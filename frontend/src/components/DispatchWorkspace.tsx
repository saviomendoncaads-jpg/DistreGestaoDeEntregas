import { useRef, useState, type ComponentProps } from 'react';
import KanbanComandas from './KanbanComandas';
import { NOME_MODELO } from './fiscal/fiscalApi';
import './dispatch-workspace.css';

type Props = ComponentProps<typeof KanbanComandas> & {
  onDespacharProntos: (ids: string[], driverId: string) => Promise<void>;
};
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function Icon({ kind }: { kind: 'truck' | 'pin' | 'search' | 'clock' | 'box' | 'user' }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'truck' ? <><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /></> : kind === 'pin' ? <><path d="M12 21s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12Z" /><circle cx="12" cy="9" r="2" /></> : kind === 'search' ? <><circle cx="10" cy="10" r="7" /><path d="m15 15 6 6" /></> : kind === 'clock' ? <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> : kind === 'user' ? <><circle cx="12" cy="7" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></> : <><path d="m3 8 9-5 9 5v9l-9 5-9-5Z" /><path d="m3 8 9 5 9-5M12 13v9" /></>}
  </svg>;
}
function elapsed(value?: string) {
  if (!value || Number.isNaN(Date.parse(value))) return 'Agora';
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000));
  return minutes < 1 ? 'Agora' : minutes < 60 ? `Há ${minutes} min` : `Há ${Math.floor(minutes / 60)}h ${minutes % 60}min`;
}

