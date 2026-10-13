import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mssql from '../src/db';
import type { ConfigFiscalLoja, NotaFiscal } from '../src/fiscal/tipos';

describe.skipIf(process.env.RUN_SQL_SEFAZ_TESTS!=='1')('fiscal SEFAZ no SQL Server real',()=>{
  const nome=`DISTRE_TEST_FISCAL_${Date.now()}`,originais={banco:process.env.DB_DATABASE,seed:process.env.SEED_DEMO};
  let master:InstanceType<typeof mssql.ConnectionPool>,banco:typeof import('../src/database'),repo:typeof import('../src/fiscal/fiscalRepo'),sefaz:typeof import('../src/fiscal/sefaz/repositorio');
  const config:ConfigFiscalLoja={lojaId:'fiscal-a',razaoSocial:'Empresa Teste',cnpj:'11222333000181',inscricaoEstadual:'123456789',regimeTributario:1,logradouro:'Rua A',numero:'1',bairro:'Centro',municipio:'São Paulo',uf:'SP',cep:'01001000',provedor:'SEFAZ_DIRETA',ambiente:'HOMOLOGACAO',serieNfce:1,serieNfe:1,proximoNumeroNfce:1,proximoNumeroNfe:1,ncmPadrao:'21069090',cfopPadrao:'5102',icmsSituacaoPadrao:'102',origemPadrao:'0',percentualTributos:0,sefaz:{codigoMunicipio:'3550308',versaoQrCode:3,pisCst:'07',cofinsCst:'07',aliquotaIcms:0,reducaoBaseIcms:0,aliquotaPis:0,aliquotaCofins:0,aliquotaCreditoSn:0}};
  const nota=(id:string,venda=id,lojaId='fiscal-a',ambiente:'HOMOLOGACAO'|'PRODUCAO'='HOMOLOGACAO'):NotaFiscal=>({id,lojaId,pedidoId:venda,modelo:'NFCE',serie:1,status:'PROCESSANDO',ambiente,provedor:'SEFAZ_DIRETA',refProvedor:id,valorTotal:10,dados:{modelo:'NFCE',naturezaOperacao:'Venda',emitente:{...config,lojaId},itens:[],valorProdutos:10,valorDesconto:0,valorOutros:0,valorTotal:10,valorTributos:0,pagamento:{codigo:'01',descricao:'Dinheiro',valor:10}},criadoEm:new Date().toISOString(),atualizadoEm:new Date().toISOString()});
  beforeAll(async()=>{
    const sqlAuth=!!(process.env.DB_USER&&process.env.DB_PASSWORD);
    master=await new mssql.ConnectionPool({server:process.env.DB_SERVER||'localhost\\SQLEXPRESS',database:'master',...(sqlAuth?{user:process.env.DB_USER,password:process.env.DB_PASSWORD}:{}),options:{trustedConnection:!sqlAuth,trustServerCertificate:true,encrypt:false} as any}).connect();
    await master.request().query(`CREATE DATABASE [${nome}]`);process.env.DB_DATABASE=nome;process.env.SEED_DEMO='false';
    banco=await import('../src/database');await banco.conectarBanco();repo=await import('../src/fiscal/fiscalRepo');sefaz=await import('../src/fiscal/sefaz/repositorio');
    await repo.salvarConfigFiscal(config);await repo.salvarConfigFiscal({...config,lojaId:'fiscal-b'});
    await sefaz.prepararTabelasSefaz();
  },60000);
  afterAll(async()=>{
    await banco?.pool?.close();
    if(master?.connected&&/^DISTRE_TEST_FISCAL_\d+$/.test(nome)) await master.request().query(`ALTER DATABASE [${nome}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${nome}]`);
    await master?.close();
    for(const [key,value] of [['DB_DATABASE',originais.banco],['SEED_DEMO',originais.seed]]) {if(value===undefined)delete process.env[key!];else process.env[key!]=value;}
  },30000);
  it('persiste provedor direto e configuração adicional sem segredos',async()=>{
    const c=await repo.obterConfigFiscal('fiscal-a');expect(c?.provedor).toBe('SEFAZ_DIRETA');expect(c?.sefaz?.codigoMunicipio).toBe('3550308');
  });
  it('só uma reserva da mesma venda vence quando há concorrência',async()=>{
    const resultados=await Promise.allSettled([sefaz.criarNotaSefaz(nota('nf-race-1','race')),sefaz.criarNotaSefaz(nota('nf-race-2','race'))]);
    expect(resultados.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(await repo.obterNotaAtivaDaVenda('race','fiscal-a')).not.toBeNull();expect(await repo.obterNotaAtivaDaVenda('race','fiscal-b')).toBeNull();
  });
  it('lojas com mesmo CNPJ não repetem número; ambientes têm sequências independentes',async()=>{
    const a=nota('nf-a','a'),b=nota('nf-b','b','fiscal-b'),p=nota('nf-prod','prod','fiscal-a','PRODUCAO');
    await Promise.all([sefaz.criarNotaSefaz(a),sefaz.criarNotaSefaz(b)]);await sefaz.criarNotaSefaz(p);
    expect(a.numero).not.toBe(b.numero);expect(p.numero).toBe(1);
  });
  it('guarda XML cifrado, vinculado à loja, sem expor conteúdo no banco',async()=>{
    const doc={ref:'nf-segredo',lojaId:'fiscal-a',ambiente:'HOMOLOGACAO' as const,chave:'1'.repeat(44),xml:'<teste>dados-pessoais</teste>',numero:1,serie:1,emitidaEm:new Date().toISOString(),fase:'PREPARADO' as const};
    await sefaz.salvarDocumento(doc);expect((await sefaz.obterDocumento(doc.ref,'fiscal-a'))?.xml).toBe(doc.xml);expect(await sefaz.obterDocumento(doc.ref,'fiscal-b')).toBeNull();
    const row=await banco.pool.request().query("SELECT CONTEUDO FROM FISCAL_SEFAZ_DOCUMENTOS WHERE REF='nf-segredo'");expect(row.recordset[0].CONTEUDO).not.toContain('dados-pessoais');
  });
  it('eventos são cifrados e isolados por loja',async()=>{
    await sefaz.salvarEvento({id:'evento-teste',lojaId:'fiscal-a',xml:'<evento>justificativa</evento>',tipo:'110111'});
    expect(await sefaz.obterEvento('evento-teste','fiscal-b')).toBeNull();expect((await sefaz.obterEvento('evento-teste','fiscal-a'))?.tipo).toBe('110111');
  });
  it('inutilização não cobre nota pendente e consome a faixa antes de envio',async()=>{
    const ativa=await repo.obterNotaAtivaDaVenda('race','fiscal-a');
    await expect(sefaz.reservarFaixaInutilizacao({cnpj:config.cnpj,ambiente:'HOMOLOGACAO',modelo:'NFCE',serie:1,inicio:ativa!.numero!,fim:ativa!.numero!,ano:new Date().getFullYear()})).rejects.toThrow(/faixa contém/);
    await sefaz.reservarFaixaInutilizacao({cnpj:config.cnpj,ambiente:'HOMOLOGACAO',modelo:'NFCE',serie:1,inicio:50,fim:60,ano:new Date().getFullYear()});
    const n=nota('nf-depois');await sefaz.criarNotaSefaz(n);expect(n.numero).toBe(61);
  });
  it('campos tributários do produto são persistidos e recuperados',async()=>{
    await banco.salvarProduto({id:'prod-fiscal',lojaId:'fiscal-a',nome:'Produto Teste',preco:10,ativo:true,pisCst:'04',cofinsCst:'04',aliquotaIcms:17.1234,rtcCst:'410',rtcClassificacao:'410001'});
    const p=(await banco.obterProdutosDaLoja('fiscal-a'))[0];expect(p.pisCst).toBe('04');expect(p.aliquotaIcms).toBe(17.1234);
  });
  it('consulta atrasada não regride nota autorizada ou cancelada nem apaga XML autorizado',async()=>{
    const n=nota('nf-monotona');await sefaz.criarNotaSefaz(n);n.status='AUTORIZADA';n.protocolo='135260000000001';await repo.salvarNota(n);
    const atrasada={...n,status:'PROCESSANDO' as const,protocolo:undefined};await repo.salvarNota(atrasada);expect(atrasada.status).toBe('AUTORIZADA');expect(atrasada.protocolo).toBe('135260000000001');
    n.status='CANCELADA';await repo.salvarNota(n);const antiga={...n,status:'AUTORIZADA' as const};await repo.salvarNota(antiga);expect(antiga.status).toBe('CANCELADA');
    const doc={ref:'nf-doc-final',lojaId:'fiscal-a',ambiente:'HOMOLOGACAO' as const,chave:'2'.repeat(44),xml:'<teste/>',xmlAutorizado:'<autorizado/>',numero:1,serie:1,emitidaEm:new Date().toISOString(),fase:'AUTORIZADO' as const};await sefaz.salvarDocumento(doc);
    await sefaz.salvarDocumento({...doc,fase:'ENVIANDO',xmlAutorizado:undefined});expect((await sefaz.obterDocumento(doc.ref,doc.lojaId))?.xmlAutorizado).toBe('<autorizado/>');
  });
});
