import { Router } from 'express';
import mssql, { Transaction } from './db';
import { pool } from './database';
import { transacao } from './estoque';
import { obterSessaoDoRequest, verificarSessao } from './auth';
import { lojas } from './tenants';
import { asyncHandler } from './http/asyncHandler';
export const IMPLANTACAO_SCHEMA = `
IF OBJECT_ID('IMPLANTACAO_LOJAS','U') IS NULL CREATE TABLE IMPLANTACAO_LOJAS (
 LOJA_ID VARCHAR(100) PRIMARY KEY, ACOLHIDO_EM DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
 PASSOS_CONCLUIDOS INT NOT NULL DEFAULT 0 CHECK(PASSOS_CONCLUIDOS BETWEEN 0 AND 7), CONCLUIDO_EM DATETIME2 NULL);
IF OBJECT_ID('IMPLANTACAO_ETAPAS','U') IS NULL CREATE TABLE IMPLANTACAO_ETAPAS (
 LOJA_ID VARCHAR(100) NOT NULL, PASSO INT NOT NULL CHECK(PASSO BETWEEN 1 AND 7),
 MODALIDADE VARCHAR(50) NOT NULL, AUTOR NVARCHAR(200) NOT NULL, EVIDENCIA NVARCHAR(MAX) NOT NULL,
 CONCLUIDO_EM DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(), PRIMARY KEY(LOJA_ID,PASSO));`;
