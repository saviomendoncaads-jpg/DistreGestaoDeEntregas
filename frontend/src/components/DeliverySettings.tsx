import { useEffect, useState } from 'react';
import { nomeEntrega, type ConfigEntrega } from '../delivery';
import './delivery.css';

export default function DeliverySettings({ backendUrl, token, lojaId }: { backendUrl: string; token: string; lojaId: string }) {
  const [config, setConfig] = useState<ConfigEntrega | null>(null);
  const [erro, setErro] = useState(''); const [status, setStatus] = useState(''); const [salvando, setSalvando] = useState(false);
  const url = `${backendUrl}/api/gestao/entrega?lojaId=${encodeURIComponent(lojaId)}`;
  useEffect(() => {
    let ativo = true;
    void fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error); if (ativo) setConfig(data); }).catch(e => { if (ativo) setErro(e.message || 'Erro ao carregar entregas.'); });
    return () => { ativo = false; };
  }, [url, token]);
  const mudar = (patch: Partial<ConfigEntrega>) => { setConfig(c => c ? { ...c, ...patch } : c); setStatus('Alterações de entrega ainda não salvas.'); setErro(''); };
  async function salvar() {
    setSalvando(true); setErro('');
    try { const r = await fetch(url, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(config) }); const data = await r.json(); if (!r.ok) throw new Error(data.error); setConfig(data); setStatus('Regras de entrega salvas para esta loja.'); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao salvar.'); }
    finally { setSalvando(false); }
  }
  return <section className="delivery-settings" aria-labelledby="delivery-settings-title">
    <h3 id="delivery-settings-title">Tipos e taxas de entrega</h3>
    <p>Escolha os serviços disponíveis na finalização da pré-venda. Os valores e prazos ficam registrados na comanda.</p>
    {erro && <p role="alert" className="delivery-error">{erro}</p>}
    {!config ? <p>{erro ? 'Não foi possível carregar as regras.' : 'Carregando regras…'}</p> : <fieldset disabled={salvando}>
      <label className="delivery-check"><input type="checkbox" checked={config.ativa} onChange={e => mudar({ ativa: e.target.checked })} />Ativar regras de entrega nesta loja</label>
      <label>Como calcular a taxa<select value={config.cobranca} onChange={e => mudar({ cobranca: e.target.value as ConfigEntrega['cobranca'] })}><option value="tipo">Valor fixo por tipo de entrega</option><option value="km">Faixas de distância por km</option></select></label>
      <p>{config.cobranca === 'km' ? 'A faixa de distância define a taxa final para todos os tipos. Os valores fixos abaixo ficam reservados ao modo por tipo.' : 'Cada tipo usa seu próprio valor fixo e prazo.'}</p>
      {config.tipos.map((t, i) => <div key={t.tipo} className={`delivery-type ${t.tipo === 'EXPRESS' ? 'delivery-type--express' : ''}`}>
        <label className="delivery-check"><input type="checkbox" checked={t.ativo} onChange={e => mudar({ tipos: config.tipos.map((v, n) => n === i ? { ...v, ativo: e.target.checked } : v) })} />{nomeEntrega[t.tipo]}</label>
        <div className="delivery-fields"><label>Taxa (R$)<input aria-label={`Taxa ${t.tipo}`} type="number" min="0" max="100000" step="0.01" disabled={config.cobranca === 'km'} value={t.valor} onChange={e => mudar({ tipos: config.tipos.map((v,n) => n === i ? { ...v, valor: e.target.valueAsNumber } : v) })} /></label>
        {t.tipo === 'AGENDADA' ? <span>Conforme horário agendado</span> : <label>Prazo (minutos)<input aria-label={`Prazo ${t.tipo}`} type="number" min="1" max="10080" step="1" value={t.prazoMinutos ?? ''} onChange={e => mudar({ tipos: config.tipos.map((v,n) => n === i ? { ...v, prazoMinutos: e.target.valueAsNumber } : v) })} /></label>}</div>
      </div>)}
      {config.cobranca === 'km' && <div className="delivery-distance"><label>CEP da loja · origem<input inputMode="numeric" maxLength={9} placeholder="00000-000" value={config.cepOrigem} onChange={e => mudar({ cepOrigem: e.target.value })} /></label>
        <p>Distância pelas vias desde o CEP de origem. Acima da última faixa, o endereço fica fora da área atendida.</p>
        {config.faixas.map((f,i) => <div key={i} className="delivery-band"><label>{i ? `Acima de ${config.faixas[i-1].ateKm} até (km)` : 'Até (km)'}<input aria-label={`Limite faixa ${i+1}`} type="number" min="0.001" max="1000" step="0.001" value={f.ateKm} onChange={e => mudar({ faixas: config.faixas.map((v,n) => n === i ? { ...v, ateKm: e.target.valueAsNumber } : v) })} /></label><label>Taxa (R$)<input aria-label={`Taxa faixa ${i+1}`} type="number" min="0" step="0.01" value={f.valor} onChange={e => mudar({ faixas: config.faixas.map((v,n) => n === i ? { ...v, valor: e.target.valueAsNumber } : v) })} /></label><button type="button" aria-label={`Remover faixa ${i+1}`} disabled={config.faixas.length === 1} onClick={() => mudar({ faixas: config.faixas.filter((_,n) => n !== i) })}>×</button></div>)}
        <button type="button" disabled={config.faixas.length >= 30} onClick={() => mudar({ faixas: [...config.faixas, { ateKm: config.faixas.at(-1)!.ateKm+1, valor: config.faixas.at(-1)!.valor }] })}>Adicionar faixa</button>
      </div>}
      <button type="button" className="delivery-save" onClick={() => void salvar()}>{salvando ? 'Salvando…' : 'Salvar regras de entrega'}</button>
      <p role="status">{status}</p>
    </fieldset>}
  </section>;
}
