import { useState } from 'react';
import { imprimirLocal, listarImpressorasLocais, type LocalPrinter } from '../localPrinting';

export default function LocalPrinterSettings({ printer, onChange }: { printer: string; onChange: (name: string) => void }) {
  const [printers, setPrinters] = useState<LocalPrinter[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function connect() {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await listarImpressorasLocais();
      setPrinters(result.printers);
      setMessage(`${result.printers.length} impressoras encontradas neste computador.`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível listar as impressoras.'); }
    finally { setBusy(false); }
  }
  async function test() {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await imprimirLocal(printer, ['DISTRE — TESTE DE IMPRESSÃO', '', '1x Produto de teste', 'TOTAL: R$ 10,00', '', 'Teste sem pedido real e sem valor fiscal.']);
      setMessage(result.file ? `Teste concluído. PDF salvo em: ${result.file}` : 'Teste enviado à impressora. Confira a saída.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha no teste.'); }
    finally { setBusy(false); }
  }
  return <div style={{ display: 'grid', gap: 10 }}>
    <button type="button" disabled={busy} onClick={connect}>{busy ? 'Aguarde…' : 'Buscar impressoras deste computador'}</button>
    <label>Impressora para impressão automática
      <select aria-label="Impressora para impressão automática" className="form-select" value={printer} disabled={busy} onChange={e => onChange(e.target.value)}>
        <option value="">Selecione uma impressora</option>
        {printer && !printers.some(p => p.name === printer) && <option value={printer}>{printer} (salva — atualize a lista)</option>}
        {printers.map(p => <option key={p.name} value={p.name} disabled={!p.automatic}>{p.name}{!p.automatic ? ' — use a janela do navegador' : ''}</option>)}
      </select>
    </label>
    <button type="button" disabled={busy || !printer} onClick={test}>Imprimir teste sem abrir janela</button>
    {message && <p role="status" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{message}</p>}
    {error && <p role="alert" style={{ fontSize: 12, color: '#b91c1c' }}>{error}</p>}
    <small>Escolha a impressora virtual Distre para testar em PDF ou uma impressora física instalada para imprimir no papel.</small>
  </div>;
}
