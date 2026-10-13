import { useEffect,useState } from 'react';
import { implementationRequest,type ImplementationState } from '../../implantacao/api';
export default function StoreImplementationBadge({token,lojaId}:{token:string;lojaId:string}){
 const [state,setState]=useState<ImplementationState|null>(null);const [error,setError]=useState(false);
 useEffect(()=>{let live=true;implementationRequest<ImplementationState>(token,'','GET',lojaId).then(s=>{if(live)setState(s);}).catch(()=>{if(live)setError(true);});return()=>{live=false;};},[token,lojaId]);
 return <a className="master-store-link" href={`/implantacao?lojaId=${encodeURIComponent(lojaId)}`}>{error?'Consultar implantação':state?`Implantação: ${state.percent}% · ${state.currentTitle}`:'Carregando implantação…'}</a>;
}
