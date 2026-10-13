export interface BannerLoja { titulo: string; texto: string; botao: string; categoria: string; imagemUrl: string; ativo: boolean }
export interface ConfigVitrine {
  nomePublico: string; cor: string; anuncio: string; sobre: string; whatsapp: string;
  instagram: string; horarioTexto: string; seoTitulo: string; seoDescricao: string;
  pausada: boolean; mensagemPausa: string; pedidoMinimo: number;
  pagamentos: ('pix' | 'cartao' | 'dinheiro')[];
  secoes: ('banners' | 'categorias' | 'destaques')[];
  categoriasDestaque: string[]; produtosDestaque: string[]; limiteDestaques: number;
  banners: BannerLoja[];
}
export const configPadrao = (): ConfigVitrine => ({ nomePublico: '', cor: '#2563eb', anuncio: '', sobre: '', whatsapp: '', instagram: '', horarioTexto: '', seoTitulo: '', seoDescricao: '', pausada: false, mensagemPausa: 'Esta loja não está aceitando pedidos online no momento.', pedidoMinimo: 0, pagamentos: ['pix','cartao','dinheiro'], secoes: ['banners','categorias','destaques'], categoriasDestaque: [], produtosDestaque: [], limiteDestaques: 10, banners: [] });
