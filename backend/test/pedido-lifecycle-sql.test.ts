import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mssql from '../src/db';
import type { Entrega } from '../src/types';

describe.skipIf(process.env.RUN_SQL_ESTOQUE_TESTS !== '1')('ciclo pedido→entrega→retorno no SQL Server real', () => {
  const nomeBanco = `DISTRE_TEST_CICLO_${Date.now()}`;
  const originais = { banco: process.env.DB_DATABASE, seed: process.env.SEED_DEMO };
  let master: InstanceType<typeof mssql.ConnectionPool>, banco: typeof import('../src/database');
  let estoque: typeof import('../src/estoque'), lifecycle: typeof import('../src/pedidoLifecycle'), reports: typeof import('../src/commercialReports');
  let onboarding: typeof import('../src/implantacao');
  let seq = 0, loja: string, produto: string, pedido: Entrega;
  beforeAll(async () => {
    const sqlAuth = !!(process.env.DB_USER && process.env.DB_PASSWORD);
    master = await new mssql.ConnectionPool({ server: process.env.DB_SERVER || 'localhost\\SQLEXPRESS', database: 'master',
      ...(sqlAuth ? { user: process.env.DB_USER, password: process.env.DB_PASSWORD } : {}),
      options: { trustedConnection: !sqlAuth, trustServerCertificate: true, encrypt: false } as any }).connect();
    await master.request().query(`CREATE DATABASE [${nomeBanco}]`);
    process.env.DB_DATABASE = nomeBanco; process.env.SEED_DEMO = 'false';
    banco = await import('../src/database'); await banco.conectarBanco();
    estoque = await import('../src/estoque'); await estoque.inicializarEstoque();
    onboarding=await import('../src/implantacao');await onboarding.inicializarImplantacao();
    lifecycle = await import('../src/pedidoLifecycle'); reports = await import('../src/commercialReports');
    await banco.salvarEmpresa({ id: 'empresa-fixture', nome: 'Empresa fixture', cnpj: '00000000000191', ativo: true, criadoEm: new Date().toISOString() });
  }, 60000);
  beforeEach(async () => {
    seq++; loja = `loja-${seq}`; produto = `produto-${seq}`;
    await banco.salvarLoja({ id: loja, empresaId: 'empresa-fixture', nome: loja, usuario: loja, senhaHash: 'fixture-sem-login', chaveAcesso: `fixture-${seq}`, ativo: true, criadoEm: new Date().toISOString() });
    await banco.salvarProduto({ id: produto, lojaId: loja, nome: produto, preco: 5, ativo: true, codigoBarras: '12345670' });
    await estoque.receberMercadoria(loja, produto, 10, `entrada-${seq}`, 'fixture');
    pedido = { id: `pedido-${seq}`, lojaId: loja, tipoComanda: 'pedido', nomeCliente: 'Fixture', endereco: 'Fixture',
      itens: [`2x ${produto}`], valor: 10, prioridade: 'media', tipoCarga: 'normal', status: 'EM_PREPARO',
      incidentes: [], logsWebhook: [], criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString() };
    await estoque.salvarVendaComEstoque(pedido, [{ produtoId: produto, quantidade: 2 }], [{ produtoId: produto, nome: produto, ean: '12345670', quantidade: 2, preco: 5 }]);
  });
  afterAll(async () => {
    await banco?.pool?.close();
    if (master?.connected && /^DISTRE_TEST_CICLO_\d+$/.test(nomeBanco)) await master.request().query(`ALTER DATABASE [${nomeBanco}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${nomeBanco}]`);
    await master?.close();
    for (const [key, value] of [['DB_DATABASE', originais.banco], ['SEED_DEMO', originais.seed]]) {
      if (value === undefined) delete process.env[key!]; else process.env[key!] = value;
    }
  }, 30000);
  it('implantação persiste por loja e inicia uma única jornada sob concorrência',async()=>{
    await Promise.all([onboarding.iniciarImplantacao(loja),onboarding.iniciarImplantacao(loja)]);
    expect((await onboarding.lerImplantacao(loja)).completed).toBe(0);
    const rows=await banco.pool.request().input('loja',mssql.VarChar(100),loja).query('SELECT COUNT(*) total FROM IMPLANTACAO_LOJAS WHERE LOJA_ID=@loja');
    expect(rows.recordset[0].total).toBe(1);
    await onboarding.concluirEtapa(loja,1,true,'operador');
    expect((await onboarding.lerImplantacao(loja)).history[0]).toMatchObject({passo:1,modalidade:'conhecimento_previo_confirmado',autor:'operador'});
    expect((await onboarding.lerImplantacao('outra-loja')).completed).toBe(0);
  });
  it('dashboard cruza pagamentos e vencimentos sem atribuir fatura de outra filial',async()=>{
    async function invoice(id:string,tenant:string|null,status:string,payment:string|null,due:string){
      await banco.pool.request().input('id',mssql.VarChar,id).input('loja',mssql.VarChar,tenant)
       .input('status',mssql.VarChar,status).input('pago',mssql.VarChar,payment).input('vence',mssql.VarChar,due)
       .query(`INSERT INTO FATURAS(ID,EMPRESA_ID,LOJA_ID,VALOR_BRUTO,VALOR_DESCONTO,STATUS,DATA_EMISSAO,DATA_VENCIMENTO,DATA_PAGAMENTO,REFERENCIA_MES_ANO,CRIADO_EM)
       VALUES(@id,'empresa-fixture',@loja,100,10,@status,'2026-10-01',@vence,@pago,'10/2026','2026-10-01')`);
    }
    await invoice('paid-'+seq,loja,'PAGA','2026-10-03T12:00:00Z','2026-10-05');
    await invoice('other-'+seq,'outra-filial','PAGA','2026-09-01T12:00:00Z','2026-09-05');
    await invoice('pending-'+seq,loja,'PENDENTE',null,'2026-10-10');
    await invoice('future-'+seq,loja,'PENDENTE',null,'2026-11-10');
    let row=(await onboarding.lerIndicadoresImplantacao()).find((r:any)=>r.lojaId===loja);
    expect(row).toMatchObject({primeiroPagamentoFaturaId:'paid-'+seq,pagamentoEscopo:'loja',faturaId:'pending-'+seq,faturaEscopo:'loja',faturaValor:90,comandas30Dias:1});
    expect(row.primeiroPagamentoVencimento).toBe('2026-10-05');
    await invoice('legacy-'+seq,null,'PAGA','2026-08-01T12:00:00Z','2026-08-05');
    row=(await onboarding.lerIndicadoresImplantacao()).find((r:any)=>r.lojaId===loja);
    expect(row).toMatchObject({primeiroPagamentoFaturaId:'legacy-'+seq,pagamentoEscopo:'empresa'});
    await banco.pool.request().input('id',mssql.VarChar,'legacy-'+seq).query('DELETE FROM FATURAS WHERE ID=@id');
  });
  it('dashboard não duplica a contagem operacional pelo vínculo pedido e entrega',async()=>{
    const child={...pedido,id:'delivery-indicator-'+seq,tipoComanda:'entrega',pedidoOrigemId:pedido.id,status:'ENTREGUE'};
    await banco.salvarEntrega(child as Entrega);
    const row=(await onboarding.lerIndicadoresImplantacao()).find((r:any)=>r.lojaId===loja);
    expect(row.comandas30Dias).toBe(1);expect(row.ultimaOperacaoEm).toBeTruthy();expect(row.ultimaAlteracaoCatalogoEm).toBeTruthy();
    expect(row.primeiroPagamentoEm).toBeNull();
  });
  it('implantação rejeita saltos e confirmação ausente, sem alterar progresso',async()=>{
    await onboarding.iniciarImplantacao(loja);
    await expect(onboarding.concluirEtapa(loja,2,true,'operador')).rejects.toThrow('anterior');
    await expect(onboarding.concluirEtapa(loja,1,false,'operador')).rejects.toThrow('Confirme');
    expect((await onboarding.lerImplantacao(loja)).completed).toBe(0);
  });
  it('conclusão concorrente é idempotente e estoque precisa de registros reais',async()=>{
    await onboarding.iniciarImplantacao(loja);await onboarding.concluirEtapa(loja,1,true,'operador');
    await Promise.all([onboarding.concluirEtapa(loja,2,true,'operador'),onboarding.concluirEtapa(loja,2,true,'operador')]);
    expect((await onboarding.lerImplantacao(loja)).history).toHaveLength(2);
    await onboarding.concluirEtapa(loja,3,true,'operador');
    await banco.salvarProduto({id:'sem-saldo-'+seq,lojaId:loja,nome:'Sem saldo',preco:5,ativo:true});
    await expect(onboarding.concluirEtapa(loja,4,true,'operador')).rejects.toThrow('saldo inicial');
    expect((await onboarding.lerImplantacao(loja)).completed).toBe(3);
  });
  it('Go-Live verifica estoque novamente antes de concluir e salva a data',async()=>{
    await onboarding.iniciarImplantacao(loja);
    for(let passo=1;passo<=6;passo++)await onboarding.concluirEtapa(loja,passo,true,'operador');
    await banco.salvarProduto({id:'novo-'+seq,lojaId:loja,nome:'Novo produto',preco:5,ativo:true});
    await expect(onboarding.concluirEtapa(loja,7,true,'operador')).rejects.toThrow('saldo inicial');
    await estoque.receberMercadoria(loja,'novo-'+seq,1,'nova-entrada-'+seq,'fixture');
    await onboarding.concluirEtapa(loja,7,true,'operador');
    expect((await onboarding.lerImplantacao(loja))).toMatchObject({completed:7,percent:100});
    expect((await onboarding.lerImplantacao(loja)).completedAt).toBeTruthy();
  });
  it('e-commerce exige imagens e loja suspensa não conclui Go-Live',async()=>{
    const tenants=await import('../src/tenants');const row=(await banco.obterLojas()).find(l=>l.id===loja)!;
    const store={...row,recebePedidos:true};tenants.lojas.push(store);
    try{
      await onboarding.iniciarImplantacao(loja);for(let passo=1;passo<=4;passo++)await onboarding.concluirEtapa(loja,passo,true,'operador');
      await expect(onboarding.concluirEtapa(loja,5,true,'operador')).rejects.toThrow('imagem principal');
      await banco.pool.request().input('loja',mssql.VarChar(100),loja).query("UPDATE PRODUTOS SET IMAGEM_URL='/uploads/fixture.jpg' WHERE LOJA_ID=@loja");
      await onboarding.concluirEtapa(loja,5,true,'operador');await onboarding.concluirEtapa(loja,6,true,'operador');
      store.statusFinanceiro='SUSPENSO';await expect(onboarding.concluirEtapa(loja,7,true,'operador')).rejects.toThrow('Regularize');
      expect((await onboarding.lerImplantacao(loja)).completed).toBe(6);
    }finally{tenants.lojas.splice(tenants.lojas.indexOf(store),1);}
  });
  async function conferir() {
    await banco.pool.request().input('pedido', mssql.VarChar(50), pedido.id)
      .query('UPDATE PEDIDO_CONFERENCIA_ITENS SET CONFERIDA = QUANTIDADE WHERE PEDIDO_ID = @pedido');
  }
  const estado = async () => (await banco.obterEntregas()).filter(e => e.lojaId === loja);
  it('bloqueia finalização incompleta sem criar entrega nem alterar pedido', async () => {
    await expect(lifecycle.finalizarPedidoParaEntrega(pedido, `entrega-${seq}`)).rejects.toThrow('todas as unidades');
    expect(await estado()).toHaveLength(1); expect((await estado())[0].status).toBe('EM_PREPARO');
  });
  it('duas finalizações simultâneas retornam a mesma entrega e registram separação, não entrega ao cliente', async () => {
    await conferir();
    const resultados = await Promise.all([lifecycle.finalizarPedidoParaEntrega(pedido, 'entrega-a'), lifecycle.finalizarPedidoParaEntrega(pedido, 'entrega-b')]);
    expect(resultados[0].entrega.id).toBe(resultados[1].entrega.id); expect(resultados.filter(r => r.repetido)).toHaveLength(1);
    expect(resultados[0].pedido.status).toBe('SEPARADO'); expect(resultados[0].entrega.status).toBe('RECEBIDO');
    expect(await estado()).toHaveLength(2);
    const recarregado = (await estado()).find(e => e.id === pedido.id)!;
    expect(recarregado.entregaVinculadaId).toBe(resultados[0].entrega.id);
    expect((await lifecycle.finalizarPedidoParaEntrega(recarregado, 'retry-apos-restart')).entrega.id).toBe(resultados[0].entrega.id);
  });
  it('falha ao inserir a entrega reverte também a alteração do pedido', async () => {
    await conferir();
    await banco.pool.request().query(`CREATE TRIGGER teste_falha_entrega ON ENTREGAS AFTER INSERT AS
      IF EXISTS (SELECT 1 FROM inserted WHERE ID='entrega-falha') THROW 50001, 'Falha fixture na entrega', 1;`);
    try {
      await expect(lifecycle.finalizarPedidoParaEntrega(pedido, 'entrega-falha')).rejects.toThrow('Falha fixture');
      expect(await estado()).toHaveLength(1); expect((await estado())[0].status).toBe('EM_PREPARO');
    } finally { await banco.pool.request().query('DROP TRIGGER teste_falha_entrega'); }
  });
  it('não sobrescreve uma comanda existente por colisão de identificador', async () => {
    await conferir();
    await banco.salvarEntrega({ ...pedido, id: 'id-existente', tipoComanda: 'entrega', nomeCliente: 'Preservado' });
    await expect(lifecycle.finalizarPedidoParaEntrega(pedido, 'id-existente')).rejects.toThrow('já utilizado');
    expect((await estado()).find(e => e.id === 'id-existente')?.nomeCliente).toBe('Preservado');
    expect((await estado()).find(e => e.id === pedido.id)?.status).toBe('EM_PREPARO');
  });
  it('relatório conta uma venda e usa o status da entrega, com preço e data da venda original', async () => {
    await conferir(); const result = await lifecycle.finalizarPedidoParaEntrega(pedido, `entrega-${seq}`);
    const inicial = await reports.readCommercialReport({ storeId: loja });
    expect(inicial.summary).toMatchObject({ orders: 1, value: 10, delivered: 0, itemQuantity: 2 });
    expect((await reports.readCommercialReport({ storeId: loja, basis: 'delivered' })).summary.orders).toBe(0);
    await banco.salvarEntrega({ ...result.entrega, status: 'ENTREGUE' });
    expect((await reports.readCommercialReport({ storeId: loja, basis: 'delivered' })).summary).toMatchObject({ orders: 1, value: 10, delivered: 1 });
    await banco.salvarEntrega({ ...pedido, id: 'entrega-independente', tipoComanda: 'entrega', status: 'ENTREGUE', valor: 7 });
    expect((await reports.readCommercialReport({ storeId: loja })).summary).toMatchObject({ orders: 2, value: 17 });
  });
  it('retorno integral estorna a venda original uma vez, inclusive sob concorrência', async () => {
    await conferir(); const result = await lifecycle.finalizarPedidoParaEntrega(pedido, `entrega-${seq}`);
    const devolucao = { ...result.entrega, status: 'AGUARDANDO_RETORNO_CD' as const }; await banco.salvarEntrega(devolucao);
    const results = await Promise.all([lifecycle.receberRetornoIntegral(devolucao, result.pedido), lifecycle.receberRetornoIntegral(devolucao, result.pedido)]);
    expect(results.filter(r => r.repetido)).toHaveLength(1); expect((await estoque.saldosPublicos(loja)).get(produto)).toBe(10);
    expect((await estoque.listarEstoque(loja)).movimentos.filter(m => m.tipo === 'ESTORNO')).toHaveLength(1);
    expect((await estado()).every(e => e.status === 'PRODUTO_RETORNADO_ESTOQUE')).toBe(true);
    expect((await reports.readCommercialReport({ storeId: loja })).summary).toMatchObject({ orders: 0, returned: 1, totalRegistered: 1 });
  });
  it('recusa retorno em estado errado e vínculo de outra loja sem estornar estoque', async () => {
    await conferir(); const result = await lifecycle.finalizarPedidoParaEntrega(pedido, `entrega-${seq}`);
    await expect(lifecycle.receberRetornoIntegral(result.entrega, result.pedido)).rejects.toThrow('aguardando');
    await expect(lifecycle.receberRetornoIntegral(result.entrega, { ...result.pedido, lojaId: 'outra' })).rejects.toThrow('origem');
    expect((await estoque.saldosPublicos(loja)).get(produto)).toBe(8);
  });
  it('falha ao concluir retorno desfaz estorno e alterações de ambas as comandas', async () => {
    await conferir(); const result = await lifecycle.finalizarPedidoParaEntrega(pedido, `entrega-${seq}`);
    const devolucao = { ...result.entrega, status: 'AGUARDANDO_RETORNO_CD' as const }; await banco.salvarEntrega(devolucao);
    await banco.pool.request().query(`CREATE TRIGGER teste_falha_retorno ON ENTREGAS AFTER UPDATE AS
      IF EXISTS (SELECT 1 FROM inserted WHERE TIPO_COMANDA='entrega' AND STATUS='PRODUTO_RETORNADO_ESTOQUE') THROW 50001, 'Falha fixture no retorno', 1;`);
    try {
      await expect(lifecycle.receberRetornoIntegral(devolucao, result.pedido)).rejects.toThrow('Falha fixture');
      expect((await estoque.saldosPublicos(loja)).get(produto)).toBe(8);
      expect((await estado()).find(e => e.id === pedido.id)?.status).toBe('SEPARADO');
      expect((await estoque.listarEstoque(loja)).movimentos.some(m => m.tipo === 'ESTORNO')).toBe(false);
    } finally { await banco.pool.request().query('DROP TRIGGER teste_falha_retorno'); }
  });
  it('legado com duas entregas não duplica venda nem declara entrega comprovada', async () => {
    await banco.salvarEntrega({ ...pedido, status: 'ENTREGUE' });
    for (const id of ['legado-um','legado-dois']) await banco.salvarEntrega({ ...pedido, id, tipoComanda: 'entrega', status: 'ENTREGUE', referencia: `Origem: Pedido ${pedido.id}` });
    const report = await reports.readCommercialReport({ storeId: loja });
    expect(report.summary).toMatchObject({ orders: 1, delivered: 0, value: 10 }); expect(report.quality.linkIssues).toBe(1);
    expect((await reports.readCommercialReport({ storeId: loja, basis: 'delivered' })).summary.orders).toBe(0);
    await expect(lifecycle.finalizarPedidoParaEntrega(pedido, 'nova')).rejects.toThrow('mais de uma');
    const retorno = { ...(await estado()).find(e => e.id === 'legado-um')!, status: 'AGUARDANDO_RETORNO_CD' as const };
    await banco.salvarEntrega(retorno);
    await expect(lifecycle.receberRetornoIntegral(retorno, pedido)).rejects.toThrow('ambíguo');
    expect((await estoque.saldosPublicos(loja)).get(produto)).toBe(8);
  });
});
