import mssql, { Transaction } from './db';
import { pool, salvarEntrega } from './database';
import { Entrega } from './types';
import { CONFERENCIA_SCHEMA, gravarItensConferencia, ItemConferencia } from './conferencia';

export class ErroEstoque extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

export const ESTOQUE_SCHEMA = `
IF OBJECT_ID('ESTOQUE_SALDOS', 'U') IS NULL
CREATE TABLE ESTOQUE_SALDOS (
  LOJA_ID VARCHAR(100) NOT NULL, PRODUTO_ID VARCHAR(100) NOT NULL,
  SALDO INT NOT NULL CONSTRAINT CK_ESTOQUE_SALDO CHECK (SALDO >= 0),
  CONSTRAINT PK_ESTOQUE_SALDOS PRIMARY KEY (LOJA_ID, PRODUTO_ID)
);
IF OBJECT_ID('ESTOQUE_MOVIMENTOS', 'U') IS NULL
CREATE TABLE ESTOQUE_MOVIMENTOS (
  ID BIGINT IDENTITY PRIMARY KEY, LOJA_ID VARCHAR(100) NOT NULL,
  PRODUTO_ID VARCHAR(100) NOT NULL, TIPO VARCHAR(20) NOT NULL,
  QUANTIDADE INT NOT NULL CHECK (QUANTIDADE > 0),
  REFERENCIA NVARCHAR(200) NULL, CHAVE VARCHAR(120) NOT NULL,
  CRIADO_EM DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_ESTOQUE_MOVIMENTO UNIQUE (LOJA_ID, PRODUTO_ID, TIPO, CHAVE)
);`;

export async function inicializarEstoque() {
  await transacao(async tx => {
    // Dois processos podem iniciar juntos durante uma recarga/deploy.
    await new mssql.Request(tx).query(`
      DECLARE @resultado INT;
      EXEC @resultado = sp_getapplock @Resource = 'distre:estoque:schema',
        @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 30000;
      IF @resultado < 0 THROW 50001, 'Não foi possível inicializar o estoque.', 1;`);
    await new mssql.Request(tx).query(ESTOQUE_SCHEMA + CONFERENCIA_SCHEMA);
  });
}

export async function transacao<T>(run: (tx: Transaction) => Promise<T>): Promise<T> {
  if (!pool) throw new Error('Banco de dados indisponível.');
  const tx = new mssql.Transaction(pool);
  await tx.begin(mssql.ISOLATION_LEVEL.SERIALIZABLE);
  try { const result = await run(tx); await tx.commit(); return result; }
  catch (error) { await tx.rollback().catch(() => {}); throw error; }
}

export const request = (tx: Transaction, lojaId: string, produtoId: string) => new mssql.Request(tx)
  .input('loja', mssql.VarChar(100), lojaId).input('produto', mssql.VarChar(100), produtoId);

export async function listarEstoque(lojaId: string) {
  if (!pool) throw new Error('Banco de dados indisponível.');
  const r = await pool.request().input('loja', mssql.VarChar(100), lojaId).query(`
    SELECT p.ID id, p.NOME nome, p.UNIDADE unidade, p.ATIVO ativo, s.SALDO saldo
    FROM PRODUTOS p LEFT JOIN ESTOQUE_SALDOS s ON s.PRODUTO_ID = p.ID AND s.LOJA_ID = @loja
    WHERE p.LOJA_ID = @loja ORDER BY p.NOME;
    SELECT TOP (100) m.ID id, m.PRODUTO_ID produtoId, p.NOME nome, m.TIPO tipo,
      m.QUANTIDADE quantidade, m.REFERENCIA referencia, m.CRIADO_EM criadoEm
    FROM ESTOQUE_MOVIMENTOS m LEFT JOIN PRODUTOS p ON p.ID = m.PRODUTO_ID
    WHERE m.LOJA_ID = @loja ORDER BY m.ID DESC;
  `);
  if (!Array.isArray(r.recordsets)) throw new Error('Resposta de estoque inválida.');
  return { produtos: r.recordsets[0], movimentos: r.recordsets[1] };
}

