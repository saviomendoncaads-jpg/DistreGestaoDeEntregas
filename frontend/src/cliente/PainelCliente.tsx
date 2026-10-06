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
import { IcoSeta, ordenarCategorias } from './vitrine/icones';
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

// Barra flutuante "Ver sacola" — no celular, com itens no carrinho.
function BarraSacola({ onAbrir }: { onAbrir: () => void }) {
  const { totalItens, subtotal } = useCarrinho();
  if (totalItens === 0) return null;
  return (
    <button type="button" className="v-barra-sacola vt-barra-mobile" onClick={onAbrir}>
      <span className="v-barra-sacola-badge">{totalItens}</span>
      <span>Ver carrinho</span>
      <span className="v-barra-sacola-total">{formatarPreco(subtotal)}</span>
    </button>
  );
}

function ConteudoPainel({ cardapio }: { cardapio: CardapioResposta }) {
  const [tela, setTela] = useState<Tela>('catalogo');
  const [sacolaAberta, setSacolaAberta] = useState(false);
  const [confirmacao, setConfirmacao] = useState<PedidoConfirmacao | null>(null);
  const { loja, produtos, outrasLojas = [], maisVendidos = [] } = cardapio;

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
        normalizarTexto(`${p.nome} ${p.descricao || ''} ${p.categoria || ''} ${p.subcategoria || ''}`).includes(termoBusca));
    }
    return filtrarPorCategoria(produtos, filtro);
  }, [produtos, filtro, termoBusca]);
  const tituloResultado = termoBusca ? `Resultados para “${busca.trim()}”` : filtro.categoria || 'Todos os produtos';

  const topo = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  const irInicio = () => { setTela('catalogo'); setFiltro({}); setBusca(''); setVerTodos(false); topo(); };
  const abrirCategoria = (categoria: string) => { setTela('catalogo'); setBusca(''); setVerTodos(false); setFiltro({ categoria }); topo(); };
  const aoBuscar = (v: string) => { setBusca(v); setTela('catalogo'); if (v.trim()) { setFiltro({}); setVerTodos(false); } };

  useEffect(() => {
    document.title = `${loja.nome} • Loja online`;
  }, [loja.nome]);

  return (
    <div className="vt-pagina">
      <div className="vt-container">
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
              <div className="vt-aviso" role="status">Esta loja não está aceitando pedidos online no momento.</div>
            )}

            {tela === 'catalogo' && (emResultado ? (
              <section className="vt-secao">
                <div className="vt-secao-topo">
                  <h2>{tituloResultado} <small style={{ color: '#64748b', fontWeight: 500 }}>({resultado.length})</small></h2>
                  <button type="button" className="vt-link vt-voltar" onClick={irInicio}><IcoSeta dir="esq" size={14} /> Voltar ao início</button>
                </div>
                {resultado.length > 0 ? (
                  <GradeProdutos produtos={resultado} lojaId={loja.id} podePedir={loja.aceitandoPedidos} />
                ) : (
                  <div className="vt-vazio">
                    <strong>Nada encontrado</strong>
                    Nenhum produto corresponde à sua busca. Confira a grafia ou navegue pelas categorias.
                  </div>
                )}
              </section>
            ) : (
              <>
                <BannerVitrine
                  produtos={produtos}
                  categorias={categorias}
                  onCategoria={abrirCategoria}
                  onVerProdutos={() => { setVerTodos(true); topo(); }}
                />
                <CategoriasDestaque categorias={categorias} onCategoria={abrirCategoria} />
                {produtos.length > 0 ? (
                  <ProdutosDestaque
                    produtos={produtos}
                    categorias={categorias}
                    maisVendidos={maisVendidos}
                    lojaId={loja.id}
                    podePedir={loja.aceitandoPedidos}
                    onVerTodos={() => { setVerTodos(true); topo(); }}
                  />
                ) : (
                  <div className="vt-vazio"><strong>Catálogo em preparação</strong>Esta loja ainda não publicou produtos. Volte em breve!</div>
                )}
              </>
            ))}

            {tela === 'checkout' && (
              <CheckoutForm
                lojaId={loja.id}
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
          Pedidos e entregas orquestrados por <strong className="v-footer-marca">Distre</strong>
        </footer>
      </div>

      {tela === 'catalogo' && loja.aceitandoPedidos && <BarraSacola onAbrir={() => setSacolaAberta(true)} />}

      <CarrinhoDrawer
        aberto={sacolaAberta}
        onFechar={() => setSacolaAberta(false)}
        onIrParaCheckout={() => {
          setSacolaAberta(false);
          setTela('checkout');
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
        if (ativo) setErro(err?.message || 'Não foi possível carregar o cardápio.');
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
            Este cardápio é acessado por um link no formato <code>/loja/&lt;id-da-loja&gt;</code>.
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
          <h2>Não foi possível abrir o cardápio</h2>
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
        <div className="v-carregando" role="status" aria-label="Carregando cardápio">
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
