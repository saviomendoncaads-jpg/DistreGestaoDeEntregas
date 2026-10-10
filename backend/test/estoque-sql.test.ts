import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mssql from '../src/db';
import type { Entrega } from '../src/types';

// Executar opt-in: RUN_SQL_ESTOQUE_TESTS=1 npm test -- test/estoque-sql.test.ts
// Usa um banco temporário próprio; nunca insere recebimentos/vendas no banco da loja.
describe.skipIf(process.env.RUN_SQL_ESTOQUE_TESTS !== '1')('estoque no SQL Server real', () => {
  let master: InstanceType<typeof mssql.ConnectionPool>;
  let banco: typeof import('../src/database');
  let estoque: typeof import('../src/estoque');
  let conferencia: typeof import('../src/conferencia');
  const nomeBanco = `DISTRE_TEST_ESTOQUE_${Date.now()}`;
  const databaseOriginal = process.env.DB_DATABASE;
  const loja = 'test-estoque';
  const venda = (id: string): Entrega => ({ id, lojaId: loja, nomeCliente: 'Teste', endereco: 'Teste', itens: ['1x Teste'], prioridade: 'media', tipoCarga: 'normal', status: 'RECEBIDO', incidentes: [], logsWebhook: [], criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString() });
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
    await Promise.all([estoque.inicializarEstoque(), estoque.inicializarEstoque()]);
    for (const id of ['a', 'b', 'livre']) await banco.salvarProduto({ id, nome: id, preco: 1, lojaId: loja, ativo: true, codigoBarras: id === 'a' ? '12345670' : id === 'b' ? '12345687' : undefined });
  }, 60000);
  afterAll(async () => {
    await banco?.pool?.close();
    if (master?.connected && /^DISTRE_TEST_ESTOQUE_\d+$/.test(nomeBanco)) {
      await master.request().query(`ALTER DATABASE [${nomeBanco}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${nomeBanco}]`);
    }
    await master?.close();
    if (databaseOriginal === undefined) delete process.env.DB_DATABASE; else process.env.DB_DATABASE = databaseOriginal;
  }, 30000);
  it('entrada é idempotente, auditada e isolada por loja', async () => {
    await estoque.receberMercadoria(loja, 'a', 10, 'entrada-a-001', 'NF 001');
    await estoque.receberMercadoria(loja, 'a', 10, 'entrada-a-001', 'NF 001');
    expect((await estoque.saldosPublicos(loja)).get('a')).toBe(10);
    await expect(estoque.receberMercadoria('outra', 'a', 1, 'entrada-a-002', '')).rejects.toThrow('nesta loja');
    await expect(estoque.receberMercadoria(loja, 'a', 11, 'entrada-a-001', 'NF 001')).rejects.toThrow('já usada');
  });
  it('não grava venda parcial nem baixa saldo se um dos itens for insuficiente', async () => {
    await estoque.receberMercadoria(loja, 'b', 1, 'entrada-b-001', '');
    await expect(estoque.salvarVendaComEstoque(venda('v-falha'), [{ produtoId: 'a', quantidade: 2 }, { produtoId: 'b', quantidade: 2 }])).rejects.toThrow('insuficiente');
    expect((await estoque.saldosPublicos(loja)).get('a')).toBe(10);
    expect((await banco.obterEntregas()).some(e => e.id === 'v-falha')).toBe(false);
  });
  it('duas vendas simultâneas não vendem a mesma última unidade', async () => {
    const resultados = await Promise.allSettled([estoque.salvarVendaComEstoque(venda('v-1'), [{ produtoId: 'b', quantidade: 1 }]), estoque.salvarVendaComEstoque(venda('v-2'), [{ produtoId: 'b', quantidade: 1 }])]);
    expect(resultados.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect((await estoque.saldosPublicos(loja)).get('b')).toBe(0);
    const gravadas = (await banco.obterEntregas()).filter(e => ['v-1', 'v-2'].includes(e.id));
    expect(gravadas).toHaveLength(1);
    await estoque.salvarCancelamentoComEstoque({ ...gravadas[0], status: 'CANCELADO' });
    await estoque.salvarCancelamentoComEstoque({ ...gravadas[0], status: 'CANCELADO' });
    expect((await estoque.saldosPublicos(loja)).get('b')).toBe(1);
  });
  it('soma itens repetidos, baixa e registra movimentos; catálogo antigo segue sem controle', async () => {
    await estoque.salvarVendaComEstoque(venda('v-3'), [{ produtoId: 'a', quantidade: 2 }, { produtoId: 'a', quantidade: 3 }, { produtoId: 'livre', quantidade: 2 }]);
    expect((await estoque.saldosPublicos(loja)).get('a')).toBe(5);
    const dados = await estoque.listarEstoque(loja);
    expect(dados.movimentos.filter(m => m.tipo === 'VENDA' && m.referencia === 'v-3')).toHaveLength(1);
    expect(dados.produtos.find(p => p.id === 'livre').saldo).toBeNull();
  });
  it('falha ao persistir a comanda reverte saldo e movimento', async () => {
    const saldoAntes = (await estoque.saldosPublicos(loja)).get('a');
    await expect(estoque.salvarVendaComEstoque({ ...venda('v-persistencia-falha'), nomeCliente: undefined as any }, [{ produtoId: 'a', quantidade: 1 }])).rejects.toThrow();
    expect((await estoque.saldosPublicos(loja)).get('a')).toBe(saldoAntes);
    expect((await estoque.listarEstoque(loja)).movimentos.some(m => m.referencia === 'v-persistencia-falha')).toBe(false);
  });
  it('preserva produtos com estoque e permite excluir um produto sem controle', async () => {
    expect(await banco.deletarProduto('a', loja)).toBe(false);
    expect(await banco.deletarProduto('livre', loja)).toBe(true);
  });
  it('conferência por EAN persiste contagens, bloqueia produto errado e exige todas as unidades', async () => {
    const pedido = { ...venda('pedido-ean'), status: 'EM_PREPARO' as const, tipoComanda: 'pedido' as const, itens: ['2x a'] };
    await estoque.salvarVendaComEstoque(pedido, [{ produtoId: 'a', quantidade: 2 }], [{ produtoId: 'a', nome: 'a', ean: '12345670', quantidade: 2 }]);
    await conferencia.iniciarConferencia(pedido);
    await expect(conferencia.exigirConferenciaCompleta(pedido.id)).rejects.toThrow('todas as unidades');
    await expect(conferencia.registrarLeitura(pedido.id, 'outra-loja', '12345670', 'scan-errado')).rejects.toThrow();
    await expect(conferencia.registrarLeitura(pedido.id, loja, '12345687', 'scan-errado')).rejects.toThrow('não pertence');
    await conferencia.registrarLeitura(pedido.id, loja, '12345670', 'scan-unidade-1');
    await conferencia.registrarLeitura(pedido.id, loja, '12345670', 'scan-unidade-1');
    expect((await conferencia.iniciarConferencia(pedido)).itens[0].conferida).toBe(1);
    const simultaneas = await Promise.allSettled([
      conferencia.registrarLeitura(pedido.id, loja, '12345670', 'scan-unidade-2'),
      conferencia.registrarLeitura(pedido.id, loja, '12345670', 'scan-unidade-3'),
    ]);
    expect(simultaneas.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect((await conferencia.iniciarConferencia(pedido)).itens[0].conferida).toBe(2);
    await conferencia.exigirConferenciaCompleta(pedido.id);
    await expect(conferencia.registrarLeitura(pedido.id, loja, '12345670', 'scan-unidade-4')).rejects.toThrow('já foram conferidas');
  });
  it('recupera produtos de pedidos antigos sem usar preço ou nome como código de barras', async () => {
    const pedido = { ...venda('pedido-antigo'), status: 'EM_PREPARO' as const, tipoComanda: 'pedido' as const, itens: ['2x a (observação)'] };
    await banco.salvarEntrega(pedido);
    expect((await conferencia.iniciarConferencia(pedido)).itens[0]).toMatchObject({ produtoId: 'a', ean: '12345670', quantidade: 2, conferida: 0 });
    expect(() => conferencia.resolverItensAntigos(['1x desconhecido'], [])).toThrow('identificar');
  });
  it('salva e recupera o CPF da vitrine inclusive na comanda de entrega', async () => {
    const pedido = { ...venda('pedido-cpf'), clienteDocumento: '01234567890', tipoComanda: 'pedido' as const };
    await estoque.salvarVendaComEstoque(pedido, [{ produtoId: 'livre', quantidade: 1 }]);
    const salvo = (await banco.obterEntregas()).find(e => e.id === pedido.id)!;
    expect(salvo.clienteDocumento).toBe('01234567890');
    await banco.salvarEntrega({ ...salvo, id: 'entrega-cpf', tipoComanda: 'entrega' });
    expect((await banco.obterEntregas()).find(e => e.id === 'entrega-cpf')?.clienteDocumento).toBe('01234567890');
  });
  it('motoboy permanece online ao salvar sem conexão e após recuperar cadastro antigo', async () => {
    await banco.salvarMotorista({ id: 'motoboy-online', name: 'Teste', vehicleType: 'motorcycle', status: 'ocupado', lojaId: loja, codigoVinculo: 'test-online', dispositivoConectado: false });
    const row = await banco.pool!.request().query("SELECT DISPOSITIVO_CONECTADO FROM MOTORISTAS WHERE ID = 'motoboy-online'");
    expect(Boolean(row.recordset[0].DISPOSITIVO_CONECTADO)).toBe(true);
    await banco.pool!.request().query("UPDATE MOTORISTAS SET DISPOSITIVO_CONECTADO = 0 WHERE ID = 'motoboy-online'");
    const recuperado = (await banco.obterMotoristas()).find(d => d.id === 'motoboy-online');
    expect(recuperado).toMatchObject({ dispositivoConectado: true, status: 'ocupado' });
  });
});