export async function saldosPublicos(lojaId: string): Promise<Map<string, number>> {
  if (!pool) throw new Error('Banco de dados indisponível.');
  const r = await pool.request().input('loja', mssql.VarChar(100), lojaId)
    .query('SELECT PRODUTO_ID, SALDO FROM ESTOQUE_SALDOS WHERE LOJA_ID = @loja');
  return new Map(r.recordset.map(row => [row.PRODUTO_ID, row.SALDO]));
}

export async function movimento(tx: Transaction, lojaId: string, produtoId: string, tipo: string, quantidade: number, chave: string, referencia?: string) {
  await request(tx, lojaId, produtoId).input('tipo', mssql.VarChar(20), tipo)
    .input('qtd', mssql.Int, quantidade).input('chave', mssql.VarChar(120), chave)
    .input('ref', mssql.NVarChar(200), referencia || null).query(`
      INSERT INTO ESTOQUE_MOVIMENTOS (LOJA_ID, PRODUTO_ID, TIPO, QUANTIDADE, CHAVE, REFERENCIA)
      VALUES (@loja, @produto, @tipo, @qtd, @chave, @ref)`);
}

export async function receberMercadoria(lojaId: string, produtoId: string, quantidade: number, chave: string, referencia: string) {
  if (!Number.isSafeInteger(quantidade) || quantidade <= 0 || quantidade > 1000000)
    throw new ErroEstoque('Quantidade deve ser inteira entre 1 e 1.000.000.', 400);
  if (!/^[a-zA-Z0-9-]{8,100}$/.test(chave)) throw new ErroEstoque('Chave de recebimento inválida.', 400);
  return transacao(async tx => {
    const produto = await request(tx, lojaId, produtoId).query('SELECT ID FROM PRODUTOS WITH (UPDLOCK, HOLDLOCK) WHERE ID = @produto AND LOJA_ID = @loja');
    if (!produto.recordset.length) throw new ErroEstoque('Produto não encontrado nesta loja.', 404);
    const existente = await request(tx, lojaId, produtoId).input('chave', mssql.VarChar(120), chave).query(`
      SELECT QUANTIDADE, REFERENCIA FROM ESTOQUE_MOVIMENTOS WHERE LOJA_ID = @loja AND PRODUTO_ID = @produto AND TIPO = 'ENTRADA' AND CHAVE = @chave`);
    if (existente.recordset.length) {
      const anterior = existente.recordset[0];
      if (anterior.QUANTIDADE !== quantidade || (anterior.REFERENCIA || '') !== referencia) throw new ErroEstoque('Chave já usada em outro recebimento.');
      return { success: true, repetido: true };
    }
    await request(tx, lojaId, produtoId).input('qtd', mssql.Int, quantidade).query(`
      IF EXISTS (SELECT 1 FROM ESTOQUE_SALDOS WITH (UPDLOCK, HOLDLOCK) WHERE LOJA_ID = @loja AND PRODUTO_ID = @produto)
        UPDATE ESTOQUE_SALDOS SET SALDO = SALDO + @qtd WHERE LOJA_ID = @loja AND PRODUTO_ID = @produto;
      ELSE INSERT INTO ESTOQUE_SALDOS (LOJA_ID, PRODUTO_ID, SALDO) VALUES (@loja, @produto, @qtd);`);
    await movimento(tx, lojaId, produtoId, 'ENTRADA', quantidade, chave, referencia);
    return { success: true, repetido: false };
  });
}

