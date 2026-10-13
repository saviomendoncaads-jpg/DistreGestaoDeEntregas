import {getPanelSession,getPanelRole,sessionKey} from '../auth/sessions';
import { useCallback, useEffect, useState } from 'react';
import ClientSections,{sectionLabels,type ClientSection} from './ClientSections';
import Sidebar from './Sidebar';
import Timeline from './Timeline';
import Icon from './Icon';
import { getSession,implementationRequest,type ImplementationState } from './api';
import './implementation.css';
export default function ImplementationPanel(){
 useEffect(()=>{document.title='Distre - Área do Cliente';},[]);
 const [session]=useState(getSession);const [state,setState]=useState<ImplementationState|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 useEffect(()=>{if(!session)return;const sync=(event:StorageEvent)=>{if(event.key===sessionKey(session.tipo)&&getPanelSession(session.tipo)?.token!==session.token)location.reload();};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[session]);
 const lojaId=session?.tipo==='admin'?new URLSearchParams(location.search).get('lojaId')||undefined:undefined;
 const requested=new URLSearchParams(location.search).get('secao');
 const section:ClientSection=location.pathname.startsWith('/implantacao')?'implantacao':requested&&Object.hasOwn(sectionLabels,requested)?requested as ClientSection:'inicio';
 const load=useCallback(async()=>{if(!session)return;try{setError('');setState(await implementationRequest(session.token,session.tipo==='loja'&&section==='implantacao'?'/inicio':'',session.tipo==='loja'&&section==='implantacao'?'POST':'GET',lojaId));}catch(e){setError(e instanceof Error?e.message:'Falha ao carregar.');}},[session,lojaId,section]);
 useEffect(()=>{if(!session){location.replace(getPanelRole()==='admin'?'/app?perfil=admin&adminArea=implantacao':'/app?perfil=loja&next=area-cliente');return;}if(session.tipo==='admin'&&!lojaId){location.replace('/app?perfil=admin&adminArea=implantacao');return;}void load();},[session,lojaId,load]);
 async function complete(step:number){if(!session||busy)return;setBusy(true);setError('');try{setState(await implementationRequest(session.token,`/etapas/${step}`,'POST',lojaId));}catch(e){setError(e instanceof Error?e.message:'Não foi possível concluir.');}finally{setBusy(false);}}
 return <div className="imp-shell"><Sidebar name={state?.nomeLoja} section={section} lojaId={lojaId}/><div className="imp-page">
  <header className="imp-topbar"><span>Área do Cliente / <strong>{sectionLabels[section]}</strong></span><span className="imp-preview-badge">{session?.tipo==='admin'?'ACOMPANHAMENTO':'PROGRESSO DA LOJA'}</span></header>
  <div className="imp-layout"><main id="jornada" className="min-w-0">{section==='implantacao'&&<div className="imp-intro"><span className="imp-eyebrow">SEU ERP COMEÇA AQUI</span><h1>{state?.nomeLoja?`Vamos preparar ${state.nomeLoja}.`:'Vamos preparar sua operação.'}</h1><p>Aprenda, coloque em prática e avance. Seu progresso fica salvo nesta loja.</p></div>}
  {error&&<div className="imp-error" role="alert">{error} <button className="imp-text-button" disabled={busy} onClick={()=>void load()}>Atualizar dados</button></div>}
  {!state&&!error&&<p role="status">Carregando a implantação da loja…</p>}
  {state&&section!=='implantacao'&&<ClientSections section={section} state={state} lojaId={lojaId}/>}
  {state&&section==='implantacao'&&<><section className="imp-progress-card"><div><strong>Minha implantação</strong><span>{state.completed} de 7 etapas concluídas <b>{state.percent}%</b></span></div><div className="imp-progress-track" role="progressbar" aria-label="Implantação concluída" aria-valuenow={state.percent} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${state.percent}%`}}/></div><p>{state.currentTitle}</p></section>
   <p className="imp-demo-note">Cada etapa tem uma aula em vídeo e um manual em PDF. As etapas de treinamento são confirmadas pela loja; as tarefas práticas são verificadas com dados reais.</p>
   <Timeline state={state} busy={busy} readOnly={session?.tipo==='admin'} onComplete={step=>void complete(step)}/>
   {state.completed===7&&<div className="imp-finished" role="status"><Icon name="check"/><div><strong>Implantação concluída!</strong><p>Conclusão registrada em {new Date(state.completedAt!).toLocaleString('pt-BR',{timeZone:'America/Fortaleza'})}.</p></div><a className="imp-button primary" href="/app">Acessar Operação</a></div>}
   <div className="imp-bottom"><button className="imp-text-button" disabled={busy} onClick={()=>void load()}>Atualizar progresso</button><a className="imp-text-button" href={session?.tipo==='admin'?'/app?perfil=admin':'/app?perfil=loja'}>{session?.tipo==='admin'?'Voltar ao Admin Master':'Acessar meu painel'}</a></div>
   <span className="sr-only" role="status" aria-live="polite">{state.currentTitle}</span></>}
  </main><aside className="imp-support" id="ajuda">{section==='cobrancas'?<section><Icon name="help" size={26}/><h2>Regularize sua assinatura.</h2><p>A conta permanece acessível durante a suspensão da operação.</p><h3>Confirmação de pagamento</h3><p>A operação será liberada quando o pagamento for confirmado e não houver outras pendências impeditivas. Use Atualizar situação do pagamento para conferir.</p><p>Em contratos de rede, a regularização da fatura libera as filiais abrangidas pelo contrato.</p></section>:<section><Icon name="help" size={26}/><h2>Um passo de cada vez.</h2><p>O progresso é individual por loja. Etapas práticas só avançam após a conferência do servidor.</p><h3 id="materiais">Aulas e manuais</h3><p>Cada etapa traz uma aula em vídeo e um manual em PDF para baixar. Confirmar uma etapa de treinamento é uma declaração da loja: o Distre não registra se o vídeo foi assistido.</p><a className="imp-text-button" href={`/area-cliente?secao=materiais${lojaId?`&lojaId=${encodeURIComponent(lojaId)}`:''}`}>Ver todos os materiais</a></section>}</aside></div>
  <footer className="imp-footer">DISTRE <span>Preparando sua próxima etapa.</span></footer>
 </div></div>;
}
