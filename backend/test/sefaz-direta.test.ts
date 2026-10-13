import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import forge from 'node-forge';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SignedXml } from 'xml-crypto';
import { DOMParser } from '@xmldom/xmldom';
vi.mock('../src/fiscal/sefaz/repositorio',()=>({obterDocumento:vi.fn(),salvarDocumento:vi.fn(),obterEvento:vi.fn(),salvarEvento:vi.fn(),reservarFaixaInutilizacao:vi.fn()}));
import { prepararDocumento, dataFiscal, qrCodeOnline } from '../src/fiscal/sefaz/documento';
import { certificadoContexto, transmitirSefaz } from '../src/fiscal/sefaz/transporte';
import { materialCertificadoA1 } from '../src/fiscal/certificado';
import { coberturaSefaz, endpointSefaz } from '../src/fiscal/sefaz/catalogo';
import { lerXml, NS_NFE, validarXmlNota } from '../src/fiscal/sefaz/xml';
import { interpretarResposta, SefazDiretaAdapter } from '../src/fiscal/adapters/SefazDiretaAdapter';
import { EmissaoInput } from '../src/fiscal/FiscalProviderAdapter';
import { DocumentoSefaz } from '../src/fiscal/sefaz/repositorio';
import * as repo from '../src/fiscal/sefaz/repositorio';
import * as transporte from '../src/fiscal/sefaz/transporte';
import { normalizarOpcoesSefaz } from '../src/fiscal/sefaz/configuracao';
import { gerarDanfeNfe } from '../src/fiscal/sefaz/danfe';
import { validarXmlSefaz } from '../src/fiscal/sefaz/xml';

