import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useCarrinho } from '../context/CarrinhoContext';
import { urlImagem } from '../services/api';
import { buscarEnderecoPorCep, mascararCep } from '../services/cep';
import type { CategoriaVitrine, FiltroCategoria } from '../components/SidebarCategorias';
import {
  formatarPreco, lerClienteIdentificado, salvarClienteIdentificado,
  type LojaVitrine, type OutraLoja, type ProdutoVitrine,
} from '../types';
import {
  COR_TILE, capitalizar, IcoAjuda, IcoBusca, IcoCaminhao, IcoCarrinho, IcoCoracao, IcoFlecha, IcoFone, IcoGrade, IcoPin, IcoSeta,
  IcoUsuario, IcoWhats, IcoX, IconeCategoriaCor, IconeCategoriaLinha, tipoCategoria,
} from './icones';
import './vitrine.css';

// ============================================================================
// VITRINE (layout "loja de farmácia"): cabeçalho com busca/status/carrinho,
// sidebar de categorias + ajuda + entrega, banner rotativo, categorias em
// destaque e produtos em destaque com abas. Tudo vem dos dados reais da loja.
// ============================================================================

const fmtFone = (d?: string) => {
  if (!d) return '';
  const n = d.replace(/^55(?=\d{10,11}$)/, '');
  return n.length === 11 ? `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
    : n.length === 10 ? `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}` : d;
};
const linkWhats = (d: string, texto: string) => `https://wa.me/${d.length <= 11 ? `55${d}` : d}?text=${encodeURIComponent(texto)}`;

// ─── Modal genérico ──────────────────────────────────────────────────────────
function Modal({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: ReactNode }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onFechar]);
  return (
    <div className="vt-modal-fundo" onClick={onFechar}>
      <div className="vt-modal" role="dialog" aria-modal="true" aria-label={titulo} onClick={e => e.stopPropagation()}>
        <div className="vt-modal-topo"><h2>{titulo}</h2><button type="button" className="vt-icone-btn" onClick={onFechar} aria-label="Fechar"><IcoX /></button></div>
        {children}
      </div>
    </div>
  );
}

// ─── Cabeçalho ───────────────────────────────────────────────────────────────
function LogoLoja({ loja }: { loja: LojaVitrine }) {
  const [falhou, setFalhou] = useState(false);
  const src = urlImagem(loja.logoUrl);
  if (!src || falhou) return <div className="vt-logo vt-logo--inicial" aria-hidden="true">{loja.nome.charAt(0).toUpperCase()}</div>;
  return <div className="vt-logo"><img src={src} alt={`Logo de ${loja.nome}`} onError={() => setFalhou(true)} /></div>;
}

