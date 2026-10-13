import https from 'https';
import { ContextoEmissao } from '../FiscalProviderAdapter';
import { materialCertificadoA1 } from '../certificado';
import { ModeloNota } from '../tipos';
import { endpointSefaz, ServicoSefaz } from './catalogo';
import { escaparXml, lerXml, validarXmlSefaz } from './xml';

const OPERACAO: Record<ServicoSefaz, [string,string]> = {
  autorizacao:['NFeAutorizacao4','nfeAutorizacaoLote'], retorno:['NFeRetAutorizacao4','nfeRetAutorizacaoLote'],
  consulta:['NFeConsultaProtocolo4','nfeConsultaNF'],status:['NFeStatusServico4','nfeStatusServicoNF'],
  evento:['NFeRecepcaoEvento4','nfeRecepcaoEvento'],inutilizacao:['NFeInutilizacao4','nfeInutilizacaoNF'],
};
export function certificadoContexto(ctx:ContextoEmissao) {
  const cred = ctx.credenciais;
  if (!cred?.certificadoPfx) throw new Error('Envie o certificado A1 e sua senha em Dados fiscais.');
  const material = materialCertificadoA1(cred.certificadoPfx,cred.certificadoSenha || '');
  if (Date.parse(material.validoDe) > Date.now() || Date.parse(material.validoAte) <= Date.now()) throw new Error('Certificado fora do período de validade.');
  if (!material.cnpj || material.cnpj.slice(0,8) !== ctx.cnpjEmitente.slice(0,8)) throw new Error('O certificado A1 precisa identificar a mesma raiz CNPJ do emitente.');
  return material;
}
export function envelopeSefaz(servico:ServicoSefaz,xml:string) {
  const [ws,operacao] = OPERACAO[servico];
  const namespace = `http://www.portalfiscal.inf.br/nfe/wsdl/${ws}`;
  return {action:`${namespace}/${operacao}`, body:`<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="${escaparXml(namespace)}">${xml}</nfeDadosMsg></soap12:Body></soap12:Envelope>`};
}
// Sem redirecionamento, sem desativar TLS, sem repetir automaticamente requisições de escrita.
export async function transmitirSefaz(ctx:ContextoEmissao,modelo:ModeloNota,servico:ServicoSefaz,xml:string):Promise<string> {
  const material = certificadoContexto(ctx);
  const endpoint = endpointSefaz(ctx.uf,modelo,ctx.ambiente,servico);
  const schema:Record<ServicoSefaz,string>={autorizacao:'enviNFe_v4.00.xsd',retorno:'consReciNFe_v4.00.xsd',consulta:'consSitNFe_v4.00.xsd',status:'consStatServ_v4.00.xsd',evento:'envEvento_v1.00.xsd',inutilizacao:'inutNFe_v4.00.xsd'};
  await validarXmlSefaz(xml,schema[servico]);
  const {action,body} = envelopeSefaz(servico,xml);
  return new Promise((resolve,reject)=>{
    const req = https.request(endpoint,{method:'POST',key:material.chavePem,cert:material.cadeiaPem,rejectUnauthorized:true,minVersion:'TLSv1.2',headers:{'Content-Type':`application/soap+xml; charset=utf-8; action="${action}"`,'Content-Length':Buffer.byteLength(body)}},res=>{
      const partes:Buffer[]=[];let tamanho=0;
      res.on('data',(b:Buffer)=>{tamanho+=b.length;if(tamanho>3_000_000) req.destroy(new Error('Resposta fiscal acima do limite.'));else partes.push(b);});
      res.on('end',()=>{
        if(res.statusCode!==200) return reject(new Error(`SEFAZ retornou HTTP ${res.statusCode}; consulte a nota antes de tentar novamente.`));
        try{const resposta=Buffer.concat(partes).toString('utf8');lerXml(resposta);resolve(resposta);}catch{reject(new Error('Resposta fiscal inválida; consulte a nota antes de tentar novamente.'));}
      });
      res.on('error',()=>reject(new Error('Conexão interrompida com a SEFAZ; consulte a nota.')));
    });
    const timer=setTimeout(()=>req.destroy(new Error('Tempo de resposta da SEFAZ esgotado; consulte a nota.')),30_000);
    req.once('close',()=>clearTimeout(timer));
    req.on('error',()=>reject(new Error('Não foi possível confirmar a resposta da SEFAZ. Consulte a nota; o envio pode ter sido recebido.')));
    req.end(body);
  });
}
