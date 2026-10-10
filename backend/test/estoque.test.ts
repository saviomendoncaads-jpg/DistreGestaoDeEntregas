import { describe, it, expect, vi } from 'vitest';
vi.mock('../src/database', () => ({ pool: undefined, salvarEntrega: vi.fn() }));
import { agruparItens, receberMercadoria } from '../src/estoque';

describe('validação do estoque', () => {
  it('soma produtos repetidos e ordena para aquisição consistente dos locks', () => {
    expect(agruparItens([{ produtoId: 'b', quantidade: 2 }, { produtoId: 'a', quantidade: 1 }, { produtoId: 'b', quantidade: 3 }])).toEqual([['a', 1], ['b', 5]]);
  });
  it.each([0, -1, 1.5, NaN, Infinity, 1000001])('rejeita quantidade inválida: %s', quantidade => {
    expect(() => agruparItens([{ produtoId: 'a', quantidade }])).toThrow();
  });
  it('rejeita soma excessiva dos itens repetidos', () => {
    expect(() => agruparItens([{ produtoId: 'a', quantidade: 600000 }, { produtoId: 'a', quantidade: 600000 }])).toThrow();
  });
  it('rejeita recebimento com chave inválida antes de acessar o banco', async () => {
    await expect(receberMercadoria('loja', 'a', 1, 'x', '')).rejects.toThrow('Chave');
  });
});
