import { useEffect, useState } from 'react';
import type { FiscalApi, NotaCompleta, NotaResumo, ModeloNota, EventoFiscal } from './fiscalApi';
import { imprimirNota } from './danfe';

export default function DocumentosFiscais({api,provedor,ambiente}:{api:FiscalApi;provedor:string;ambiente:string}) {
  const [notas,setNotas]=useState<NotaResumo[]>([]),[nota,setNota]=useState<NotaCompleta|null>(null),[erro,setErro]=useState(''),[msg,setMsg]=useState(''),[ocupado,setOcupado]=useState(false);
  const [acao,setAcao]=useState<'cancelar'|'correcao'|'inutilizar'|null>(null),[texto,setTexto]=useState(''),[sequencia,setSequencia]=useState(1),[evento,setEvento]=useState<string|null>(null);
  const [faixa,setFaixa]=useState({modelo:'NFCE' as ModeloNota,serie:1,ano:new Date().getFullYear(),inicio:1,fim:1});
  const [eventos,setEventos]=useState<EventoFiscal[]>([]);
  const atualizar=async()=>{setNotas(await api.listarNotas(90));if(provedor==='SEFAZ_DIRETA')setEventos(await api.listarEventos());};
  useEffect(()=>{atualizar().catch(e=>setErro(e.message));},[api]);
  const executar=async(fn:()=>Promise<void>)=>{setOcupado(true);setErro('');setMsg('');try{await fn();await atualizar();}catch(e){setErro(e instanceof Error?e.message:'Falha na operação fiscal.');}finally{setOcupado(false);}};
  const abrir=(n:NotaResumo)=>executar(async()=>{setNota(await api.obterNota(n.id));setAcao(null);setEvento(null);});
  const confirmar=()=>executar(async()=>{
    if(acao==='cancelar'&&nota){await api.cancelar(nota.id,texto);setNota(await api.obterNota(nota.id));setMsg('Cancelamento confirmado pela SEFAZ.');}
    if(acao==='correcao'&&nota){const r=await api.corrigir(nota.id,texto,sequencia);setMsg(r.mensagem);if(r.success)setEvento(r.id);}
    if(acao==='inutilizar'){const r=await api.inutilizar({...faixa,justificativa:texto});setMsg(r.mensagem);if(r.success)setEvento(r.id);}
    setAcao(null);setTexto('');
  });
  return <section>
    <h4 className="fiscal-secao">Documentos fiscais · últimos 90 dias</h4>
    <p className="fiscal-dica">Consulte notas pendentes antes de tentar emitir novamente. O XML autorizado e os eventos ficam disponíveis para download.</p>
    <div className="fiscal-acoes"><button className="kanban-btn kanban-btn-ghost" disabled={ocupado} onClick={()=>executar(async()=>{await atualizar();})}>Atualizar lista</button>{provedor==='SEFAZ_DIRETA'&&<button className="kanban-btn kanban-btn-ghost" disabled={ocupado} onClick={()=>{setAcao('inutilizar');setTexto('');setEvento(null);}}>Inutilizar numeração</button>}</div>
    <div className="fiscal-documentos-lista">{notas.length===0?<p className="fiscal-dica">Nenhuma nota no período.</p>:notas.map(n=><button className={`fiscal-documento-item ${nota?.id===n.id?'ativa':''}`} disabled={ocupado} key={n.id} onClick={()=>abrir(n)}><span>{n.modelo==='NFCE'?'NFC-e':'NF-e'} {n.numero?`nº ${n.numero}`:''} · série {n.serie??'—'}</span><span>{n.status} · {n.ambiente==='PRODUCAO'?'Produção':'Homologação'} · R$ {n.valorTotal.toFixed(2)}</span></button>)}</div>
    {nota&&<div className="fiscal-documento-detalhe">
      <p><b>{nota.modelo==='NFCE'?'NFC-e':'NF-e'} nº {nota.numero} · {nota.status}</b></p><p className="fiscal-dica">{nota.chave||'Chave ainda não disponível.'}</p><p className="fiscal-dica">{nota.mensagem}</p>
      <div className="fiscal-acoes">
        <button className="kanban-btn kanban-btn-ghost" disabled={ocupado} onClick={()=>executar(async()=>setNota(await api.atualizar(nota.id)))}>Consultar situação</button>
        {['AUTORIZADA','CONTINGENCIA'].includes(nota.status)&&<button className="kanban-btn kanban-btn-ghost" disabled={ocupado} onClick={()=>nota.provedor==='SEFAZ_DIRETA'&&nota.modelo==='NFE'?executar(()=>api.baixarDanfe(nota.id)):imprimirNota(nota)}>{nota.provedor==='SEFAZ_DIRETA'&&nota.modelo==='NFE'?'Baixar DANFE (PDF)':'Imprimir / salvar PDF'}</button>}
        {nota.provedor==='SEFAZ_DIRETA'&&<>
          {['AUTORIZADA','CANCELADA'].includes(nota.status)&&<button className="kanban-btn kanban-btn-ghost" disabled={ocupado} onClick={()=>executar(()=>api.baixarXml(nota.id))}>Baixar XML</button>}
          {['PROCESSANDO','CONTINGENCIA'].includes(nota.status)&&<button className="kanban-btn kanban-btn-ghost" disabled={ocupado} onClick={()=>executar(async()=>setNota(await api.recuperar(nota.id)))}>{nota.status==='CONTINGENCIA'?'Transmitir contingência':'Recuperar envio'}</button>}
          {nota.status==='AUTORIZADA'&&<button className="kanban-btn kanban-btn-ghost" disabled={ocupado} onClick={()=>{setAcao('cancelar');setTexto('');}}>Cancelar nota</button>}
          {nota.status==='AUTORIZADA'&&nota.modelo==='NFE'&&<button className="kanban-btn kanban-btn-ghost" disabled={ocupado} onClick={()=>{setAcao('correcao');setTexto('');setEvento(null);}}>Carta de correção</button>}
        </>}
      </div>
    </div>}
    {acao&&<div className="fiscal-documento-detalhe">
      <h4 className="fiscal-secao">{acao==='cancelar'?'Cancelar nota':acao==='correcao'?'Carta de correção':'Inutilizar numeração'} · {acao==='inutilizar'?ambiente:nota?.ambiente}</h4>
      {acao==='correcao'&&<><p className="fiscal-dica">A carta não pode alterar valores, impostos, destinatário, emitente ou data. Uma nova carta deve consolidar as correções anteriores.</p><label className="fiscal-campo"><span>Sequência da carta (1 a 20)</span><input className="form-input" type="number" min={1} max={20} value={sequencia} onChange={e=>setSequencia(Number(e.target.value))}/></label></>}
      {acao==='inutilizar'&&<div className="fiscal-form"><label className="fiscal-campo"><span>Modelo</span><select className="form-select" value={faixa.modelo} onChange={e=>setFaixa(p=>({...p,modelo:e.target.value as ModeloNota}))}><option value="NFCE">NFC-e</option><option value="NFE">NF-e</option></select></label>{(['serie','ano','inicio','fim'] as const).map((k,i)=><label className="fiscal-campo" key={k}><span>{['Série','Ano','Número inicial','Número final'][i]}</span><input className="form-input" type="number" value={faixa[k]} onChange={e=>setFaixa(p=>({...p,[k]:Number(e.target.value)}))}/></label>)}</div>}
      <label className="fiscal-campo"><span>{acao==='correcao'?'Correção':'Justificativa'} (mínimo 15 caracteres)</span><textarea className="form-input" rows={4} value={texto} maxLength={acao==='correcao'?1000:255} onChange={e=>setTexto(e.target.value)}/></label>
      <div className="fiscal-acoes"><button className="kanban-btn kanban-btn-emerald" disabled={ocupado||texto.trim().length<15} onClick={confirmar}>{ocupado?'Transmitindo…':'Confirmar e transmitir à SEFAZ'}</button><button className="kanban-btn kanban-btn-ghost" disabled={ocupado} onClick={()=>setAcao(null)}>Voltar</button></div>
    </div>}
    {erro&&<div className="fiscal-erro" role="alert">{erro}</div>}{msg&&<div className="fiscal-ok" role="status">{msg}</div>}
    {evento&&<button className="kanban-btn kanban-btn-ghost" disabled={ocupado} onClick={()=>executar(()=>api.baixarXml(evento,true))}>Baixar XML do evento</button>}
    {eventos.length>0&&<><h4 className="fiscal-secao">Histórico de eventos fiscais</h4><div className="fiscal-documentos-lista">{eventos.map(e=><article className="fiscal-documento-detalhe" key={e.id}><b>{e.tipo==='110111'?'Cancelamento':e.tipo==='110110'?'Carta de correção':'Inutilização'} · {e.autorizado?'Registrado':'Pendente / rejeitado'}</b><p className="fiscal-dica">{e.mensagem||'Aguardando confirmação da SEFAZ.'}</p>{e.autorizado&&<button className="kanban-btn kanban-btn-ghost" disabled={ocupado} onClick={()=>executar(()=>api.baixarXml(e.id,true))}>Baixar XML</button>}</article>)}</div></>}
  </section>;
}
