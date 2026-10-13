import { describe, it, expect } from 'vitest';
import { configPadrao, validarConfigVitrine, lerConfigVitrine, erroRegraCompra, urlVitrine } from '../src/configVitrine';
import { configPadrao as padraoCliente } from '../../frontend/src/cliente/configVitrine';
describe('parametrização pública da vitrine', () => {
 it('preserva o comportamento anterior em lojas sem configuração', () => { expect(lerConfigVitrine(null)).toEqual(configPadrao()); expect(padraoCliente()).toEqual(configPadrao()); expect(erroRegraCompra(configPadrao(),1,'pix')).toBeUndefined(); });
 it('mantém a ordem de seções, categorias, produtos e campanhas', () => { const c = validarConfigVitrine({ ...configPadrao(), secoes:['destaques','banners'], categoriasDestaque:['B','A'], produtosDestaque:['p2','p1'], banners:[{ titulo:'Campanha',texto:'Texto',botao:'Ver ofertas',categoria:'Ofertas',imagemUrl:'/uploads/banner.webp',ativo:true }] }); expect(c.secoes).toEqual(['destaques','banners']); expect(c.produtosDestaque).toEqual(['p2','p1']); expect(c.banners[0].imagemUrl).toBe('/uploads/banner.webp'); });
 it.each(['javascript:alert(1)','data:text/html,x','//externo.com/image','https://user:senha@example.com/imagem'])('rejeita imagens inseguras %s', url => expect(() => urlVitrine(url)).toThrow());
 it('rejeita links de redes sociais fora do Instagram e cores inválidas', () => { expect(() => validarConfigVitrine({ instagram:'https://example.com' })).toThrow('Instagram'); expect(() => validarConfigVitrine({ cor:'red' })).toThrow('cor'); });
 it('exige pelo menos um pagamento e limita banners e destaques', () => { expect(() => validarConfigVitrine({ pagamentos:[] })).toThrow('pagamento'); expect(() => validarConfigVitrine({ banners:Array(7).fill({}) })).toThrow('6 banners'); expect(() => validarConfigVitrine({ limiteDestaques:25 })).toThrow('24'); });
 it('bloqueia compras enquanto pausada sem depender do navegador', () => expect(erroRegraCompra({ ...configPadrao(), pausada:true, mensagemPausa:'Voltamos amanhã' },100,'pix')).toBe('Voltamos amanhã'));
 it('valida pedido mínimo em centavos e pagamento habilitado', () => { const c = { ...configPadrao(),pedidoMinimo:20.1,pagamentos:['dinheiro' as const] }; expect(erroRegraCompra(c,20.1,'dinheiro')).toBeUndefined(); expect(erroRegraCompra(c,20.09,'dinheiro')).toContain('mínimo'); expect(erroRegraCompra(c,100,'pix')).toContain('pagamento'); });
 it.each([-1,NaN,Infinity,'10'])('rejeita pedido mínimo inválido %s', pedidoMinimo => expect(() => validarConfigVitrine({ pedidoMinimo })).toThrow('mínimo'));
 it('não aceita campos administrativos na configuração pública', () => expect(validarConfigVitrine({ senhaHash:'segredo',statusFinanceiro:'REGULAR' })).toEqual(configPadrao()));
});
