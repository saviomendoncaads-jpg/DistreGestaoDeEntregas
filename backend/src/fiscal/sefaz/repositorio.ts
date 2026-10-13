import mssql from '../../db';
import { pool } from '../../database';
import { cifrar, decifrar } from '../cofre';
import { garantirTabelasFiscais, salvarNota } from '../fiscalRepo';
import { AmbienteFiscal, ConfigFiscalLoja, ModeloNota, NotaFiscal } from '../tipos';

export interface DocumentoSefaz {
  ref:string; lojaId:string; ambiente:AmbienteFiscal; chave:string; xml:string; recibo?:string;
  xmlAutorizado?:string; qrcodeUrl?:string; urlConsulta?:string;
  numero:number; serie:number; emitidaEm:string;
  fase:'PREPARADO'|'ENVIANDO'|'RECEBIDO'|'AUTORIZADO'|'REJEITADO';
}
let tabelas:Promise<void>|undefined;
export function prepararTabelasSefaz() {
  return tabelas ||= garantirTabelasFiscais().then(async()=>{
    await pool.request().query(`
      IF OBJECT_ID('FISCAL_SEFAZ_DOCUMENTOS','U') IS NULL CREATE TABLE FISCAL_SEFAZ_DOCUMENTOS(
        REF VARCHAR(60) PRIMARY KEY, LOJA_ID VARCHAR(50) NOT NULL, AMBIENTE VARCHAR(12) NOT NULL, FASE VARCHAR(12) NOT NULL, CHAVE VARCHAR(44) NOT NULL,
        CONTEUDO NVARCHAR(MAX) NOT NULL, ATUALIZADO_EM DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        CONSTRAINT UQ_FSD_CHAVE UNIQUE(CHAVE,AMBIENTE));
      IF OBJECT_ID('FISCAL_SEFAZ_SEQUENCIAS','U') IS NULL CREATE TABLE FISCAL_SEFAZ_SEQUENCIAS(
        CNPJ VARCHAR(14) NOT NULL, AMBIENTE VARCHAR(12) NOT NULL, MODELO VARCHAR(4) NOT NULL, SERIE INT NOT NULL,
        PROXIMO INT NOT NULL, PRIMARY KEY(CNPJ,AMBIENTE,MODELO,SERIE));
      IF OBJECT_ID('FISCAL_SEFAZ_EVENTOS','U') IS NULL CREATE TABLE FISCAL_SEFAZ_EVENTOS(
        ID VARCHAR(80) NOT NULL, LOJA_ID VARCHAR(50) NOT NULL, CONTEUDO NVARCHAR(MAX) NOT NULL,
        ATUALIZADO_EM DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(), PRIMARY KEY(ID,LOJA_ID));
    `);
  }).catch(err=>{tabelas=undefined;throw err;});
}
export async function criarNotaSefaz(n:NotaFiscal) {
  await prepararTabelasSefaz();
  const tx = new mssql.Transaction(pool);
  await tx.begin();
  try {
    const recurso=`fiscal:venda:${n.lojaId}:${n.pedidoId}`;
    const lock=await new mssql.Request(tx).input('recurso',mssql.NVarChar,recurso).query(`DECLARE @r INT; EXEC @r=sp_getapplock @Resource=@recurso,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000; SELECT @r AS R;`);
    if(lock.recordset[0].R<0) throw new Error('Venda está sendo processada. Consulte as notas antes de emitir novamente.');
    const existente=await new mssql.Request(tx).input('loja',mssql.VarChar,n.lojaId).input('venda',mssql.VarChar,n.pedidoId).query(`SELECT ID FROM NOTAS_FISCAIS WHERE LOJA_ID=@loja AND PEDIDO_ID=@venda AND STATUS IN ('AUTORIZADA','PROCESSANDO','CONTINGENCIA')`);
    if(existente.recordset.length) throw new Error('Esta venda já possui uma nota autorizada ou em processamento.');
    const e=n.dados.emitente;
    const contador=await new mssql.Request(tx)
      .input('cnpj',mssql.VarChar,e.cnpj).input('amb',mssql.VarChar,n.ambiente).input('modelo',mssql.VarChar,n.modelo).input('serie',mssql.Int,n.serie)
      .input('loja',mssql.VarChar,n.lojaId)
      .query(`
        DECLARE @inicio INT;
        SELECT @inicio=${n.modelo==='NFCE'?'PROXIMO_NUMERO_NFCE':'PROXIMO_NUMERO_NFE'} FROM CONFIG_FISCAL_LOJA WITH(UPDLOCK,HOLDLOCK) WHERE LOJA_ID=@loja;
        IF @inicio IS NULL THROW 50001, 'Configuração fiscal não encontrada.', 1;
        MERGE FISCAL_SEFAZ_SEQUENCIAS WITH(HOLDLOCK) AS t
        USING(SELECT @cnpj CNPJ,@amb AMBIENTE,@modelo MODELO,@serie SERIE) s ON t.CNPJ=s.CNPJ AND t.AMBIENTE=s.AMBIENTE AND t.MODELO=s.MODELO AND t.SERIE=s.SERIE
        WHEN NOT MATCHED THEN INSERT(CNPJ,AMBIENTE,MODELO,SERIE,PROXIMO) VALUES(@cnpj,@amb,@modelo,@serie,@inicio)
        WHEN MATCHED AND t.PROXIMO<@inicio THEN UPDATE SET PROXIMO=@inicio;
        IF EXISTS(SELECT 1 FROM FISCAL_SEFAZ_SEQUENCIAS WHERE CNPJ=@cnpj AND AMBIENTE=@amb AND MODELO=@modelo AND SERIE=@serie AND PROXIMO>999999999)
          THROW 50002, 'Numeração fiscal esgotada nesta série.', 1;
        UPDATE FISCAL_SEFAZ_SEQUENCIAS SET PROXIMO=PROXIMO+1 OUTPUT DELETED.PROXIMO AS NUMERO WHERE CNPJ=@cnpj AND AMBIENTE=@amb AND MODELO=@modelo AND SERIE=@serie;
      `);
    n.numero=contador.recordset[0].NUMERO;
    await salvarNota(n,tx);
    await tx.commit();
  } catch(err) {await tx.rollback();throw err;}
}
export async function obterDocumento(ref:string,lojaId:string):Promise<DocumentoSefaz|null> {
  await prepararTabelasSefaz();
  const r=await pool.request().input('ref',mssql.VarChar,ref).input('loja',mssql.VarChar,lojaId).query('SELECT CONTEUDO FROM FISCAL_SEFAZ_DOCUMENTOS WHERE REF=@ref AND LOJA_ID=@loja');
  return r.recordset[0]?JSON.parse(decifrar(r.recordset[0].CONTEUDO)):null;
}
export async function salvarDocumento(doc:DocumentoSefaz) {
  await prepararTabelasSefaz();
  await pool.request().input('ref',mssql.VarChar,doc.ref).input('loja',mssql.VarChar,doc.lojaId).input('amb',mssql.VarChar,doc.ambiente).input('fase',mssql.VarChar,doc.fase).input('chave',mssql.VarChar,doc.chave).input('conteudo',mssql.NVarChar(mssql.MAX),cifrar(JSON.stringify(doc)))
    .query(`MERGE FISCAL_SEFAZ_DOCUMENTOS WITH(HOLDLOCK) t USING(SELECT @ref REF) s ON t.REF=s.REF
      WHEN MATCHED AND t.LOJA_ID=@loja AND t.CHAVE=@chave AND t.AMBIENTE=@amb AND (t.FASE NOT IN('AUTORIZADO','REJEITADO') OR @fase='AUTORIZADO' OR (t.FASE='REJEITADO' AND @fase='REJEITADO')) THEN UPDATE SET CONTEUDO=@conteudo, FASE=@fase, ATUALIZADO_EM=SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT(REF,LOJA_ID,AMBIENTE,FASE,CHAVE,CONTEUDO) VALUES(@ref,@loja,@amb,@fase,@chave,@conteudo);`);
}
export interface EventoSefaz {id:string;lojaId:string;xml:string;resposta?:string;autorizado?:boolean;mensagem?:string;protocolo?:string;chave?:string;tipo:string}
export async function salvarEvento(e:EventoSefaz) {
  await prepararTabelasSefaz();
  await pool.request().input('id',mssql.VarChar,e.id).input('loja',mssql.VarChar,e.lojaId).input('conteudo',mssql.NVarChar(mssql.MAX),cifrar(JSON.stringify(e)))
    .query(`MERGE FISCAL_SEFAZ_EVENTOS WITH(HOLDLOCK) t USING(SELECT @id ID,@loja LOJA_ID) s ON t.ID=s.ID AND t.LOJA_ID=s.LOJA_ID
      WHEN MATCHED THEN UPDATE SET CONTEUDO=@conteudo, ATUALIZADO_EM=SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT(ID,LOJA_ID,CONTEUDO) VALUES(@id,@loja,@conteudo);`);
}
export async function obterEvento(id:string,lojaId:string):Promise<EventoSefaz|null> {
  await prepararTabelasSefaz();
  const r=await pool.request().input('id',mssql.VarChar,id).input('loja',mssql.VarChar,lojaId).query('SELECT CONTEUDO FROM FISCAL_SEFAZ_EVENTOS WHERE ID=@id AND LOJA_ID=@loja');
  return r.recordset[0]?JSON.parse(decifrar(r.recordset[0].CONTEUDO)):null;
}

