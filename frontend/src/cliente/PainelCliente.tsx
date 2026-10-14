import { configPadrao } from './configVitrine';
import type { CSSProperties } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { CarrinhoProvider, useCarrinho } from './context/CarrinhoContext';
import { CATEGORIA_OUTROS, categoriasDe, filtrarPorCategoria } from './components/SidebarCategorias';
import type { FiltroCategoria } from './components/SidebarCategorias';
import CarrinhoDrawer from './components/CarrinhoDrawer';
import CheckoutForm from './components/CheckoutForm';
import PedidoConfirmado from './components/PedidoConfirmado';
import { buscarCardapio } from './services/pedidoService';
import { formatarPreco } from './types';
import type { CardapioResposta, PedidoConfirmacao } from './types';
import {
  BannerVitrine, CabecalhoVitrine, CategoriasDestaque, GradeProdutos, ProdutosDestaque, SidebarVitrine,
} from './vitrine/VitrineLoja';
import { IcoCarrinho, IcoSeta, ordenarCategorias } from './vitrine/icones';
import './cliente.css';

// ============================================================================
// PAINEL DO CLIENTE — vitrine pública servida em /loja/<lojaId>.
// Catálogo → sacola (drawer) → checkout → confirmação. Os pedidos entram no
// Distre pela rota pública /api/vitrine e caem como comanda no painel da loja.
// ============================================================================

type Tela = 'catalogo' | 'checkout' | 'confirmado';

