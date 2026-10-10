import mssql, { Transaction } from './db';
import { pool, obterProdutos, obterProdutosDaLoja } from './database';
import { Entrega } from './types';

export class ErroConferencia extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
export const CONFERENCIA_SCHEMA = `
IF OBJECT_ID('PEDIDO_CONFERENCIA_ITENS', 'U') IS NULL
CREATE TABLE PEDIDO_CONFERENCIA_ITENS (
  PEDIDO_ID VARCHAR(100) NOT NULL, PRODUTO_ID VARCHAR(100) NOT NULL,
  NOME NVARCHAR(255) NOT NULL, EAN VARCHAR(14) NULL,
  QUANTIDADE INT NOT NULL CHECK (QUANTIDADE > 0), CONFERIDA INT NOT NULL DEFAULT 0,
  PRIMARY KEY (PEDIDO_ID, PRODUTO_ID), CHECK (CONFERIDA >= 0 AND CONFERIDA <= QUANTIDADE)
);
IF OBJECT_ID('PEDIDO_CONFERENCIA_LEITURAS', 'U') IS NULL
CREATE TABLE PEDIDO_CONFERENCIA_LEITURAS (
  PEDIDO_ID VARCHAR(100) NOT NULL, CHAVE VARCHAR(100) NOT NULL,
  EAN VARCHAR(14) NOT NULL, CRIADO_EM DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  PRIMARY KEY (PEDIDO_ID, CHAVE)
);
-- Preço unitário na hora da venda: base para recalcular o total quando um item falta.
IF COL_LENGTH('PEDIDO_CONFERENCIA_ITENS', 'PRECO') IS NULL
ALTER TABLE PEDIDO_CONFERENCIA_ITENS ADD PRECO DECIMAL(10,2) NULL;
-- Produtos que faltaram na separação (auditoria; CHAVE torna o registro idempotente).
IF OBJECT_ID('PEDIDO_CONFERENCIA_FALTAS', 'U') IS NULL
CREATE TABLE PEDIDO_CONFERENCIA_FALTAS (
  ID BIGINT IDENTITY PRIMARY KEY, PEDIDO_ID VARCHAR(100) NOT NULL, PRODUTO_ID VARCHAR(100) NOT NULL,
  NOME NVARCHAR(255) NOT NULL, QUANTIDADE INT NOT NULL CHECK (QUANTIDADE > 0), PRECO DECIMAL(10,2) NULL,
  MOTIVO NVARCHAR(200) NOT NULL, DESFECHO VARCHAR(20) NOT NULL, CHAVE VARCHAR(100) NOT NULL,
  CRIADO_EM DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_CONFERENCIA_FALTA UNIQUE (PEDIDO_ID, CHAVE)
);`;

export type ItemConferencia = { produtoId: string; nome: string; ean?: string; quantidade: number; preco?: number };
export async function gravarItensConferencia(tx: Transaction, pedidoId: string, itens: ItemConferencia[]) {
  const agrupados = new Map<string, ItemConferencia>();
  for (const item of itens) {
    const anterior = agrupados.get(item.produtoId);
    agrupados.set(item.produtoId, { ...item, quantidade: (anterior?.quantidade || 0) + item.quantidade });
  }
  for (const item of agrupados.values()) await new mssql.Request(tx)
    .input('pedido', mssql.VarChar(100), pedidoId).input('produto', mssql.VarChar(100), item.produtoId)
    .input('nome', mssql.NVarChar(255), item.nome).input('ean', mssql.VarChar(14), item.ean || null)
    .input('qtd', mssql.Int, item.quantidade).input('preco', mssql.Decimal(10, 2), item.preco ?? null).query(`INSERT INTO PEDIDO_CONFERENCIA_ITENS
      (PEDIDO_ID, PRODUTO_ID, NOME, EAN, QUANTIDADE, PRECO) VALUES (@pedido, @produto, @nome, @ean, @qtd, @preco)`);
}

async function txRun<T>(run: (tx: Transaction) => Promise<T>) {
  if (!pool) throw new Error('Banco indisponível.');
  const tx = new mssql.Transaction(pool);
  await tx.begin(mssql.ISOLATION_LEVEL.SERIALIZABLE);
  try { const result = await run(tx); await tx.commit(); return result; }
  catch (e) { await tx.rollback().catch(() => {}); throw e; }
}