export async function listarEventosSefaz(lojaId:string,chave?:string) {
  await prepararTabelasSefaz();
  const r=await pool.request().input('loja',mssql.VarChar,lojaId).query('SELECT TOP 250 CONTEUDO,ATUALIZADO_EM FROM FISCAL_SEFAZ_EVENTOS WHERE LOJA_ID=@loja ORDER BY ATUALIZADO_EM DESC');
  return r.recordset.map(row=>({evento:JSON.parse(decifrar(row.CONTEUDO)) as EventoSefaz,data:row.ATUALIZADO_EM})).filter(({evento})=>!chave||evento.chave===chave).map(({evento:e,data})=>({id:e.id,tipo:e.tipo,autorizado:!!e.autorizado,mensagem:e.mensagem,protocolo:e.protocolo,atualizadoEm:data}));
}
export async function proximosNumerosSefaz(config:ConfigFiscalLoja) {
  await prepararTabelasSefaz();
  const r=await pool.request().input('cnpj',mssql.VarChar,config.cnpj).input('amb',mssql.VarChar,config.ambiente).input('nfce',mssql.Int,config.serieNfce).input('nfe',mssql.Int,config.serieNfe)
    .query("SELECT MODELO,PROXIMO FROM FISCAL_SEFAZ_SEQUENCIAS WHERE CNPJ=@cnpj AND AMBIENTE=@amb AND ((MODELO='NFCE' AND SERIE=@nfce) OR (MODELO='NFE' AND SERIE=@nfe))");
  return {proximoNumeroNfce:Math.max(config.proximoNumeroNfce,r.recordset.find(row=>row.MODELO==='NFCE')?.PROXIMO||1),proximoNumeroNfe:Math.max(config.proximoNumeroNfe,r.recordset.find(row=>row.MODELO==='NFE')?.PROXIMO||1)};
}

