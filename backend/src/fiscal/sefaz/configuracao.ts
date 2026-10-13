import { OpcoesSefaz } from '../tipos';
import { CODIGO_UF } from '../chaveAcesso';

export function normalizarOpcoesSefaz(body:unknown,uf:string):OpcoesSefaz|undefined {
  if(body===undefined||body===null) return undefined;
  if(typeof body!=='object'||Array.isArray(body)) throw new Error('Configuração SEFAZ inválida.');
  const b=body as Record<string,unknown>;
  const texto=(k:string,max=600)=>typeof b[k]==='string'?String(b[k]).trim().slice(0,max):'';
  const aliquota=(k:string)=>{const n=Number(b[k]??0);if(!Number.isFinite(n)||n<0||n>100) throw new Error(`Alíquota inválida: ${k}.`);return n;};
  const codigoMunicipio=texto('codigoMunicipio',7);
  if(codigoMunicipio&&(!/^\d{7}$/.test(codigoMunicipio)||codigoMunicipio.slice(0,2)!==CODIGO_UF[uf])) throw new Error('Código IBGE não corresponde ao estado do emitente.');
  const url=(k:string)=>{const v=texto(k);if(!v)return undefined;let u:URL;try{u=new URL(v);}catch{throw new Error('URL de QR Code/consulta inválida.');}if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.hash||u.searchParams.has('p')||v.includes('|')||v.includes(']]>')) throw new Error('Informe a URL pública de consulta sem chave ou parâmetros do QR Code.');return v;};
  const pisCst=texto('pisCst',2),cofinsCst=texto('cofinsCst',2);
  if(!/^\d{2}$/.test(pisCst)||!/^\d{2}$/.test(cofinsCst)) throw new Error('Informe os CST de PIS e COFINS com dois dígitos.');
  const rtcCst=texto('rtcCst',3)||undefined,rtcClassificacao=texto('rtcClassificacao',6)||undefined;
  if(rtcCst && !/^\d{3}$/.test(rtcCst)||rtcClassificacao&&!/^\d{6}$/.test(rtcClassificacao)) throw new Error('CST IBS/CBS ou classificação tributária inválida.');
  if(b.versaoQrCode!==2&&b.versaoQrCode!==3) throw new Error('Versão do QR Code deve ser 2 ou 3.');
  return {codigoMunicipio,qrCodeHomologacao:url('qrCodeHomologacao'),qrCodeProducao:url('qrCodeProducao'),consultaHomologacao:url('consultaHomologacao'),consultaProducao:url('consultaProducao'),versaoQrCode:b.versaoQrCode,pisCst,cofinsCst,aliquotaIcms:aliquota('aliquotaIcms'),reducaoBaseIcms:aliquota('reducaoBaseIcms'),aliquotaPis:aliquota('aliquotaPis'),aliquotaCofins:aliquota('aliquotaCofins'),aliquotaCreditoSn:aliquota('aliquotaCreditoSn'),rtcCst,rtcClassificacao,aliquotaIbsUf:aliquota('aliquotaIbsUf'),aliquotaIbsMunicipio:aliquota('aliquotaIbsMunicipio'),aliquotaCbs:aliquota('aliquotaCbs')};
}
