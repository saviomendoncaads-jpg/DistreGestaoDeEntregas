import { describe, expect, it } from 'vitest';
import { comandasOperacionais } from '../../frontend/src/operationOrders';
describe('uma comanda operacional por venda separada', () => {
  it('mantém pedido em preparo e troca o separado pela entrega vinculada, inclusive legados', () => {
    const pedido = { id: 'p1', lojaId: 'l1', tipoComanda: 'pedido' };
    expect(comandasOperacionais([pedido])).toEqual([pedido]);
    for (const vinculo of [{ pedidoOrigemId: 'p1' }, { referencia: 'Origem: Pedido p1' }]) {
      const entrega = { id: 'e1', lojaId: 'l1', tipoComanda: 'entrega', ...vinculo };
      expect(comandasOperacionais([pedido, entrega])).toEqual([entrega]);
    }
  });
  it('não oculta pedidos de outra loja nem entregas independentes', () => {
    const rows = [{ id: 'p1', lojaId: 'l1', tipoComanda: 'pedido' }, { id: 'e1', lojaId: 'l2', tipoComanda: 'entrega', referencia: 'Origem: Pedido p1' }];
    expect(comandasOperacionais(rows)).toEqual(rows);
  });
});
