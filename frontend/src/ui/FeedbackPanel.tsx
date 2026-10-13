import { useEffect, useState, useSyncExternalStore } from 'react';
import { assinarFeedback, lerFeedback, limparAviso, responderAcao } from './feedback';
import './feedback.css';

export default function FeedbackPanel() {
  const {aviso,acao}=useSyncExternalStore(assinarFeedback,lerFeedback,lerFeedback);
  const [valor,setValor]=useState('');
  useEffect(()=>setValor(''),[acao?.id]);
  if(!aviso&&!acao) return null;
  return <div className="distre-feedback">
    {aviso&&<section className={`distre-feedback-aviso ${aviso.tipo}`} role={aviso.tipo==='erro'?'alert':'status'}><p>{aviso.mensagem}</p><button type="button" onClick={limparAviso} aria-label="Dispensar aviso">✕</button></section>}
    {acao&&<section className="distre-feedback-acao" aria-label="Confirmação da ação"><div><strong>Confira antes de continuar</strong><p>{acao.mensagem}</p>{acao.campo&&<label>{acao.campo}<input value={valor} maxLength={255} onChange={e=>setValor(e.target.value)}/></label>}</div><div className="distre-feedback-botoes"><button type="button" onClick={()=>responderAcao(acao.id,false)}>Voltar</button><button type="button" className="confirmar" onClick={()=>responderAcao(acao.id,true,valor)}>{acao.textoConfirmar}</button></div></section>}
  </div>;
}
