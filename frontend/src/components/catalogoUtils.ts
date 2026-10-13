export interface ProdutoCatalogo {
  id: string; codigoInterno?: string; nome: string; descricao?: string; preco: number; precoPromocional?: number; custo?: number;
  marca?: string; fabricante?: string; ativo: boolean; situacao?: 'rascunho' | 'ativo' | 'arquivado'; publicado?: boolean;
  imagemUrl?: string; imagens?: string[]; categoria?: string; subcategoria?: string; codigoBarras?: string;
  ncm?: string; cest?: string; cfop?: string; icmsSituacao?: string; unidade?: string;
  estoqueMinimo?: number; peso?: number; altura?: number; largura?: number; comprimento?: number; seoTitulo?: string; seoDescricao?: string;
}
export const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const normalizar = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
export function numero(valor: string) { const v = valor.trim(); return Number(v.includes(',') ? v.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(v) ? v.replace(/\./g, '') : v); }
export function gtinValido(v: string) { if (!/^(\d{8}|\d{12,14})$/.test(v) || /^(\d)\1+$/.test(v)) return false; let soma = 0; for (let i = v.length - 2, peso = 3; i >= 0; i--, peso = peso === 3 ? 1 : 3) soma += Number(v[i]) * peso; return (10 - soma % 10) % 10 === Number(v.at(-1)); }
export const situacaoProduto = (p: ProdutoCatalogo) => p.situacao || 'ativo';
export const publicado = (p: ProdutoCatalogo) => (p.publicado ?? p.ativo) && situacaoProduto(p) === 'ativo';
export const pendencias = (p: ProdutoCatalogo) => [!gtinValido(p.codigoBarras || '') && 'EAN', !p.imagemUrl && 'Foto', !p.categoria && 'Categoria'].filter((s): s is string => !!s);
export const fiscalProduto = (p: ProdutoCatalogo) => [p.ncm, p.cfop, p.icmsSituacao, p.unidade].every(Boolean) ? 'Específico' : [p.ncm, p.cfop, p.icmsSituacao, p.unidade, p.cest].some(Boolean) ? 'Parcial / padrão da loja' : 'Padrão da loja';
export const imagem = (url: string | undefined, backend: string) => url?.startsWith('/') ? backend + url : url;
export const COLUNAS_CSV = ['codigoInterno', 'nome', 'preco', 'precoPromocional', 'custo', 'marca', 'fabricante', 'descricao', 'imagemUrl', 'imagens', 'categoria', 'subcategoria', 'codigoBarras', 'ncm', 'cest', 'cfop', 'icmsSituacao', 'unidade', 'situacao', 'publicado', 'estoqueMinimo', 'peso', 'altura', 'largura', 'comprimento', 'seoTitulo', 'seoDescricao'] as const;
export function gerarCsv(produtos: Partial<ProdutoCatalogo>[]) {
  // Evita execução de fórmulas ao abrir a exportação em Excel.
  const celula = (v: unknown) => { const t = v === undefined || v === null ? '' : String(v); return '"' + (/^[=+@\-\t\r]/.test(t) ? "'" + t : t).replace(/"/g, '""') + '"'; };
  return '\uFEFF' + [COLUNAS_CSV.join(';'), ...produtos.map(p => COLUNAS_CSV.map(k => celula(k === 'imagens' ? (p.imagens?.length ? p.imagens : p.imagemUrl ? [p.imagemUrl] : []).join('|') : p[k])).join(';'))].join('\r\n');
}
export function lerCsv(texto: string): Record<string, unknown>[] {
  const t = texto.replace(/^\uFEFF/, ''); const primeira = t.split(/\r?\n/)[0];
  const separador = primeira.includes(';') ? ';' : primeira.includes('\t') ? '\t' : ',';
  const linhas: string[][] = []; let linha: string[] = [], celula = '', aspas = false;
  for (let i = 0; i < t.length; i++) { const c = t[i];
    if (c === '"') { if (aspas && t[i + 1] === '"') { celula += '"'; i++; } else aspas = !aspas; }
    else if (!aspas && c === separador) { linha.push(celula); celula = ''; }
    else if (!aspas && (c === '\n' || c === '\r')) { if (c === '\r' && t[i + 1] === '\n') i++; linha.push(celula); if (linha.some(v => v.trim())) linhas.push(linha); linha = []; celula = ''; }
    else celula += c;
  }
  if (aspas) throw new Error('Há aspas sem fechamento no arquivo.');
  linha.push(celula); if (linha.some(v => v.trim())) linhas.push(linha);
  const headers = linhas.shift()?.map(v => v.trim());
  if (!headers || !['codigoInterno', 'nome', 'preco'].every(k => headers.includes(k))) throw new Error('O arquivo precisa das colunas codigoInterno, nome e preco. Baixe o modelo.');
  if (new Set(headers).size !== headers.length || headers.some(h => !COLUNAS_CSV.includes(h as typeof COLUNAS_CSV[number]))) throw new Error('Colunas repetidas ou desconhecidas. Use o modelo de importação.');
  if (!linhas.length || linhas.length > 500) throw new Error('Importe de 1 a 500 produtos por arquivo.');
  return linhas.map((vals, i) => {
    if (vals.length !== headers.length) throw new Error(`Linha ${i + 2}: quantidade de colunas incorreta.`);
    return Object.fromEntries(headers.map((h, j) => {
      let v: unknown = vals[j].trim();
      if (typeof v === 'string' && v.startsWith("'") && /^[=+@\-]/.test(v.slice(1))) v = v.slice(1);
      if (h === 'imagens') v = String(v).trim() ? String(v).split('|').map(u => u.trim()).filter(Boolean) : [];
      if (h === 'situacao' && !v) v = 'rascunho';
      if (['preco', 'precoPromocional', 'custo', 'estoqueMinimo', 'peso', 'altura', 'largura', 'comprimento'].includes(h) && v !== '') { const n = numero(String(v)); if (!Number.isFinite(n)) throw new Error(`Linha ${i + 2}: valor inválido em ${h}.`); v = n; }
      if (h === 'publicado') { if (!['true', 'false', 'sim', 'nao', 'não', '1', '0', ''].includes(normalizar(String(v)))) throw new Error(`Linha ${i + 2}: publicado deve ser true ou false.`); v = ['true', 'sim', '1'].includes(normalizar(String(v))); }
      return [h, v];
    }));
  });
}
export function baixarCsv(nome: string, csv: string) { const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })); const a = document.createElement('a'); a.href = url; a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
