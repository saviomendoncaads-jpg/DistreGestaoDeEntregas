import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mssql from '../src/db';

// Só utiliza um banco criado por este teste. Nunca executa migração no banco da operação.
describe.skipIf(process.env.RUN_SQL_ESTOQUE_TESTS !== '1')('inicialização preserva dados no SQL Server real', () => {
  const nome = `DISTRE_TEST_BOOT_${Date.now()}`;
  let master: InstanceType<typeof mssql.ConnectionPool>;
  let banco: typeof import('../src/database');
  const original = { banco: process.env.DB_DATABASE, seed: process.env.SEED_DEMO };
  beforeAll(async () => {
    const sqlAuth = !!(process.env.DB_USER && process.env.DB_PASSWORD);
    master = await new mssql.ConnectionPool({ server: process.env.DB_SERVER || 'localhost\\SQLEXPRESS', database: 'master',
      ...(sqlAuth ? { user: process.env.DB_USER, password: process.env.DB_PASSWORD } : {}),
      options: { trustedConnection: !sqlAuth, trustServerCertificate: true, encrypt: false } as any }).connect();
    await master.request().query(`CREATE DATABASE [${nome}]`);
    process.env.DB_DATABASE = nome; process.env.SEED_DEMO = 'false';
    banco = await import('../src/database');
  }, 60000);
  afterAll(async () => {
    await banco?.pool?.close();
    if (master?.connected && /^DISTRE_TEST_BOOT_\d+$/.test(nome)) await master.request().query(`ALTER DATABASE [${nome}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${nome}]`);
    await master?.close();
    if (original.banco === undefined) delete process.env.DB_DATABASE; else process.env.DB_DATABASE = original.banco;
    if (original.seed === undefined) delete process.env.SEED_DEMO; else process.env.SEED_DEMO = original.seed;
  }, 30000);
  it('interrompe schema incompatível sem apagar registros legados', async () => {
    await master.request().query(`CREATE TABLE [${nome}].dbo.ENTREGAS (ID VARCHAR(50), nomeCliente NVARCHAR(100)); INSERT [${nome}].dbo.ENTREGAS VALUES ('registro-preservado', 'Teste');`);
    await expect(banco.conectarBanco()).rejects.toThrow(/Schema legado/);
    const r = await master.request().query(`SELECT ID FROM [${nome}].dbo.ENTREGAS`);
    expect(r.recordset[0].ID).toBe('registro-preservado');
    // Limpeza limitada à fixture incompatível, no banco temporário deste teste.
    await master.request().query(`DROP TABLE [${nome}].dbo.ENTREGAS`);
  });
  it('adiciona colunas ausentes e preserva pedidos já gravados', async () => {
    await banco.conectarBanco();
    await banco.salvarEntrega({ id: 'pedido-preservado', nomeCliente: 'Teste', endereco: 'Teste', itens: [], prioridade: 'media', tipoCarga: 'normal', status: 'RECEBIDO', incidentes: [], logsWebhook: [], criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString() });
    await banco.pool.close();
    await master.request().query(`ALTER TABLE [${nome}].dbo.ENTREGAS DROP COLUMN DATA_HORA_CONCLUSAO, VALOR, LOJA_ID`);
    await banco.conectarBanco();
    expect((await banco.obterEntregas()).map(p => p.id)).toContain('pedido-preservado');
  });
  it('propaga falha de gravação fora de transação sem afirmar sucesso', async () => {
    await expect(banco.salvarEntrega({ id: 'invalido', nomeCliente: undefined } as any)).rejects.toThrow();
    expect((await banco.obterEntregas()).some(p => p.id === 'invalido')).toBe(false);
  });
});
