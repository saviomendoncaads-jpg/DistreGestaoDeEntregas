import { describe,it,expect } from 'vitest';
import { limiteQuantidade,somarQuantidade } from '../../frontend/src/cliente/quantidadeCompra';
describe('quantidade selecionada na ficha do produto',()=>{
 it('adiciona várias unidades à quantidade existente sem ultrapassar o estoque',()=>{expect(somarQuantidade(2,3,10)).toBe(5);expect(somarQuantidade(2,20,4)).toBe(4);});
 it('limita compras a 99 unidades quando o estoque não é informado',()=>{expect(limiteQuantidade()).toBe(99);expect(somarQuantidade(95,10)).toBe(99);});
 it('mantém fora da sacola produtos sem estoque',()=>{expect(somarQuantidade(0,2,0)).toBe(0);expect(limiteQuantidade(-1)).toBe(0);});
 it.each([0,-1,1.5,NaN,Infinity])('não adiciona quantidade inválida %s',q=>expect(somarQuantidade(2,q,10)).toBe(2));
});