export const reqPedido = (tx: Transaction, pedido: string) => new mssql.Request(tx).input('pedido', mssql.VarChar(100), pedido);
// `preco` (valor na venda) e `controlado` (produto tem saldo em ESTOQUE_SALDOS) alimentam a tela de "produto em falta".
export async function lerItens(tx: Transaction, pedido: string) {
  const r = await reqPedido(tx, pedido).query(`SELECT i.PRODUTO_ID produtoId, i.NOME nome, i.EAN ean,
    i.QUANTIDADE quantidade, i.CONFERIDA conferida, i.PRECO preco,
    CAST(CASE WHEN EXISTS (SELECT 1 FROM ESTOQUE_SALDOS s JOIN ENTREGAS e ON e.LOJA_ID = s.LOJA_ID
      WHERE e.ID = i.PEDIDO_ID AND s.PRODUTO_ID = i.PRODUTO_ID) THEN 1 ELSE 0 END AS BIT) controlado
    FROM PEDIDO_CONFERENCIA_ITENS i WHERE i.PEDIDO_ID = @pedido ORDER BY i.NOME`);
  return r.recordset;
}

export async function listarFaltas(tx: Transaction, pedido: string) {
  const r = await reqPedido(tx, pedido).query(`SELECT PRODUTO_ID produtoId, NOME nome, QUANTIDADE quantidade,
    MOTIVO motivo, DESFECHO desfecho FROM PEDIDO_CONFERENCIA_FALTAS WHERE PEDIDO_ID = @pedido ORDER BY ID`);
  return r.recordset;
}

export function resolverItensAntigos(linhas: string[], produtos: { id: string; nome: string; preco?: number; codigoBarras?: string }[]): ItemConferencia[] {
  const norm = (s: string) => s.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return linhas.map(linha => {
    const m = linha.match(/^\s*(\d+)\s*x\s+(.+)$/i);
    const nome = (m ? m[2] : linha).replace(/\s*\([^()]*\)\s*$/, '');
    const encontrados = produtos.filter(p => norm(p.nome) === norm(nome));
    if (encontrados.length !== 1) throw new ErroConferencia(`Não foi possível identificar "${nome}" no catálogo. Revise o cadastro antes de conferir.`);
    return { produtoId: encontrados[0].id, nome: encontrados[0].nome, ean: encontrados[0].codigoBarras, preco: encontrados[0].preco, quantidade: m ? Number(m[1]) : 1 };
  });
}

export async function iniciarConferencia(order: Entrega) {
  if (!order.lojaId) throw new ErroConferencia('Pedido sem loja vinculada.');
  const produtos = [...await obterProdutos(order.lojaId), ...await obterProdutosDaLoja(order.lojaId)];
  const catalogo = [...new Map(produtos.map(p => [p.id, p])).values()];
  return txRun(async tx => {
    const estado = await reqPedido(tx, order.id).query("SELECT STATUS FROM ENTREGAS WITH (UPDLOCK, HOLDLOCK) WHERE ID = @pedido AND TIPO_COMANDA = 'pedido'");
    if (estado.recordset[0]?.STATUS !== 'EM_PREPARO') throw new ErroConferencia('O pedido precisa estar em separação.');
    let itens = await lerItens(tx, order.id);
    if (!itens.length) {
      if (!order.itens.length) throw new ErroConferencia('Pedido sem itens para conferir.');
      await gravarItensConferencia(tx, order.id, resolverItensAntigos(order.itens, catalogo));
      itens = await lerItens(tx, order.id);
    }
    // Produtos antigos podem ter recebido o EAN depois da criação do pedido.
    for (const item of itens.filter(i => i.conferida === 0)) {
      const ean = catalogo.find(p => p.id === item.produtoId)?.codigoBarras;
      if (ean && ean !== item.ean) await reqPedido(tx, order.id).input('produto', mssql.VarChar(100), item.produtoId)
        .input('ean', mssql.VarChar(14), ean).query('UPDATE PEDIDO_CONFERENCIA_ITENS SET EAN = @ean WHERE PEDIDO_ID = @pedido AND PRODUTO_ID = @produto');
    }
    // Pedidos anteriores ao registro de preço: só assume o preço atual do cadastro quando a soma
    // fecha com o total da comanda — assim nunca se recalcula o valor com um preço diferente do cobrado.
    if (itens.some(i => i.preco == null) && order.valor != null) {
      const precos = itens.map(i => i.preco ?? catalogo.find(p => p.id === i.produtoId)?.preco);
      const soma = itens.reduce((n, i, k) => n + Math.round((precos[k] ?? NaN) * 100) * i.quantidade, 0);
      if (precos.every(p => p != null) && soma === Math.round(order.valor * 100)) {
        for (const [k, item] of itens.entries()) if (item.preco == null) await reqPedido(tx, order.id).input('produto', mssql.VarChar(100), item.produtoId)
          .input('preco', mssql.Decimal(10, 2), precos[k]).query('UPDATE PEDIDO_CONFERENCIA_ITENS SET PRECO = @preco WHERE PEDIDO_ID = @pedido AND PRODUTO_ID = @produto AND PRECO IS NULL');
      }
    }
    return { itens: await lerItens(tx, order.id), faltas: await listarFaltas(tx, order.id) };
  });
}

