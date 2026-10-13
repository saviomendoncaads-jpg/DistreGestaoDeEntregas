import PDFDocument from 'pdfkit';
import bwipjs from 'bwip-js';
import { NotaFiscal } from '../tipos';
import { DocumentoSefaz } from './repositorio';
import { lerXml, NS_NFE } from './xml';

const dinheiro=(v:unknown)=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
export async function gerarDanfeNfe(nota:NotaFiscal,doc:DocumentoSefaz):Promise<Buffer> {
  if(nota.modelo!=='NFE'||!doc.xmlAutorizado||!['AUTORIZADA','CANCELADA'].includes(nota.status)) throw new Error('DANFE exige NF-e com XML autorizado.');
  const xml=lerXml(doc.xmlAutorizado);
  const get=(nome:string,node:typeof xml|NonNullable<typeof xml.documentElement>=xml)=>node.getElementsByTagNameNS(NS_NFE,nome)[0]?.textContent||'';
  const chave=get('chNFe');
  if(chave!==doc.chave||chave!==nota.chave) throw new Error('XML autorizado não corresponde à nota do DANFE.');
  const barcode=await bwipjs.toBuffer({bcid:'code128',text:chave,scale:2,height:12,includetext:false,padding:0});
  const pdf=new PDFDocument({size:'A4',margin:20,autoFirstPage:false,info:{Title:`DANFE NF-e ${nota.numero}`,Author:'Distre'}});
  const buffers:Buffer[]=[];const final=new Promise<Buffer>((resolve,reject)=>{pdf.on('data',b=>buffers.push(b));pdf.on('end',()=>resolve(Buffer.concat(buffers)));pdf.on('error',reject);});
  const width=555,emit=xml.getElementsByTagNameNS(NS_NFE,'emit')[0],dest=xml.getElementsByTagNameNS(NS_NFE,'dest')[0],total=xml.getElementsByTagNameNS(NS_NFE,'ICMSTot')[0];
  const itens=Array.from(xml.getElementsByTagNameNS(NS_NFE,'det'));
  const porPagina=9,paginas=Math.max(1,Math.ceil(itens.length/porPagina));
  const campo=(label:string,value:string,x:number,y:number,w:number,h=30)=>{
    pdf.rect(x,y,w,h).stroke();pdf.font('Helvetica').fontSize(5.5).text(label,x+3,y+3,{width:w-6,lineBreak:false});
    pdf.font('Helvetica').fontSize(8).text(value,x+3,y+12,{width:w-6,height:h-13,ellipsis:true});
  };
  const secao=(label:string,y:number)=>pdf.font('Helvetica-Bold').fontSize(8).text(label,20,y,{width});
  for(let pagina=0;pagina<paginas;pagina++) {
    pdf.addPage();pdf.strokeColor('#000').lineWidth(.5);
    pdf.rect(20,20,width,24).stroke();pdf.font('Helvetica').fontSize(6).text(`RECEBEMOS DE ${get('xNome',emit)} OS PRODUTOS CONSTANTES DA NF-e Nº ${nota.numero} / SÉRIE ${nota.serie}`,23,25,{width:width-6});
    campo('DATA DE RECEBIMENTO','',20,44,120,26);campo('IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR','',140,44,435,26);
    pdf.rect(20,78,230,84).stroke();pdf.font('Helvetica-Bold').fontSize(11).text(get('xNome',emit),25,84,{width:220});
    pdf.font('Helvetica').fontSize(7).text(`${get('xLgr',emit)}, ${get('nro',emit)} — ${get('xBairro',emit)}\n${get('xMun',emit)} / ${get('UF',emit)} — CEP ${get('CEP',emit)}\n${get('fone',emit)}`,25,113,{width:220});
    pdf.rect(250,78,100,84).stroke();pdf.font('Helvetica-Bold').fontSize(14).text('DANFE',255,83,{width:90,align:'center'});
    pdf.font('Helvetica').fontSize(6).text('DOCUMENTO AUXILIAR DA\nNOTA FISCAL ELETRÔNICA',255,101,{width:90,align:'center'});
    pdf.fontSize(8).text('0 - ENTRADA\n1 - SAÍDA     1',256,122,{width:90});pdf.font('Helvetica-Bold').text(`Nº ${nota.numero}\nSÉRIE ${nota.serie}`,256,144,{width:90});
    pdf.rect(350,78,225,84).stroke();pdf.image(barcode,357,83,{width:210,height:35});
    pdf.font('Helvetica').fontSize(5.5).text('CHAVE DE ACESSO',355,122);pdf.font('Helvetica-Bold').fontSize(6.5).text(chave.replace(/(\d{4})(?=\d)/g,'$1 '),355,132,{width:215});
    pdf.font('Helvetica').fontSize(5.5).text('Consulta de autenticidade no portal nacional da NF-e\nwww.nfe.fazenda.gov.br/portal ou no site da SEFAZ autorizadora',355,143,{width:215});
    campo('NATUREZA DA OPERAÇÃO',get('natOp'),20,162,300);campo('PROTOCOLO DE AUTORIZAÇÃO DE USO',`${get('nProt')} — ${get('dhRecbto')}`,320,162,255);
    campo('INSCRIÇÃO ESTADUAL',get('IE',emit),20,192,185);campo('INSCRIÇÃO ESTADUAL DO SUBST. TRIBUTÁRIO',get('IEST',emit),205,192,185);campo('CNPJ',get('CNPJ',emit),390,192,185);
    secao('DESTINATÁRIO / REMETENTE',229);
    campo('NOME / RAZÃO SOCIAL',dest?get('xNome',dest):'',20,241,315);campo('CNPJ / CPF',dest?(get('CNPJ',dest)||get('CPF',dest)):'',335,241,145);campo('DATA EMISSÃO',get('dhEmi').slice(0,10),480,241,95);
    campo('ENDEREÇO',dest?`${get('xLgr',dest)}, ${get('nro',dest)}`:'',20,271,285);campo('BAIRRO',dest?get('xBairro',dest):'',305,271,175);campo('CEP',dest?get('CEP',dest):'',480,271,95);
    campo('MUNICÍPIO',dest?get('xMun',dest):'',20,301,235);campo('UF',dest?get('UF',dest):'',255,301,40);campo('FONE',dest?get('fone',dest):'',295,301,140);campo('INSCRIÇÃO ESTADUAL',dest?get('IE',dest):'',435,301,140);
    secao('CÁLCULO DO IMPOSTO',338);
    const impostos=[['BASE CÁLCULO ICMS','vBC'],['VALOR ICMS','vICMS'],['BASE CÁLCULO ICMS ST','vBCST'],['VALOR ICMS ST','vST'],['VALOR DOS PRODUTOS','vProd']];
    impostos.forEach(([label,key],i)=>campo(label,dinheiro(get(key,total)),20+i*111,350,111));
    [['FRETE','vFrete'],['SEGURO','vSeg'],['DESCONTO','vDesc'],['OUTRAS DESPESAS','vOutro'],['VALOR TOTAL NF-e','vNF']].forEach(([label,key],i)=>campo(label,dinheiro(get(key,total)),20+i*111,380,111));
    secao('TRANSPORTADOR / VOLUMES TRANSPORTADOS',417);
    campo('NOME / RAZÃO SOCIAL','',20,429,235);campo('FRETE POR CONTA',get('modFrete')==='9'?'9 — SEM TRANSPORTE':get('modFrete'),255,429,180);campo('CNPJ / CPF','',435,429,140);
    secao('DADOS DOS PRODUTOS / SERVIÇOS',466);
    const colunas=[['CÓDIGO',48],['DESCRIÇÃO',154],['NCM',46],['CST',30],['CFOP',31],['UN',23],['QTD',37],['V. UNIT.',47],['V. TOTAL',47],['BC ICMS',39],['V. ICMS',32],['ICMS %',21]] as const;
    let x=20;for(const [label,w] of colunas){pdf.rect(x,478,w,17).stroke();pdf.font('Helvetica-Bold').fontSize(5).text(label,x+2,483,{width:w-4});x+=w;}
    const lote=itens.slice(pagina*porPagina,(pagina+1)*porPagina);
    lote.forEach((item,index)=>{
      const p=item.getElementsByTagNameNS(NS_NFE,'prod')[0],icms=item.getElementsByTagNameNS(NS_NFE,'ICMS')[0];
      const valores=[get('cProd',p),get('xProd',p),get('NCM',p),(get('orig',icms)||'')+(get('CST',icms)||get('CSOSN',icms)),get('CFOP',p),get('uCom',p),get('qCom',p),dinheiro(get('vUnCom',p)),dinheiro(get('vProd',p)),dinheiro(get('vBC',icms)),dinheiro(get('vICMS',icms)),get('pICMS',icms)];
      let px=20;colunas.forEach(([,w],i)=>{pdf.rect(px,495+index*23,w,23).stroke();pdf.font('Helvetica').fontSize(6).text(valores[i],px+2,498+index*23,{width:w-4,height:20,align:i>=6?'right':'left'});px+=w;});
    });
    const y=706;secao('DADOS ADICIONAIS',y);
    campo('INFORMAÇÕES COMPLEMENTARES',get('infCpl'),20,y+12,400,77);campo('RESERVADO AO FISCO','',420,y+12,155,77);
    pdf.font('Helvetica').fontSize(6).text(`Distre · DANFE · Página ${pagina+1} de ${paginas}`,20,809,{width,align:'right'});
    if(nota.ambiente==='HOMOLOGACAO'||nota.status==='CANCELADA') {
      pdf.save();pdf.opacity(.18).fillColor('#000').font('Helvetica-Bold').fontSize(32).rotate(-35,{origin:[298,421]}).text(nota.status==='CANCELADA'?'NF-e CANCELADA':'SEM VALOR FISCAL',80,410,{width:450,align:'center'});pdf.restore();
    }
  }
  pdf.end();return final;
}
