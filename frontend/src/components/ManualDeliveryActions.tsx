import { useState } from 'react';

type Action = 'arrive' | 'complete' | 'fail';
export default function ManualDeliveryActions({ status, onAction }: {
  status: string;
  onAction: (action: Action, payload: Record<string, string>) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!['DESPACHADO', 'EM_TRANSITO', 'NO_LOCAL', 'ALERTA_INCIDENTE', 'SLA_ALERTA'].includes(status)) return null;
  async function submit(action: Action, payload: Record<string, string>) {
    if (busy) return;
    setBusy(true); setError('');
    try { await onAction(action, payload); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível atualizar a entrega.'); }
    finally { setBusy(false); }
  }
  return <div style={{ display: 'grid', gap: '.75rem', marginTop: '1rem' }}>
    <p>Registre o andamento após receber a confirmação do entregador.</p>
    {status !== 'NO_LOCAL' && <button className="btn btn-secondary" disabled={busy}
      onClick={() => submit('arrive', {})}>Registrar chegada ao cliente</button>}
    <button className="btn btn-success" type="button" disabled={busy}
      onClick={() => submit('complete', {})}>{busy ? 'Registrando…' : 'Finalizar entrega'}</button>
    <form onSubmit={event => { event.preventDefault(); if (reason.trim()) void submit('fail', { motivoInsucesso: reason.trim() }); }}>
      <label htmlFor="delivery-failure">Motivo do insucesso</label>
      <input id="delivery-failure" className="form-input" value={reason} maxLength={500} required disabled={busy}
        onChange={event => setReason(event.target.value)} />
      <button className="btn btn-danger" type="submit" disabled={busy || !reason.trim()}>Registrar insucesso e aguardar retorno</button>
    </form>
    {error && <p role="alert">{error}</p>}
  </div>;
}