let input:EmissaoInput;
beforeAll(()=>{
  const keys=forge.pki.rsa.generateKeyPair(2048),cert=forge.pki.createCertificate();
  cert.publicKey=keys.publicKey;cert.serialNumber='01';cert.validity.notBefore=new Date(Date.now()-86400000);cert.validity.notAfter=new Date(Date.now()+86400000*30);
  cert.setSubject([{name:'commonName',value:'EMITENTE TESTE:11222333000181'}]);cert.setIssuer([{name:'commonName',value:'AC TESTE'}]);cert.sign(keys.privateKey,forge.md.sha256.create());
  const pfx=Buffer.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey,[cert],'senha-teste',{algorithm:'3des'})).getBytes(),'binary');
  input={ref:'nota-teste',numero:1,serie:1,emitidaEm:'2026-10-13T13:00:00.000Z',ctx:{lojaId:'loja-1',ambiente:'HOMOLOGACAO',uf:'SP',cnpjEmitente:'11222333000181',credenciais:{certificadoPfx:pfx,certificadoSenha:'senha-teste'}},dados:{modelo:'NFCE',naturezaOperacao:'Venda de mercadoria',emitente:{lojaId:'loja-1',razaoSocial:'Empresa Teste',cnpj:'11222333000181',inscricaoEstadual:'123456789',regimeTributario:1,logradouro:'Rua A',numero:'1',bairro:'Centro',municipio:'São Paulo',uf:'SP',cep:'01001000',provedor:'SEFAZ_DIRETA',ambiente:'HOMOLOGACAO',serieNfce:1,serieNfe:1,ncmPadrao:'21069090',cfopPadrao:'5102',icmsSituacaoPadrao:'102',origemPadrao:'0',percentualTributos:0,sefaz:{codigoMunicipio:'3550308',versaoQrCode:3,qrCodeHomologacao:'https://www.homologacao.nfce.fazenda.sp.gov.br/qrcode',consultaHomologacao:'https://www.homologacao.nfce.fazenda.sp.gov.br/consulta',pisCst:'07',cofinsCst:'07',aliquotaPis:0,aliquotaCofins:0,aliquotaIcms:0,reducaoBaseIcms:0,aliquotaCreditoSn:0}},itens:[{numero:1,codigo:'produto-1',descricao:'Mercadoria & teste',ncm:'21069090',cfop:'5102',unidade:'UN',quantidade:1,valorUnitario:10,valorBruto:10,valorDesconto:0,valorOutros:0,valorTributos:0,origem:'0',icmsSituacao:'102'}],valorProdutos:10,valorDesconto:0,valorOutros:0,valorTotal:10,valorTributos:0,pagamento:{codigo:'01',descricao:'Dinheiro',valor:10},informacoesAdicionais:'Venda teste'}};
});
beforeEach(()=>vi.clearAllMocks());
describe('emissor SEFAZ direto',()=>{
  it('mapeia os seis serviços de ambos modelos, dois ambientes, nas 27 UFs',()=>{
    expect(coberturaSefaz()).toHaveLength(27);
    for(const {uf} of coberturaSefaz()) for(const modelo of ['NFE','NFCE'] as const) for(const ambiente of ['HOMOLOGACAO','PRODUCAO'] as const) for(const servico of ['autorizacao','retorno','consulta','status','evento','inutilizacao'] as const) expect(endpointSefaz(uf,modelo,ambiente,servico)).toMatch(/^https:\/\//);
    expect(endpointSefaz('CE','NFE','HOMOLOGACAO','autorizacao')).toContain('nfe-homologacao.svrs');
    expect(endpointSefaz('MG','NFCE','HOMOLOGACAO','status')).toContain('hnfce.fazenda.mg');
  });
  it('gera NFC-e assinada válida no XSD oficial e assinatura verificável',async()=>{
    const doc=await prepararDocumento(input);
    expect(doc.chave).toHaveLength(44);expect(doc.qrcodeUrl).toContain('|3|2');
    const xml=lerXml(doc.xml),signature=xml.getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#','Signature')[0];
    const checker=new SignedXml({publicCert:materialCertificadoA1(input.ctx.credenciais!.certificadoPfx!,'senha-teste').certPem});checker.loadSignature(signature);
    expect(checker.checkSignature(doc.xml)).toBe(true);
    const adulterado=doc.xml.replace('<vNF>10.00</vNF>','<vNF>11.00</vNF>');
    expect(checker.checkSignature(adulterado)).toBe(false);
  });
  it('preserva chave e XML ao retomar a mesma reserva',async()=>{
    const a=await prepararDocumento(input),b=await prepararDocumento(input);
    expect(a.xml).toBe(b.xml);expect(a.chave).toBe(b.chave);
  });
  it('gera NF-e com destinatário e XML escapado',async()=>{
    const dados=structuredClone(input.dados);dados.modelo='NFE';dados.destinatario={documento:'12345678909',nome:'Cliente & teste',logradouro:'Rua B',numero:'2',bairro:'Centro',municipio:'São Paulo',codigoMunicipio:'3550308',uf:'SP',cep:'01001000'};
    const doc=await prepararDocumento({...input,dados});expect(doc.xml).toContain('Mercadoria &amp; teste');expect(doc.xml).toContain('<mod>55</mod>');expect(doc.xml).not.toContain('infNFeSupl');
  });
  it('valida CST00 com IBS/CBS no regime normal pelo XSD oficial',async()=>{
    const dados=structuredClone(input.dados);dados.emitente.regimeTributario=3;dados.itens[0].icmsSituacao='00';Object.assign(dados.emitente.sefaz!,{aliquotaIcms:18,pisCst:'01',cofinsCst:'01',aliquotaPis:1.65,aliquotaCofins:7.6,rtcCst:'000',rtcClassificacao:'000001',aliquotaIbsUf:0.1,aliquotaIbsMunicipio:0,aliquotaCbs:0.9});
    const doc=await prepararDocumento({...input,dados});expect(doc.xml).toContain('<IBSCBSTot>');expect(doc.xml).toContain('<vICMS>1.80</vICMS>');
  });
  it('bloqueia certificado de outra empresa e certificado ausente',()=>{
    expect(()=>certificadoContexto({...input.ctx,cnpjEmitente:'99888777000100'})).toThrow(/raiz CNPJ/);
    expect(()=>certificadoContexto({...input.ctx,credenciais:{}})).toThrow(/certificado/);
  });
  it('rejeita XML com entidade externa, tributação incompleta e total inconsistente',async()=>{
    expect(()=>lerXml('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///secret">]><x>&e;</x>')).toThrow();
    const dados=structuredClone(input.dados);dados.itens[0].icmsSituacao='201';await expect(prepararDocumento({...input,dados})).rejects.toThrow(/adicionais/);
    await expect(prepararDocumento({...input,dados:{...input.dados,valorTotal:20}})).rejects.toThrow(/Totais/);
  });
  it('QR v2 exige CSC; v3 online dispensa CSC',()=>{
    const o=input.dados.emitente.sefaz!;
    expect(()=>qrCodeOnline('1'.repeat(44),input.ctx,{...o,versaoQrCode:2})).toThrow(/CSC/);
    expect(qrCodeOnline('1'.repeat(44),input.ctx,o).qrcodeUrl).toContain('|3|2');
  });
  it('usa data local da UF sem erro na virada do mês',()=>{
    expect(dataFiscal(new Date('2026-11-01T02:00:00Z'),'SP')).toBe('2026-10-31T23:00:00-03:00');
    expect(dataFiscal(new Date('2026-11-01T04:00:00Z'),'AC')).toBe('2026-10-31T23:00:00-05:00');
  });
  it('normaliza opções e rejeita URLs com parâmetros já preenchidos',()=>{
    expect(normalizarOpcoesSefaz(input.dados.emitente.sefaz,'SP')?.codigoMunicipio).toBe('3550308');
    expect(()=>normalizarOpcoesSefaz({...input.dados.emitente.sefaz,codigoMunicipio:'2304400'},'SP')).toThrow(/estado/);
    expect(()=>normalizarOpcoesSefaz({...input.dados.emitente.sefaz,qrCodeHomologacao:'https://example.com?p=123'},'SP')).toThrow(/parâmetros/);
  });
  it('consulta status dos autorizadores virtuais sem confundir UF do emitente com a do serviço',async()=>{
    const spy=vi.spyOn(transporte,'transmitirSefaz').mockImplementation(async(_ctx,_modelo,servico,xml)=>{
      expect(servico).toBe('status');await validarXmlSefaz(xml,'consStatServ_v4.00.xsd');
      return `<retConsStatServ xmlns="${NS_NFE}" versao="4.00"><tpAmb>2</tpAmb><verAplic>SVRS_TESTE</verAplic><cStat>107</cStat><xMotivo>Servico em Operacao</xMotivo><cUF>43</cUF><dhRecbto>2026-10-13T10:00:00-03:00</dhRecbto><tMed>1</tMed></retConsStatServ>`;
    });
    expect((await new SefazDiretaAdapter().testarConexao({...input.ctx,uf:'CE'})).ok).toBe(true);expect(spy).toHaveBeenCalledTimes(2);spy.mockRestore();
  });
  it('só autoriza quando o protocolo corresponde a chave e ambiente',async()=>{
    const preparado=await prepararDocumento(input);const doc:DocumentoSefaz={...preparado,ambiente:'HOMOLOGACAO',ref:'nota-teste',lojaId:'loja-1',fase:'ENVIANDO'};
    const digest=lerXml(doc.xml).getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#','DigestValue')[0].textContent;
    const prot=(chave=doc.chave,amb='2')=>`<retEnviNFe xmlns="${NS_NFE}"><tpAmb>2</tpAmb><cStat>104</cStat><protNFe versao="4.00"><infProt><tpAmb>${amb}</tpAmb><verAplic>TESTE</verAplic><chNFe>${chave}</chNFe><dhRecbto>2026-10-13T10:00:00-03:00</dhRecbto><nProt>135260000000001</nProt><digVal>${digest}</digVal><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></retEnviNFe>`;
    expect(interpretarResposta(prot(),doc,input.ctx).status).toBe('AUTORIZADA');expect(doc.xmlAutorizado).toContain('nfeProc');
    expect(()=>interpretarResposta(prot('2'.repeat(44)),doc,input.ctx)).toThrow(/corresponde/);
    expect(()=>interpretarResposta(prot(doc.chave,'1'),doc,input.ctx)).toThrow(/ambiente/);
    expect(()=>interpretarResposta(prot().replace(digest!,'invalido'),doc,input.ctx)).toThrow(/criptográfico/);
  });
  it('timeout mantém PROCESSANDO e persiste XML antes do envio',async()=>{
    vi.mocked(repo.obterDocumento).mockResolvedValue(null);
    const spy=vi.spyOn(transporte,'transmitirSefaz').mockRejectedValue(new Error('timeout'));
    const r=await new SefazDiretaAdapter().emitir(input);
    expect(r.status).toBe('PROCESSANDO');expect(r.chave).toHaveLength(44);expect(repo.salvarDocumento).toHaveBeenCalledTimes(2);
    expect(vi.mocked(repo.salvarDocumento).mock.invocationCallOrder[1]).toBeLessThan(spy.mock.invocationCallOrder[0]);spy.mockRestore();
  });
  it('NFC-e offline v3 é válida, tem chave tpEmis9 e assinatura RSA do QR verificável',async()=>{
    const doc=await prepararDocumento({...input,dados:{...input.dados,contingencia:{justificativa:'Falha técnica de conexão de teste'}}});
    expect(doc.chave[34]).toBe('9');expect(doc.xml).toContain('<dhCont>');
    const params=doc.qrcodeUrl!.split('?p=')[1].split('|');expect(params[5]).toBe('');expect(params[6]).toBe('');
    const material=materialCertificadoA1(input.ctx.credenciais!.certificadoPfx!,'senha-teste');
    expect(crypto.verify('RSA-SHA1',Buffer.from(params.slice(0,7).join('|')),material.certPem,Buffer.from(params[7],'base64'))).toBe(true);
  });
  it('NFC-e offline v2 usa o DigestValue em hexadecimal e CSC',async()=>{
    const ctx={...input.ctx,credenciais:{...input.ctx.credenciais,cscIdHomologacao:'000001',cscHomologacao:'CSC-TESTE-NAO-FISCAL'}};
    const dados=structuredClone(input.dados);dados.emitente.sefaz!.versaoQrCode=2;dados.contingencia={justificativa:'Falha técnica de conexão de teste'};
    const doc=await prepararDocumento({...input,dados,ctx});const params=doc.qrcodeUrl!.split('?p=')[1].split('|');
    const digest=lerXml(doc.xml).getElementsByTagNameNS('http://www.w3.org/2000/09/xmldsig#','DigestValue')[0].textContent!;
    expect(params[5]).toBe(Buffer.from(digest).toString('hex'));expect(params[7]).toBe(crypto.createHash('sha1').update(params.slice(0,7).join('|')+ctx.credenciais.cscHomologacao).digest('hex').toUpperCase());
  });
  it('contingência é salva sem tentar transmitir e sem marcar autorização',async()=>{
    vi.mocked(repo.obterDocumento).mockResolvedValue(null);const spy=vi.spyOn(transporte,'transmitirSefaz');
    const r=await new SefazDiretaAdapter().emitir({...input,dados:{...input.dados,contingencia:{justificativa:'Falha técnica de conexão de teste'}}});
    expect(r.status).toBe('CONTINGENCIA');expect(spy).not.toHaveBeenCalled();expect(repo.salvarDocumento).toHaveBeenCalledTimes(1);spy.mockRestore();
  });
  it('cancelamento e carta são assinados, validados pelo esquema oficial e arquivados',async()=>{
    const dados=structuredClone(input.dados);dados.modelo='NFE';dados.destinatario={documento:'12345678909',nome:'Cliente Teste',logradouro:'Rua B',numero:'2',bairro:'Centro',municipio:'São Paulo',codigoMunicipio:'3550308',uf:'SP',cep:'01001000'};
    const preparado=await prepararDocumento({...input,dados});const doc:DocumentoSefaz={...preparado,ref:'nota-teste',lojaId:'loja-1',ambiente:'HOMOLOGACAO',fase:'AUTORIZADO',xmlAutorizado:`<nfeProc xmlns="${NS_NFE}">${preparado.xml}<protNFe><infProt><nProt>135260000000001</nProt></infProt></protNFe></nfeProc>`};
    vi.mocked(repo.obterDocumento).mockResolvedValue(doc);vi.mocked(repo.obterEvento).mockResolvedValue(null);
    const spy=vi.spyOn(transporte,'transmitirSefaz').mockImplementation(async(_ctx,_modelo,servico,xml)=>{
      expect(servico).toBe('evento');await validarXmlSefaz(xml,'envEvento_v1.00.xsd');
      const evento=lerXml(xml),tipo=evento.getElementsByTagNameNS(NS_NFE,'tpEvento')[0].textContent;
      return `<retEnvEvento xmlns="${NS_NFE}"><cStat>128</cStat><retEvento versao="1.00"><infEvento><tpAmb>2</tpAmb><chNFe>${doc.chave}</chNFe><tpEvento>${tipo}</tpEvento><nSeqEvento>1</nSeqEvento><cStat>135</cStat><xMotivo>Evento registrado e vinculado a NF-e</xMotivo><nProt>135260000000002</nProt></infEvento></retEvento></retEnvEvento>`;
    });
    const adapter=new SefazDiretaAdapter();expect((await adapter.cancelar('nota-teste','NFE','Cancelamento de venda de teste',input.ctx)).status).toBe('CANCELADA');
    expect((await adapter.corrigir('nota-teste','Correção de informação adicional de teste',1,input.ctx)).autorizado).toBe(true);
    expect(repo.salvarEvento).toHaveBeenCalledTimes(4);spy.mockRestore();
  });
  it('inutilização assina o intervalo e só aceita protocolo correspondente',async()=>{
    vi.mocked(repo.obterEvento).mockResolvedValue(null);
    const spy=vi.spyOn(transporte,'transmitirSefaz').mockImplementation(async(_ctx,_modelo,servico,xml)=>{
      expect(servico).toBe('inutilizacao');await validarXmlSefaz(xml,'inutNFe_v4.00.xsd');
      return `<retInutNFe xmlns="${NS_NFE}"><infInut><tpAmb>2</tpAmb><cStat>102</cStat><CNPJ>11222333000181</CNPJ><serie>1</serie><nNFIni>50</nNFIni><nNFFin>60</nNFFin><nProt>135260000000003</nProt><xMotivo>Inutilização homologada</xMotivo></infInut></retInutNFe>`;
    });
    const r=await new SefazDiretaAdapter().inutilizar({modelo:'NFCE',serie:1,ano:2026,inicio:50,fim:60,justificativa:'Faixa não utilizada para teste'},input.ctx);
    expect(r.autorizado).toBe(true);expect(repo.reservarFaixaInutilizacao).toHaveBeenCalledTimes(1);spy.mockRestore();
  });
  it('gera DANFE PDF com código de barras a partir do XML autorizado',async()=>{
    const dados=structuredClone(input.dados);dados.modelo='NFE';dados.destinatario={documento:'12345678909',nome:'Cliente Teste',logradouro:'Rua B',numero:'2',bairro:'Centro',municipio:'São Paulo',codigoMunicipio:'3550308',uf:'SP',cep:'01001000'};
    const preparado=await prepararDocumento({...input,dados});
    const doc:DocumentoSefaz={...preparado,ref:'nota-teste',lojaId:'loja-1',ambiente:'HOMOLOGACAO',fase:'AUTORIZADO',xmlAutorizado:`<nfeProc xmlns="${NS_NFE}">${preparado.xml}<protNFe><infProt><chNFe>${preparado.chave}</chNFe><nProt>135260000000001</nProt><dhRecbto>2026-10-13T10:00:00-03:00</dhRecbto></infProt></protNFe></nfeProc>`};
    const nota={id:'nf-pdf',lojaId:'loja-1',modelo:'NFE' as const,numero:1,serie:1,chave:doc.chave,status:'AUTORIZADA' as const,ambiente:'HOMOLOGACAO' as const,provedor:'SEFAZ_DIRETA',refProvedor:'nota-teste',valorTotal:10,dados,criadoEm:input.emitidaEm!,atualizadoEm:input.emitidaEm!};
    const pdf=await gerarDanfeNfe(nota,doc);expect(pdf.subarray(0,5).toString()).toBe('%PDF-');expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1);expect(pdf.toString('latin1').trim().endsWith('%%EOF')).toBe(true);
    fs.writeFileSync(path.join(os.tmpdir(),'distre-danfe-fixture.pdf'),pdf);
  });
});
