import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mssql from '../src/db';
import type { Entrega } from '../src/types';

// Executar opt-in: RUN_SQL_ESTOQUE_TESTS=1 npm test -- test/faltas-sql.test.ts
// Usa um banco temporário próprio (criado e removido pelo teste); nunca toca no banco da loja.
describe.skipIf(process.env.RUN_SQL_ESTOQUE_TESTS !== '1')('produto em falta na separação (SQL Server real)', () => {
  let master: InstanceType<typeof mssql.ConnectionPool>;
  let banco: typeof import('../src/database');
  let estoque: typeof import('../src/estoque');
  let conferencia: typeof import('../src/conferencia');
  let faltas: typeof import('../src/faltas');
  const nomeBanco = `DISTRE_TEST_FALTAS_${Date.now()}`;
  const databaseOriginal = process.env.DB_DATABASE;
  const loja = 'test-faltas';

  const base = (id: string, itens: string[], valor: number): Entrega => ({
    id, lojaId: loja, nomeCliente: 'Cliente Teste', endereco: 'Rua A, 1', itens, valor, prioridade: 'media', tipoCarga: 'normal',
    status: 'EM_PREPARO', tipoComanda: 'pedido', incidentes: [], logsWebhook: [], criadoEm: new Date().toISOString(),
    atualizadoEm: new Date().toISOString(), referencia: 'Tel: 81999990000 | Pedido via Cardápio Online',
  });
  const saldo = async (p: string) => (await estoque.saldosPublicos(loja)).get(p);
  const gravada = async (id: string) => (await banco.obterEntregas()).find(e => e.id === id)!;
  const movs = async (produto: string, tipo: string) => (await estoque.listarEstoque(loja)).movimentos.filter(m => m.produtoId === produto && m.tipo === tipo);
  // Testes anteriores zeram saldo de propósito; cada cenário que vende reabastece antes.
  let reposicao = 0;
  const reabastecer = async () => {
    for (const p of ['p1', 'p2']) await estoque.receberMercadoria(loja, p, 50, `reposicao-${p}-${++reposicao}`, 'reposição do teste');
  };
  const falta = (order: Entrega, extra: Partial<import('../src/faltas').EntradaFalta> & { produtoId: string; chave: string }) =>
    faltas.registrarFalta(order, { quantidade: 1, motivo: 'Sem estoque físico', desfecho: 'ITEM', zerarSaldo: false, ...extra });

  beforeAll(async () => {
    const sqlAuth = !!(process.env.DB_USER && process.env.DB_PASSWORD);
    master = await new mssql.ConnectionPool({ server: process.env.DB_SERVER || 'localhost\\SQLEXPRESS', database: 'master',
      ...(sqlAuth ? { user: process.env.DB_USER, password: process.env.DB_PASSWORD } : {}),
      options: { trustedConnection: !sqlAuth, trustServerCertificate: true, encrypt: false } as any }).connect();
    await master.request().query(`CREATE DATABASE [${nomeBanco}]`);
    process.env.DB_DATABASE = nomeBanco;
    process.env.SEED_DEMO = 'false';
    banco = await import('../src/database');
    await banco.conectarBanco();
    estoque = await import('../src/estoque');
    conferencia = await import('../src/conferencia');
    faltas = await import('../src/faltas');
    await estoque.inicializarEstoque();
    await banco.salvarProduto({ id: 'p1', nome: 'p1', preco: 10, lojaId: loja, ativo: true, codigoBarras: '12345670' });
    await banco.salvarProduto({ id: 'p2', nome: 'p2', preco: 5, lojaId: loja, ativo: true, codigoBarras: '12345687' });
    await banco.salvarProduto({ id: 'livre', nome: 'livre', preco: 3, lojaId: loja, ativo: true, codigoBarras: '12345694' });
    await estoque.receberMercadoria(loja, 'p1', 100, 'entrada-p1-0001', '');
    await estoque.receberMercadoria(loja, 'p2', 100, 'entrada-p2-0001', '');
  }, 60000);

  afterAll(async () => {
    await banco?.pool?.close();
    if (master?.connected && /^DISTRE_TEST_FALTAS_\d+$/.test(nomeBanco)) {
      await master.request().query(`ALTER DATABASE [${nomeBanco}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${nomeBanco}]`);
    }
    await master?.close();
    if (databaseOriginal === undefined) delete process.env.DB_DATABASE; else process.env.DB_DATABASE = databaseOriginal;
  }, 30000);

  it('retira só algumas unidades: ajusta itens e total, estorna o estoque e é idempotente', async () => {
    const pedido = base('f-item', ['2x p1 (sem gelo)', '3x p2'], 35);
    await estoque.salvarVendaComEstoque(pedido, [{ produtoId: 'p1', quantidade: 2 }, { produtoId: 'p2', quantidade: 3 }],
      [{ produtoId: 'p1', nome: 'p1', ean: '12345670', quantidade: 2, preco: 10 }, { produtoId: 'p2', nome: 'p2', ean: '12345687', quantidade: 3, preco: 5 }]);
    const antes = { p1: await saldo('p1'), p2: await saldo('p2') }; // já com a baixa da venda
    await conferencia.iniciarConferencia(pedido);

    const r = await falta(pedido, { produtoId: 'p2', quantidade: 1, chave: 'falta-item-0001' });
    expect(r.cancelado).toBe(false);
    expect(r.pedido!.itens).toEqual(['2x p1 (sem gelo)', '2x p2']);
    expect(r.pedido!.valor).toBe(30);
    expect((r.itens as any[]).find(i => i.produtoId === 'p2')).toMatchObject({ quantidade: 2, conferida: 0, preco: 5 });
    expect(await saldo('p2')).toBe(antes.p2! + 1);
    expect(await saldo('p1')).toBe(antes.p1);
    const salvo = await gravada('f-item');
    expect(salvo.valor).toBe(30);
    expect(salvo.itens).toEqual(['2x p1 (sem gelo)', '2x p2']);
    expect(salvo.status).toBe('EM_PREPARO');
    expect(salvo.referencia).toContain('Faltou: 1x p2 (Sem estoque físico)');
    expect((await movs('p2', 'ESTORNO')).filter(m => m.referencia === 'f-item')).toHaveLength(1);
    expect(r.faltas).toEqual([expect.objectContaining({ produtoId: 'p2', quantidade: 1, desfecho: 'ITEM_REMOVIDO' })]);

    // Mesma requisição de novo (duplo clique / retry): nada muda.
    const repetido = await falta(r.pedido!, { produtoId: 'p2', quantidade: 1, chave: 'falta-item-0001' });
    expect(repetido.repetido).toBe(true);
    expect(await saldo('p2')).toBe(antes.p2! + 1);
    expect((await gravada('f-item')).valor).toBe(30);
    // Mesma chave com outro conteúdo é recusada.
    await expect(falta(r.pedido!, { produtoId: 'p2', quantidade: 2, chave: 'falta-item-0001' })).rejects.toThrow('Chave já usada');
  });

  it('unidades já conferidas não podem faltar e a quantidade não passa do que resta', async () => {
    let atual = await gravada('f-item'); // 2x p1, 2x p2 em separação
    await conferencia.registrarLeitura('f-item', loja, '12345670', 'scan-f-item-1');
    await conferencia.registrarLeitura('f-item', loja, '12345670', 'scan-f-item-2');
    await expect(falta(atual, { produtoId: 'p1', chave: 'falta-conf-0001' })).rejects.toThrow('já foram conferidas');
    await expect(falta(atual, { produtoId: 'p2', quantidade: 3, chave: 'falta-conf-0002' })).rejects.toThrow('restam 2 unidades');
    await expect(falta(atual, { produtoId: 'nao-existe', chave: 'falta-conf-0003' })).rejects.toThrow('não faz parte');
    atual = await gravada('f-item');
    expect(atual.itens).toEqual(['2x p1 (sem gelo)', '2x p2']);
  });

  it('item totalmente em falta sai do pedido, zera o saldo (ajuste auditado) e a conferência fecha com o resto', async () => {
    const atual = await gravada('f-item');
    const r = await falta(atual, { produtoId: 'p2', quantidade: 2, zerarSaldo: true, chave: 'falta-zero-0001' });
    expect(r.cancelado).toBe(false);
    expect(r.pedido!.itens).toEqual(['2x p1 (sem gelo)']);
    expect(r.pedido!.valor).toBe(20);
    expect((r.itens as any[]).map(i => i.produtoId)).toEqual(['p1']);
    expect(await saldo('p2')).toBe(0);
    const ajustes = await movs('p2', 'AJUSTE');
    expect(ajustes).toHaveLength(1);
    expect(ajustes[0].referencia).toContain('f-item');
    await conferencia.exigirConferenciaCompleta('f-item'); // só sobrou p1, já conferido
  });

  it('se só havia aquele item, o pedido é cancelado sozinho e o estoque volta', async () => {
    await reabastecer();
    const pedido = base('f-unico', ['1x p1'], 10);
    await estoque.salvarVendaComEstoque(pedido, [{ produtoId: 'p1', quantidade: 1 }], [{ produtoId: 'p1', nome: 'p1', ean: '12345670', quantidade: 1, preco: 10 }]);
    const antes = await saldo('p1');
    await conferencia.iniciarConferencia(pedido);
    const r = await falta(pedido, { produtoId: 'p1', desfecho: 'ITEM', chave: 'falta-unico-001' });
    expect(r.cancelado).toBe(true);
    expect(r.pedido!.status).toBe('CANCELADO');
    expect((await gravada('f-unico')).status).toBe('CANCELADO');
    expect(await saldo('p1')).toBe(antes! + 1);
    expect(r.faltas).toEqual([expect.objectContaining({ desfecho: 'PEDIDO_CANCELADO' })]);
  });

  it('cancelar o pedido inteiro devolve o que já estava baixado, sem devolver duas vezes o que faltou antes', async () => {
    await reabastecer();
    const pedido = base('f-cancela', ['3x p1', '2x p2'], 40);
    await estoque.salvarVendaComEstoque(pedido, [{ produtoId: 'p1', quantidade: 3 }, { produtoId: 'p2', quantidade: 2 }],
      [{ produtoId: 'p1', nome: 'p1', ean: '12345670', quantidade: 3, preco: 10 }, { produtoId: 'p2', nome: 'p2', ean: '12345687', quantidade: 2, preco: 5 }]);
    const antes = { p1: await saldo('p1'), p2: await saldo('p2') };
    await conferencia.iniciarConferencia(pedido);
    const parcial = await falta(pedido, { produtoId: 'p2', quantidade: 1, chave: 'falta-canc-0001' });
    expect(await saldo('p2')).toBe(antes.p2! + 1);
    const total = await falta(parcial.pedido!, { produtoId: 'p1', quantidade: 1, desfecho: 'PEDIDO', motivo: 'Cliente não aceita sem o p1', chave: 'falta-canc-0002' });
    expect(total.cancelado).toBe(true);
    expect((await gravada('f-cancela')).status).toBe('CANCELADO');
    // p1: devolve as 3 baixadas; p2: devolve só a 1 que ainda restava (a outra já havia voltado).
    expect(await saldo('p1')).toBe(antes.p1! + 3);
    expect(await saldo('p2')).toBe(antes.p2! + 2);
    // Cancelar de novo (rota de cancelamento clássica) não devolve nada além disso.
    await estoque.salvarCancelamentoComEstoque({ ...(await gravada('f-cancela')), status: 'CANCELADO' });
    expect(await saldo('p1')).toBe(antes.p1! + 3);
    expect(await saldo('p2')).toBe(antes.p2! + 2);
    // Pedido cancelado não aceita mais registros de falta.
    await expect(falta(total.pedido!, { produtoId: 'p1', chave: 'falta-canc-0003' })).rejects.toThrow('em separação');
  });

  it('cancelar zerando o saldo estorna primeiro e zera depois', async () => {
    await reabastecer();
    const pedido = base('f-cancela-zero', ['2x p1'], 20);
    await estoque.salvarVendaComEstoque(pedido, [{ produtoId: 'p1', quantidade: 2 }], [{ produtoId: 'p1', nome: 'p1', ean: '12345670', quantidade: 2, preco: 10 }]);
    await conferencia.iniciarConferencia(pedido);
    const r = await falta(pedido, { produtoId: 'p1', quantidade: 2, desfecho: 'PEDIDO', zerarSaldo: true, chave: 'falta-cz-00001' });
    expect(r.cancelado).toBe(true);
    expect(await saldo('p1')).toBe(0);
    expect((await movs('p1', 'AJUSTE')).some(m => m.referencia?.includes('f-cancela-zero'))).toBe(true);
  });

  it('produto sem controle de estoque: sai do pedido sem mexer em saldo', async () => {
    await reabastecer();
    const pedido = base('f-livre', ['1x livre', '1x p2'], 8);
    await estoque.salvarVendaComEstoque(pedido, [{ produtoId: 'livre', quantidade: 1 }, { produtoId: 'p2', quantidade: 1 }],
      [{ produtoId: 'livre', nome: 'livre', ean: '12345694', quantidade: 1, preco: 3 }, { produtoId: 'p2', nome: 'p2', ean: '12345687', quantidade: 1, preco: 5 }]);
    const inicio = await conferencia.iniciarConferencia(pedido);
    expect(inicio.itens.find(i => i.produtoId === 'livre')!.controlado).toBe(false);
    expect(inicio.itens.find(i => i.produtoId === 'p2')!.controlado).toBe(true);
    const r = await falta(pedido, { produtoId: 'livre', zerarSaldo: true, chave: 'falta-livre-001' });
    expect(r.pedido!.valor).toBe(5);
    expect((await estoque.listarEstoque(loja)).movimentos.some(m => m.produtoId === 'livre')).toBe(false);
  });

  it('pedido anterior ao registro de preço: recupera o preço só se a soma fecha com o total', async () => {
    await reabastecer();
    const consistente = base('f-legado-ok', ['2x p1'], 20);
    await estoque.salvarVendaComEstoque(consistente, [{ produtoId: 'p1', quantidade: 2 }], [{ produtoId: 'p1', nome: 'p1', ean: '12345670', quantidade: 2 }]);
    const ok = await conferencia.iniciarConferencia(consistente);
    expect(ok.itens[0].preco).toBe(10);

    const divergente = base('f-legado-nok', ['2x p1', '1x p2'], 99); // total não bate com o cadastro
    await estoque.salvarVendaComEstoque(divergente, [{ produtoId: 'p1', quantidade: 2 }, { produtoId: 'p2', quantidade: 1 }],
      [{ produtoId: 'p1', nome: 'p1', ean: '12345670', quantidade: 2 }, { produtoId: 'p2', nome: 'p2', ean: '12345687', quantidade: 1 }]);
    const nok = await conferencia.iniciarConferencia(divergente);
    expect(nok.itens.every(i => i.preco == null)).toBe(true);
    await expect(falta(divergente, { produtoId: 'p2', chave: 'falta-legado-01' })).rejects.toThrow('calcular o novo valor');
    // Mas o cancelamento do pedido inteiro continua disponível.
    expect((await falta(divergente, { produtoId: 'p2', desfecho: 'PEDIDO', chave: 'falta-legado-02' })).cancelado).toBe(true);
  });

  it('duas faltas simultâneas do mesmo produto não retiram mais unidades do que existem', async () => {
    await reabastecer();
    const pedido = base('f-corrida', ['2x p2', '1x p1'], 20);
    await estoque.salvarVendaComEstoque(pedido, [{ produtoId: 'p2', quantidade: 2 }, { produtoId: 'p1', quantidade: 1 }],
      [{ produtoId: 'p2', nome: 'p2', ean: '12345687', quantidade: 2, preco: 5 }, { produtoId: 'p1', nome: 'p1', ean: '12345670', quantidade: 1, preco: 10 }]);
    await conferencia.iniciarConferencia(pedido);
    const resultados = await Promise.allSettled([
      falta(pedido, { produtoId: 'p2', quantidade: 2, chave: 'falta-race-0001' }),
      falta(pedido, { produtoId: 'p2', quantidade: 2, chave: 'falta-race-0002' }),
    ]);
    expect(resultados.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const salvo = await gravada('f-corrida');
    expect(salvo.itens).toEqual(['1x p1']);
    expect(salvo.valor).toBe(10);
  });
});
