import { useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import KanbanComandas from './KanbanComandas';
import { NOME_MODELO, type NotaResumo } from './fiscal/fiscalApi';
import './operations-workspace.css';

type Props = ComponentProps<typeof KanbanComandas>;
type Order = Props['deliveries'][number];
type Stage = 'todos' | 'novos' | 'separacao' | 'prontos' | 'rota' | 'atrasados' | 'fiscal';

// ─── Ícones (traço único, herdam a cor do texto) ─────────────────────────────
const Ico = ({ children, size = 16 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const IcoDoc = (p: { size?: number }) => <Ico {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></Ico>;
const IcoBox = (p: { size?: number }) => <Ico {...p}><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="m3 8 9 5 9-5M12 13v8" /></Ico>;
const IcoCheck = (p: { size?: number }) => <Ico {...p}><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></Ico>;
const IcoAlert = (p: { size?: number }) => <Ico {...p}><path d="M12 3 2 20h20z" /><path d="M12 10v4M12 17h.01" /></Ico>;
const IcoTruck = (p: { size?: number }) => <Ico {...p}><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /></Ico>;
const IcoClock = (p: { size?: number }) => <Ico {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Ico>;
const IcoX = (p: { size?: number }) => <Ico {...p}><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" /></Ico>;
const IcoCart = (p: { size?: number }) => <Ico {...p}><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l3 12h11l2-8H6" /></Ico>;
const IcoPin = (p: { size?: number }) => <Ico {...p}><path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></Ico>;

const stages: { key: Stage; label: string; icon: ReactNode }[] = [
  { key: 'todos', label: 'Pedidos', icon: <IcoCart size={18} /> },
  { key: 'novos', label: 'Novos', icon: <IcoDoc size={18} /> },
  { key: 'separacao', label: 'Separação', icon: <IcoBox size={18} /> },
  { key: 'prontos', label: 'Despacho', icon: <IcoTruck size={18} /> },
  { key: 'rota', label: 'Entregas', icon: <IcoPin size={18} /> },
  { key: 'atrasados', label: 'Atrasados', icon: <IcoAlert size={18} /> },
  { key: 'fiscal', label: 'Fiscal', icon: <IcoDoc size={18} /> },
];
const onRoute = new Set(['DESPACHADO', 'EM_TRANSITO', 'NO_LOCAL', 'ALERTA_INCIDENTE', 'SLA_ALERTA', 'AGUARDANDO_RETORNO_CD']);
const fiscalIssues = new Set(['REJEITADA', 'ERRO']);
const LIMITE_ATRASO_MIN = 30;
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
function normalize(value: string) { return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('pt-BR'); }
function stageOf(order: Order): Stage {
  if (order.tipoComanda === 'pedido' && order.status === 'RECEBIDO') return 'novos';
  if (order.tipoComanda === 'pedido' && order.status === 'EM_PREPARO') return 'separacao';
  if (order.tipoComanda !== 'pedido' && order.status === 'RECEBIDO') return 'prontos';
  if (order.tipoComanda !== 'pedido' && onRoute.has(order.status)) return 'rota';
  return 'todos';
}

// Situação da linha: define cor, ordem na lista e a ação principal.
type Situacao = 'novo' | 'separacao' | 'pronto' | 'faturado' | 'rota' | 'finalizado';
const ORDEM: Record<Situacao, number> = { novo: 0, separacao: 1, pronto: 2, faturado: 3, rota: 4, finalizado: 5 };
function situacaoOf(order: Order, nota?: NotaResumo): Situacao {
  const st = stageOf(order);
  if (st === 'novos') return 'novo';
  if (st === 'separacao') return 'separacao';
  if (st === 'rota') return 'rota';
  if (st === 'prontos') return nota?.status === 'AUTORIZADA' ? 'faturado' : 'pronto';
  return 'finalizado';
}
const tempo = (o: Order) => new Date(o.criadoEm || o.atualizadoEm || 0).getTime() || 0;
// Minutos parado na etapa atual (mesma régua do timer do Kanban).
const minutosNaEtapa = (o: Order) => Math.max(0, Math.floor((Date.now() - new Date(o.atualizadoEm || o.criadoEm || Date.now()).getTime()) / 60000));
const atrasado = (o: Order, sit: Situacao) => sit !== 'finalizado' && minutosNaEtapa(o) >= LIMITE_ATRASO_MIN;
function decorrido(min: number) {
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  if (min < 1440) return `há ${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
  const dias = Math.floor(min / 1440);
  return `há ${dias} dia${dias > 1 ? 's' : ''}`;
}
const fmtData = (d: Date) => `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

function BadgeOperacao({ sit, order, getStatusText }: { sit: Situacao; order: Order; getStatusText: (s: string) => string }) {
  const m: Record<Situacao, [string, ReactNode]> = {
    novo: ['Novo', <IcoDoc />],
    separacao: ['Em separação', <IcoBox />],
    pronto: ['Conferido', <IcoCheck />],
    faturado: ['Conferido', <IcoCheck />],
    rota: ['Em rota', <IcoTruck />],
    finalizado: [getStatusText(order.status), <IcoCheck />],
  };
  const [rotulo, icone] = m[sit];
  return <span className={`ops-pill ops-pill--${sit}`}>{icone}{rotulo}</span>;
}

function BadgeFiscal({ nota, sit, onClick }: { nota?: NotaResumo; sit: Situacao; onClick?: () => void }) {
  if (!nota) {
    if (sit === 'finalizado' || sit === 'rota') return <span className="ops-pill ops-pill--neutro">Sem nota</span>;
    return <span className="ops-pill ops-pill--pendente"><IcoClock />Pendente</span>;
  }
  const mapa: Record<string, [string, string, ReactNode]> = {
    AUTORIZADA: ['autorizada', 'Autorizada', <IcoCheck />],
    PROCESSANDO: ['pendente', 'Processando', <IcoClock />],
    REJEITADA: ['rejeitada', 'Rejeitada', <IcoX />],
    ERRO: ['rejeitada', 'Erro', <IcoX />],
    CANCELADA: ['neutro', 'Cancelada', <IcoX />],
  };
  const [cls, rotulo, icone] = mapa[nota.status] || ['neutro', nota.status, null];
  return (
    <button type="button" className={`ops-pill ops-pill--${cls} ops-pill--btn`} onClick={onClick} disabled={!onClick}
      title={nota.mensagem || `${NOME_MODELO[nota.modelo]} ${nota.numero ?? ''} — clique para reimprimir`}>
      {icone}{NOME_MODELO[nota.modelo]} {rotulo.toLowerCase()}
    </button>
  );
}

/** Central de pedidos. Toda mutação continua nos handlers do App/Kanban (props). */
export default function OperationsWorkspace(props: Props) {
  const [stage, setStage] = useState<Stage>('todos');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'lista' | 'quadro'>('lista');
  const [focused, setFocused] = useState<string | null>(null);
  const nota = (o: Order) => props.notasPorComanda?.[o.id];
  const sitOf = (o: Order) => situacaoOf(o, nota(o));

  const counts = useMemo(() => {
    const r: Record<Stage, number> = { todos: props.deliveries.length, novos: 0, separacao: 0, prontos: 0, rota: 0, atrasados: 0, fiscal: 0 };
    for (const o of props.deliveries) {
      const k = stageOf(o);
      if (k !== 'todos') r[k]++;
      if (atrasado(o, sitOf(o))) r.atrasados++;
      if (fiscalIssues.has(nota(o)?.status ?? '')) r.fiscal++;
    }
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.deliveries, props.notasPorComanda]);

  const filtered = props.deliveries.filter(o => {
    const ok = stage === 'todos' ? true
      : stage === 'fiscal' ? fiscalIssues.has(nota(o)?.status ?? '')
        : stage === 'atrasados' ? atrasado(o, sitOf(o))
          : stageOf(o) === stage;
    return ok && normalize(`${o.id} ${o.nomeCliente} ${o.endereco}`).includes(normalize(query.trim()));
  }).sort((a, b) => (ORDEM[sitOf(a)] - ORDEM[sitOf(b)]) || (tempo(b) - tempo(a)));

  const changeStage = (next: Stage) => { setStage(next); setFocused(null); setView('lista'); };
  const title = stage === 'todos' ? 'Pedidos' : stages.find(s => s.key === stage)?.label ?? 'Pedidos';
  const focusExists = props.deliveries.some(o => o.id === focused);
  const boardOrders = focused ? props.deliveries.filter(o => o.id === focused) : filtered;
  const hiddenSelections = props.selectedForManifest.filter(id => !boardOrders.some(o => o.id === id));
  const abrirNoQuadro = (id: string) => { setFocused(id); setView('quadro'); };
  const abrir = (o: Order) => (sitOf(o) === 'finalizado' ? props.onAbrirComanda(o.id) : abrirNoQuadro(o.id));

  // Ação principal de cada linha, no espírito "um clique para avançar".
  function acao(o: Order): { rotulo: string; fazer: (e: React.MouseEvent) => void; tom?: 'alerta' } | null {
    const sit = sitOf(o);
    const n = nota(o);
    if (n && fiscalIssues.has(n.status) && props.onNotaFiscal) return { rotulo: 'Corrigir', tom: 'alerta', fazer: () => props.onNotaFiscal!(o.id, n) };
    if (sit === 'novo') return { rotulo: 'Separar', fazer: e => props.onPreparar(o.id, e) };
    if (sit === 'separacao') return { rotulo: 'Concluir', fazer: e => props.onFinalizar(o.id, e) };
    if (sit === 'pronto' && props.onNotaFiscal) return { rotulo: 'Emitir nota', fazer: () => props.onNotaFiscal!(o.id, n) };
    if (sit === 'pronto' || sit === 'faturado') {
      return { rotulo: 'Despachar', fazer: () => { if (!props.selectedForManifest.includes(o.id)) props.onToggleManifest(o.id, true); abrirNoQuadro(o.id); } };
    }
    if (sit === 'rota') return { rotulo: 'Acompanhar', fazer: () => props.onAbrirComanda(o.id) };
    return null;
  }

  const cards: { key: Stage; rotulo: string; icone: ReactNode }[] = [
    { key: 'novos', rotulo: 'Novos', icone: <IcoDoc size={22} /> },
    { key: 'separacao', rotulo: 'Em separação', icone: <IcoBox size={22} /> },
    { key: 'prontos', rotulo: 'Prontos', icone: <IcoCheck size={22} /> },
    { key: 'atrasados', rotulo: 'Atrasados', icone: <IcoAlert size={22} /> },
  ];

  return (
    <div className="ops-workspace">
      <a className="ops-skip" href="#ops-orders">Ir para os pedidos</a>
      <aside className="ops-sidebar" aria-label="Navegação da operação">
        <a className="ops-brand" href="#ops-orders">DISTRE</a>
        <nav>{stages.map(item => (
          <button key={item.key} type="button" className={`ops-nav-item ${stage === item.key ? 'is-active' : ''}`} aria-current={stage === item.key ? 'page' : undefined} onClick={() => changeStage(item.key)}>
            <span className="ops-nav-icon">{item.icon}</span><span>{item.label}</span>
            {item.key !== 'todos' && counts[item.key] > 0 && <span className={`ops-nav-count ${item.key === 'atrasados' || item.key === 'fiscal' ? 'is-alerta' : ''}`}>{counts[item.key]}</span>}
          </button>
        ))}</nav>
        <div className="ops-sidebar-foot"><div>Da entrada à entrega<small>{counts.todos} pedidos registrados</small></div></div>
      </aside>

      <section id="ops-orders" className="ops-content" aria-label="Central de pedidos">
        <div className="ops-heading">
          <h2>{title}</h2>
          <label className="ops-search"><Ico size={18}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Ico>
            <input type="search" aria-label="Buscar pedido ou cliente" placeholder="Buscar pedido ou cliente" value={query} onChange={e => { setQuery(e.target.value); setFocused(null); }} />
          </label>
          <div className="ops-view-switch" aria-label="Visualização">{(['lista', 'quadro'] as const).map(mode => <button type="button" key={mode} aria-pressed={view === mode} onClick={() => { setView(mode); setFocused(null); }}>{mode === 'lista' ? 'Lista' : 'Quadro'}</button>)}</div>
        </div>

        <div className="ops-metrics" aria-label="Resumo da operação">
          {cards.map(c => (
            <button type="button" key={c.key} className={`ops-metric ops-metric--${c.key}`} aria-pressed={stage === c.key} onClick={() => changeStage(stage === c.key ? 'todos' : c.key)}>
              <span className="ops-metric-icone">{c.icone}</span>
              <span className="ops-metric-txt"><span>{c.rotulo}</span><strong>{counts[c.key]}</strong></span>
            </button>
          ))}
        </div>

        <div className="ops-results" role="status">{filtered.length} {filtered.length === 1 ? 'pedido' : 'pedidos'}{stage !== 'todos' && <button type="button" onClick={() => changeStage('todos')}>Ver todos</button>}{query && <button type="button" onClick={() => { setQuery(''); setFocused(null); }}>Limpar busca</button>}</div>

        {view === 'lista' ? <div className="ops-table-wrap"><table className="ops-table"><caption className="ops-sr-only">Pedidos e situação operacional e fiscal</caption>
          <thead><tr><th>Pedido</th><th>Cliente</th><th>Recebido</th><th>Operação</th><th>Fiscal</th><th>Ação</th></tr></thead>
          <tbody>
            {filtered.map(o => {
              const sit = sitOf(o); const n = nota(o); const a = acao(o); const min = minutosNaEtapa(o); const atras = atrasado(o, sit);
              const data = o.criadoEm ? new Date(o.criadoEm) : null;
              return <tr key={o.id} className={`ops-row ops-sit--${sit}${atras ? ' is-atrasado' : ''}`}>
                <td data-label="Pedido"><strong className="ops-order-id">{o.id}</strong>{sit === 'novo' && <span className="ops-novo-tag">NOVO</span>}</td>
                <td data-label="Cliente"><span className="ops-customer">{o.nomeCliente}</span><span className="ops-money">{money.format(props.getValor(o))}</span></td>
                <td data-label="Recebido">
                  <span className="ops-hora">{data && !Number.isNaN(data.getTime()) ? fmtData(data) : '—'}</span>
                  {sit !== 'finalizado' && <span className={`ops-decorrido ${atras ? 'is-atrasado' : ''}`}>{atras && <IcoAlert size={12} />}{decorrido(min)}</span>}
                </td>
                <td data-label="Operação"><BadgeOperacao sit={sit} order={o} getStatusText={props.getStatusText} /></td>
                <td data-label="Fiscal"><BadgeFiscal nota={n} sit={sit} onClick={n && props.onNotaFiscal ? () => props.onNotaFiscal!(o.id, n) : undefined} /></td>
                <td className="ops-acoes"><div className="ops-acoes-inner">
                  {a && <button type="button" className={`ops-acao ${a.tom === 'alerta' ? 'ops-acao--alerta' : ''}`} onClick={a.fazer}>{a.rotulo}</button>}
                  <button type="button" className="ops-abrir" aria-label={`Abrir pedido ${o.id}`} onClick={() => abrir(o)}>›</button>
                </div></td>
              </tr>;
            })}
          </tbody></table>
          {filtered.length === 0 && <div className="ops-empty"><strong>Nenhum pedido nesta visualização</strong><p>Escolha outra etapa ou ajuste a busca.</p><button type="button" onClick={() => { changeStage('todos'); setQuery(''); }}>Ver todos os pedidos</button></div>}
        </div> : <div className={`ops-board ${focused ? 'ops-board--focused' : ''}`}>
          {focused && <div className="ops-focus-banner"><button type="button" onClick={() => { setFocused(null); setView('lista'); }}>← Voltar à lista</button><span>Pedido {focused}</span></div>}
          {hiddenSelections.length > 0 && <div className="ops-selection-warning" role="alert">Há {hiddenSelections.length} pedido(s) selecionado(s) fora desta visualização. Remova essas seleções antes de despachar. <button type="button" onClick={() => hiddenSelections.forEach(id => props.onToggleManifest(id, false))}>Remover seleções ocultas</button></div>}
          {focused && !focusExists ? <p className="ops-empty">Este pedido não está mais disponível. Volte à lista para atualizar a seleção.</p> : <KanbanComandas {...props} deliveries={boardOrders} onDespachar={driverId => { if (hiddenSelections.length === 0) props.onDespachar(driverId); }} />}
        </div>}
      </section>
    </div>
  );
}
