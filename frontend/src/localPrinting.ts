const BASE = 'http://127.0.0.1:17891';
export type LocalPrinter = { name: string; driver: string; automatic: boolean };
export async function listarImpressorasLocais(): Promise<{ printers: LocalPrinter[]; token: string }> {
  try {
    const response = await fetch(`${BASE}/printers`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error();
    return await response.json();
  } catch { throw new Error('Não foi possível conectar à impressão local. Verifique se o conector Distre está aberto e permita o acesso à rede local quando o navegador solicitar.'); }
}
export async function imprimirLocal(printer: string, lines: string[]): Promise<{ file?: string; fileName?: string }> {
  if (!printer) throw new Error('Escolha uma impressora em Configurações antes de imprimir.');
  const { token, printers } = await listarImpressorasLocais();
  if (!printers.some(p => p.name === printer && p.automatic)) throw new Error('A impressora escolhida não está disponível para impressão automática. Confira em Configurações.');
  const response = await fetch(`${BASE}/print`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Distre-Print-Token': token },
    body: JSON.stringify({ printer, lines }), signal: AbortSignal.timeout(65000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível imprimir.');
  return result;
}
export async function baixarTesteLocal(fileName: string): Promise<void> {
  const { token } = await listarImpressorasLocais();
  const response = await fetch(`${BASE}/files/${encodeURIComponent(fileName)}`, { headers: { 'X-Distre-Print-Token': token } });
  if (!response.ok) throw new Error('Não foi possível baixar o teste. Imprima um novo teste.');
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement('a');
  link.href = url; link.download = 'teste-impressao-distre.pdf';
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
