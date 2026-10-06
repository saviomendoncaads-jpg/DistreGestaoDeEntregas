import type { ReactNode } from 'react';

// Ícones da vitrine. Categorias são texto livre da loja: o ícone e a cor do
// bloco saem de palavras-chave do nome (acentos ignorados), com um padrão neutro.

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export const Linha = ({ children, size = 18 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

// ─── Ícones de interface ─────────────────────────────────────────────────────
export const IcoBusca = () => <Linha size={20}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Linha>;
export const IcoX = () => <Linha size={18}><path d="M6 6l12 12M18 6 6 18" /></Linha>;
export const IcoPin = () => <Linha size={14}><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="9" r="2.4" /></Linha>;
export const IcoUsuario = () => <Linha size={24}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Linha>;
export const IcoCarrinho = ({ size = 24 }: { size?: number }) => <Linha size={size}><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2 3h2.5l2.4 12.2a1.5 1.5 0 0 0 1.5 1.2h8.8a1.5 1.5 0 0 0 1.5-1.2L21 7H5.2" /></Linha>;
export const IcoCoracao = ({ cheio }: { cheio?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill={cheio ? '#ef4444' : 'none'} stroke={cheio ? '#ef4444' : 'currentColor'} strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 20.5s-7.5-4.6-9.3-9.4C1.4 7.4 3.7 4 7.2 4c2 0 3.6 1.1 4.8 2.8C13.2 5.1 14.8 4 16.8 4c3.5 0 5.8 3.4 4.5 7.1-1.8 4.8-9.3 9.4-9.3 9.4z" />
  </svg>
);
export const IcoSeta = ({ dir = 'dir', size = 16 }: { dir?: 'dir' | 'esq' | 'baixo'; size?: number }) => (
  <Linha size={size}>{dir === 'dir' ? <path d="m9 6 6 6-6 6" /> : dir === 'esq' ? <path d="m15 6-6 6 6 6" /> : <path d="m6 9 6 6 6-6" />}</Linha>
);
export const IcoFlecha = () => <Linha size={16}><path d="M5 12h14M13 6l6 6-6 6" /></Linha>;
export const IcoGrade = () => <Linha><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></Linha>;
export const IcoWhats = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3.5 20.5 5 16.3A8.5 8.5 0 1 1 8 19.2z" /><path d="M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2-1-1 .9c-1-.4-2.4-1.8-2.8-2.8l.9-1-1-2z" />
  </svg>
);
export const IcoFone = () => <Linha><path d="M5 3h3l2 5-2.5 1.5a11 11 0 0 0 7 7L16 14l5 2v3a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z" /></Linha>;
export const IcoAjuda = () => <Linha><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5h.01" /></Linha>;
export const IcoCaminhao = () => (
  <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
    <rect x="2" y="8" width="17" height="13" rx="2" fill="#1d4ed8" />
    <path d="M19 12h6l4 5v4h-10z" fill="#2563eb" />
    <rect x="21" y="13.5" width="4" height="3" rx="0.6" fill="#bfdbfe" />
    <circle cx="8" cy="23" r="3" fill="#0f2a4a" /><circle cx="8" cy="23" r="1.2" fill="#fff" />
    <circle cx="24" cy="23" r="3" fill="#0f2a4a" /><circle cx="24" cy="23" r="1.2" fill="#fff" />
  </svg>
);

// ─── Categorias ──────────────────────────────────────────────────────────────
type Tipo = 'medicamento' | 'convenio' | 'higiene' | 'dermo' | 'saude' | 'bebe' | 'alimento' | 'ortopedia' | 'oferta' | 'padrao';

export function tipoCategoria(nome: string): Tipo {
  const n = norm(nome);
  if (/medicament|remedio|generico|farmac|analgesic/.test(n)) return 'medicamento';
  if (/convenienc|mercearia/.test(n)) return 'alimento'; // "Conveniência" ≠ "Convênios"
  if (/\bconvenios?\b|plano de saude/.test(n)) return 'convenio';
  if (/higien|pessoal|banho|cabelo|shampoo|bucal/.test(n)) return 'higiene';
  if (/dermo|pele|cosmet|beleza|protetor|maquiag/.test(n)) return 'dermo';
  if (/saude|bem.?estar|vitamin|suplement/.test(n)) return 'saude';
  if (/bebe|infantil|crianca|fralda|mamae/.test(n)) return 'bebe';
  if (/aliment|bebida|mercearia|lanche|doce|chocolate/.test(n)) return 'alimento';
  if (/ortoped|ortes|acessibil/.test(n)) return 'ortopedia';
  if (/oferta|promo|liquida|desconto/.test(n)) return 'oferta';
  return 'padrao';
}

// Ordem "de farmácia" das categorias conhecidas; o resto vem depois, em ordem alfabética.
const ORDEM_TIPO: Tipo[] = ['medicamento', 'convenio', 'higiene', 'dermo', 'saude', 'bebe', 'alimento', 'ortopedia', 'oferta', 'padrao'];
export function ordenarCategorias<T extends { nome: string }>(lista: T[]): T[] {
  return [...lista].sort((a, b) =>
    (ORDEM_TIPO.indexOf(tipoCategoria(a.nome)) - ORDEM_TIPO.indexOf(tipoCategoria(b.nome))) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** "PLANALTO" → "Planalto"; "ABREU E LIMA" → "Abreu e Lima" (só se o texto veio todo em maiúsculas). */
export function capitalizar(texto?: string): string {
  if (!texto || texto !== texto.toUpperCase()) return texto || '';
  return texto.toLowerCase().replace(/(^|\s|-)(\p{L})/gu, (_, sep, l) => sep + l.toUpperCase())
    .replace(/\s(E|De|Da|Do|Das|Dos)\s/g, m => m.toLowerCase());
}

/** Fundo pastel do bloco de categoria (mesma paleta da proposta). */
export const COR_TILE: Record<Tipo, string> = {
  medicamento: '#e8f7ee', convenio: '#e7f0ff', higiene: '#fde9f2', dermo: '#fff1e3', saude: '#f1ecff',
  bebe: '#fff6dc', alimento: '#e6f3ff', ortopedia: '#e3f8f4', oferta: '#ffe9ec', padrao: '#eef2f7',
};

export function IconeCategoriaLinha({ nome }: { nome: string }) {
  switch (tipoCategoria(nome)) {
    case 'medicamento': return <Linha><rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-35 12 12)" /><path d="m10 8 4 8" /></Linha>;
    case 'convenio': return <Linha><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></Linha>;
    case 'higiene': return <Linha><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" /></Linha>;
    case 'dermo': return <Linha><path d="M8 3h8l-1 4H9z" /><rect x="7" y="7" width="10" height="14" rx="2" /></Linha>;
    case 'saude': return <Linha><path d="M12 20s-7-4.4-8.6-8.8C2.2 7.7 4.4 4.5 7.6 4.5c1.9 0 3.4 1 4.4 2.6 1-1.6 2.5-2.6 4.4-2.6 3.2 0 5.4 3.2 4.2 6.7C19 15.6 12 20 12 20z" /></Linha>;
    case 'bebe': return <Linha><circle cx="12" cy="12" r="8" /><path d="M9 11h.01M15 11h.01M9.5 15a3.5 3.5 0 0 0 5 0M12 4c1 1 1 2 0 3" /></Linha>;
    case 'alimento': return <Linha><path d="M5 3v8a2 2 0 0 0 4 0V3M7 11v10M15 3c-1.7 0-3 2.5-3 6s1.3 4 3 4v8" /></Linha>;
    case 'ortopedia': return <Linha><circle cx="10" cy="4.5" r="1.8" /><path d="M10 7v6h6l2 5M10 10h5" /><path d="M8.5 11.5a5 5 0 1 0 6 6.5" /></Linha>;
    case 'oferta': return <Linha><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" /><circle cx="8" cy="8" r="1.5" /></Linha>;
    default: return <Linha><path d="M6 7h12l-1 14H7z" /><path d="M9 7a3 3 0 0 1 6 0" /></Linha>;
  }
}

/** Ilustração colorida do bloco "Categorias em destaque". */
export function IconeCategoriaCor({ nome }: { nome: string }) {
  const t = tipoCategoria(nome);
  const S = ({ children }: { children: ReactNode }) => <svg width="44" height="44" viewBox="0 0 48 48" aria-hidden="true">{children}</svg>;
  switch (t) {
    case 'medicamento': return <S><g transform="rotate(-38 24 24)"><rect x="9" y="17" width="15" height="14" rx="7" fill="#ef4444" /><rect x="22" y="17" width="17" height="14" rx="7" fill="#facc15" /><rect x="20" y="17" width="5" height="14" fill="#ef4444" /><rect x="13" y="20" width="6" height="2.5" rx="1.2" fill="#fff" opacity=".6" /></g></S>;
    case 'convenio': return <S><rect x="6" y="11" width="36" height="26" rx="5" fill="#2563eb" /><rect x="6" y="17" width="36" height="5" fill="#1e3a8a" /><rect x="11" y="27" width="12" height="4" rx="2" fill="#bfdbfe" /></S>;
    case 'higiene': return <S><rect x="19" y="5" width="10" height="6" rx="2" fill="#be185d" /><path d="M21 11h6v3h-6z" fill="#db2777" /><rect x="14" y="14" width="20" height="29" rx="7" fill="#ec4899" /><rect x="18" y="22" width="12" height="9" rx="2" fill="#fbcfe8" /></S>;
    case 'dermo': return <S><path d="M15 6h18l-3 30H18z" fill="#f97316" /><rect x="17" y="36" width="14" height="7" rx="2" fill="#c2410c" /><rect x="19" y="13" width="10" height="10" rx="2" fill="#fed7aa" /></S>;
    case 'saude': return <S><path d="M24 41S7 31 7 18.5C7 12 11.5 8 17 8c3.2 0 5.6 1.7 7 4 1.4-2.3 3.8-4 7-4 5.5 0 10 4 10 10.5C41 31 24 41 24 41z" fill="#8b5cf6" /><path d="M11 23h7l3-6 4 11 3-5h9" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></S>;
    case 'bebe': return <S><circle cx="24" cy="26" r="15" fill="#fdba74" /><circle cx="24" cy="26" r="12" fill="#fed7aa" /><circle cx="19" cy="25" r="1.8" fill="#7c2d12" /><circle cx="29" cy="25" r="1.8" fill="#7c2d12" /><path d="M20 31a5 5 0 0 0 8 0" stroke="#7c2d12" strokeWidth="2" fill="none" strokeLinecap="round" /><path d="M24 11c3-1 4 2 2 3" stroke="#9a3412" strokeWidth="2" fill="none" strokeLinecap="round" /></S>;
    case 'alimento': return <S><rect x="20" y="4" width="8" height="5" rx="1.5" fill="#1d4ed8" /><path d="M19 9h10l3 7v24a4 4 0 0 1-4 4h-8a4 4 0 0 1-4-4V16z" fill="#3b82f6" /><rect x="18" y="21" width="12" height="10" rx="1.5" fill="#dbeafe" /></S>;
    case 'ortopedia': return <S><circle cx="20" cy="9" r="4" fill="#0d9488" /><path d="M18 14h5v11h9l4 10" stroke="#0d9488" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" /><circle cx="19" cy="33" r="9" stroke="#14b8a6" strokeWidth="4" fill="none" /></S>;
    case 'oferta': return <S><circle cx="24" cy="24" r="17" fill="#ef4444" /><circle cx="18" cy="18" r="3.2" fill="#fff" /><circle cx="30" cy="30" r="3.2" fill="#fff" /><path d="m31 16-14 16" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" /></S>;
    default: return <S><path d="M10 16h28l-2.5 26h-23z" fill="#64748b" /><path d="M17 16a7 7 0 0 1 14 0" stroke="#334155" strokeWidth="3" fill="none" /></S>;
  }
}
