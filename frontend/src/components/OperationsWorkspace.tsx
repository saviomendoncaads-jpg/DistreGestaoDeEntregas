import { useMemo, useState, type ComponentProps } from 'react';
import KanbanComandas from './KanbanComandas';
import { NOME_MODELO } from './fiscal/fiscalApi';
import './operations-workspace.css';

type Props = ComponentProps<typeof KanbanComandas>;
type Order = Props['deliveries'][number];
type Stage = 'todos' | 'novos' | 'separacao' | 'prontos' | 'rota' | 'fiscal';
const stages: { key: Stage; label: string; icon: string }[] = [
  { key: 'todos', label: 'Todos os pedidos', icon: '▦' },
  { key: 'novos', label: 'Novos pedidos', icon: '+' },
  { key: 'separacao', label: 'Separação', icon: '▤' },
  { key: 'prontos', label: 'Despacho', icon: '↗' },
  { key: 'rota', label: 'Em entrega', icon: '⇢' },
  { key: 'fiscal', label: 'Pendências fiscais', icon: '!' },
];
const onRoute = new Set(['DESPACHADO', 'EM_TRANSITO', 'NO_LOCAL', 'ALERTA_INCIDENTE', 'SLA_ALERTA', 'AGUARDANDO_RETORNO_CD']);
const fiscalIssues = new Set(['REJEITADA', 'ERRO']);
const fiscalLabels: Record<string, string> = { AUTORIZADA: 'Autorizada', PROCESSANDO: 'Processando', REJEITADA: 'Rejeitada', ERRO: 'Erro', CANCELADA: 'Cancelada' };
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
function normalize(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR'); }
function stageOf(order: Order): Stage {
  if (order.tipoComanda === 'pedido' && order.status === 'RECEBIDO') return 'novos';
  if (order.tipoComanda === 'pedido' && order.status === 'EM_PREPARO') return 'separacao';
  if (order.tipoComanda !== 'pedido' && order.status === 'RECEBIDO') return 'prontos';
  if (order.tipoComanda !== 'pedido' && onRoute.has(order.status)) return 'rota';
  return 'todos';
}

/** Presentation adapter. All mutations stay in the existing Kanban and App handlers. */
export default function OperationsWorkspace(props: Props) {
  const [stage, setStage] = useState<Stage>('todos');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'lista' | 'quadro'>('lista');
  const [focused, setFocused] = useState<string | null>(null);
  const counts = useMemo(() => {
    const result: Record<Stage, number> = { todos: props.deliveries.length, novos: 0, separacao: 0, prontos: 0, rota: 0, fiscal: 0 };
    for (const order of props.deliveries) {
      const key = stageOf(order);
      if (key !== 'todos') result[key]++;
      if (fiscalIssues.has(props.notasPorComanda?.[order.id]?.status ?? '')) result.fiscal++;
    }
    return result;
  }, [props.deliveries, props.notasPorComanda]);
  const filtered = props.deliveries.filter(order => {
    const matchesStage = stage === 'todos' || (stage === 'fiscal'
      ? fiscalIssues.has(props.notasPorComanda?.[order.id]?.status ?? '') : stageOf(order) === stage);
    return matchesStage && normalize(`${order.id} ${order.nomeCliente} ${order.endereco}`).includes(normalize(query.trim()));
  });
  const changeStage = (next: Stage) => { setStage(next); setFocused(null); setView('lista'); };
  const title = stages.find(item => item.key === stage)?.label ?? 'Pedidos';
  const focusExists = props.deliveries.some(order => order.id === focused);
  // A focused Kanban keeps the original detail, fiscal and dispatch interactions.
  const boardOrders = focused ? props.deliveries.filter(order => order.id === focused) : filtered;
  const hiddenSelections = props.selectedForManifest.filter(id => !boardOrders.some(order => order.id === id));
  return (
    <div className="ops-workspace">
      <a className="ops-skip" href="#ops-orders">Ir para os pedidos</a>
      <aside className="ops-sidebar" aria-label="Navegação da operação">
        <a className="ops-brand" href="#ops-orders"><span className="ops-brand-mark" aria-hidden="true">Λ</span> DISTRE</a>
        <span className="ops-nav-caption">OPERAÇÃO</span>
        <nav>{stages.map(item => (
          <button key={item.key} type="button" className={`ops-nav-item ${stage === item.key ? 'is-active' : ''}`} aria-current={stage === item.key ? 'page' : undefined} onClick={() => changeStage(item.key)}>
            <span aria-hidden="true" className="ops-nav-icon">{item.icon}</span><span>{item.label}</span><span className="ops-nav-count">{counts[item.key]}</span>
          </button>
        ))}</nav>
        <div className="ops-sidebar-foot"><span className="ops-brand-mark" aria-hidden="true">✓</span><div>Da entrada à entrega<small>Uma operação conectada</small></div></div>
      </aside>
      <section id="ops-orders" className="ops-content" aria-label="Central de pedidos">
        <div className="ops-heading"><div><span className="ops-eyebrow">CENTRAL DE PEDIDOS</span><h2>{title}</h2><p>Acompanhe cada etapa e avance com clareza.</p></div><span className="ops-total">{counts.todos} pedidos registrados</span></div>
        <div className="ops-metrics" aria-label="Resumo da operação">
          {(['novos', 'separacao', 'prontos', 'rota'] as Stage[]).map(key => <button type="button" key={key} className={`ops-metric ops-metric--${key}`} aria-pressed={stage === key} onClick={() => changeStage(key)}><span>{key === 'novos' ? 'Novos pedidos' : key === 'separacao' ? 'Em separação' : key === 'prontos' ? 'Prontos para despacho' : 'Em entrega'}</span><strong>{counts[key]}</strong><small>Ver pedidos <span aria-hidden="true">→</span></small></button>)}
        </div>
        <div className="ops-toolbar">
          <label className="ops-search"><span aria-hidden="true">⌕</span><input type="search" aria-label="Buscar pedido, cliente ou endereço" placeholder="Buscar pedido, cliente ou endereço" value={query} onChange={event => { setQuery(event.target.value); setFocused(null); }} /></label>
          <div className="ops-view-switch" aria-label="Visualização">{(['lista', 'quadro'] as const).map(mode => <button type="button" key={mode} aria-pressed={view === mode} onClick={() => { setView(mode); setFocused(null); }}>{mode === 'lista' ? 'Lista' : 'Quadro'}</button>)}</div>
        </div>
        <div className="ops-results" role="status">{filtered.length} {filtered.length === 1 ? 'pedido encontrado' : 'pedidos encontrados'}{query && <button type="button" onClick={() => { setQuery(''); setFocused(null); }}>Limpar busca</button>}</div>
        {view === 'lista' ? <div className="ops-table-wrap"><table className="ops-table"><caption className="ops-sr-only">Pedidos e situação operacional e fiscal</caption><thead><tr><th>Pedido / cliente</th><th>Recebido em</th><th>Operação</th><th>Fiscal</th><th>Valor</th><th><span className="ops-sr-only">Ações</span></th></tr></thead><tbody>
          {filtered.map(order => { const note = props.notasPorComanda?.[order.id]; const key = stageOf(order); const date = order.criadoEm ? new Date(order.criadoEm) : null; return <tr key={order.id}>
            <td><strong className="ops-order-id">{order.id}</strong><span className="ops-customer">{order.nomeCliente}</span></td>
            <td data-label="Recebido em">{date && !Number.isNaN(date.getTime()) ? date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'Não informado'}</td>
            <td data-label="Operação"><span className={`ops-badge ops-badge--${key}`}>{key === 'novos' ? 'Novo pedido' : key === 'separacao' ? 'Em separação' : key === 'prontos' ? 'Pronto para despacho' : props.getStatusText(order.status)}</span></td>
            <td data-label="Fiscal">{note ? <button type="button" className={`ops-badge ops-fiscal ops-fiscal--${note.status}`} disabled={!props.onNotaFiscal} onClick={() => props.onNotaFiscal?.(order.id, note)}>{NOME_MODELO[note.modelo]} · {fiscalLabels[note.status] ?? note.status}</button> : <span className="ops-no-note">Sem nota registrada</span>}</td>
            <td data-label="Valor" className="ops-money">{money.format(props.getValor(order))}</td>
            <td><button type="button" className="ops-open" aria-label={`Ver pedido ${order.id} de ${order.nomeCliente}`} onClick={() => { if (key === 'todos') { props.onAbrirComanda(order.id); return; } setFocused(order.id); setView('quadro'); }}>Ver pedido <span aria-hidden="true">→</span></button></td>
          </tr>; })}
        </tbody></table>{filtered.length === 0 && <div className="ops-empty"><strong>Nenhum pedido nesta visualização</strong><p>Escolha outra etapa ou ajuste os termos da busca.</p><button type="button" onClick={() => { changeStage('todos'); setQuery(''); }}>Ver todos os pedidos</button></div>}</div> : <div className={`ops-board ${focused ? 'ops-board--focused' : ''}`}>
          {focused && <div className="ops-focus-banner"><button type="button" onClick={() => { setFocused(null); setView('lista'); }}>← Voltar à lista</button><span>Pedido {focused}</span></div>}
          {hiddenSelections.length > 0 && <div className="ops-selection-warning" role="alert">Há {hiddenSelections.length} pedido(s) selecionado(s) fora desta visualização. Remova essas seleções antes de despachar. <button type="button" onClick={() => hiddenSelections.forEach(id => props.onToggleManifest(id, false))}>Remover seleções ocultas</button></div>}
          {focused && !focusExists ? <p className="ops-empty">Este pedido não está mais disponível. Volte à lista para atualizar a seleção.</p> : <KanbanComandas {...props} deliveries={boardOrders} onDespachar={driverId => { if (hiddenSelections.length === 0) props.onDespachar(driverId); }} />}
        </div>}
      </section>
    </div>
  );
}