export async function registrarLeitura(pedido: string, lojaId: string, ean: string, chave: string) {
  if (!/^(\d{8}|\d{12,14})$/.test(ean) || !/^[a-zA-Z0-9-]{8,100}$/.test(chave)) throw new ErroConferencia('EAN ou chave de leitura inválidos.', 400);
  return txRun(async tx => {
    const order = await reqPedido(tx, pedido).input('loja', mssql.VarChar(100), lojaId)
      .query("SELECT STATUS FROM ENTREGAS WITH (UPDLOCK, HOLDLOCK) WHERE ID = @pedido AND LOJA_ID = @loja AND TIPO_COMANDA = 'pedido'");
    if (order.recordset[0]?.STATUS !== 'EM_PREPARO') throw new ErroConferencia('Pedido indisponível para conferência.');
    const leitura = await reqPedido(tx, pedido).input('chave', mssql.VarChar(100), chave)
      .query('SELECT EAN FROM PEDIDO_CONFERENCIA_LEITURAS WHERE PEDIDO_ID = @pedido AND CHAVE = @chave');
    if (leitura.recordset.length) {
      if (leitura.recordset[0].EAN !== ean) throw new ErroConferencia('Chave usada com outro EAN.');
      return { itens: await lerItens(tx, pedido) };
    }
    const itens = await lerItens(tx, pedido);
    const encontrados = itens.filter(i => i.ean === ean);
    if (encontrados.length !== 1) throw new ErroConferencia(encontrados.length ? 'EAN duplicado no pedido. Corrija os códigos do catálogo.' : 'Este código não pertence aos produtos deste pedido.');
    const item = encontrados[0];
    if (item.conferida >= item.quantidade) throw new ErroConferencia('Todas as unidades deste produto já foram conferidas.');
    await reqPedido(tx, pedido).input('produto', mssql.VarChar(100), item.produtoId)
      .query('UPDATE PEDIDO_CONFERENCIA_ITENS SET CONFERIDA = CONFERIDA + 1 WHERE PEDIDO_ID = @pedido AND PRODUTO_ID = @produto AND CONFERIDA < QUANTIDADE');
    await reqPedido(tx, pedido).input('ean', mssql.VarChar(14), ean).input('chave', mssql.VarChar(100), chave)
      .query('INSERT INTO PEDIDO_CONFERENCIA_LEITURAS (PEDIDO_ID, CHAVE, EAN) VALUES (@pedido, @chave, @ean)');
    return { itens: await lerItens(tx, pedido) };
  });
}

export async function exigirConferenciaCompleta(pedido: string) {
  if (!pool) throw new Error('Banco indisponível.');
  const r = await pool.request().input('pedido', mssql.VarChar(100), pedido)
    .query('SELECT QUANTIDADE, CONFERIDA FROM PEDIDO_CONFERENCIA_ITENS WHERE PEDIDO_ID = @pedido');
  if (!r.recordset.length || r.recordset.some(i => i.CONFERIDA !== i.QUANTIDADE)) throw new ErroConferencia('Confira todas as unidades pelo EAN antes de concluir a separação.');
}
