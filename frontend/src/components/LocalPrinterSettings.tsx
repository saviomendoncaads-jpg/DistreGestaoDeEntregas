import { useEffect, useState } from 'react';
import { baixarTesteLocal, imprimirLocal, listarImpressorasLocais, type LocalPrinter } from '../localPrinting';

export default function LocalPrinterSettings({ printer, onChange }: { printer: string; onChange: (name: string) => void }) {
  const [printers, setPrinters] = useState<LocalPrinter[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [testFile, setTestFile] = useState('');
  const [connected, setConnected] = useState(false);
  useEffect(() => { void connect(); }, []);
  async function connect() {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await listarImpressorasLocais();
      setPrinters(result.printers);
      setConnected(true);
      setMessage(`${result.printers.filter(p => p.automatic).length} impressoras disponíveis para impressão automática.`);
    } catch (e) { setConnected(false); setError(e instanceof Error ? e.message : 'Não foi possível listar as impressoras.'); }
    finally { setBusy(false); }
  }
  async function test() {
    setBusy(true); setError(''); setMessage(''); setTestFile('');
    try {
      const result = await imprimirLocal(printer, ['DISTRE — TESTE DE IMPRESSÃO', '', '1x Produto de teste', 'TOTAL: R$ 10,00', '', 'Teste sem pedido real e sem valor fiscal.']);
      setTestFile(result.fileName || '');
      setMessage(result.fileName ? 'Teste concluído sem abrir janela. O PDF do teste está pronto.' : 'Teste enviado sem abrir janela. Confira a saída na impressora.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha no teste.'); }
    finally { setBusy(false); }
  }
  async function download() {
    setBusy(true); setError('');
    try { await baixarTesteLocal(testFile); }
    catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível baixar o teste.'); }
    finally { setBusy(false); }
  }
  return <div style={{ display: 'grid', gap: 10, padding: 16, border: '1px solid #e2e8f0', borderRadius: 9, background: '#f8fafc' }}>
    <strong style={{ fontSize: 14, color: connected ? '#047857' : '#475569' }}>{connected ? '● Impressão local conectada' : busy ? 'Conectando às impressoras…' : 'Impressão local desconectada'}</strong>
    <button type="button" disabled={busy} onClick={connect}>{busy ? 'Aguarde…' : 'Atualizar impressoras'}</button>
    <label>Impressora para impressão automática
      <select aria-label="Impressora para impressão automática" className="form-select" value={printer} disabled={busy} onChange={e => onChange(e.target.value)}>
        <option value="">Selecione uma impressora</option>
        {printer && !printers.some(p => p.name === printer) && <option value={printer}>{printer} (salva — atualize a lista)</option>}
        {printers.map(p => <option key={p.name} value={p.name} disabled={!p.automatic}>{p.name}{!p.automatic ? ' — use a janela do navegador' : ''}</option>)}
      </select>
    </label>
    <button type="button" disabled={busy || !printer} onClick={test}>Imprimir teste sem abrir janela</button>
    {message && <p role="status" style={{ fontSize: 12, overflowWrap: 'anywhere', color: '#047857' }}>{message}</p>}
    {testFile && <button type="button" disabled={busy} onClick={download}>Baixar PDF do teste</button>}
    {error && <p role="alert" style={{ fontSize: 12, color: '#b91c1c' }}>{error}</p>}
    <small>Escolha a impressora virtual Distre para testar em PDF ou uma impressora física instalada para imprimir no papel.</small>
  </div>;
}