export function CabecalhoVitrine({ loja, outrasLojas, busca, onBuscar, onAbrirCarrinho, onInicio }: {
  loja: LojaVitrine; outrasLojas: OutraLoja[]; busca: string; onBuscar: (v: string) => void; onAbrirCarrinho: () => void; onInicio: () => void;
}) {
  const { totalItens } = useCarrinho();
  const [trocarAberto, setTrocarAberto] = useState(false);
  const [entrarAberto, setEntrarAberto] = useState(false);
  const [cliente, setCliente] = useState(lerClienteIdentificado);
  const local = [capitalizar(loja.bairro), [capitalizar(loja.cidade), loja.uf?.toUpperCase()].filter(Boolean).join(' - ')].filter(Boolean).join(', ');
  return (
    <header className="vt-header">
      <button type="button" className="vt-header-loja" onClick={onInicio} aria-label="Ir para o início da loja">
        <LogoLoja loja={loja} />
      </button>
      <div className="vt-header-info">
        <strong className="vt-header-nome">{loja.nome}</strong>
        {local && <span className="vt-header-local"><IcoPin />{local}</span>}
        {outrasLojas.length > 0 && (
          <div className="vt-trocar">
            <button type="button" className="vt-link" onClick={() => setTrocarAberto(v => !v)} aria-expanded={trocarAberto}>Trocar loja <IcoSeta dir="baixo" size={14} /></button>
            {trocarAberto && (
              <ul className="vt-trocar-lista">
                {outrasLojas.map(l => (
                  <li key={l.id}><a href={`/loja/${encodeURIComponent(l.id)}`}><strong>{l.nome}</strong>{(l.bairro || l.cidade) && <span>{[l.bairro, l.cidade].filter(Boolean).join(', ')}</span>}</a></li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <label className="vt-busca" role="search">
        <IcoBusca />
        <input type="search" placeholder="Buscar medicamento, produto ou marca..." value={busca} onChange={e => onBuscar(e.target.value)} aria-label="Buscar medicamento, produto ou marca" />
        {busca && <button type="button" className="vt-icone-btn" onClick={() => onBuscar('')} aria-label="Limpar busca"><IcoX /></button>}
      </label>

      <div className={`vt-status ${loja.aceitandoPedidos ? '' : 'vt-status--off'}`}>
        <span className="vt-status-ponto" aria-hidden="true" />
        <span><strong>{loja.aceitandoPedidos ? 'ONLINE' : 'PAUSADO'}</strong><small>{loja.aceitandoPedidos ? 'Recebendo pedidos' : 'Pedidos pausados'}</small></span>
      </div>

      <button type="button" className="vt-header-acao" onClick={() => setEntrarAberto(true)}>
        <IcoUsuario /><span>{cliente ? cliente.nome.split(' ')[0] : 'Entrar'}</span>
      </button>
      <button type="button" className="vt-header-acao" onClick={onAbrirCarrinho} aria-label={`Carrinho com ${totalItens} itens`}>
        <span className="vt-carrinho-ico"><IcoCarrinho /><span className="vt-badge">{totalItens}</span></span><span>Carrinho</span>
      </button>

      {entrarAberto && <ModalEntrar onFechar={() => setEntrarAberto(false)} onSalvo={setCliente} />}
    </header>
  );
}

function ModalEntrar({ onFechar, onSalvo }: { onFechar: () => void; onSalvo: (c: ReturnType<typeof lerClienteIdentificado>) => void }) {
  const atual = lerClienteIdentificado();
  const [nome, setNome] = useState(atual?.nome || '');
  const [telefone, setTelefone] = useState(atual?.telefone || '');
  const [erro, setErro] = useState('');
  const salvar = () => {
    if (nome.trim().length < 2) return setErro('Informe seu nome.');
    if (telefone.replace(/\D/g, '').length < 10) return setErro('Informe um telefone com DDD.');
    const c = { nome: nome.trim(), telefone: telefone.trim() };
    salvarClienteIdentificado(c);
    onSalvo(c);
    onFechar();
  };
  return (
    <Modal titulo={atual ? 'Seus dados' : 'Entrar'} onFechar={onFechar}>
      <p className="vt-modal-texto">Seus dados ficam salvos neste aparelho e já preenchem o pedido na finalização.</p>
      <label className="vt-campo"><span>Nome</span><input value={nome} onChange={e => setNome(e.target.value)} autoComplete="name" /></label>
      <label className="vt-campo"><span>Telefone / WhatsApp</span><input value={telefone} onChange={e => setTelefone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="(81) 99999-9999" /></label>
      {erro && <p className="vt-erro" role="alert">{erro}</p>}
      <div className="vt-modal-acoes">
        {atual && <button type="button" className="vt-btn-sec" onClick={() => { salvarClienteIdentificado(null); onSalvo(null); onFechar(); }}>Sair</button>}
        <button type="button" className="vt-btn-pri" onClick={salvar}>Salvar</button>
      </div>
    </Modal>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────
export function SidebarVitrine({ loja, categorias, filtro, onFiltrar }: {
  loja: LojaVitrine; categorias: CategoriaVitrine[]; filtro: FiltroCategoria; onFiltrar: (f: FiltroCategoria) => void;
}) {
  const [entregaAberto, setEntregaAberto] = useState(false);
  const [ajudaAberto, setAjudaAberto] = useState(false);
  return (
    <aside className="vt-sidebar" aria-label="Categorias">
      <nav className="vt-cats">
        <button type="button" className={`vt-cat ${!filtro.categoria ? 'is-ativa' : ''}`} onClick={() => onFiltrar({})}><IcoGrade /><span>Todos os Produtos</span></button>
        {categorias.map(c => (
          <button key={c.nome} type="button" className={`vt-cat ${filtro.categoria === c.nome ? 'is-ativa' : ''}`} onClick={() => onFiltrar({ categoria: c.nome })}>
            <IconeCategoriaLinha nome={c.nome} /><span>{c.nome}</span>
          </button>
        ))}
      </nav>

      <div className="vt-ajuda">
        <strong>Precisa de ajuda?</strong>
        {loja.telefone && <a href={linkWhats(loja.telefone, `Olá! Vim pela loja online da ${loja.nome}.`)} target="_blank" rel="noreferrer"><IcoWhats /> Falar no WhatsApp</a>}
        {loja.telefone && <a href={`tel:+55${loja.telefone.replace(/^55/, '')}`}><IcoFone /> {fmtFone(loja.telefone)}</a>}
        <button type="button" onClick={() => setAjudaAberto(true)}><IcoAjuda /> Dúvidas frequentes</button>
      </div>

      <div className="vt-entrega">
        <div className="vt-entrega-topo"><IcoCaminhao /><div><strong>Entrega na sua região</strong><small>Confira o prazo para seu CEP</small></div></div>
        <button type="button" className="vt-btn-pri vt-btn-largo" onClick={() => setEntregaAberto(true)}>Calcular entrega <IcoSeta /></button>
      </div>

      {entregaAberto && <ModalEntrega loja={loja} onFechar={() => setEntregaAberto(false)} />}
      {ajudaAberto && <ModalAjuda loja={loja} onFechar={() => setAjudaAberto(false)} />}
    </aside>
  );
}

function ModalEntrega({ loja, onFechar }: { loja: LojaVitrine; onFechar: () => void }) {
  const [cep, setCep] = useState('');
  const [estado, setEstado] = useState<'inicial' | 'buscando' | 'ok' | 'fora' | 'invalido'>('inicial');
  const [local, setLocal] = useState('');
  const norm = (s?: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const consultar = async () => {
    setEstado('buscando');
    const r = await buscarEnderecoPorCep(cep);
    if (!r) return setEstado('invalido');
    setLocal([r.bairro, `${r.cidade} - ${r.uf}`].filter(Boolean).join(', '));
    setEstado(!loja.cidade || norm(r.cidade) === norm(loja.cidade) ? 'ok' : 'fora');
  };
  return (
    <Modal titulo="Calcular entrega" onFechar={onFechar}>
      <label className="vt-campo"><span>Seu CEP</span>
        <div className="vt-linha">
          <input value={cep} onChange={e => { setCep(mascararCep(e.target.value)); setEstado('inicial'); }} inputMode="numeric" placeholder="00000-000" onKeyDown={e => e.key === 'Enter' && consultar()} />
          <button type="button" className="vt-btn-pri" disabled={cep.replace(/\D/g, '').length !== 8 || estado === 'buscando'} onClick={consultar}>{estado === 'buscando' ? 'Consultando…' : 'Consultar'}</button>
        </div>
      </label>
      {estado === 'ok' && <p className="vt-resultado vt-resultado--ok">✓ Entregamos em <b>{local}</b>. A taxa e o prazo são confirmados pela loja ao receber o pedido.</p>}
      {estado === 'fora' && <p className="vt-resultado vt-resultado--aviso">{local} fica fora da cidade da loja{loja.cidade ? ` (${loja.cidade})` : ''}. {loja.telefone ? 'Fale com a gente pelo WhatsApp para confirmar a entrega.' : 'Consulte a loja antes de pedir.'}</p>}
      {estado === 'invalido' && <p className="vt-resultado vt-resultado--aviso">CEP não encontrado. Confira os números.</p>}
    </Modal>
  );
}

function ModalAjuda({ loja, onFechar }: { loja: LojaVitrine; onFechar: () => void }) {
  const faq: [string, string][] = [
    ['Como faço um pedido?', 'Adicione os produtos ao carrinho, clique em Carrinho e finalize informando endereço e forma de pagamento. A loja recebe na hora.'],
    ['Quais formas de pagamento?', 'PIX, cartão (na maquininha, na entrega) ou dinheiro — informe se precisa de troco.'],
    ['Qual o prazo e a taxa de entrega?', 'A loja confirma prazo e taxa ao aceitar o pedido. Use "Calcular entrega" para conferir se atendemos o seu CEP.'],
    ['Preciso de receita?', 'Medicamentos com retenção de receita exigem a apresentação da receita original na entrega.'],
  ];
  return (
    <Modal titulo="Dúvidas frequentes" onFechar={onFechar}>
      <div className="vt-faq">{faq.map(([p, r]) => <details key={p}><summary>{p}</summary><p>{r}</p></details>)}</div>
      {loja.telefone && <a className="vt-btn-pri vt-btn-largo" href={linkWhats(loja.telefone, 'Olá! Tenho uma dúvida sobre um pedido.')} target="_blank" rel="noreferrer">Falar no WhatsApp</a>}
    </Modal>
  );
}

// ─── Banner rotativo ─────────────────────────────────────────────────────────
interface Slide { eyebrow: string; titulo: string; destaque: string; texto: string; cta: string; categoria?: string; fotos: string[] }

export function BannerVitrine({ produtos, categorias, onCategoria, onVerProdutos }: {
  produtos: ProdutoVitrine[]; categorias: CategoriaVitrine[]; onCategoria: (c: string) => void; onVerProdutos: () => void;
}) {
  const slides = useMemo<Slide[]>(() => {
    const fotosDe = (filtro?: (p: ProdutoVitrine) => boolean) =>
      produtos.filter(p => p.imagemUrl && (!filtro || filtro(p))).slice(0, 3).map(p => urlImagem(p.imagemUrl)!);
    const achar = (tipo: string) => categorias.find(c => tipoCategoria(c.nome) === tipo)?.nome;
    const dermo = achar('dermo');
    const oferta = achar('oferta');
    const lista: Slide[] = [];
    if (dermo) lista.push({ eyebrow: 'Cuide da sua pele', titulo: dermo, destaque: 'selecionados', texto: 'Marcas renomadas para a sua rotina de cuidados.', cta: 'Ver produtos', categoria: dermo, fotos: fotosDe(p => p.categoria === dermo) });
    if (oferta) lista.push({ eyebrow: 'Aproveite', titulo: 'Ofertas da', destaque: 'semana', texto: 'Preços especiais por tempo limitado.', cta: 'Ver ofertas', categoria: oferta, fotos: fotosDe(p => p.categoria === oferta) });
    lista.push({ eyebrow: 'Cuide da sua saúde', titulo: 'Tudo o que você precisa,', destaque: 'na sua porta', texto: 'Peça online e receba em casa com rapidez e segurança.', cta: 'Ver produtos', fotos: fotosDe() });
    lista.push({ eyebrow: 'Entrega rápida', titulo: 'Peça agora e', destaque: 'receba hoje', texto: 'Acompanhe o seu pedido do preparo até a entrega.', cta: 'Começar pedido', fotos: fotosDe().reverse() });
    return lista;
  }, [produtos, categorias]);
  const [i, setI] = useState(0);
  const pausado = useRef(false);
  useEffect(() => {
    const t = setInterval(() => { if (!pausado.current) setI(v => (v + 1) % slides.length); }, 6000);
    return () => clearInterval(t);
  }, [slides.length]);
  const s = slides[i % slides.length];
  const ir = (d: number) => setI(v => (v + d + slides.length) % slides.length);
  return (
    <section className="vt-banner" aria-roledescription="carrossel" aria-label="Destaques" onMouseEnter={() => (pausado.current = true)} onMouseLeave={() => (pausado.current = false)}>
      <div className="vt-banner-texto" key={i}>
        <span className="vt-banner-eyebrow">{s.eyebrow}</span>
        <h2>{s.titulo}<br /><em>{s.destaque}</em></h2>
        <p>{s.texto}</p>
        <button type="button" className="vt-banner-cta" onClick={() => (s.categoria ? onCategoria(s.categoria) : onVerProdutos())}>{s.cta} <IcoFlecha /></button>
      </div>
      <div className="vt-banner-arte" aria-hidden="true">
        {s.fotos.length > 0 ? s.fotos.map((f, k) => <img key={f + k} src={f} alt="" className={`vt-banner-foto vt-banner-foto--${k}`} />) : (
          <svg viewBox="0 0 260 200" className="vt-banner-ilustra">
            <rect x="20" y="40" width="70" height="150" rx="14" fill="#fff" opacity=".95" /><rect x="20" y="40" width="70" height="40" rx="14" fill="#f97316" />
            <rect x="105" y="20" width="60" height="170" rx="16" fill="#e0f2fe" /><rect x="120" y="0" width="30" height="30" rx="6" fill="#0f172a" />
            <rect x="180" y="55" width="62" height="135" rx="12" fill="#fff" /><rect x="188" y="95" width="46" height="30" rx="4" fill="#38bdf8" />
          </svg>
        )}
      </div>
      {slides.length > 1 && (
        <>
          <div className="vt-banner-setas">
            <button type="button" onClick={() => ir(1)} aria-label="Próximo destaque"><IcoSeta /></button>
            <button type="button" onClick={() => ir(-1)} aria-label="Destaque anterior"><IcoSeta dir="esq" /></button>
          </div>
          <div className="vt-banner-pontos">{slides.map((_, k) => <button key={k} type="button" className={k === i ? 'is-ativo' : ''} onClick={() => setI(k)} aria-label={`Destaque ${k + 1}`} />)}</div>
        </>
      )}
    </section>
  );
}

// ─── Categorias em destaque ──────────────────────────────────────────────────
export function CategoriasDestaque({ categorias, onCategoria }: { categorias: CategoriaVitrine[]; onCategoria: (c: string) => void }) {
  const [todas, setTodas] = useState(false);
  const visiveis = todas ? categorias : categorias.slice(0, 8);
  if (categorias.length === 0) return null;
  return (
    <section className="vt-secao">
      <div className="vt-secao-topo"><h2>Categorias em destaque</h2>{categorias.length > 8 && <button type="button" className="vt-link" onClick={() => setTodas(v => !v)}>{todas ? 'Ver menos' : 'Ver todas'} <IcoFlecha /></button>}</div>
      <div className="vt-tiles">
        {visiveis.map(c => (
          <button key={c.nome} type="button" className="vt-tile" style={{ background: COR_TILE[tipoCategoria(c.nome)] }} onClick={() => onCategoria(c.nome)}>
            <IconeCategoriaCor nome={c.nome} /><span>{c.nome}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

// ─── Produtos ────────────────────────────────────────────────────────────────
function useFavoritos(lojaId: string) {
  const chave = `distre.vitrine.fav.${lojaId}`;
  const [favs, setFavs] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(chave) || '[]'); } catch { return []; } });
  const alternar = (id: string) => setFavs(f => {
    const n = f.includes(id) ? f.filter(x => x !== id) : [...f, id];
    try { localStorage.setItem(chave, JSON.stringify(n)); } catch { /* ignore */ }
    return n;
  });
  return { favs, alternar };
}

function FotoProduto({ produto }: { produto: ProdutoVitrine }) {
  const [indice, setIndice] = useState(0);
  const urls = produto.imagens?.length ? produto.imagens : produto.imagemUrl ? [produto.imagemUrl] : [];
  const src = urlImagem(urls[indice] || urls[0]);
  return <div className="vt-card-foto" style={{ position: 'relative' }}>{src ? <img src={src} alt={produto.nome + (urls.length > 1 ? ' — foto ' + (indice + 1) : '')} loading="lazy" /> : <div className="vt-card-foto--vazia">{produto.nome.charAt(0).toUpperCase()}</div>}{urls.length > 1 && <div className="vt-product-gallery"><button type="button" aria-label={'Foto anterior de ' + produto.nome} onClick={() => setIndice(i => (i - 1 + urls.length) % urls.length)}>‹</button><span>{indice + 1} / {urls.length}</span><button type="button" aria-label={'Próxima foto de ' + produto.nome} onClick={() => setIndice(i => (i + 1) % urls.length)}>›</button></div>}</div>;
}

export function CardProduto({ produto, favorito, onFavoritar, podePedir }: { produto: ProdutoVitrine; favorito: boolean; onFavoritar: () => void; podePedir: boolean }) {
  const { adicionar, incrementar, decrementar, quantidadeDe } = useCarrinho();
  const qtd = quantidadeDe(produto.id);
  return (
    <article className={`vt-card ${qtd > 0 ? 'vt-card--no-carrinho' : ''}`}>
      <button type="button" className={`vt-fav ${favorito ? 'is-fav' : ''}`} onClick={onFavoritar} aria-pressed={favorito} aria-label={favorito ? `Remover ${produto.nome} dos favoritos` : `Favoritar ${produto.nome}`}><IcoCoracao cheio={favorito} /></button>
      <FotoProduto produto={produto} />
      <h3 className="vt-card-nome">{produto.nome}</h3>
      <p className="vt-card-sub">{produto.descricao || produto.subcategoria || produto.categoria || ' '}</p>
      <div>{produto.precoOriginal && <del style={{ color: '#64748b', fontSize: '0.8rem' }}>{formatarPreco(produto.precoOriginal)}</del>}<strong className="vt-card-preco">{formatarPreco(produto.preco)}</strong></div>
      <div className="vt-card-carrinho-status" role="status" aria-atomic="true">
        {qtd > 0 && <><IcoCarrinho size={14} /><span>{qtd} {qtd === 1 ? 'unidade na cestinha' : 'unidades na cestinha'}</span></>}
      </div>
      {!podePedir || produto.estoqueDisponivel === 0 ? (
        <button type="button" className="vt-btn-add" disabled>Indisponível</button>
      ) : qtd === 0 ? (
        <button type="button" className="vt-btn-add" onClick={() => adicionar(produto)}><IcoCarrinho size={18} /> Adicionar</button>
      ) : (
        <div className="vt-stepper" role="group" aria-label={`Quantidade de ${produto.nome}`}>
          <button type="button" onClick={() => decrementar(produto.id)} aria-label="Remover uma unidade">−</button>
          <span aria-live="polite">{qtd}</span>
          <button type="button" disabled={produto.estoqueDisponivel !== undefined && qtd >= produto.estoqueDisponivel} onClick={() => incrementar(produto.id)} aria-label="Adicionar uma unidade">+</button>
        </div>
      )}
    </article>
  );
}

export function GradeProdutos({ produtos, lojaId, podePedir }: { produtos: ProdutoVitrine[]; lojaId: string; podePedir: boolean }) {
  const { favs, alternar } = useFavoritos(lojaId);
  return (
    <div className="vt-grade">
      {produtos.map(p => <CardProduto key={p.id} produto={p} favorito={favs.includes(p.id)} onFavoritar={() => alternar(p.id)} podePedir={podePedir} />)}
    </div>
  );
}

export function ProdutosDestaque({ produtos, categorias, maisVendidos, lojaId, podePedir, onVerTodos }: {
  produtos: ProdutoVitrine[]; categorias: CategoriaVitrine[]; maisVendidos: string[]; lojaId: string; podePedir: boolean; onVerTodos: () => void;
}) {
  const abas = ['Mais vendidos', ...categorias.slice(0, 5).map(c => c.nome)];
  const [aba, setAba] = useState(abas[0]);
  const lista = useMemo(() => {
    if (aba === 'Mais vendidos') {
      const rank = new Map(maisVendidos.map((id, k) => [id, k]));
      return [...produtos].sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9)).slice(0, 10);
    }
    return produtos.filter(p => p.categoria === aba).slice(0, 10);
  }, [aba, produtos, maisVendidos]);
  return (
    <section className="vt-secao">
      <div className="vt-secao-topo"><h2>Produtos em destaque</h2><button type="button" className="vt-link" onClick={onVerTodos}>Ver todos <IcoFlecha /></button></div>
      {abas.length > 1 && (
        <div className="vt-chips" role="tablist">
          {abas.map(a => <button key={a} type="button" role="tab" aria-selected={aba === a} className={`vt-chip ${aba === a ? 'is-ativo' : ''}`} onClick={() => setAba(a)}>{a}</button>)}
        </div>
      )}
      <GradeProdutos produtos={lista} lojaId={lojaId} podePedir={podePedir} />
    </section>
  );
}