export function agruparItens(itens: { produtoId: string; quantidade: number }[]) {
  const totais = new Map<string, number>();
  for (const item of itens) {
    if (!item.produtoId || !Number.isSafeInteger(item.quantidade) || item.quantidade <= 0) throw new ErroEstoque('Item de estoque inválido.', 400);
    const total = (totais.get(item.produtoId) || 0) + item.quantidade;
    if (!Number.isSafeInteger(total) || total > 1000000) throw new ErroEstoque('Quantidade total inválida.', 400);
    totais.set(item.produtoId, total);
  }
  return [...totais].sort(([a], [b]) => a.localeCompare(b));
}

// A baixa e o pedido são gravados juntos: nenhum saldo negativo nem venda parcial.
export async function salvarVendaComEstoque(entrega: Entrega, itens: { produtoId: string; quantidade: number }[], conferencia?: ItemConferencia[]) {
  const lojaId = entrega.lojaId!;
  const agrupados = agruparItens(itens);
  await transacao(async tx => {
    for (const [produtoId, quantidade] of agrupados) {
      const saldo = await request(tx, lojaId, produtoId).query('SELECT SALDO FROM ESTOQUE_SALDOS WITH (UPDLOCK, HOLDLOCK) WHERE LOJA_ID = @loja AND PRODUTO_ID = @produto');
      // Catálogo existente permanece vendável até o primeiro recebimento físico.
      if (!saldo.recordset.length) continue;
      const baixa = await request(tx, lojaId, produtoId).input('qtd', mssql.Int, quantidade).query(`
        UPDATE ESTOQUE_SALDOS SET SALDO = SALDO - @qtd WHERE LOJA_ID = @loja AND PRODUTO_ID = @produto AND SALDO >= @qtd`);
      if (!baixa.rowsAffected[0]) throw new ErroEstoque('Estoque insuficiente. Atualize o carrinho e tente novamente.');
      await movimento(tx, lojaId, produtoId, 'VENDA', quantidade, entrega.id, entrega.id);
    }
    await salvarEntrega(entrega, tx);
    if (conferencia?.length) await gravarItensConferencia(tx, entrega.id, conferencia);
  });
}

// Devolve ao saldo o que ainda não foi estornado da venda: baixa (VENDA) menos os estornos já
// feitos para o pedido (inclusive os parciais de "produto em falta"). Roda dentro da transação do chamador.
export async function estornarPedido(tx: Transaction, entrega: Entrega) {
  const r = await new mssql.Request(tx).input('loja', mssql.VarChar(100), entrega.lojaId || '')
    .input('pedido', mssql.VarChar(120), entrega.id).query(`
      SELECT v.PRODUTO_ID, v.QUANTIDADE - ISNULL((
        SELECT SUM(e.QUANTIDADE) FROM ESTOQUE_MOVIMENTOS e
        WHERE e.LOJA_ID = v.LOJA_ID AND e.PRODUTO_ID = v.PRODUTO_ID AND e.TIPO = 'ESTORNO' AND e.REFERENCIA = @pedido), 0) AS RESTANTE
      FROM ESTOQUE_MOVIMENTOS v WITH (UPDLOCK, HOLDLOCK)
      WHERE v.LOJA_ID = @loja AND v.CHAVE = @pedido AND v.TIPO = 'VENDA'
      ORDER BY v.PRODUTO_ID`);
  for (const row of r.recordset.filter(x => x.RESTANTE > 0)) {
    await request(tx, entrega.lojaId!, row.PRODUTO_ID).input('qtd', mssql.Int, row.RESTANTE)
      .query('UPDATE ESTOQUE_SALDOS SET SALDO = SALDO + @qtd WHERE LOJA_ID = @loja AND PRODUTO_ID = @produto');
    await movimento(tx, entrega.lojaId!, row.PRODUTO_ID, 'ESTORNO', row.RESTANTE, entrega.id, entrega.id);
  }
}

// Cancelamento devolve apenas o que foi efetivamente baixado, uma única vez.
export async function salvarCancelamentoComEstoque(entrega: Entrega) {
  await transacao(async tx => {
    await estornarPedido(tx, entrega);
    await salvarEntrega(entrega, tx);
  });
}
