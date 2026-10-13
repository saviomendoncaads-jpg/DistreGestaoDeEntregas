import { useEffect,useState } from 'react';
import { implementationRequest,type ImplementationState } from './api';
export default function ImplementationCard({token,onLoaded}:{token:string;onLoaded:(state:ImplementationState)=>void}){
 const [state,setState]=useState<ImplementationState|null>(null);const [error,setError]=useState('');
 useEffect(()=>{let live=true;implementationRequest<ImplementationState>(token).then(s=>{if(live){setState(s);onLoaded(s);}}).catch(()=>{if(live)setError('Não foi possível carregar sua implantação.');});return()=>{live=false;};},[token,onLoaded]);
 if(state?.completed===7)return null;
 return <section style={{margin:'16px 0',padding:18,border:'1px solid #bfd1ef',borderRadius:12,background:'#f4f8ff',color:'#243a60'}} aria-label="Continue sua implantação">
  <strong>Continue sua implantação</strong><p>{error||(!state?'Carregando progresso…':`${state.completed} de 7 etapas · ${state.percent}% concluído`)}</p>{state&&<p>Próxima etapa: {state.currentTitle}</p>}
  <a className="btn btn-primary" href="/area-cliente?secao=implantacao">Continuar implantação</a>
 </section>;
}
