import { describe, expect, it } from 'vitest';
import { ajustarLinhasItens, subtrairValor } from '../src/itensPedido';
import { validarEntradaFalta } from '../src/faltas';

describe('ajustarLinhasItens', () => {
  it('reduz a quantidade da linha e preserva a observação', () => {
    expect(ajustarLinhasItens(['2x Dorflex (sem receita)', '1x Água'], 'Dorflex', 1))
      .toEqual({ linhas: ['1x Dorflex (sem receita)', '1x Água'], removidas: 1 });
  });

  it('remove a linha quando todas as unidades faltam', () => {
    expect(ajustarLinhasItens(['2x Dorflex', '1x Água'], 'Dorflex', 2)).toEqual({ linhas: ['1x Água'], removidas: 2 });
  });

  it('ignora acentos e caixa ao casar o nome', () => {
    expect(ajustarLinhasItens(['1x ÁGUA Mineral'], 'agua mineral', 1)).toEqual({ linhas: [], removidas: 1 });
  });

  it('distribui entre linhas repetidas do mesmo produto, começando pela última', () => {
    expect(ajustarLinhasItens(['2x Dorflex', '3x Dorflex (urgente)'], 'Dorflex', 4))
      .toEqual({ linhas: ['1x Dorflex'], removidas: 4 });
  });

  it('linha sem "Nx" vale 1 unidade', () => {
    expect(ajustarLinhasItens(['Dorflex'], 'Dorflex', 1)).toEqual({ linhas: [], removidas: 1 });
  });

  it('informa quando não encontra unidades suficientes e não mexe em outros produtos', () => {
    expect(ajustarLinhasItens(['1x Água'], 'Dorflex', 1)).toEqual({ linhas: ['1x Água'], removidas: 0 });
    expect(ajustarLinhasItens(['1x Dorflex'], 'Dorflex', 3)).toEqual({ linhas: [], removidas: 1 });
  });
});

describe('subtrairValor', () => {
  it('trabalha em centavos, sem erro de ponto flutuante', () => {
    expect(subtrairValor(0.3, 0.1, 1)).toBe(0.2);
    expect(subtrairValor(96.8, 42.9, 2)).toBe(11);
    expect(subtrairValor(10, 5.49, 1)).toBe(4.51);
  });

  it('nunca fica negativo', () => {
    expect(subtrairValor(5, 10, 1)).toBe(0);
  });
});

describe('validarEntradaFalta', () => {
  const ok = { produtoId: 'p1', quantidade: 2, motivo: 'Sem estoque físico', desfecho: 'ITEM' as const, zerarSaldo: true, chave: 'falta-abc-123' };

  it('aceita uma entrada válida', () => {
    expect(validarEntradaFalta(ok)).toEqual(ok);
  });

  it('rejeita quantidade zero, fracionada ou negativa', () => {
    for (const quantidade of [0, 1.5, -1, NaN]) expect(() => validarEntradaFalta({ ...ok, quantidade })).toThrow(/quantidade/i);
  });

  it('exige motivo, desfecho e chave válidos', () => {
    expect(() => validarEntradaFalta({ ...ok, motivo: '  ' })).toThrow(/motivo/i);
    expect(() => validarEntradaFalta({ ...ok, desfecho: 'OUTRO' as any })).toThrow(/retirar o item|cancelar/i);
    expect(() => validarEntradaFalta({ ...ok, chave: 'curta' })).toThrow(/chave/i);
    expect(() => validarEntradaFalta({ ...ok, produtoId: '' })).toThrow(/produto/i);
  });

  it('zerarSaldo só vale quando for exatamente true', () => {
    expect(validarEntradaFalta({ ...ok, zerarSaldo: 'sim' as any }).zerarSaldo).toBe(false);
  });
});
