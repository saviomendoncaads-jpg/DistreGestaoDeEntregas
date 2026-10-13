export interface PedidoAcao {
  id:number;
  mensagem:string;
  campo?:string;
  textoConfirmar:string;
}
interface EstadoFeedback { aviso:{mensagem:string;tipo:'erro'|'info'}|null; acao:PedidoAcao|null }
let estado:EstadoFeedback={aviso:null,acao:null};
let sequencia=0;
const ouvintes=new Set<()=>void>();
const fila:Array<{pedido:PedidoAcao;resolver:(valor:string|null)=>void}>=[];
const publicar=(proximo:EstadoFeedback)=>{estado=proximo;ouvintes.forEach(fn=>fn());};
export const lerFeedback=()=>estado;
export const assinarFeedback=(fn:()=>void)=>{ouvintes.add(fn);return ()=>{ouvintes.delete(fn);};};
export const limparAviso=()=>publicar({...estado,aviso:null});
export function limparFeedback() {
  const pendentes=fila.splice(0);publicar({aviso:null,acao:null});pendentes.forEach(p=>p.resolver(null));
}
export function avisarErro(mensagem:unknown) {publicar({...estado,aviso:{tipo:'erro',mensagem:String(mensagem||'Não foi possível concluir a ação. Tente novamente.')}});}
export function avisarInfo(mensagem:unknown) {publicar({...estado,aviso:{tipo:'info',mensagem:String(mensagem||'')}});}
function solicitar(mensagem:string,campo?:string,textoConfirmar='Confirmar'):Promise<string|null> {
  // Clique repetido não pode criar duas confirmações da mesma ação destrutiva.
  if(fila.some(p=>p.pedido.mensagem===mensagem)) return Promise.resolve(null);
  return new Promise(resolver=>{
    const pedido={id:++sequencia,mensagem,campo,textoConfirmar};fila.push({pedido,resolver});
    if(!estado.acao) publicar({...estado,acao:pedido});
  });
}
export async function confirmarAcao(mensagem:string):Promise<boolean> {return await solicitar(mensagem)!==null;}
export function solicitarCancelamento(mensagem:string) {return solicitar(mensagem,'Motivo do cancelamento (opcional)','Cancelar pedido');}
export function responderAcao(id:number,confirmado:boolean,valor='') {
  if(fila[0]?.pedido.id!==id) return;
  const atual=fila.shift()!;publicar({...estado,acao:fila[0]?.pedido||null});atual.resolver(confirmado?valor:null);
}