export default function DispatchWorkspace(props: Props) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'manual' | 'auto'>('manual');
  const [driverId, setDriverId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const submitting = useRef(false);
  const ready = props.deliveries.filter(o => o.tipoComanda !== 'pedido' && o.status === 'RECEBIDO');
  const visible = ready.filter(o => normalize(`${o.id} ${o.nomeCliente} ${o.endereco}`).includes(normalize(query.trim())));
  const selected = ready.filter(o => props.selectedForManifest.includes(o.id));
  const outside = props.selectedForManifest.filter(id => !visible.some(o => o.id === id));
  const available = props.drivers.filter(d => d.status === 'ocioso');
  const chosen = mode === 'auto' ? available[0] : props.drivers.find(d => d.id === driverId);
  const allVisible = visible.length > 0 && visible.every(o => props.selectedForManifest.includes(o.id));
  const total = selected.reduce((sum, o) => sum + props.getValor(o), 0);
  const canDispatch = selected.length > 0 && outside.length === 0 && !!chosen && !busy;
  async function dispatch() {
    if (!canDispatch || submitting.current || !chosen) return;
    submitting.current = true; setBusy(true); setError(''); setSuccess('');
    try {
      await props.onDespacharProntos(selected.map(o => o.id), chosen.id);
      setSuccess(`${selected.length} ${selected.length === 1 ? 'pedido despachado' : 'pedidos despachados'}. O romaneio está disponível para impressão.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível despachar. Tente novamente.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <div className="dispatch-workspace" aria-busy={busy}>
    <header className="dispatch-heading"><div><h2>Despacho</h2><p>Selecione os pedidos e escolha quem fará a entrega.</p></div>
      <div className="dispatch-stats" aria-label="Resumo do despacho">
        <span><Icon kind="box" /><strong>{ready.length}</strong> prontos</span>
        <span><strong>{selected.length}</strong> {selected.length === 1 ? 'selecionado' : 'selecionados'}</span>
        <span><Icon kind="user" /><strong>{available.length}</strong> {available.length === 1 ? 'entregador disponível' : 'entregadores disponíveis'}</span>
      </div>
    </header>
    <div className="dispatch-columns">
      <section className="dispatch-panel" aria-labelledby="dispatch-ready-title">
        <div className="dispatch-list-heading"><h3 id="dispatch-ready-title">Pedidos prontos</h3><label className="dispatch-select-all"><input type="checkbox" checked={allVisible} disabled={busy || !visible.length} onChange={e => visible.forEach(o => props.onToggleManifest(o.id, e.target.checked))} />Selecionar todos</label></div>
        <label className="ops-search dispatch-search"><Icon kind="search" /><input type="search" aria-label="Buscar pedido ou cliente no despacho" placeholder="Buscar pedido ou cliente" value={query} disabled={busy} onChange={e => setQuery(e.target.value)} /></label>
        {outside.length > 0 && <div className="ops-selection-warning" role="alert">Há {outside.length} seleção(ões) fora desta busca ou que não está(ão) mais pronta(s).<button type="button" disabled={busy} onClick={() => outside.forEach(id => props.onToggleManifest(id, false))}>Remover seleções fora da lista</button></div>}
        <div className="dispatch-orders">{visible.map(o => {
          const checked = props.selectedForManifest.includes(o.id);
          const n = props.notasPorComanda?.[o.id];
          const status = n?.status === 'AUTORIZADA' ? 'autorizada' : n?.status === 'REJEITADA' ? 'rejeitada' : n?.status === 'ERRO' ? 'erro' : n?.status === 'CANCELADA' ? 'cancelada' : 'processando';
          return <article key={o.id} className={`dispatch-order ${checked ? 'is-selected' : ''}`}>
            <input type="checkbox" aria-label={`Selecionar pedido ${o.id}`} checked={checked} disabled={busy} onChange={e => props.onToggleManifest(o.id, e.target.checked)} />
            <div className="dispatch-order-info"><strong>{o.id}</strong><span className="dispatch-customer">{o.nomeCliente}</span><span className="dispatch-address"><Icon kind="pin" />{o.endereco}</span><button type="button" className="dispatch-link" onClick={() => props.onAbrirComanda(o.id)}>Ver pedido →</button></div>
            <div className="dispatch-order-meta"><strong>{money.format(props.getValor(o))}</strong><button type="button" disabled={!props.onNotaFiscal} onClick={() => props.onNotaFiscal?.(o.id, n)} className={`dispatch-fiscal ${n?.status === 'AUTORIZADA' ? 'is-authorized' : n?.status === 'ERRO' || n?.status === 'REJEITADA' ? 'is-error' : ''}`}>{n ? `${NOME_MODELO[n.modelo]} ${status}` : 'Nota pendente'}</button><span className="dispatch-time"><Icon kind="clock" />{elapsed(o.atualizadoEm || o.criadoEm)}</span></div>
          </article>;
        })}</div>
        {!visible.length && <div className="dispatch-empty"><Icon kind="box" /><h4>{ready.length ? 'Nenhum pedido encontrado' : 'Nenhum pedido pronto para despacho'}</h4><p>{ready.length ? 'Ajuste a busca para encontrar o pedido.' : 'Os pedidos aparecem aqui após concluir a separação.'}</p>{query && <button className="dispatch-link" type="button" onClick={() => setQuery('')}>Limpar busca</button>}</div>}
      </section>
      <aside className="dispatch-panel dispatch-summary" aria-labelledby="dispatch-summary-title">
        <h3 id="dispatch-summary-title">Preparar despacho</h3>
        <div className="dispatch-selection" role="status"><strong>{selected.length}</strong> {selected.length === 1 ? 'pedido selecionado' : 'pedidos selecionados'}</div>
        <div className="dispatch-total"><span>Total dos pedidos</span><strong>{money.format(total)}</strong></div>
        <fieldset className="dispatch-driver" disabled={busy}><legend>Entregador</legend>
          <label className="dispatch-manual"><input type="radio" name="dispatch-mode" checked={mode === 'manual'} onChange={() => setMode('manual')} />Escolher entregador</label>
          <select aria-label="Escolher entregador" disabled={mode !== 'manual'} value={driverId} onChange={e => setDriverId(e.target.value)}><option value="">Selecione um entregador</option>{props.drivers.map(d => <option key={d.id} value={d.id}>{d.name} · {d.status === 'ocioso' ? 'Disponível' : 'Em rota'}</option>)}</select>
          <small>{mode === 'manual' && chosen ? `${chosen.name} receberá os pedidos selecionados.` : 'Todos os entregadores cadastrados estão online.'}</small>
          <label className={`dispatch-auto ${mode === 'auto' ? 'is-selected' : ''}`}><input type="radio" name="dispatch-mode" checked={mode === 'auto'} onChange={() => setMode('auto')} /><span><strong>Despacho automático</strong><small>{mode === 'auto' && chosen ? `Entregador escolhido: ${chosen.name}.` : 'Seleciona o primeiro entregador disponível.'}</small></span></label>
        </fieldset>
        {available.length === 0 && <p className="dispatch-hint">{props.drivers.length ? 'Os entregadores estão em rota. Escolha manualmente quem receberá estes pedidos.' : 'Cadastre um motoboy para despachar os pedidos.'}</p>}
        {error && <p className="dispatch-error" role="alert">{error}</p>}{success && <p className="dispatch-success" role="status">{success}</p>}
        <button type="button" className="dispatch-submit" disabled={!canDispatch} onClick={dispatch}><Icon kind="truck" />{busy ? 'Despachando…' : `Despachar ${selected.length} ${selected.length === 1 ? 'pedido' : 'pedidos'}`}</button>
        <p className="dispatch-footnote">Após o despacho, acompanhe em <strong>Entregas</strong>.</p>
      </aside>
    </div>
  </div>;
}
