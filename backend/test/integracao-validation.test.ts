import { describe, expect, it } from 'vitest';
import { validarValoresIntegracao } from '../src/integracaoValidation';
describe('valores dos pedidos integrados', () => {
  it('aceita valores que fecham em centavos', () => {
    expect(validarValoresIntegracao([{ quantidade: 3, precoUnitario: 0.1 }], { taxaEntrega: 2, desconto: 0.3, total: 2 })).toBeNull();
    expect(validarValoresIntegracao([{ quantidade: 1 }], { subtotal: 20, total: 20 })).toBeNull();
    expect(validarValoresIntegracao([{ quantidade: 1 }], { total: 20 })).toBeNull();
  });
  it('rejeita negativos, tipos errados, infinito e total incoerente', () => {
    for (const preco of [-1, NaN, Infinity, '10']) expect(validarValoresIntegracao([{ quantidade: 1, precoUnitario: preco as number }])).not.toBeNull();
    for (const valores of [{ total: -1 },{ subtotal: 10, total: 11 },{ subtotal: 10, desconto: 11 },{ subtotal: 99999999.99, taxaEntrega: 1 },{ taxaEntrega: '5' }]) expect(validarValoresIntegracao([{ quantidade: 1 }], valores as any)).not.toBeNull();
  });
});
