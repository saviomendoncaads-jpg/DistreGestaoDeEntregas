import mssql, { Transaction } from './db';
import { salvarEntrega } from './database';
import { Entrega, StatusEntrega } from './types';
import { ErroConferencia, listarFaltas, lerItens, reqPedido } from './conferencia';
import { estornarPedido, movimento, request as reqEstoque, transacao } from './estoque';
import { ajustarLinhasItens, subtrairValor } from './itensPedido';

// ============================================================================
// PRODUTO EM FALTA NA SEPARAÇÃO
// Na conferência o operador pode descobrir que um produto não existe na prateleira.
// Dois desfechos, ambos numa única transação SERIALIZABLE (tudo ou nada):
//   ITEM   → só as unidades que faltaram saem do pedido; o total é recalculado e a
//            separação continua com o que sobrou.
//   PEDIDO → o pedido inteiro é cancelado e o que já estava baixado volta ao estoque.
// Se as unidades que faltam são TODAS as do pedido, o desfecho vira PEDIDO sozinho.
// Estoque: as unidades que faltaram são estornadas da venda (o cliente não as levará).
// Opcionalmente o saldo do produto é zerado (ajuste de inventário) para a vitrine
// parar de vender o que a prateleira provou não ter.
// ============================================================================

export type DesfechoFalta = 'ITEM' | 'PEDIDO';
export interface EntradaFalta {
  produtoId: string;
  quantidade: number;
  motivo: string;
  desfecho: DesfechoFalta;
  zerarSaldo: boolean;
  chave: string;
}

export interface ResultadoFalta {
  repetido: boolean;
  cancelado: boolean;
  itens: unknown[];
  faltas: unknown[];
  /** Estado novo da comanda (a rota aplica na memória e avisa o painel). Ausente quando repetido. */
  pedido?: Entrega;
}

const CHAVE_OK = /^[a-zA-Z0-9-]{8,64}$/;

export function validarEntradaFalta(e: Partial<EntradaFalta>): EntradaFalta {
  const quantidade = Number(e.quantidade);
  const motivo = String(e.motivo ?? '').trim();
  if (!e.produtoId || typeof e.produtoId !== 'string' || e.produtoId.length > 100) throw new ErroConferencia('Produto inválido.', 400);
  if (!Number.isSafeInteger(quantidade) || quantidade < 1 || quantidade > 99999) throw new ErroConferencia('Informe uma quantidade inteira maior que zero.', 400);
  if (motivo.length < 3 || motivo.length > 180) throw new ErroConferencia('Informe o motivo da falta (3 a 180 caracteres).', 400);
  if (e.desfecho !== 'ITEM' && e.desfecho !== 'PEDIDO') throw new ErroConferencia('Escolha entre retirar o item ou cancelar o pedido.', 400);
  if (typeof e.chave !== 'string' || !CHAVE_OK.test(e.chave)) throw new ErroConferencia('Chave da operação inválida.', 400);
  return { produtoId: e.produtoId, quantidade, motivo, desfecho: e.desfecho, zerarSaldo: e.zerarSaldo === true, chave: e.chave };
}