export async function reservarFaixaInutilizacao(p:{cnpj:string;ambiente:AmbienteFiscal;modelo:ModeloNota;serie:number;inicio:number;fim:number;ano:number}) {
  await prepararTabelasSefaz();
  const tx=new mssql.Transaction(pool);await tx.begin(mssql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    // SQL Server 2014 também é suportado: não usa JSON_VALUE no snapshot da nota.
    const notas=await new mssql.Request(tx).input('amb',mssql.VarChar,p.ambiente).input('modelo',mssql.VarChar,p.modelo).input('serie',mssql.Int,p.serie).input('inicio',mssql.Int,p.inicio).input('fim',mssql.Int,p.fim)
      .query(`SELECT DADOS FROM NOTAS_FISCAIS WITH(UPDLOCK,HOLDLOCK) WHERE AMBIENTE=@amb AND MODELO=@modelo AND SERIE=@serie AND NUMERO BETWEEN @inicio AND @fim AND PROVEDOR<>'MOCK' AND STATUS NOT IN('ERRO','REJEITADA')`);
    if(notas.recordset.some(row=>JSON.parse(row.DADOS).emitente.cnpj===p.cnpj)) throw new Error('A faixa contém nota autorizada, cancelada ou pendente. Consulte os documentos antes de inutilizar.');
    await new mssql.Request(tx).input('cnpj',mssql.VarChar,p.cnpj).input('amb',mssql.VarChar,p.ambiente).input('modelo',mssql.VarChar,p.modelo).input('serie',mssql.Int,p.serie).input('inicio',mssql.Int,p.inicio).input('fim',mssql.Int,p.fim).input('ano',mssql.VarChar,String(p.ano)).query(`
      MERGE FISCAL_SEFAZ_SEQUENCIAS WITH(HOLDLOCK) t USING(SELECT @cnpj CNPJ,@amb AMBIENTE,@modelo MODELO,@serie SERIE) s ON t.CNPJ=s.CNPJ AND t.AMBIENTE=s.AMBIENTE AND t.MODELO=s.MODELO AND t.SERIE=s.SERIE
      WHEN NOT MATCHED THEN INSERT(CNPJ,AMBIENTE,MODELO,SERIE,PROXIMO) VALUES(@cnpj,@amb,@modelo,@serie,@fim+1)
      WHEN MATCHED AND PROXIMO<=@fim THEN UPDATE SET PROXIMO=@fim+1;
    `);
    await tx.commit();
  } catch(err) {await tx.rollback();throw err;}
}
