import { describe, expect, it } from 'vitest';
import { groupByShop } from '../src/shopSnapshots';
describe('isolamento dos snapshots operacionais', () => {
  it('mantém lojas separadas e exclui registros globais das salas de loja', () => {
    const records = [{ id: 1, lojaId: 'a' }, { id: 2, lojaId: 'b' }, { id: 3, lojaId: 'a' }, { id: 4 }];
    const groups = groupByShop(records);
    expect(groups.get('a')?.map(r => r.id)).toEqual([1, 3]);
    expect(groups.get('b')?.map(r => r.id)).toEqual([2]);
    expect(groups.size).toBe(2);
    expect(records).toHaveLength(4);
  });
});
