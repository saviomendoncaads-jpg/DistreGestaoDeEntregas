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
export class ErroConfigVitrine extends Error {}
export function urlVitrine(valor: unknown): string {
  if (valor === undefined || valor === null || valor === '') return '';
  if (typeof valor !== 'string' || valor.length > 600) throw new ErroConfigVitrine('URL de imagem inválida.');
  if (!valor.trim()) return '';
  const s = valor.trim();
  if (/^\/uploads\/[\w.-]+$/.test(s)) return s;
  try { const u = new URL(s); if (!u.username && !u.password && (u.protocol === 'https:' || u.protocol === 'http:')) return u.href; } catch {}
  throw new ErroConfigVitrine('Use uma URL de imagem HTTP/HTTPS válida.');
}
export function validarConfigVitrine(valor: unknown): ConfigVitrine {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new ErroConfigVitrine('Configuração inválida.');
  const v = valor as Record<string, unknown>; const c = configPadrao();
  const texto = (key: string, max: number) => { const t = v[key]; if (t === undefined) return ''; if (typeof t !== 'string' || t.length > max) throw new ErroConfigVitrine(`Revise o campo ${key} (até ${max} caracteres).`); return t.trim(); };
  c.nomePublico = texto('nomePublico',100); c.anuncio = texto('anuncio',180); c.sobre = texto('sobre',1000); c.horarioTexto = texto('horarioTexto',200); c.seoTitulo = texto('seoTitulo',70); c.seoDescricao = texto('seoDescricao',160);
  c.cor = texto('cor',7) || c.cor; if (!/^#[0-9a-f]{6}$/i.test(c.cor)) throw new ErroConfigVitrine('Escolha uma cor válida.');
  c.whatsapp = texto('whatsapp',25).replace(/\D/g,''); if (c.whatsapp && !/^\d{10,13}$/.test(c.whatsapp)) throw new ErroConfigVitrine('Informe WhatsApp com DDD.');
  c.instagram = texto('instagram',300); if (c.instagram) { let u: URL; try { u = new URL(c.instagram); } catch { throw new ErroConfigVitrine('Informe o link completo do Instagram.'); } if (u.protocol !== 'https:' || !['instagram.com','www.instagram.com'].includes(u.hostname) || u.username || u.password) throw new ErroConfigVitrine('Use um link HTTPS do Instagram.'); }
  if (v.pausada !== undefined && typeof v.pausada !== 'boolean') throw new ErroConfigVitrine('Estado de atendimento inválido.'); c.pausada = v.pausada === true;
  c.mensagemPausa = texto('mensagemPausa',200) || c.mensagemPausa;
  if (v.pedidoMinimo !== undefined && (typeof v.pedidoMinimo !== 'number' || !Number.isFinite(v.pedidoMinimo) || v.pedidoMinimo < 0 || v.pedidoMinimo > 100000)) throw new ErroConfigVitrine('Pedido mínimo deve estar entre R$ 0 e R$ 100.000.'); c.pedidoMinimo = Math.round(Number(v.pedidoMinimo || 0)*100)/100;
  const lista = (key: string, max: number, permitidos?: string[]) => { if (v[key] === undefined) return undefined; const a = v[key]; if (!Array.isArray(a) || a.length > max || a.some(x => typeof x !== 'string' || !x.trim() || x.length > 120 || (permitidos && !permitidos.includes(x)))) throw new ErroConfigVitrine(`Seleção inválida: ${key}.`); return [...new Set(a)] as string[]; };
  c.pagamentos = (lista('pagamentos',3,['pix','cartao','dinheiro']) ?? c.pagamentos) as ConfigVitrine['pagamentos']; if (!c.pagamentos.length) throw new ErroConfigVitrine('Selecione pelo menos uma forma de pagamento.');
  c.secoes = (lista('secoes',3,['banners','categorias','destaques']) ?? c.secoes) as ConfigVitrine['secoes'];
  c.categoriasDestaque = lista('categoriasDestaque',24) ?? []; c.produtosDestaque = lista('produtosDestaque',24) ?? [];
  if (v.limiteDestaques !== undefined && (!Number.isInteger(v.limiteDestaques) || Number(v.limiteDestaques)<1 || Number(v.limiteDestaques)>24)) throw new ErroConfigVitrine('Mostre de 1 a 24 produtos em destaque.'); c.limiteDestaques = Number(v.limiteDestaques ?? 10);
  if (v.banners !== undefined) { if (!Array.isArray(v.banners) || v.banners.length>6) throw new ErroConfigVitrine('Use até 6 banners.'); c.banners = v.banners.map(b => { if (!b || typeof b !== 'object') throw new ErroConfigVitrine('Banner inválido.'); const t = (k: string,max: number) => { if (typeof b[k] !== 'string' || b[k].length > max) throw new ErroConfigVitrine('Revise os textos dos banners.'); return b[k].trim(); }; const titulo=t('titulo',100); if (!titulo) throw new ErroConfigVitrine('Todo banner precisa de um título.'); if (typeof b.ativo !== 'boolean') throw new ErroConfigVitrine('Estado do banner inválido.'); return { titulo, texto:t('texto',220), botao:t('botao',40) || 'Ver produtos', categoria:t('categoria',120), imagemUrl:urlVitrine(b.imagemUrl), ativo:b.ativo }; }); }
  return c;
}
export function lerConfigVitrine(json: unknown): ConfigVitrine {
  try { return validarConfigVitrine(typeof json === 'string' ? JSON.parse(json) : json); } catch { return configPadrao(); }
}
export function erroRegraCompra(c: ConfigVitrine, subtotal: number, forma: string): string | undefined {
  if (c.pausada) return c.mensagemPausa;
  if (!c.pagamentos.includes(forma as ConfigVitrine['pagamentos'][number])) return 'Esta forma de pagamento não está disponível nesta loja.';
  if (Math.round(subtotal*100) < Math.round(c.pedidoMinimo*100)) return `Pedido mínimo de ${c.pedidoMinimo.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} em produtos.`;
}
