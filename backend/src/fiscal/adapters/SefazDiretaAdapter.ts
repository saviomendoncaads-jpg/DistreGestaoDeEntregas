import { ContextoEmissao, EmissaoInput, EmissaoResult, FiscalProviderAdapter } from '../FiscalProviderAdapter';
import { ModeloNota } from '../tipos';
import { autorizador } from '../sefaz/catalogo';
import { CODIGO_UF } from '../chaveAcesso';
import { prepararDocumento, dataFiscal } from '../sefaz/documento';
import { DocumentoSefaz, obterDocumento, salvarDocumento, obterEvento, salvarEvento, reservarFaixaInutilizacao } from '../sefaz/repositorio';
import { certificadoContexto, transmitirSefaz } from '../sefaz/transporte';
import { assinarXml, elemento, grupo as g, lerXml, NS_NFE, tag as t, valor, validarXmlSefaz } from '../sefaz/xml';

const tpAmb=(ctx:ContextoEmissao)=>ctx.ambiente==='PRODUCAO'?'1':'2';
const loja=(ctx:ContextoEmissao)=>{if(!ctx.lojaId) throw new Error('Loja fiscal não identificada.');return ctx.lojaId;};
const root=(nome:string,conteudo:string,versao='4.00')=>`<${nome} xmlns="${NS_NFE}" versao="${versao}">${conteudo}</${nome}>`;
export function interpretarResposta(resposta:string,doc:DocumentoSefaz,ctx:ContextoEmissao):EmissaoResult {
  const prot=elemento(resposta,'protNFe');
  const principal=valor(resposta,'cStat');
  const status=prot?valor(prot,'cStat'):valor(resposta,'cStat');
  const resultado:EmissaoResult={status:'PROCESSANDO',chave:doc.chave,numero:doc.numero,serie:doc.serie,qrcodeUrl:doc.qrcodeUrl,urlConsulta:doc.urlConsulta,mensagem:`SEFAZ ${status || 'sem código'}: ${valor(prot || resposta,'xMotivo') || 'aguardando confirmação'}`};
  if(['101','151','155'].includes(principal||'')) {
    if(valor(resposta,'chNFe')!==doc.chave||valor(resposta,'tpAmb')!==tpAmb(ctx)) throw new Error('Consulta fiscal não corresponde à nota.');
    resultado.status='CANCELADA';
  } else if(prot) {
    if(valor(prot,'chNFe')!==doc.chave||valor(prot,'tpAmb')!==tpAmb(ctx)) throw new Error('Protocolo fiscal não corresponde à chave ou ao ambiente esperado.');
    if(['100','150'].includes(status||'')) {
      const protocolo=valor(prot,'nProt');
      if(!protocolo||!/^\d{15}$/.test(protocolo)) throw new Error('Protocolo de autorização inválido.');
      const digest=lerXml(doc.xml).getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#','DigestValue')[0]?.textContent;
      if(valor(prot,'digVal')!==digest) throw new Error('Protocolo não corresponde ao resumo criptográfico do XML enviado.');
      resultado.status='AUTORIZADA';resultado.protocolo=protocolo;resultado.emitidaEm=valor(prot,'dhRecbto');
      doc.xmlAutorizado=root('nfeProc',doc.xml+prot);doc.fase='AUTORIZADO';
    } else {resultado.status='REJEITADA';doc.fase='REJEITADO';}
  } else if(['101','151','155'].includes(status||'')) {
    if(valor(resposta,'chNFe')!==doc.chave||valor(resposta,'tpAmb')!==tpAmb(ctx)) throw new Error('Consulta fiscal não corresponde à nota.');
    resultado.status='CANCELADA';
  } else if(!['103','104','105','106','108','109','204','217','539'].includes(status||'')&&status) {
    resultado.status='REJEITADA';doc.fase='REJEITADO';
  }
  if(valor(resposta,'nRec')) {doc.recibo=valor(resposta,'nRec');doc.fase='RECEBIDO';}
  return resultado;
}
export class SefazDiretaAdapter implements FiscalProviderAdapter {
  readonly nome='SEFAZ_DIRETA' as const;
  readonly numeracaoLocal=true;
  async emitir(input:EmissaoInput):Promise<EmissaoResult> {
    const existente=await obterDocumento(input.ref,loja(input.ctx));
    if(existente) return this.consultar(input.ref,input.dados.modelo,input.ctx);
    let preparado;
    try {preparado=await prepararDocumento(input);} catch(err) {
      // Falha local comprovadamente anterior a qualquer envio. A numeração permanece consumida.
      return {status:'ERRO',numero:input.numero,serie:input.serie,mensagem:err instanceof Error?err.message:'Dados fiscais inválidos.'};
    }
    const doc:DocumentoSefaz={...preparado,ambiente:input.ctx.ambiente,ref:input.ref,lojaId:loja(input.ctx),fase:'PREPARADO'};
    await salvarDocumento(doc);
    if(input.dados.contingencia) return {status:'CONTINGENCIA',numero:doc.numero,serie:doc.serie,chave:doc.chave,qrcodeUrl:doc.qrcodeUrl,urlConsulta:doc.urlConsulta,emitidaEm:doc.emitidaEm,mensagem:'Emitida em contingência offline — pendente de autorização. Transmita assim que a conexão retornar, dentro do prazo exigido pelo estado.'};
    return this.enviar(doc,input.dados.modelo,input.ctx);
  }
  private async enviar(doc:DocumentoSefaz,modelo:ModeloNota,ctx:ContextoEmissao) {
    doc.fase='ENVIANDO';await salvarDocumento(doc);
    try {
      const resposta=await transmitirSefaz(ctx,modelo,'autorizacao',root('enviNFe',t('idLote',doc.numero)+t('indSinc','1')+doc.xml));
      const r=interpretarResposta(resposta,doc,ctx);if(doc.xmlAutorizado) await validarXmlSefaz(doc.xmlAutorizado,'procNFe_v4.00.xsd');await salvarDocumento(doc);
      if(['204','539'].includes(valor(resposta,'cStat')||'')) return this.consultar(doc.ref,modelo,ctx);
      return r;
    } catch {
      return {status:'PROCESSANDO' as const,chave:doc.chave,numero:doc.numero,serie:doc.serie,qrcodeUrl:doc.qrcodeUrl,urlConsulta:doc.urlConsulta,mensagem:'Envio sem confirmação. Consulte esta nota; não emita outra nota para a mesma venda.'};
    }
  }
  async consultar(ref:string,modelo:ModeloNota,ctx:ContextoEmissao):Promise<EmissaoResult> {
    certificadoContexto(ctx);
    const doc=await obterDocumento(ref,loja(ctx));
    if(!doc) return {status:'PROCESSANDO',mensagem:'Documento ainda não preparado. Use Recuperar envio para retomar a mesma reserva fiscal.'};
    if(doc.ambiente!==ctx.ambiente||doc.chave.slice(6,20)!==ctx.cnpjEmitente||doc.chave.slice(0,2)!==CODIGO_UF[ctx.uf]||doc.chave.slice(20,22)!==(modelo==='NFCE'?'65':'55')) throw new Error('Documento incompatível com emitente/modelo/ambiente da consulta.');
    const resposta=doc.recibo&&doc.fase!=='AUTORIZADO'
      ?await transmitirSefaz(ctx,modelo,'retorno',root('consReciNFe',t('tpAmb',tpAmb(ctx))+t('nRec',doc.recibo)))
      :await transmitirSefaz(ctx,modelo,'consulta',root('consSitNFe',t('tpAmb',tpAmb(ctx))+t('xServ','CONSULTAR')+t('chNFe',doc.chave)));
    const resultado=interpretarResposta(resposta,doc,ctx);if(doc.xmlAutorizado) await validarXmlSefaz(doc.xmlAutorizado,'procNFe_v4.00.xsd');await salvarDocumento(doc);return resultado;
  }
  async reenviar(ref:string,modelo:ModeloNota,ctx:ContextoEmissao):Promise<EmissaoResult> {
    const preparado=await obterDocumento(ref,loja(ctx));
    if(preparado?.fase==='PREPARADO'&&preparado.chave[34]==='9') return this.enviar(preparado,modelo,ctx);
    const r=await this.consultar(ref,modelo,ctx);
    if(r.status!=='PROCESSANDO'||!r.mensagem?.startsWith('SEFAZ 217:')) return r;
    const doc=await obterDocumento(ref,loja(ctx));
    if(!doc) throw new Error('Documento não encontrado.');
    return this.enviar(doc,modelo,ctx); // mesma chave, XML assinado, série e número
  }
  async cancelar(ref:string,modelo:ModeloNota,justificativa:string,ctx:ContextoEmissao):Promise<EmissaoResult> {
    const doc=await obterDocumento(ref,loja(ctx));
    if(!doc?.xmlAutorizado) throw new Error('XML autorizado não encontrado; consulte a nota antes do cancelamento.');
    const evento=await this.registrarEvento(doc,modelo,'110111',1,justificativa,ctx);
    return {status:evento.autorizado?'CANCELADA':'AUTORIZADA',mensagem:evento.mensagem,chave:doc.chave};
  }
  async corrigir(ref:string,correcao:string,sequencia:number,ctx:ContextoEmissao) {
    const doc=await obterDocumento(ref,loja(ctx));
    if(!doc?.xmlAutorizado||doc.chave.slice(20,22)!=='55') throw new Error('Carta de correção exige NF-e autorizada.');
    return this.registrarEvento(doc,'NFE','110110',sequencia,correcao,ctx);
  }
  private async registrarEvento(doc:DocumentoSefaz,modelo:ModeloNota,tipo:string,sequencia:number,texto:string,ctx:ContextoEmissao) {
    if(texto.trim().length<15||texto.trim().length>(tipo==='110110'?1000:255)||!Number.isInteger(sequencia)||sequencia<1||sequencia>20) throw new Error('Texto ou sequência do evento fiscal inválido.');
    const idXml=`ID${tipo}${doc.chave}${String(sequencia).padStart(2,'0')}`;
    const id=(ctx.ambiente==='PRODUCAO'?'P':'H')+idXml;
    let evento=await obterEvento(id,loja(ctx));
    if(evento?.autorizado) return evento;
    if(!evento) {
      const material=certificadoContexto(ctx);
      const det=tipo==='110111'
        ?t('descEvento','Cancelamento')+t('nProt',valor(doc.xmlAutorizado!,'nProt'))+t('xJust',texto.trim())
        :t('descEvento','Carta de Correcao')+t('xCorrecao',texto.trim())+t('xCondUso','A Carta de Correcao e disciplinada pelo paragrafo 1o-A do art. 7o do Convenio S/N, de 15 de dezembro de 1970 e pode ser utilizada para regularizacao de erro ocorrido na emissao de documento fiscal, desde que o erro nao esteja relacionado com: I - as variaveis que determinam o valor do imposto tais como: base de calculo, aliquota, diferenca de preco, quantidade, valor da operacao ou da prestacao; II - a correcao de dados cadastrais que implique mudanca do remetente ou do destinatario; III - a data de emissao ou de saida.');
      const xml=assinarXml(root('evento',`<infEvento Id="${idXml}">${t('cOrgao',CODIGO_UF[ctx.uf])}${t('tpAmb',tpAmb(ctx))}${t('CNPJ',ctx.cnpjEmitente)}${t('chNFe',doc.chave)}${t('dhEvento',dataFiscal(new Date(),ctx.uf))}${t('tpEvento',tipo)}${t('nSeqEvento',sequencia)}${t('verEvento','1.00')}<detEvento versao="1.00">${det}</detEvento></infEvento>`,'1.00'),'infEvento',material.chavePem,material.certPem);
      evento={id,lojaId:loja(ctx),xml,chave:doc.chave,tipo};await salvarEvento(evento);
    }
    const resposta=await transmitirSefaz(ctx,modelo,'evento',root('envEvento',t('idLote',doc.numero)+evento.xml,'1.00'));
    const ret=elemento(resposta,'retEvento');
    if(!ret||valor(ret,'chNFe')!==doc.chave||valor(ret,'tpAmb')!==tpAmb(ctx)||valor(ret,'tpEvento')!==tipo||Number(valor(ret,'nSeqEvento'))!==sequencia) throw new Error('Retorno do evento não corresponde à solicitação. Consulte a nota.');
    const status=valor(ret,'cStat');
    evento.resposta=ret;evento.autorizado=['135','155'].includes(status||'')&&!!valor(ret,'nProt');evento.protocolo=valor(ret,'nProt');evento.mensagem=`SEFAZ ${status}: ${valor(ret,'xMotivo')||'sem descrição'}`;
    await salvarEvento(evento);return evento;
  }
  async inutilizar(p:{modelo:ModeloNota;serie:number;inicio:number;fim:number;ano:number;justificativa:string},ctx:ContextoEmissao) {
    if(!Number.isInteger(p.serie)||p.serie<0||p.serie>999||![p.inicio,p.fim,p.ano].every(Number.isInteger)||p.inicio<1||p.fim<p.inicio||p.fim>999999999||p.ano<2006||p.ano>new Date().getFullYear()||p.justificativa.trim().length<15||p.justificativa.trim().length>255) throw new Error('Dados da inutilização inválidos.');
    const mod=p.modelo==='NFCE'?'65':'55';
    const id=`ID${CODIGO_UF[ctx.uf]}${String(p.ano).slice(-2)}${ctx.cnpjEmitente}${mod}${String(p.serie).padStart(3,'0')}${String(p.inicio).padStart(9,'0')}${String(p.fim).padStart(9,'0')}`;
    const eventId=`${ctx.ambiente==='PRODUCAO'?'P':'H'}${id}`;
    let evento=await obterEvento(eventId,loja(ctx));if(evento?.autorizado) return evento;
    if(!evento) {
      const material=certificadoContexto(ctx);
      await reservarFaixaInutilizacao({...p,cnpj:ctx.cnpjEmitente,ambiente:ctx.ambiente});
      const xml=assinarXml(root('inutNFe',`<infInut Id="${id}">${t('tpAmb',tpAmb(ctx))}${t('xServ','INUTILIZAR')}${t('cUF',CODIGO_UF[ctx.uf])}${t('ano',String(p.ano).slice(-2))}${t('CNPJ',ctx.cnpjEmitente)}${t('mod',mod)}${t('serie',p.serie)}${t('nNFIni',p.inicio)}${t('nNFFin',p.fim)}${t('xJust',p.justificativa.trim())}</infInut>`),'infInut',material.chavePem,material.certPem);
      evento={id:eventId,lojaId:loja(ctx),xml,tipo:'INUTILIZACAO'};await salvarEvento(evento);
    }
    const resposta=await transmitirSefaz(ctx,p.modelo,'inutilizacao',evento.xml);
    const ret=elemento(resposta,'retInutNFe');
    if(!ret||valor(ret,'tpAmb')!==tpAmb(ctx)) throw new Error('Resposta de inutilização incompatível com o ambiente.');
    if(valor(ret,'cStat')==='102'&& (valor(ret,'CNPJ')!==ctx.cnpjEmitente || Number(valor(ret,'serie'))!==p.serie||Number(valor(ret,'nNFIni'))!==p.inicio||Number(valor(ret,'nNFFin'))!==p.fim)) throw new Error('Protocolo de inutilização incompatível com a faixa solicitada.');
    evento.resposta=ret;evento.autorizado=valor(ret,'cStat')==='102'&&!!valor(ret,'nProt');evento.protocolo=valor(ret,'nProt');evento.mensagem=`SEFAZ ${valor(ret,'cStat')}: ${valor(ret,'xMotivo')}`;await salvarEvento(evento);return evento;
  }
  async testarConexao(ctx:ContextoEmissao) {
    const modelos:ModeloNota[]=ctx.modelo?[ctx.modelo]:['NFE','NFCE'];
    const mensagens:string[]=[];let ok=true;
    for(const modelo of modelos) {
      const resposta=await transmitirSefaz(ctx,modelo,'status',root('consStatServ',t('tpAmb',tpAmb(ctx))+t('cUF',CODIGO_UF[ctx.uf])+t('xServ','STATUS')));
      const ret=elemento(resposta,'retConsStatServ');
      const nomeAutorizador=autorizador(ctx.uf,modelo),codigoAutorizador=nomeAutorizador==='SVRS'?'43':nomeAutorizador==='SVAN'?'91':CODIGO_UF[ctx.uf];
      if(!ret||valor(ret,'tpAmb')!==tpAmb(ctx)||![CODIGO_UF[ctx.uf],codigoAutorizador].includes(valor(ret,'cUF')||'')) throw new Error('Resposta de status incompatível com UF/ambiente.');
      const status=valor(ret,'cStat');ok=ok&&status==='107';mensagens.push(`${modelo}: SEFAZ ${status} — ${valor(ret,'xMotivo')}`);
    }
    return {ok,mensagem:mensagens.join('; ')+'. Status do serviço não comprova o credenciamento da empresa.'};
  }
}
