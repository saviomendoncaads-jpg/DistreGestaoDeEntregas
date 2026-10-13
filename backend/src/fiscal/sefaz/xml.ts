import { SignedXml } from 'xml-crypto';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { validateXML } from 'xmllint-wasm';
import schemas from './schemas.json';

export const NS_NFE = 'http://www.portalfiscal.inf.br/nfe';
export const HOMOLOGACAO_NOME = 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL';
export function escaparXml(v: unknown): string {
  return String(v).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}
export const tag = (nome: string, valor: unknown) => valor === undefined || valor === null ? '' : `<${nome}>${escaparXml(valor)}</${nome}>`;
export const grupo = (nome:string, conteudo:string) => `<${nome}>${conteudo}</${nome}>`;
export const decimal = (v:number, casas=2) => {
  if (!Number.isFinite(v) || v < 0) throw new Error('Valor fiscal negativo ou inválido.');
  return v.toFixed(casas);
};

export function lerXml(xml:string) {
  if (Buffer.byteLength(xml) > 3_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Resposta XML inválida da SEFAZ.');
  return new DOMParser({onError:(level)=>{if(level !== 'warning') throw new Error('XML malformado.');}}).parseFromString(xml,'application/xml');
}
export function elemento(xml: string, nome: string): string | undefined {
  const nodes = lerXml(xml).getElementsByTagNameNS(NS_NFE,nome);
  return nodes.length ? new XMLSerializer().serializeToString(nodes[0]) : undefined;
}
export function valor(xml:string, nome:string):string | undefined {
  return lerXml(xml).getElementsByTagNameNS(NS_NFE,nome)[0]?.textContent || undefined;
}
export function assinarXml(xml:string, elementoId:string, chavePem:string, certPem:string):string {
  const signer = new SignedXml({privateKey:chavePem,publicCert:certPem});
  signer.signatureAlgorithm='http://www.w3.org/2000/09/xmldsig#rsa-sha1';
  signer.canonicalizationAlgorithm='http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
  signer.addReference({xpath:`//*[local-name()='${elementoId}']`,transforms:['http://www.w3.org/2000/09/xmldsig#enveloped-signature','http://www.w3.org/TR/2001/REC-xml-c14n-20010315'],digestAlgorithm:'http://www.w3.org/2000/09/xmldsig#sha1'});
  signer.computeSignature(xml,{location:{reference:`//*[local-name()='${elementoId}']`,action:'after'}});
  return signer.getSignedXml();
}
export async function validarXmlNota(xml:string):Promise<void> {
  await validarXmlSefaz(xml,'nfe_v4.00.xsd');
}
export async function validarXmlSefaz(xml:string,schema:string):Promise<void> {
  lerXml(xml);
  const arquivos = Object.entries(schemas).map(([fileName,contents])=>({fileName,contents}));
  const arquivo=(schemas as Record<string,string>)[schema];if(!arquivo) throw new Error('Esquema fiscal não instalado.');
  const resultado = await validateXML({xml:[{fileName:'nota.xml',contents:xml}],schema:[{fileName:schema,contents:arquivo}],preload:arquivos,initialMemoryPages:512,maxMemoryPages:2048});
  if (!resultado.valid) {
    // Não devolve XML/dados pessoais nos erros da API.
    const campos = resultado.errors.slice(0,4).map(e=>e.message.match(/Element '(?:\{[^}]+\})?([^']+)'/)?.[1] || 'estrutura');
    throw new Error(`XML fiscal incompatível com o leiaute oficial (PL 010f): ${[...new Set(campos)].join(', ')}. Confira os dados e a tributação.`);
  }
}
