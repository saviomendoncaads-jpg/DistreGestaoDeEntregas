import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '../services/api';
import type { EnderecoEntrega } from '../types';
import { dinheiro, nomeEntrega, type ConfigEntrega, type CotacaoEntrega, type SelecaoEntrega, type TipoEntrega } from '../../delivery';
import DeliveryBadge from '../../components/DeliveryBadge';

export function useDeliveryCheckout(lojaId: string, endereco: EnderecoEntrega) {
  const [config, setConfig] = useState<ConfigEntrega | null>(null);
  const [carregando, setCarregando] = useState(true); const [falhaConfig, setFalhaConfig] = useState('');
  const [tipo, setTipo] = useState<TipoEntrega | ''>(''); const [agendamento, setAgendamento] = useState('');
  const [cotacao, setCotacao] = useState<{ chave: string; data: CotacaoEntrega } | null>(null);
  const [erro, setErro] = useState(''); const [calculando, setCalculando] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    let ativo = true;
    void apiGet<ConfigEntrega | null>(`/api/vitrine/${encodeURIComponent(lojaId)}/entrega`).then(c => { if (ativo) { setConfig(c); setFalhaConfig(''); } }).catch(() => { if (ativo) setFalhaConfig('Não foi possível carregar as opções de entrega.'); }).finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [lojaId, tentativa]);
  // O horário é sempre o da loja (Fortaleza), mesmo em outro fuso no navegador.
  const agendadoPara = tipo === 'AGENDADA' && agendamento ? `${agendamento}:00-03:00` : undefined;
  const chave = JSON.stringify([lojaId, config, endereco, tipo, agendadoPara]);
  const atual = cotacao?.chave === chave ? cotacao.data : null;
  useEffect(() => {
    if (!cotacao) return;
    const timer = setTimeout(() => setCotacao(null), Math.max(0, Date.parse(cotacao.data.expiraEm) - Date.now()));
    return () => clearTimeout(timer);
  }, [cotacao]);
  async function calcular() {
    setErro(''); setCalculando(true);
    try {
      const data = await apiPost<CotacaoEntrega>(`/api/vitrine/${encodeURIComponent(lojaId)}/entrega/cotacao`, { endereco, entrega: { tipo, agendadoPara } });
      setCotacao({ chave, data });
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível calcular a entrega.'); setCotacao(null); }
    finally { setCalculando(false); }
  }
  const validar = () => carregando ? 'Aguarde as opções de entrega.' : falhaConfig || (config && (!atual || Date.parse(atual.expiraEm) <= Date.now()) ? 'Selecione e calcule a entrega antes de finalizar.' : null);
  const selecao: SelecaoEntrega | undefined = config && atual ? { tipo: atual.servico.tipo, agendadoPara, cotacaoId: atual.cotacaoId } : undefined;
  const conteudo = carregando ? <p role="status">Carregando opções de entrega…</p> : falhaConfig ? <div role="alert"><p>{falhaConfig}</p><button type="button" onClick={() => { setCarregando(true); setTentativa(v => v+1); }}>Tentar novamente</button></div> : config ? <section className="v-form-bloco">
    <h2 className="v-form-titulo">Tipo de entrega</h2>
    <div className="delivery-choice" role="radiogroup" aria-label="Tipo de entrega">{config.tipos.filter(t => t.ativo).map(t => <label key={t.tipo} className={`delivery-option ${t.tipo === 'EXPRESS' ? 'delivery-option--express' : ''}`}><input type="radio" name="tipoEntrega" checked={tipo === t.tipo} onChange={() => { setTipo(t.tipo); setErro(''); }} /><span><strong>{t.tipo === 'EXPRESS' ? '⚡ ' : ''}{nomeEntrega[t.tipo]}</strong><small>{t.tipo === 'AGENDADA' ? 'Conforme horário agendado' : `Até ${t.prazoMinutos} minutos`} · {config.cobranca === 'tipo' ? dinheiro(t.valor) : 'Taxa conforme distância'}</small></span></label>)}</div>
    {tipo === 'AGENDADA' && <div className="v-campo"><label htmlFor="delivery-schedule">Data e horário da entrega · horário de Fortaleza</label><input className="v-input" id="delivery-schedule" type="datetime-local" value={agendamento} onChange={e => { setAgendamento(e.target.value); setErro(''); }} /></div>}
    <div className="delivery-quote"><button type="button" disabled={calculando || !tipo} onClick={() => void calcular()}>{calculando ? 'Calculando…' : atual ? 'Recalcular entrega' : 'Calcular entrega'}</button>
    {config.cobranca === 'km' && <p>A taxa é calculada pelas vias desde o CEP da loja. Endereços fora da área atendida não podem ser finalizados.</p>}
    {erro && <p className="delivery-error" role="alert">{erro}</p>}
    {atual ? <DeliveryBadge servico={atual.servico} /> : <p>Calcule a entrega após selecionar o serviço ou alterar o endereço.</p>}</div>
  </section> : null;
  return { conteudo, selecao, taxa: atual?.servico.taxa ?? 0, pendente: carregando || !!falhaConfig || (!!config && !atual), servico: atual?.servico, validar };
}
