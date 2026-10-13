export type SessionRole = 'admin' | 'loja';
export type PanelSession = {
  tipo:SessionRole;token:string;lojaId?:string;nomeLoja?:string;nomeEmpresa?:string;
  operacaoBloqueada?:boolean;criadoEm?:string;recebePedidos?:boolean;latitude?:number;longitude?:number;
};
export const sessionKey=(role:SessionRole)=>`distre_sessao_${role}`;
function read(key:string):PanelSession|null {
  try {const value=JSON.parse(localStorage.getItem(key)||'null');return value&&['admin','loja'].includes(value.tipo)&&typeof value.token==='string'&&value.token?value:null;}catch{return null;}
}
function migrate(){
  if(localStorage.getItem('distre_sessoes_migradas')==='1')return;
  const legacy=read('distre_sessao');
  if(legacy&&!localStorage.getItem(sessionKey(legacy.tipo))){localStorage.setItem(sessionKey(legacy.tipo),JSON.stringify(legacy));localStorage.setItem('distre_ultimo_perfil',legacy.tipo);}
  localStorage.setItem('distre_sessoes_migradas','1');
  localStorage.removeItem('distre_sessao');localStorage.removeItem('distre_token');
}
export function getPanelRole():SessionRole {
  migrate();
  const query=new URLSearchParams(location.search),explicit=query.get('perfil');
  if(explicit==='admin'||explicit==='loja')return explicit;
  if(query.has('adminArea')||query.has('lojaId'))return 'admin';
  if(location.pathname.startsWith('/area-cliente')||query.has('area')||query.has('next'))return 'loja';
  if(localStorage.getItem('distre_ultimo_perfil')==='admin'&&read(sessionKey('admin')))return 'admin';
  return 'loja';
}
/** Cada aba fixa seu perfil na URL; entrar em outro painel não altera o perfil dela. */
export function pinPanelRole():SessionRole {
  const role=getPanelRole(),url=new URL(location.href);url.searchParams.set('perfil',role);history.replaceState(null,'',url);return role;
}
export function getPanelSession(role:SessionRole=getPanelRole()):PanelSession|null {
  migrate();const session=read(sessionKey(role));return session?.tipo===role?session:null;
}
export function savePanelSession(session:PanelSession){
  migrate();localStorage.setItem(sessionKey(session.tipo),JSON.stringify(session));localStorage.setItem('distre_ultimo_perfil',session.tipo);
}
export function clearPanelSession(role:SessionRole,expectedToken?:string){
  const saved=getPanelSession(role);if(expectedToken&&saved?.token!==expectedToken)return;
  localStorage.removeItem(sessionKey(role));
}
