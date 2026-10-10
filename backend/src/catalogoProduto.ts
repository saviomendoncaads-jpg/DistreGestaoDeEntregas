import type { Produto } from './types';

export class ErroCatalogo extends Error {
  constructor(public campos: Record<string, string>, public status = 400) {
    super(Object.values(campos)[0] || 'Verifique os dados do produto.');
  }
}
export function gtinValido(valor: string): boolean {
  if (!/^(\d{8}|\d{12,14})$/.test(valor) || /^(\d)\1+$/.test(valor)) return false;
  let soma = 0;
  const base = valor.slice(0, -1);
  for (let i = base.length - 1, peso = 3; i >= 0; i--, peso = peso === 3 ? 1 : 3) soma += Number(base[i]) * peso;
  return (10 - soma % 10) % 10 === Number(valor.at(-1));
}
export const precoVenda = (p: Produto) => p.precoPromocional && p.precoPromocional < p.preco ? p.precoPromocional : p.preco;
export const publicadoNaVitrine = (p: Produto) => p.ativo && (p.situacao ?? 'ativo') === 'ativo' && (p.publicado ?? p.ativo);

/** Mescla apenas os campos de catálogo; nunca aceita lojaId/id vindos do cliente. */
export function prepararProduto(body: Record<string, unknown>, atual?: Produto): Partial<Produto> {
  const erros: Record<string, string> = {};
  const dados: Record<string, unknown> = { ...atual, ...body };
  const texto = (k: string, max: number) => {
    if (dados[k] !== undefined && dados[k] !== null && typeof dados[k] !== 'string') erros[k] = 'Informe um texto.';
    const v = typeof dados[k] === 'string' ? dados[k].trim() : '';
    if (v.length > max) erros[k] = `Use até ${max} caracteres.`;
    return v || undefined;
  };
  const numero = (k: string, max: number, inteiro = false) => {
    const raw = dados[k];
    if (raw === '' || raw === undefined || raw === null) return undefined;
    const v = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.replace(',', '.')) : NaN;
    if (!Number.isFinite(v) || v < 0 || v > max || (inteiro && !Number.isInteger(v))) erros[k] = inteiro ? 'Informe um número inteiro positivo ou zero.' : 'Informe um valor válido, positivo ou zero.';
    return inteiro ? v : Math.round(v * 100) / 100;
  };
  const situacao = dados.situacao ?? (atual ? 'ativo' : 'rascunho');
  if (!['rascunho', 'ativo', 'arquivado'].includes(String(situacao))) erros.situacao = 'Escolha rascunho, ativo ou arquivado.';
  if ('publicado' in body && typeof body.publicado !== 'boolean') erros.publicado = 'Escolha a visibilidade na vitrine.';
  const publicado = (dados.publicado ?? atual?.ativo ?? false) === true;
  const nome = texto('nome', 255);
  if (!nome) erros.nome = 'Informe o nome do produto.';
  const preco = numero('preco', 100000);
  if (preco === undefined || preco <= 0) erros.preco = 'Informe um preço maior que zero.';
  const precoPromocional = numero('precoPromocional', 100000);
  if (precoPromocional !== undefined && (precoPromocional <= 0 || precoPromocional >= (preco || 0))) erros.precoPromocional = 'A promoção deve ser maior que zero e menor que o preço normal.';
  const codigoBarras = texto('codigoBarras', 14);
  const mudouEan = !atual || ('codigoBarras' in body && codigoBarras !== atual.codigoBarras);
  const ativando = situacao === 'ativo' && ((!atual || atual.situacao === 'rascunho' || atual.situacao === 'arquivado') || (body.publicado === true && !atual?.publicado));
  if (codigoBarras && (mudouEan || ativando) && !gtinValido(codigoBarras)) erros.codigoBarras = 'EAN / GTIN inválido. Confira os dígitos da embalagem.';
  if ((ativando || situacao === 'ativo' && !atual) && !codigoBarras) erros.codigoBarras = 'Informe o EAN para ativar o produto.';
  if (publicado && situacao !== 'ativo') erros.publicado = 'Ative o produto antes de publicá-lo na vitrine.';
  const fiscal: Partial<Produto> = {};
  for (const [k, regra, mensagem] of [
    ['ncm', /^\d{8}$/, 'NCM deve ter 8 dígitos.'], ['cest', /^\d{7}$/, 'CEST deve ter 7 dígitos.'],
    ['cfop', /^[56]\d{3}$/, 'CFOP de saída deve ter 4 dígitos (5xxx ou 6xxx).'],
    ['icmsSituacao', /^\d{2,3}$/, 'CSOSN / CST deve ter 2 ou 3 dígitos.'],
    ['unidade', /^[A-Z0-9]{1,6}$/, 'Informe uma unidade como UN, CX ou KG.']
  ] as const) {
    const v = texto(k, k === 'ncm' ? 8 : k === 'cest' ? 7 : 6)?.toUpperCase();
    if (v && !regra.test(v)) erros[k] = mensagem;
    fiscal[k] = v;
  }
  const categoria = texto('categoria', 120);
  const imagensRaw = dados.imagens ?? (dados.imagemUrl ? [dados.imagemUrl] : []);
  if (!Array.isArray(imagensRaw) || imagensRaw.length > 8 || imagensRaw.some(u => typeof u !== 'string' || u.length > 600 || !/^(\/uploads\/|https?:\/\/)/i.test(u))) erros.imagens = 'Use até 8 imagens com endereço válido.';
  const imagens = Array.isArray(imagensRaw) ? [...new Set(imagensRaw.filter((u): u is string => typeof u === 'string' && !!u))] : [];
  const resultado: Partial<Produto> = {
    nome, preco, precoPromocional, custo: numero('custo', 100000), codigoInterno: texto('codigoInterno', 60),
    codigoBarras, ...fiscal, situacao: situacao as Produto['situacao'], publicado,
    ativo: situacao === 'ativo', marca: texto('marca', 120), fabricante: texto('fabricante', 120),
    descricao: texto('descricao', 5000), categoria, subcategoria: categoria ? texto('subcategoria', 120) : undefined,
    imagens, imagemUrl: imagens[0], estoqueMinimo: numero('estoqueMinimo', 1000000, true),
    peso: numero('peso', 100000), altura: numero('altura', 1000), largura: numero('largura', 1000), comprimento: numero('comprimento', 1000),
    seoTitulo: texto('seoTitulo', 70), seoDescricao: texto('seoDescricao', 160)
  };
  if (Object.keys(erros).length) throw new ErroCatalogo(erros);
  return resultado;
}

export function verificarIdentificadores(p: Produto, existentes: Produto[]) {
  const outros = existentes.filter(o => o.id !== p.id);
  if (outros.some(o => (o.codigoInterno || o.id).toLocaleLowerCase('pt-BR') === p.codigoInterno?.toLocaleLowerCase('pt-BR'))) throw new ErroCatalogo({ codigoInterno: 'Este código interno já pertence a outro produto.' }, 409);
  if (p.codigoBarras && outros.some(o => o.codigoBarras === p.codigoBarras)) throw new ErroCatalogo({ codigoBarras: 'Este EAN já pertence a outro produto.' }, 409);
}
