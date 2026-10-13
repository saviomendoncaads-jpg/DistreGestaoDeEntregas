import crypto from 'crypto';
import { ContextoEmissao, EmissaoInput } from '../FiscalProviderAdapter';
import { gerarChaveAcesso, CODIGO_UF } from '../chaveAcesso';
import { ItemNota, OpcoesSefaz } from '../tipos';
import { certificadoContexto } from './transporte';
import { assinarXml, decimal as d, escaparXml, grupo as g, HOMOLOGACAO_NOME, lerXml, NS_NFE, tag as t, validarXmlNota } from './xml';

const arred = (n:number)=>Math.round((n+Number.EPSILON)*100)/100;
export function dataFiscal(agora:Date,uf:string) {
  const offsets:Record<string,number>={AC:-5,AM:-4,RO:-4,RR:-4,MT:-4,MS:-4};
  const offset=offsets[uf]||-3;
  return new Date(agora.getTime()+offset*3_600_000).toISOString().slice(0,19)+`-${String(-offset).padStart(2,'0')}:00`;
}
function contribuicao(nome:'PIS'|'COFINS',cst:string,base:number,aliquota:number) {
  if(['01','02'].includes(cst)) {
    return {xml:g(nome,g(nome+'Aliq',t('CST',cst)+t('vBC',d(base))+t('p'+nome,d(aliquota,4))+t('v'+nome,d(arred(base*aliquota/100))))),valor:arred(base*aliquota/100)};
  }
  if(['04','05','06','07','08','09'].includes(cst)) return {xml:g(nome,g(nome+'NT',t('CST',cst))),valor:0};
  if(['49','50','51','52','53','54','55','56','60','61','62','63','64','65','66','67','70','71','72','73','74','75','98','99'].includes(cst)) return {xml:g(nome,g(nome+'Outr',t('CST',cst)+t('vBC',d(base))+t('p'+nome,d(aliquota,4))+t('v'+nome,d(arred(base*aliquota/100))))),valor:arred(base*aliquota/100)};
  throw new Error(`CST de ${nome} não suportado para esta operação; configure tributação percentual ou não tributada.`);
}
function tributar(item:ItemNota,op:OpcoesSefaz,crt:number) {
  const o={...op,...item.tributacaoSefaz};
  const base=arred(item.valorBruto-item.valorDesconto+item.valorOutros);
  let icms='',vBC=0,vICMS=0;
  const cst=item.icmsSituacao;
  if(crt===1 && ['102','103','300','400'].includes(cst)) icms=g('ICMSSN102',t('orig',item.origem)+t('CSOSN',cst));
  else if(crt===1 && cst==='101') icms=g('ICMSSN101',t('orig',item.origem)+t('CSOSN',cst)+t('pCredSN',d(o.aliquotaCreditoSn,4))+t('vCredICMSSN',d(arred(base*o.aliquotaCreditoSn/100))));
  else if(crt===1 && cst==='500') icms=g('ICMSSN500',t('orig',item.origem)+t('CSOSN',cst));
  else if(crt!==1 && ['00','20'].includes(cst)) {
    vBC=arred(base*(1-(cst==='20'?o.reducaoBaseIcms:0)/100));vICMS=arred(vBC*o.aliquotaIcms/100);
    icms=g('ICMS'+cst,t('orig',item.origem)+t('CST',cst)+t('modBC','3')+(cst==='20'?t('pRedBC',d(o.reducaoBaseIcms,4)):'')+t('vBC',d(vBC))+t('pICMS',d(o.aliquotaIcms,4))+t('vICMS',d(vICMS)));
  } else if(crt!==1 && ['40','41','50'].includes(cst)) icms=g('ICMS40',t('orig',item.origem)+t('CST',cst));
  else if(crt!==1 && cst==='60') icms=g('ICMS60',t('orig',item.origem)+t('CST',cst));
  else throw new Error(`Item ${item.numero}: CSOSN/CST ${cst} requer grupos tributários adicionais. Não será emitida uma nota com tributação presumida.`);
  const pis=contribuicao('PIS',o.pisCst,base,o.aliquotaPis);
  const cofins=contribuicao('COFINS',o.cofinsCst,base,o.aliquotaCofins);
  let rtc='';let rtcBase=0,ibsUf=0,ibsMun=0,cbs=0;
  if(o.rtcCst) {
    if(!o.rtcClassificacao || !/^\d{6}$/.test(o.rtcClassificacao)) throw new Error('Informe a classificação tributária IBS/CBS com seis dígitos.');
    if(!['000','410'].includes(o.rtcCst)) throw new Error('O CST IBS/CBS informado requer grupos específicos de redução, diferimento ou monofasia ainda não disponíveis nesta operação.');
    let valores='';
    if(o.rtcCst==='000') {
      rtcBase=arred(base-vICMS-pis.valor-cofins.valor);
      ibsUf=arred(rtcBase*(o.aliquotaIbsUf||0)/100);ibsMun=arred(rtcBase*(o.aliquotaIbsMunicipio||0)/100);cbs=arred(rtcBase*(o.aliquotaCbs||0)/100);
      valores=g('gIBSCBS',t('vBC',d(rtcBase))+g('gIBSUF',t('pIBSUF',d(o.aliquotaIbsUf||0,4))+t('vIBSUF',d(ibsUf)))+g('gIBSMun',t('pIBSMun',d(o.aliquotaIbsMunicipio||0,4))+t('vIBSMun',d(ibsMun)))+t('vIBS',d(ibsUf+ibsMun))+g('gCBS',t('pCBS',d(o.aliquotaCbs||0,4))+t('vCBS',d(cbs))));
    }
    rtc=g('IBSCBS',t('CST',o.rtcCst)+t('cClassTrib',o.rtcClassificacao)+valores);
  } else if(crt!==1) throw new Error('Configure o CST e a classificação IBS/CBS antes de emitir no regime normal.');
  return {xml:t('vTotTrib',d(item.valorTributos))+g('ICMS',icms)+pis.xml+cofins.xml+rtc,vBC,vICMS,vPIS:pis.valor,vCOFINS:cofins.valor,rtcBase,ibsUf,ibsMun,cbs};
}
export function qrCodeOnline(chave:string,ctx:ContextoEmissao,o:OpcoesSefaz) {
  const producao=ctx.ambiente==='PRODUCAO';
  const url=producao?o.qrCodeProducao:o.qrCodeHomologacao;
  const consulta=producao?o.consultaProducao:o.consultaHomologacao;
  if(!url||!consulta) throw new Error('Informe as URLs oficiais do QR Code e da consulta NFC-e para o ambiente selecionado.');
  for(const u of [url,consulta]) {const parsed=new URL(u);if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password||u.includes('|')) throw new Error('URL pública NFC-e inválida.');}
  let parametros=`${chave}|${o.versaoQrCode}|${producao?'1':'2'}`;
  if(o.versaoQrCode===2) {
    const id=producao?ctx.credenciais?.cscIdProducao:ctx.credenciais?.cscIdHomologacao;
    const csc=producao?ctx.credenciais?.cscProducao:ctx.credenciais?.cscHomologacao;
    if(!id||!csc) throw new Error('QR Code versão 2 exige o CSC e seu identificador no ambiente selecionado.');
    parametros+=`|${Number(id)}`;
    parametros+=`|${crypto.createHash('sha1').update(parametros+csc).digest('hex').toUpperCase()}`;
  }
  return {qrcodeUrl:`${url}${url.includes('?')?'&':'?'}p=${parametros}`,urlConsulta:consulta};
}
export async function prepararDocumento(input:EmissaoInput,agora=input.emitidaEm?new Date(input.emitidaEm):new Date()) {
  const {dados,ctx,serie,numero}=input;const e=dados.emitente,o=e.sefaz;
  if(!o || !/^\d{7}$/.test(o.codigoMunicipio)||o.codigoMunicipio.slice(0,2)!==CODIGO_UF[e.uf]) throw new Error('Código IBGE do município do emitente inválido.');
  if(!numero || numero<1 || numero>999999999 || !Number.isInteger(serie)||serie<0||serie>999) throw new Error('Número/série fiscal inválido.');
  if(e.cnpj!==ctx.cnpjEmitente || e.uf!==ctx.uf) throw new Error('Emitente diferente do contexto fiscal.');
  if(!dados.itens.length || dados.itens.length>990) throw new Error('Quantidade de itens fiscais inválida.');
  if(dados.contingencia && (dados.modelo!=='NFCE'||dados.contingencia.justificativa.trim().length<15||dados.contingencia.justificativa.trim().length>256)) throw new Error('Contingência exige NFC-e e justificativa válida.');
  const data=dataFiscal(agora,e.uf);
  // A chave usa o mesmo AAMM local da tag dhEmi, inclusive na virada do mês.
  const codigoNumerico=String(Number.parseInt(crypto.createHash('sha256').update(input.ref).digest('hex').slice(0,12),16)%100000000).padStart(8,'0');
  const chave=gerarChaveAcesso({uf:e.uf,cnpj:e.cnpj,modelo:dados.modelo,serie,numero,emissao:new Date(data.slice(0,19)),codigoNumerico,tipoEmissao:dados.contingencia?'9':'1'});
  const destino=dados.destinatario;const interestadual=!!destino?.uf && destino.uf!==e.uf;
  if(dados.modelo==='NFCE'&&interestadual) throw new Error('NFC-e só pode documentar operação interna. Use NF-e para outra UF.');
  if(interestadual) throw new Error('Operação interestadual exige a apuração de DIFAL/FCP ou enquadramento fiscal específico. Esta venda deve ser configurada antes da emissão direta.');
  const endereco=(p:{logradouro?:string;numero?:string;bairro?:string;municipio?:string;uf?:string;cep?:string;codigoMunicipio?:string})=>t('xLgr',p.logradouro)+t('nro',p.numero||'S/N')+t('xBairro',p.bairro)+t('cMun',p.codigoMunicipio)+t('xMun',p.municipio)+t('UF',p.uf)+t('CEP',p.cep)+t('cPais','1058')+t('xPais','BRASIL');
  const ide=g('ide',t('cUF',CODIGO_UF[e.uf])+t('cNF',chave.slice(35,43))+t('natOp',dados.naturezaOperacao)+t('mod',dados.modelo==='NFCE'?'65':'55')+t('serie',serie)+t('nNF',numero)+t('dhEmi',data)+t('tpNF','1')+t('idDest','1')+t('cMunFG',o.codigoMunicipio)+t('tpImp',dados.modelo==='NFCE'?'4':'1')+t('tpEmis','1')+t('cDV',chave[43])+t('tpAmb',ctx.ambiente==='PRODUCAO'?'1':'2')+t('finNFe','1')+t('indFinal','1')+t('indPres','2')+t('indIntermed','0')+t('procEmi','0')+t('verProc','Distre 1.0'));
  const emit=g('emit',t('CNPJ',e.cnpj)+t('xNome',e.razaoSocial.slice(0,60))+t('xFant',e.nomeFantasia?.slice(0,60))+g('enderEmit',endereco({...e,codigoMunicipio:o.codigoMunicipio})+t('fone',e.telefone))+t('IE',e.inscricaoEstadual)+t('CRT',e.regimeTributario));
  let dest='';
  if(destino?.documento) {
    if(dados.modelo==='NFE'&&(!destino.codigoMunicipio||destino.codigoMunicipio.slice(0,2)!==CODIGO_UF[destino.uf||''])) throw new Error('Código IBGE do município do destinatário inválido.');
    dest=g('dest',t(destino.documento.length===14?'CNPJ':'CPF',destino.documento)+t('xNome',ctx.ambiente==='HOMOLOGACAO'?HOMOLOGACAO_NOME:destino.nome)+(dados.modelo==='NFE'?g('enderDest',endereco(destino)):'')+t('indIEDest',destino.inscricaoEstadual?'1':'9')+t('IE',destino.inscricaoEstadual)+t('email',destino.email));
  }
  const tributados=dados.itens.map(item=>tributar(item,o,e.regimeTributario));
  const soma=(key:keyof Omit<ReturnType<typeof tributar>,'xml'>)=>arred(tributados.reduce((s,x)=>s+x[key],0));
  const itens=dados.itens.map((item,i)=>{
    if(!/^\d{8}$/.test(item.ncm)||!/^[56]\d{3}$/.test(item.cfop)||item.quantidade<=0) throw new Error(`Item ${i+1}: confira NCM, CFOP e quantidade.`);
    if(item.cfop.startsWith('6')) throw new Error('CFOP interestadual incompatível com operação interna.');
    const prod=t('cProd',item.codigo)+t('cEAN',item.codigoBarras||'SEM GTIN')+t('xProd',ctx.ambiente==='HOMOLOGACAO'&&dados.modelo==='NFCE'&&i===0?'NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL':item.descricao)+t('NCM',item.ncm)+t('CEST',item.cest)+t('CFOP',item.cfop)+t('uCom',item.unidade)+t('qCom',d(item.quantidade,4))+t('vUnCom',d(item.valorUnitario,10))+t('vProd',d(item.valorBruto))+t('cEANTrib',item.codigoBarras||'SEM GTIN')+t('uTrib',item.unidade)+t('qTrib',d(item.quantidade,4))+t('vUnTrib',d(item.valorUnitario,10))+(item.valorDesconto?t('vDesc',d(item.valorDesconto)):'')+(item.valorOutros?t('vOutro',d(item.valorOutros)):'')+t('indTot','1');
    return `<det nItem="${i+1}">${g('prod',prod)}${g('imposto',tributados[i].xml)}</det>`;
  }).join('');
  const produtos=arred(dados.itens.reduce((s,i)=>s+i.valorBruto,0));
  if(Math.abs(produtos-dados.valorProdutos)>0.01 || Math.abs(arred(dados.valorProdutos-dados.valorDesconto+dados.valorOutros)-dados.valorTotal)>0.01) throw new Error('Totais da venda não conferem com os itens fiscais.');
  let total=g('ICMSTot',t('vBC',d(soma('vBC')))+t('vICMS',d(soma('vICMS')))+t('vICMSDeson','0.00')+t('vFCP','0.00')+t('vBCST','0.00')+t('vST','0.00')+t('vFCPST','0.00')+t('vFCPSTRet','0.00')+t('vProd',d(dados.valorProdutos))+t('vFrete','0.00')+t('vSeg','0.00')+t('vDesc',d(dados.valorDesconto))+t('vII','0.00')+t('vIPI','0.00')+t('vIPIDevol','0.00')+t('vPIS',d(soma('vPIS')))+t('vCOFINS',d(soma('vCOFINS')))+t('vOutro',d(dados.valorOutros))+t('vNF',d(dados.valorTotal))+t('vTotTrib',d(dados.valorTributos)));
  if(dados.itens.some(item=>!!(item.tributacaoSefaz?.rtcCst||o.rtcCst))) total+=g('IBSCBSTot',t('vBCIBSCBS',d(soma('rtcBase')))+g('gIBS',g('gIBSUF',t('vDif','0.00')+t('vDevTrib','0.00')+t('vIBSUF',d(soma('ibsUf'))))+g('gIBSMun',t('vDif','0.00')+t('vDevTrib','0.00')+t('vIBSMun',d(soma('ibsMun'))))+t('vIBS',d(soma('ibsUf')+soma('ibsMun')))+t('vCredPres','0.00')+t('vCredPresCondSus','0.00'))+g('gCBS',t('vDif','0.00')+t('vDevTrib','0.00')+t('vCBS',d(soma('cbs')))+t('vCredPres','0.00')+t('vCredPresCondSus','0.00')));
  const pagamento=g('pag',g('detPag',t('tPag',dados.pagamento.codigo)+(dados.pagamento.codigo==='99'?t('xPag',dados.pagamento.descricao):'')+t('vPag',d(dados.pagamento.valor))+(['03','04'].includes(dados.pagamento.codigo)?g('card',t('tpIntegra','2')):'')));
  const material=certificadoContexto(ctx);
  let xml=`<NFe xmlns="${NS_NFE}"><infNFe Id="NFe${chave}" versao="4.00">${ide}${emit}${dest}${itens}${g('total',total)}${g('transp',t('modFrete','9'))}${pagamento}${g('infAdic',t('infCpl',dados.informacoesAdicionais))}</infNFe></NFe>`;
  if(dados.contingencia) xml=xml.replace('<tpEmis>1</tpEmis>','<tpEmis>9</tpEmis>').replace('</ide>',t('dhCont',data)+t('xJust',dados.contingencia.justificativa.trim())+'</ide>');
  xml=assinarXml(xml,'infNFe',material.chavePem,material.certPem);
  const urls:{qrcodeUrl?:string;urlConsulta?:string}=dados.modelo==='NFCE'?qrCodeOnline(chave,ctx,o):{};
  if(dados.contingencia&&urls.qrcodeUrl) {
    const base=urls.qrcodeUrl.slice(0,urls.qrcodeUrl.indexOf('p='));
    let parametros=`${chave}|${o.versaoQrCode}|${ctx.ambiente==='PRODUCAO'?'1':'2'}|${data.slice(8,10)}|${d(dados.valorTotal)}`;
    if(o.versaoQrCode===3) {
      const documento=dados.destinatario?.documento||'';
      parametros+=`|${documento?(documento.length===14?'1':'2'):''}|${documento}`;
      parametros+=`|${crypto.sign('RSA-SHA1',Buffer.from(parametros),material.chavePem).toString('base64')}`;
    } else {
      const digest=lerXml(xml).getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#','DigestValue')[0]?.textContent;
      if(!digest) throw new Error('Resumo criptográfico NFC-e ausente.');
      const id=ctx.ambiente==='PRODUCAO'?ctx.credenciais!.cscIdProducao:ctx.credenciais!.cscIdHomologacao;
      const csc=ctx.ambiente==='PRODUCAO'?ctx.credenciais!.cscProducao:ctx.credenciais!.cscHomologacao;
      parametros+=`|${Buffer.from(digest,'utf8').toString('hex')}|${Number(id)}`;
      parametros+=`|${crypto.createHash('sha1').update(parametros+csc).digest('hex').toUpperCase()}`;
    }
    urls.qrcodeUrl=base+'p='+parametros;
  }
  if(urls.qrcodeUrl) xml=xml.replace('</infNFe>',`</infNFe><infNFeSupl><qrCode><![CDATA[${urls.qrcodeUrl}]]></qrCode><urlChave>${escaparXml(urls.urlConsulta)}</urlChave></infNFeSupl>`);
  await validarXmlNota(xml);
  return {xml,chave,numero,serie,emitidaEm:data,...urls};
}