export async function registrarFalta(order: Entrega, entrada: EntradaFalta): Promise<ResultadoFalta> {
  if (!order.lojaId) throw new ErroConferencia('Pedido sem loja vinculada.');
  const lojaId = order.lojaId;
  const { produtoId, quantidade, motivo, zerarSaldo, chave } = entrada;
  if (`${order.id}:falta:${chave}`.length > 120) throw new ErroConferencia('Chave da operação inválida.', 400);

  return transacao(async (tx: Transaction) => {
    const estado = await reqPedido(tx, order.id).input('loja', mssql.VarChar(100), lojaId)
      .query("SELECT STATUS FROM ENTREGAS WITH (UPDLOCK, HOLDLOCK) WHERE ID = @pedido AND LOJA_ID = @loja AND TIPO_COMANDA = 'pedido'");
    const status = estado.recordset[0]?.STATUS;

    // Repetição da mesma requisição (duplo clique, retry de rede): devolve o resultado sem reaplicar.
    const anterior = await reqPedido(tx, order.id).input('chave', mssql.VarChar(100), chave)
      .query('SELECT PRODUTO_ID, QUANTIDADE, DESFECHO FROM PEDIDO_CONFERENCIA_FALTAS WHERE PEDIDO_ID = @pedido AND CHAVE = @chave');
    if (anterior.recordset.length) {
      const a = anterior.recordset[0];
      if (a.PRODUTO_ID !== produtoId || a.QUANTIDADE !== quantidade) throw new ErroConferencia('Chave já usada em outra operação.');
      return { repetido: true, cancelado: a.DESFECHO === 'PEDIDO_CANCELADO', itens: await lerItens(tx, order.id), faltas: await listarFaltas(tx, order.id) };
    }

    if (status !== 'EM_PREPARO') throw new ErroConferencia('O pedido precisa estar em separação.');

    const itemRes = await reqPedido(tx, order.id).input('produto', mssql.VarChar(100), produtoId).query(
      'SELECT NOME, QUANTIDADE, CONFERIDA, PRECO FROM PEDIDO_CONFERENCIA_ITENS WITH (UPDLOCK, HOLDLOCK) WHERE PEDIDO_ID = @pedido AND PRODUTO_ID = @produto');
    const item = itemRes.recordset[0];
    if (!item) throw new ErroConferencia('Este produto não faz parte do pedido.', 404);
    const pendentes: number = item.QUANTIDADE - item.CONFERIDA;
    if (pendentes < 1) throw new ErroConferencia('Todas as unidades deste produto já foram conferidas.');
    if (quantidade > pendentes) throw new ErroConferencia(`Só ${pendentes === 1 ? 'resta 1 unidade' : `restam ${pendentes} unidades`} para conferir deste produto.`, 400);

    const outros = await reqPedido(tx, order.id).input('produto', mssql.VarChar(100), produtoId)
      .query('SELECT ISNULL(SUM(QUANTIDADE), 0) AS TOTAL FROM PEDIDO_CONFERENCIA_ITENS WHERE PEDIDO_ID = @pedido AND PRODUTO_ID <> @produto');
    const sobraAlgo = outros.recordset[0].TOTAL > 0 || quantidade < item.QUANTIDADE;
    const cancelarPedido = entrada.desfecho === 'PEDIDO' || !sobraAlgo;
    const agora = new Date().toISOString();
    const descricao = `${quantidade}x ${item.NOME} (${motivo})`;
    let novo: Entrega;

    if (cancelarPedido) {
      novo = {
        ...order, status: 'CANCELADO' as StatusEntrega, atualizadoEm: agora, dataHoraConclusao: agora,
        referencia: [order.referencia, `Cancelamento: produto em falta — ${descricao}`].filter(Boolean).join(' | '),
      };
      await estornarPedido(tx, novo); // devolve tudo o que ainda não tinha sido estornado
      await salvarEntrega(novo, tx);
    } else {
      if (item.PRECO == null) throw new ErroConferencia('Não foi possível calcular o novo valor deste item. Cancele o pedido inteiro ou ajuste o valor manualmente.');
      const ajuste = ajustarLinhasItens(order.itens, item.NOME, quantidade);
      if (ajuste.removidas !== quantidade) throw new ErroConferencia('Não foi possível localizar este item na comanda. Cancele o pedido inteiro.');
      novo = {
        ...order, itens: ajuste.linhas, atualizadoEm: agora,
        valor: order.valor != null ? subtrairValor(order.valor, Number(item.PRECO), quantidade) : order.valor,
        referencia: [order.referencia, `Faltou: ${descricao}`].filter(Boolean).join(' | '),
      };
      // Estorna só as unidades que faltaram (venda − estornos anteriores), se o produto tem controle de saldo.
      const venda = await reqEstoque(tx, lojaId, produtoId).input('pedido', mssql.VarChar(120), order.id).query(`
        SELECT v.QUANTIDADE - ISNULL((SELECT SUM(e.QUANTIDADE) FROM ESTOQUE_MOVIMENTOS e WHERE e.LOJA_ID = v.LOJA_ID
          AND e.PRODUTO_ID = v.PRODUTO_ID AND e.TIPO = 'ESTORNO' AND e.REFERENCIA = @pedido), 0) AS RESTANTE
        FROM ESTOQUE_MOVIMENTOS v WITH (UPDLOCK, HOLDLOCK)
        WHERE v.LOJA_ID = @loja AND v.PRODUTO_ID = @produto AND v.TIPO = 'VENDA' AND v.CHAVE = @pedido`);
      const devolver = Math.min(quantidade, venda.recordset[0]?.RESTANTE ?? 0);
      if (devolver > 0) {
        await reqEstoque(tx, lojaId, produtoId).input('qtd', mssql.Int, devolver)
          .query('UPDATE ESTOQUE_SALDOS SET SALDO = SALDO + @qtd WHERE LOJA_ID = @loja AND PRODUTO_ID = @produto');
        await movimento(tx, lojaId, produtoId, 'ESTORNO', devolver, `${order.id}:falta:${chave}`, order.id);
      }
      if (quantidade === item.QUANTIDADE) {
        await reqPedido(tx, order.id).input('produto', mssql.VarChar(100), produtoId)
          .query('DELETE FROM PEDIDO_CONFERENCIA_ITENS WHERE PEDIDO_ID = @pedido AND PRODUTO_ID = @produto');
      } else {
        await reqPedido(tx, order.id).input('produto', mssql.VarChar(100), produtoId).input('qtd', mssql.Int, quantidade)
          .query('UPDATE PEDIDO_CONFERENCIA_ITENS SET QUANTIDADE = QUANTIDADE - @qtd WHERE PEDIDO_ID = @pedido AND PRODUTO_ID = @produto');
      }
      await salvarEntrega(novo, tx);
    }

    // Ajuste de inventário: a prateleira provou que não há mais unidades — zera o saldo (após os estornos acima).
    if (zerarSaldo) {
      const saldo = await reqEstoque(tx, lojaId, produtoId).query('SELECT SALDO FROM ESTOQUE_SALDOS WITH (UPDLOCK, HOLDLOCK) WHERE LOJA_ID = @loja AND PRODUTO_ID = @produto');
      const atual: number = saldo.recordset[0]?.SALDO ?? 0;
      if (atual > 0) {
        await reqEstoque(tx, lojaId, produtoId).query('UPDATE ESTOQUE_SALDOS SET SALDO = 0 WHERE LOJA_ID = @loja AND PRODUTO_ID = @produto');
        await movimento(tx, lojaId, produtoId, 'AJUSTE', atual, `${order.id}:ajuste:${chave}`, `Falta na separação ${order.id}: saldo zerado`);
      }
    }

    await reqPedido(tx, order.id).input('produto', mssql.VarChar(100), produtoId).input('nome', mssql.NVarChar(255), item.NOME)
      .input('qtd', mssql.Int, quantidade).input('preco', mssql.Decimal(10, 2), item.PRECO ?? null).input('motivo', mssql.NVarChar(200), motivo)
      .input('desfecho', mssql.VarChar(20), cancelarPedido ? 'PEDIDO_CANCELADO' : 'ITEM_REMOVIDO').input('chave', mssql.VarChar(100), chave)
      .query(`INSERT INTO PEDIDO_CONFERENCIA_FALTAS (PEDIDO_ID, PRODUTO_ID, NOME, QUANTIDADE, PRECO, MOTIVO, DESFECHO, CHAVE)
              VALUES (@pedido, @produto, @nome, @qtd, @preco, @motivo, @desfecho, @chave)`);

    return { repetido: false, cancelado: cancelarPedido, itens: await lerItens(tx, order.id), faltas: await listarFaltas(tx, order.id), pedido: novo };
  });
}
