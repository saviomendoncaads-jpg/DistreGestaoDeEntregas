import { describe, expect, it } from 'vitest';
import { prepararProduto, gtinValido, precoVenda, publicadoNaVitrine, verificarIdentificadores, ErroCatalogo } from '../src/catalogoProduto';
import type { Produto } from '../src/types';
import { lerCsv, gerarCsv, numero, gtinValido as gtinFrontend } from '../../frontend/src/components/catalogoUtils';
const produto: Produto = { id: 'p1', lojaId: 'loja', nome: 'Produto', preco: 20, ativo: true, codigoInterno: 'MED-001', codigoBarras: '7896094988484', situacao: 'ativo', publicado: true, imagemUrl: '/uploads/foto.png' };
describe('regras do catálogo profissional', () => {
 it.each(['7896094988484', '4006381333931', '96385074', '036000291452'])('valida GTIN completo no cliente e servidor: %s', v => { expect(gtinValido(v)).toBe(true); expect(gtinFrontend(v)).toBe(true); });
 it.each(['7896094988481', '1111111111111', '123', 'abc4006381333931'])('rejeita GTIN inválido: %s', v => { expect(gtinValido(v)).toBe(false); expect(gtinFrontend(v)).toBe(false); });
 it('permite rascunho sem EAN e mantém fora da vitrine', () => { const p = prepararProduto({ nome: 'Novo', preco: 10 }); expect(p.situacao).toBe('rascunho'); expect(p.publicado).toBe(false); });
 it('exige EAN para ativar', () => expect(() => prepararProduto({ nome: 'Novo', preco: 10, situacao: 'ativo' })).toThrow('Informe o EAN'));
 it('bloqueia publicar um rascunho', () => expect(() => prepararProduto({ nome: 'Novo', preco: 10, publicado: true })).toThrow('Ative o produto'));
 it('separa situação e publicação', () => { const p = { ...produto, publicado: false }; expect(prepararProduto({ publicado: false }, produto).ativo).toBe(true); expect(publicadoNaVitrine(p)).toBe(false); expect(publicadoNaVitrine(produto)).toBe(true); expect(publicadoNaVitrine({ ...produto, situacao: 'rascunho' })).toBe(false); });
 it('preserva EAN legado ao editar campos comerciais', () => { const antigo = { ...produto, codigoBarras: '7891234567890' }; expect(prepararProduto({ marca: 'Marca' }, antigo).codigoBarras).toBe(antigo.codigoBarras); expect(() => prepararProduto({ codigoBarras: '123' }, antigo)).toThrow('EAN'); });
 it('valida promoções e usa o preço promocional na venda', () => { expect(precoVenda({ ...produto, precoPromocional: 15 })).toBe(15); expect(precoVenda(produto)).toBe(20); expect(() => prepararProduto({ precoPromocional: 21 }, produto)).toThrow('promoção'); expect(() => prepararProduto({ precoPromocional: 0 }, produto)).toThrow('promoção'); expect(prepararProduto({ precoPromocional: null }, produto).precoPromocional).toBeUndefined(); });
 it('conserva fotos e fiscal em alterações de publicação', () => { const p = prepararProduto({ publicado: false }, { ...produto, ncm: '30049099', custo: 10 }); expect(p.imagens).toEqual(['/uploads/foto.png']); expect(p.ncm).toBe('30049099'); expect(p.custo).toBe(10); });
 it('não aceita galeria excessiva ou endereços executáveis', () => { expect(() => prepararProduto({ imagens: ['javascript:alert(1)'] }, produto)).toThrow('imagens'); expect(() => prepararProduto({ imagens: Array.from({ length: 9 }, (_, i) => '/uploads/' + i) }, produto)).toThrow('imagens'); });
 it('valida dados fiscais e estoque mínimo', () => { expect(() => prepararProduto({ ncm: 'abcdefgh' }, produto)).toThrow('NCM'); expect(() => prepararProduto({ estoqueMinimo: 1.5 }, produto)).toThrow('inteiro'); });
 it('rejeita identificadores de outro produto, mas permite o próprio', () => { expect(() => verificarIdentificadores(produto, [produto])).not.toThrow(); expect(() => verificarIdentificadores({ ...produto, id: 'p2', codigoInterno: 'med-001' }, [produto])).toThrow(ErroCatalogo); });
});
describe('planilha de catálogo', () => {
 it('preserva EAN com zero inicial, acentos, aspas e quebras de linha', () => { const csv = gerarCsv([{ codigoInterno: 'MED-001', nome: 'Água "mineral"', descricao: 'Linha 1\nLinha 2', preco: 12.5, codigoBarras: '036000291452', situacao: 'rascunho', publicado: false }]); const [p] = lerCsv(csv); expect(p.nome).toBe('Água "mineral"'); expect(p.descricao).toBe('Linha 1\nLinha 2'); expect(p.codigoBarras).toBe('036000291452'); expect(p.preco).toBe(12.5); expect(p.publicado).toBe(false); });
 it('aceita CSV com vírgulas e preço decimal brasileiro', () => { expect(lerCsv('codigoInterno,nome,preco\nSKU-1,Teste,"19,90"')[0].preco).toBe(19.9); });
 it('preserva texto que poderia virar fórmula no Excel', () => { const csv = gerarCsv([{ codigoInterno: 'A', nome: '=SOMA(A1)', preco: 10, situacao: 'rascunho' }]); expect(csv).toContain("'=SOMA(A1)"); expect(lerCsv(csv)[0].nome).toBe('=SOMA(A1)'); });
 it('rejeita colunas ausentes, duplicadas e linhas incompletas', () => { expect(() => lerCsv('nome;preco\nA;10')).toThrow('colunas'); expect(() => lerCsv('codigoInterno;nome;preco;nome\n1;A;1;A')).toThrow('Colunas'); expect(() => lerCsv('codigoInterno;nome;preco\n1;A')).toThrow('colunas'); });
 it('interpreta preços sem multiplicar valores decimais por cem', () => { expect(numero('19.90')).toBe(19.9); expect(numero('1.234,56')).toBe(1234.56); expect(numero('1.000')).toBe(1000); });
});
