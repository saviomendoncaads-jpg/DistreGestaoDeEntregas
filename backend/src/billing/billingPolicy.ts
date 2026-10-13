/** Datas civis da cobrança no fuso da operação, sem depender do fuso do servidor. */
export function diaCobranca(value:Date|string=new Date()):string {
 if(typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)){const d=new Date(value+'T12:00:00Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)throw new Error('Data de cobrança inválida');return value;}
 const d=new Date(value);if(!Number.isFinite(d.getTime()))throw new Error('Data de cobrança inválida');
 return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
}
export function diasAtraso(vencimento:string,hoje=diaCobranca()):number{return Math.round((Date.parse(diaCobranca(hoje)+'T12:00:00Z')-Date.parse(diaCobranca(vencimento)+'T12:00:00Z'))/86400000);}
export function carenciaValida(value:unknown):number{const n=Number(value);if(!Number.isInteger(n)||n<0||n>90)throw new Error('Carência deve ser de 0 a 90 dias');return n;}
export function bloqueiaFatura(status:string,vencimento:string,carencia:number,hoje=diaCobranca()){return ['PENDENTE','ATRASADA','VENCIDA'].includes(status)&&diasAtraso(vencimento,hoje)>carencia;}
export function proximoMes(vencimento:string,dia:number):string {if(!Number.isInteger(dia)||dia<1||dia>28)throw new Error('Dia de vencimento inválido');const [y,m]=diaCobranca(vencimento).split('-').map(Number);return `${m===12?y+1:y}-${String(m===12?1:m+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;}
