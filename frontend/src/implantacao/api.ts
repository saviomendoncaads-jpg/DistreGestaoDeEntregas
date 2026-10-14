import {getPanelSession,getPanelRole,clearPanelSession} from '../auth/sessions';
export type ImplementationState = { lojaId:string; nomeLoja:string; recebePedidos:boolean; completed:number; percent:number; currentTitle:string; needsWelcome:boolean; startedAt:string|null; completedAt:string|null; stats:{produtos:number;comEstoque:number;comImagem:number;operacoes:number};history:{passo:number;modalidade:string;autor:string;concluidoEm:string}[] };
export type ImplementationSession = {tipo:'loja'|'admin';token:string;lojaId?:string;nomeLoja?:string};
export function getSession():ImplementationSession|null {return getPanelSession();}
const base=import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:5000';
export async function implementationRequest<T>(token:string,path='',method='GET',lojaId?:string):Promise<T>{
 const response=await fetch(`${base}/api/implantacao${path}${lojaId?`?lojaId=${encodeURIComponent(lojaId)}`:''}`,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(method==='POST'?{body:JSON.stringify({confirmacao:true})}:{})});
 const data=await response.json();if(response.status===401){const role=getPanelRole();clearPanelSession(role,token);location.replace(role==='admin'?'/app?perfil=admin':'/app?perfil=loja&next=area-cliente');}
 if(!response.ok)throw Object.assign(new Error(data.error||'Não foi possível carregar a implantação.'),{codigo:data.codigo});return data;
}