function extrairLojaId(): string {
  const m = window.location.pathname.match(/^\/loja\/([^/]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

// Comparação sem acentos/caixa para a busca (\p{M} = marcas diacríticas).
function normalizarTexto(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

// Confirmação persistente do carrinho, inclusive quando o cabeçalho sai da tela.
function BarraSacola({ onAbrir }: { onAbrir: () => void }) {
  const { totalItens, subtotal } = useCarrinho();
  if (totalItens === 0) return null;
  return (
    <button type="button" className="v-barra-sacola vt-barra-carrinho" onClick={onAbrir}
      aria-label={`Ver cestinha: ${totalItens} ${totalItens === 1 ? 'produto' : 'produtos'}, total ${formatarPreco(subtotal)}`}>
      <IcoCarrinho size={22} />
      <span className="v-barra-sacola-badge">{totalItens}</span>
      <span className="vt-barra-carrinho-texto">Ver cestinha<small>{totalItens} {totalItens === 1 ? 'produto adicionado' : 'produtos adicionados'}</small></span>
      <span className="v-barra-sacola-total">{formatarPreco(subtotal)}</span>
    </button>
  );
}

function ConteudoPainel({ cardapio, previa = false }: { cardapio: CardapioResposta; previa?: boolean }) {
  const [tela, setTela] = useState<Tela>('catalogo');
  const [sacolaAberta, setSacolaAberta] = useState(false);
  const [confirmacao, setConfirmacao] = useState<PedidoConfirmacao | null>(null);
  const { totalItens } = useCarrinho();
  const { loja, produtos, outrasLojas = [], maisVendidos = [] } = cardapio;

  const config = loja.configVitrine ?? configPadrao();
  // Categorias derivadas dos produtos (definidas pela loja no painel).
  const categorias = useMemo(() => ordenarCategorias(categoriasDe(produtos).filter(c => c.nome !== CATEGORIA_OUTROS)), [produtos]);
  const [filtro, setFiltro] = useState<FiltroCategoria>({});
  const [verTodos, setVerTodos] = useState(false);
  const [busca, setBusca] = useState('');
  const termoBusca = normalizarTexto(busca.trim());

  // Início = banner + categorias + destaques. Busca, categoria ou "ver todos" = lista de resultados.
  const emResultado = !!termoBusca || !!filtro.categoria || verTodos;
  const resultado = useMemo(() => {
    if (termoBusca) {
      return produtos.filter(p =>
        normalizarTexto(`${p.nome} ${p.marca || ''} ${p.descricao || ''} ${p.categoria || ''} ${p.subcategoria || ''}`).includes(termoBusca));
    }
    return filtrarPorCategoria(produtos, filtro);
  }, [produtos, filtro, termoBusca]);
  const tituloResultado = termoBusca ? `Resultados para “${busca.trim()}”` : filtro.categoria || 'Todos os produtos';

  const topo = () => !previa && window.scrollTo({ top: 0, behavior: 'smooth' });
  const irInicio = () => { setTela('catalogo'); setFiltro({}); setBusca(''); setVerTodos(false); topo(); };
  const abrirCategoria = (categoria: string) => { setTela('catalogo'); setBusca(''); setVerTodos(false); setFiltro({ categoria }); topo(); };
  const aoBuscar = (v: string) => { setBusca(v); setTela('catalogo'); if (v.trim()) { setFiltro({}); setVerTodos(false); } };

  useEffect(() => {
    if (previa) return;
    document.title = config.seoTitulo || `${loja.nome} • Loja online`;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) { meta = document.createElement('meta'); meta.name = 'description'; document.head.appendChild(meta); }
    meta.content = config.seoDescricao || `Conheça os produtos de ${loja.nome}.`;
  }, [loja.nome, config.seoTitulo, config.seoDescricao, previa]);

  return (
    <div style={{ '--v-cobalto': config.cor, '--v-cobalto-forte': config.cor, '--vt-azul': config.cor, '--vt-azul-2': config.cor } as CSSProperties} className={`vt-pagina ${tela === 'catalogo' && totalItens > 0 ? 'vt-pagina--tem-carrinho' : ''}`}>
      <div className="vt-container">
        {config.anuncio && <div className="vt-anuncio">{config.anuncio}</div>}
        <CabecalhoVitrine
          loja={loja}
          outrasLojas={outrasLojas}
          busca={busca}
          onBuscar={aoBuscar}
          onAbrirCarrinho={() => setSacolaAberta(true)}
          onInicio={irInicio}
        />

        <div className="vt-corpo">
          <SidebarVitrine
            loja={loja}
            categorias={categorias}
            filtro={tela === 'catalogo' && !termoBusca ? filtro : {}}
            onFiltrar={f => (f.categoria ? abrirCategoria(f.categoria) : irInicio())}
          />

          <main className="vt-main">
            {!loja.aceitandoPedidos && tela !== 'confirmado' && (
              <div className="vt-aviso" role="status">{config.pausada ? config.mensagemPausa : 'Esta loja não está aceitando pedidos online no momento.'}</div>
            )}

            {tela === 'catalogo' && (emResultado ? (
              <section className="vt-secao">
                <div className="vt-secao-topo">
                  <h2>{tituloResultado} <small style={{ color: '#64748b', fontWeight: 500 }}>({resultado.length})</small></h2>
                  <button type="button" className="vt-link vt-voltar" onClick={irInicio}><IcoSeta dir="esq" size={14} /> Voltar ao início</button>
                </div>
                {resultado.length > 0 ? (
                  <GradeProdutos produtos={resultado} lojaId={loja.id} podePedir={loja.aceitandoPedidos && !previa} />
                ) : (
                  <div className="vt-vazio">
                    <strong>Nada encontrado</strong>
                    Nenhum produto corresponde à sua busca. Confira a grafia ou navegue pelas categorias.
                  </div>
                )}
              </section>
            ) : (
              <>
                {config.secoes.map(secao => <div key={secao}>
                  {secao === 'banners' && <BannerVitrine produtos={produtos} categorias={categorias} banners={config.banners} onCategoria={abrirCategoria} onVerProdutos={() => { setVerTodos(true); topo(); }} />}
                  {secao === 'categorias' && <CategoriasDestaque categorias={config.categoriasDestaque.length ? config.categoriasDestaque.map(nome => categorias.find(c => c.nome === nome)).filter((c): c is typeof categorias[number] => !!c) : categorias} onCategoria={abrirCategoria} />}
                  {secao === 'destaques' && (produtos.length ? <ProdutosDestaque produtos={produtos} categorias={categorias} maisVendidos={maisVendidos} selecionados={config.produtosDestaque} limite={config.limiteDestaques} lojaId={loja.id} podePedir={loja.aceitandoPedidos && !previa} onVerTodos={() => { setVerTodos(true); topo(); }} /> : <div className="vt-vazio"><strong>Catálogo em preparação</strong>Esta loja ainda não publicou produtos. Volte em breve!</div>)}
                </div>)}
              </>
            ))}

            {tela === 'checkout' && (
              <CheckoutForm
                lojaId={loja.id}
                config={config}
                onVoltar={() => setTela('catalogo')}
                onConfirmado={c => {
                  setConfirmacao(c);
                  setTela('confirmado');
                  window.scrollTo({ top: 0 });
                }}
              />
            )}

            {tela === 'confirmado' && confirmacao && (
              <PedidoConfirmado
                confirmacao={confirmacao}
                nomeLoja={loja.nome}
                onNovoPedido={() => {
                  setConfirmacao(null);
                  irInicio();
                }}
              />
            )}
          </main>
        </div>

        <footer className="v-footer">
          {config.sobre && <p>{config.sobre}</p>}
          {config.horarioTexto && <p><strong>Atendimento:</strong> {config.horarioTexto}</p>}
          {config.pedidoMinimo > 0 && <p>Pedido mínimo: {formatarPreco(config.pedidoMinimo)} em produtos.</p>}
          {config.instagram && <p><a href={config.instagram} target="_blank" rel="noreferrer">Instagram da loja</a></p>}
          Pedidos e entregas orquestrados por <strong className="v-footer-marca">Distre</strong>
          <small className="vt-creditos">
            Imagens ilustrativas de produtos:{' '}
            <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">Open Food Facts</a>,{' '}
            <a href="https://world.openbeautyfacts.org" target="_blank" rel="noreferrer">Open Beauty Facts</a> e{' '}
            <a href="https://commons.wikimedia.org" target="_blank" rel="noreferrer">Wikimedia Commons</a>{' '}
            (<a href="https://creativecommons.org/licenses/by-sa/3.0/deed.pt_BR" target="_blank" rel="noreferrer">CC BY-SA</a>).
          </small>
        </footer>
      </div>

      {!previa && tela === 'catalogo' && loja.aceitandoPedidos && !sacolaAberta && <BarraSacola onAbrir={() => setSacolaAberta(true)} />}

      <CarrinhoDrawer
        aberto={sacolaAberta}
        onFechar={() => setSacolaAberta(false)}
        onIrParaCheckout={() => {
          setSacolaAberta(false);
          if (!previa) setTela('checkout');
          window.scrollTo({ top: 0 });
        }}
      />
    </div>
  );
}

export default function PainelCliente() {
  const lojaId = useMemo(extrairLojaId, []);
  const [cardapio, setCardapio] = useState<CardapioResposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!lojaId) return;
    let ativo = true;
    buscarCardapio(lojaId)
      .then(dados => {
        if (ativo) setCardapio(dados);
      })
      .catch(err => {
        if (ativo) setErro(err?.message || 'Não foi possível carregar o catálogo.');
      });
    return () => {
      ativo = false;
    };
  }, [lojaId]);

  if (!lojaId) {
    return (
      <div className="v-pagina v-pagina--centro">
        <div className="v-estado-vazio">
          <span className="v-estado-vazio-icone" aria-hidden="true">🔗</span>
          <h2>Link incompleto</h2>
          <p>
            Este catálogo é acessado por um link no formato <code>/loja/&lt;id-da-loja&gt;</code>.
            Peça o link correto à loja.
          </p>
        </div>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="v-pagina v-pagina--centro">
        <div className="v-estado-vazio">
          <span className="v-estado-vazio-icone" aria-hidden="true">😕</span>
          <h2>Não foi possível abrir o catálogo</h2>
          <p>{erro}</p>
          <button type="button" className="v-btn-secundario" onClick={() => window.location.reload()}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (!cardapio) {
    return (
      <div className="v-pagina v-pagina--centro">
        <div className="v-carregando" role="status" aria-label="Carregando catálogo">
          <span /><span /><span />
        </div>
      </div>
    );
  }

  return (
    <CarrinhoProvider lojaId={lojaId}>
      <ConteudoPainel cardapio={cardapio} />
    </CarrinhoProvider>
  );
}

export function VitrinePrevia({ cardapio }: { cardapio: CardapioResposta }) {
  return <CarrinhoProvider lojaId={`previa-${cardapio.loja.id}`}><ConteudoPainel cardapio={cardapio} previa /></CarrinhoProvider>;
}
