import { useState } from 'react';

export default function ReturnStockAction({ onReturn }: { onReturn: () => Promise<void> }) {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <div>
    <p>Confira fisicamente os produtos. Esta ação recebe o retorno integral em condições de revenda.</p>
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '.4rem', marginBottom: '.6rem' }}>
      <input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />
      Recebi todos os produtos da entrega e confirmei que estão aptos à revenda.
    </label>
    <button className="btn btn-success btn-small" style={{ width: '100%' }} disabled={!confirmed || busy}
      onClick={async () => {
        if (busy || !confirmed) return;
        setBusy(true); setError('');
        try { await onReturn(); }
        catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível confirmar o retorno.'); }
        finally { setBusy(false); }
      }}>{busy ? 'Registrando retorno…' : 'Confirmar retorno integral ao estoque'}</button>
    {error && <p role="alert" style={{ color: 'var(--color-rose)' }}>{error}</p>}
    <p>Retornos parciais ou produtos avariados precisam de tratamento separado. Não use esta ação nesses casos.</p>
  </div>;
}