export async function inicializarImplantacao() { await pool.request().query(IMPLANTACAO_SCHEMA); }
const titles=['Como Cadastrar e Estruturar Produtos','Importação de Produtos','Gestão de Estoque Inicial','Importação de Estoque','Imagens para o E-commerce','Operação e PDV','Go-Live'];
export class ErroImplantacao extends Error { constructor(message:string,public status=409){super(message);} }
async function evidence(lojaId:string,tx?:Transaction){
 const r=await (tx?new mssql.Request(tx):pool.request()).input('loja',mssql.VarChar(100),lojaId).query(`
 SELECT COUNT(*) produtos,COALESCE(SUM(CASE WHEN s.PRODUTO_ID IS NOT NULL THEN 1 ELSE 0 END),0) comEstoque,
 COALESCE(SUM(CASE WHEN NULLIF(LTRIM(RTRIM(p.IMAGEM_URL)),'') IS NOT NULL THEN 1 ELSE 0 END),0) comImagem
 FROM PRODUTOS p LEFT JOIN ESTOQUE_SALDOS s ON s.LOJA_ID=p.LOJA_ID AND s.PRODUTO_ID=p.ID WHERE p.LOJA_ID=@loja AND p.ATIVO=1;
 SELECT COUNT(*) operacoes FROM ENTREGAS WHERE LOJA_ID=@loja;`);
 const sets=r.recordsets as any[];return {...sets[0][0],operacoes:sets[1][0].operacoes};
}
export async function lerImplantacao(lojaId:string){
 const r=await pool.request().input('loja',mssql.VarChar(100),lojaId).query(`SELECT * FROM IMPLANTACAO_LOJAS WHERE LOJA_ID=@loja;
 SELECT PASSO passo,MODALIDADE modalidade,AUTOR autor,CONCLUIDO_EM concluidoEm FROM IMPLANTACAO_ETAPAS WHERE LOJA_ID=@loja ORDER BY PASSO`);
 const sets=r.recordsets as any[];const row=sets[0][0],stats=await evidence(lojaId),completed=row?.PASSOS_CONCLUIDOS||0;
 const loja=lojas.find(l=>l.id===lojaId);
 return {lojaId,nomeLoja:loja?.nome,recebePedidos:!!loja?.recebePedidos,completed,percent:Math.round(completed/7*100),
 currentTitle:completed===7?'Implantação concluída':titles[completed],startedAt:row?.ACOLHIDO_EM||null,completedAt:row?.CONCLUIDO_EM||null,
 needsWelcome:!row&&stats.produtos===0&&stats.operacoes===0,stats,history:sets[1],conteudosDisponiveis:true};
}
export async function iniciarImplantacao(lojaId:string){
 await transacao(async tx=>{await new mssql.Request(tx).input('loja',mssql.VarChar(100),lojaId).query(`
 IF NOT EXISTS(SELECT 1 FROM IMPLANTACAO_LOJAS WITH(UPDLOCK,HOLDLOCK) WHERE LOJA_ID=@loja)
 INSERT INTO IMPLANTACAO_LOJAS(LOJA_ID) VALUES(@loja)`);});return lerImplantacao(lojaId);
}
export async function concluirEtapa(lojaId:string,passo:number,confirmacao:boolean,autor:string){
 if(!Number.isInteger(passo)||passo<1||passo>7)throw new ErroImplantacao('Etapa inválida.',400);
 if(confirmacao!==true)throw new ErroImplantacao('Confirme a revisão desta etapa.',400);
 await transacao(async tx=>{
  const r=await new mssql.Request(tx).input('loja',mssql.VarChar(100),lojaId).query('SELECT PASSOS_CONCLUIDOS FROM IMPLANTACAO_LOJAS WITH(UPDLOCK,HOLDLOCK) WHERE LOJA_ID=@loja');
  if(!r.recordset.length)throw new ErroImplantacao('Inicie a implantação antes de concluir etapas.');
  const count=r.recordset[0].PASSOS_CONCLUIDOS;if(passo<=count)return;
  if(passo!==count+1)throw new ErroImplantacao('Conclua a etapa anterior primeiro.');
  const stats=await evidence(lojaId,tx);
  if(passo===7&&['SUSPENSO','CANCELADO'].includes(lojas.find(l=>l.id===lojaId)?.statusFinanceiro||''))throw new ErroImplantacao('Regularize o acesso da loja antes de confirmar o início da operação.');
  // Os indicadores ficam no histórico; a confirmação da loja permite avançar com tarefas pendentes.
  const mode=[1,3,6].includes(passo)?'conhecimento_previo_confirmado':passo===7?'aceite_operacional':'confirmacao_da_loja';
  await new mssql.Request(tx).input('loja',mssql.VarChar(100),lojaId).input('passo',mssql.Int,passo).input('modo',mssql.VarChar(50),mode)
   .input('autor',mssql.NVarChar(200),autor).input('evidencia',mssql.NVarChar,JSON.stringify(stats)).query(`
   INSERT INTO IMPLANTACAO_ETAPAS(LOJA_ID,PASSO,MODALIDADE,AUTOR,EVIDENCIA) VALUES(@loja,@passo,@modo,@autor,@evidencia);
   UPDATE IMPLANTACAO_LOJAS SET PASSOS_CONCLUIDOS=@passo,CONCLUIDO_EM=CASE WHEN @passo=7 THEN SYSUTCDATETIME() ELSE NULL END WHERE LOJA_ID=@loja`);
 });return lerImplantacao(lojaId);
}
const router=Router();router.use(verificarSessao);
/** Indicadores somente de consulta; pagamento registrado não comprova a data de liberação do acesso. */
export async function lerIndicadoresImplantacao(){
 const r=await pool.request().query(`
 SELECT l.ID lojaId,e.NOME empresaNome,e.TELEFONE telefone,e.EMAIL email,l.STATUS_FINANCEIRO statusFinanceiro,
 primeira.ID primeiroPagamentoFaturaId,primeira.DATA_PAGAMENTO primeiroPagamentoEm,primeira.DATA_VENCIMENTO primeiroPagamentoVencimento,
 CASE WHEN COALESCE(primeira.LOJA_ID,primeira.assinaturaLoja) IS NULL THEN 'empresa' ELSE 'loja' END pagamentoEscopo,
 ultima.DATA_PAGAMENTO ultimoPagamentoEm,
 fat.ID faturaId,fat.STATUS faturaStatus,fat.DATA_VENCIMENTO faturaVencimento,fat.DATA_PAGAMENTO faturaPagamentoEm,
 fat.VALOR_BRUTO-fat.VALOR_DESCONTO faturaValor,
 CASE WHEN COALESCE(fat.LOJA_ID,fat.assinaturaLoja) IS NULL THEN 'empresa' ELSE 'loja' END faturaEscopo,
 uso.ultimaOperacaoEm,uso.comandas30Dias,etapa.ultimaEtapaEm,
 catalogo.ultimaAlteracaoCatalogoEm
 FROM LOJAS l JOIN EMPRESAS e ON e.ID=l.EMPRESA_ID
 OUTER APPLY (SELECT TOP(1) f.*,a.LOJA_ID assinaturaLoja FROM FATURAS f LEFT JOIN ASSINATURAS_EMPRESAS a ON a.ID=f.ASSINATURAS_EMPRESAS_ID
 WHERE f.EMPRESA_ID=l.EMPRESA_ID AND (COALESCE(f.LOJA_ID,a.LOJA_ID)=l.ID OR COALESCE(f.LOJA_ID,a.LOJA_ID) IS NULL)
 AND f.STATUS='PAGA' AND TRY_CONVERT(datetimeoffset,f.DATA_PAGAMENTO) IS NOT NULL
 ORDER BY TRY_CONVERT(datetimeoffset,f.DATA_PAGAMENTO),f.ID) primeira
 OUTER APPLY (SELECT TOP(1) f.DATA_PAGAMENTO FROM FATURAS f LEFT JOIN ASSINATURAS_EMPRESAS a ON a.ID=f.ASSINATURAS_EMPRESAS_ID
 WHERE f.EMPRESA_ID=l.EMPRESA_ID AND (COALESCE(f.LOJA_ID,a.LOJA_ID)=l.ID OR COALESCE(f.LOJA_ID,a.LOJA_ID) IS NULL)
 AND f.STATUS='PAGA' AND TRY_CONVERT(datetimeoffset,f.DATA_PAGAMENTO) IS NOT NULL
 ORDER BY TRY_CONVERT(datetimeoffset,f.DATA_PAGAMENTO) DESC,f.ID) ultima
 OUTER APPLY (SELECT TOP(1) f.*,a.LOJA_ID assinaturaLoja FROM FATURAS f LEFT JOIN ASSINATURAS_EMPRESAS a ON a.ID=f.ASSINATURAS_EMPRESAS_ID
 WHERE f.EMPRESA_ID=l.EMPRESA_ID AND (COALESCE(f.LOJA_ID,a.LOJA_ID)=l.ID OR COALESCE(f.LOJA_ID,a.LOJA_ID) IS NULL)
 AND f.STATUS IN ('PENDENTE','VENCIDA','ATRASADA','PAGA')
 ORDER BY CASE WHEN f.STATUS='PAGA' THEN 1 ELSE 0 END,
 CASE WHEN f.STATUS<>'PAGA' THEN TRY_CONVERT(datetimeoffset,f.DATA_VENCIMENTO) END,
 TRY_CONVERT(datetimeoffset,f.DATA_VENCIMENTO) DESC,f.ID) fat
 OUTER APPLY (SELECT MAX(TRY_CONVERT(datetimeoffset,ATUALIZADO_EM)) ultimaOperacaoEm,
 COUNT(CASE WHEN TRY_CONVERT(datetimeoffset,CRIADO_EM)>=DATEADD(day,-30,SYSUTCDATETIME()) AND (TIPO_COMANDA='pedido' OR PEDIDO_ORIGEM_ID IS NULL) THEN 1 END) comandas30Dias
 FROM ENTREGAS WHERE LOJA_ID=l.ID) uso
 OUTER APPLY (SELECT MAX(CONCLUIDO_EM) ultimaEtapaEm FROM IMPLANTACAO_ETAPAS WHERE LOJA_ID=l.ID) etapa
 OUTER APPLY (SELECT MAX(CRIADO_EM) ultimaAlteracaoCatalogoEm FROM PRODUTOS_HISTORICO WHERE LOJA_ID=l.ID) catalogo`);
 return r.recordset;
}
router.get('/admin',asyncHandler(async(req,res)=>{
 if(obterSessaoDoRequest(req)?.tipo!=='admin'){res.status(403).json({error:'Acesso administrativo necessário.'});return;}
 const indicators=new Map((await lerIndicadoresImplantacao()).map(r=>[r.lojaId,r]));
 res.json(await Promise.all(lojas.map(async l=>({...await lerImplantacao(l.id),empresaId:l.empresaId,ativo:l.ativo,acompanhamento:indicators.get(l.id)||null}))));
}));
router.use(asyncHandler(async(req,res,next)=>{
 const s=obterSessaoDoRequest(req)!;const id=s.tipo==='loja'?s.lojaId:String(req.query.lojaId||'');
 if(!lojas.some(l=>l.id===id&&l.ativo)){res.status(404).json({error:'Loja não encontrada.'});return;}
 res.locals.lojaId=id;next();
}));
router.get('/',asyncHandler(async(_req,res)=>{res.json(await lerImplantacao(res.locals.lojaId));}));
router.post('/inicio',asyncHandler(async(_req,res)=>{res.json(await iniciarImplantacao(res.locals.lojaId));}));
router.post('/etapas/:passo',asyncHandler(async(req,res)=>{
 try{const s=obterSessaoDoRequest(req)!;res.json(await concluirEtapa(res.locals.lojaId,Number(req.params.passo),req.body?.confirmacao,`${s.tipo}:${s.tipo==='loja'?s.lojaId:'administrador'}`));}
 catch(e){if(e instanceof ErroImplantacao){res.status(e.status).json({error:e.message});return;}throw e;}
}));
export default router;
