import mssql, { Transaction } from './db';
import { entregaDoRegistro, salvarEntrega } from './database';
import { transacao, estornarPedido } from './estoque';
import type { Entrega } from './types';

export class ErroPedido extends Error {
  constructor(message: string, public status = 409) { super(message); }
}

export function pedidoOrigemId(entrega: Pick<Entrega, 'pedidoOrigemId' | 'referencia'>): string | undefined {
  return entrega.pedidoOrigemId || entrega.referencia?.match(/^Origem: Pedido (\S+)$/)?.[1];
}

async function bloquear(tx: Transaction, id: string, lojaId: string | undefined): Promise<Entrega> {
  const r = await new mssql.Request(tx).input('id', mssql.VarChar(50), id)
    .query('SELECT * FROM ENTREGAS WITH (UPDLOCK, HOLDLOCK) WHERE ID = @id');
  if (!r.recordset.length || r.recordset[0].LOJA_ID !== (lojaId || null)) throw new ErroPedido('Comanda não encontrada nesta loja.', 404);
  return entregaDoRegistro(r.recordset[0]);
}

/** Bloqueia a venda antes de conferir/gravar; retries retornam a mesma entrega. */
export async function finalizarPedidoParaEntrega(pedido: Entrega, novoId: string) {
  return transacao(async tx => {
    const atual = await bloquear(tx, pedido.id, pedido.lojaId);
    if (atual.tipoComanda !== 'pedido') throw new ErroPedido('Esta comanda não é um pedido.', 400);
    const existentes = await new mssql.Request(tx).input('pedido', mssql.VarChar(50), atual.id)
      .input('loja', mssql.VarChar(100), atual.lojaId || null).input('referencia', mssql.NVarChar, `Origem: Pedido ${atual.id}`)
      .query(`SELECT TOP (2) * FROM ENTREGAS WITH (UPDLOCK, HOLDLOCK) WHERE TIPO_COMANDA = 'entrega'
        AND LOJA_ID = @loja AND (PEDIDO_ORIGEM_ID = @pedido OR REFERENCIA = @referencia)`);
    if (existentes.recordset.length > 1) throw new ErroPedido('Pedido com mais de uma entrega legada. Revise o vínculo antes de continuar.');
    if (existentes.recordset.length === 1) {
      const entrega = entregaDoRegistro(existentes.recordset[0]);
      return { pedido: { ...atual, entregaVinculadaId: entrega.id }, entrega, repetido: true };
    }
    if (atual.status !== 'EM_PREPARO') throw new ErroPedido('O pedido precisa estar em separação.');
    const colisao = await new mssql.Request(tx).input('id', mssql.VarChar(50), novoId)
      .query('SELECT ID FROM ENTREGAS WITH (UPDLOCK, HOLDLOCK) WHERE ID = @id');
    if (colisao.recordset.length) throw new ErroPedido('Identificador de entrega já utilizado. Tente novamente.');
    const conferencia = await new mssql.Request(tx).input('pedido', mssql.VarChar(50), atual.id)
      .query('SELECT QUANTIDADE, CONFERIDA FROM PEDIDO_CONFERENCIA_ITENS WITH (HOLDLOCK) WHERE PEDIDO_ID = @pedido');
    if (!conferencia.recordset.length || conferencia.recordset.some(i => i.QUANTIDADE !== i.CONFERIDA)) throw new ErroPedido('Confira todas as unidades pelo EAN antes de concluir a separação.');
    const agora = new Date().toISOString();
    const separado: Entrega = { ...atual, status: 'SEPARADO', atualizadoEm: agora, entregaVinculadaId: novoId };
    const entrega: Entrega = { ...atual, id: novoId, pedidoOrigemId: atual.id, entregaVinculadaId: undefined,
      tipoComanda: 'entrega', status: 'RECEBIDO', criadoEm: agora, atualizadoEm: agora,
      referencia: `Origem: Pedido ${atual.id}`, motorista: undefined, rota: undefined, telemetria: undefined,
      incidentes: [], logsWebhook: [], despachadoEm: undefined, dataHoraConclusao: undefined };
    await salvarEntrega(separado, tx);
    await salvarEntrega(entrega, tx);
    return { pedido: separado, entrega, repetido: false };
  });
}

/** Recebimento integral vendável: estorna a venda de origem e conclui o retorno atomicamente. */
export async function receberRetornoIntegral(entrega: Entrega, origem?: Entrega) {
  const origemId = pedidoOrigemId(entrega);
  if (origemId && (!origem || origem.id !== origemId || origem.lojaId !== entrega.lojaId)) throw new ErroPedido('Venda de origem não disponível. Revise o vínculo antes de devolver o estoque.');
  return transacao(async tx => {
    // A ordem de locks é venda→entrega, igual à finalização.
    const venda = origem ? await bloquear(tx, origem.id, origem.lojaId) : undefined;
    if (venda) {
      const vinculos = await new mssql.Request(tx).input('pedido', mssql.VarChar(50), venda.id)
        .input('loja', mssql.VarChar(100), venda.lojaId!).input('referencia', mssql.NVarChar, `Origem: Pedido ${venda.id}`)
        .query("SELECT ID FROM ENTREGAS WHERE TIPO_COMANDA='entrega' AND LOJA_ID=@loja AND (PEDIDO_ORIGEM_ID=@pedido OR REFERENCIA=@referencia)");
      if (vinculos.recordset.length !== 1 || vinculos.recordset[0].ID !== entrega.id) throw new ErroPedido('Vínculo de entrega ambíguo. Revise o pedido antes de devolver o estoque.');
    }
    const atual = await bloquear(tx, entrega.id, entrega.lojaId);
    if (pedidoOrigemId(atual) !== origemId) throw new ErroPedido('O vínculo da entrega mudou. Atualize o painel.');
    if (atual.status === 'PRODUTO_RETORNADO_ESTOQUE') return { entrega: atual, pedido: venda, repetido: true };
    if (atual.status !== 'AGUARDANDO_RETORNO_CD') throw new ErroPedido('Entrega não está aguardando retorno à loja.');
    const agora = new Date().toISOString();
    const retornada: Entrega = { ...atual, status: 'PRODUTO_RETORNADO_ESTOQUE', atualizadoEm: agora,
      motorista: atual.motorista ? { ...atual.motorista, status: 'ocioso' } : undefined };
    await estornarPedido(tx, venda || atual);
    const pedido = venda ? { ...venda, status: 'PRODUTO_RETORNADO_ESTOQUE' as const, atualizadoEm: agora } : undefined;
    if (pedido) await salvarEntrega(pedido, tx);
    await salvarEntrega(retornada, tx);
    return { entrega: retornada, pedido, repetido: false };
  });
}
