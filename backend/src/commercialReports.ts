import { asyncHandler } from './http/asyncHandler';
import { Router, Request, Response } from 'express';
import mssql from './db';
import { pool } from './database';
import { verificarAdmin } from './auth';
import { buildCommercialReport, parseReportFilter, reportWindow, type ReportOrder, type ReportItem, type ReportCatalog, type ReportMovement, type ReportStore } from './commercialAnalytics';
const router = Router();
router.use(verificarAdmin);
export async function readCommercialReport(query: Record<string, unknown>) {
  const filter = parseReportFilter(query), window = reportWindow(filter);
  if (!pool) throw Error('Banco de dados indisponível.');
  const result = await pool.request().input('start',mssql.DateTime2,new Date(window.previousStart)).input('currentStart',mssql.DateTime2,new Date(window.start)).input('end',mssql.DateTime2,new Date(window.endExclusive)).input('company',mssql.VarChar(100),filter.companyId).input('store',mssql.VarChar(100),filter.storeId).query(`
    IF OBJECT_ID('tempdb..#ReportOrders') IS NOT NULL DROP TABLE #ReportOrders;
    SELECT TOP (50001) e.ID id,e.LOJA_ID storeId,COALESCE(l.NOME,e.NOME_LOJA,'Loja removida') storeName,
      COALESCE(c.NOME,e.NOME_EMPRESA,'Empresa removida') companyName,e.CRIADO_EM createdAt,e.STATUS status,e.VALOR value,e.FORMA_PAGAMENTO payment
    INTO #ReportOrders FROM ENTREGAS e LEFT JOIN LOJAS l ON l.ID=e.LOJA_ID LEFT JOIN EMPRESAS c ON c.ID=l.EMPRESA_ID
    WHERE CAST(SWITCHOFFSET(TRY_CONVERT(datetimeoffset,e.CRIADO_EM,127),'+00:00') AS datetime2)>=@start
      AND CAST(SWITCHOFFSET(TRY_CONVERT(datetimeoffset,e.CRIADO_EM,127),'+00:00') AS datetime2)<@end
      AND e.LOJA_ID IS NOT NULL AND (@store='' OR e.LOJA_ID=@store) AND (@company='' OR l.EMPRESA_ID=@company);
    SELECT * FROM #ReportOrders;
    SELECT TOP (250001) i.PEDIDO_ID orderId,i.PRODUTO_ID productId,i.NOME name,i.QUANTIDADE quantity,i.PRECO price
      FROM PEDIDO_CONFERENCIA_ITENS i JOIN #ReportOrders e ON e.id=i.PEDIDO_ID;
    SELECT TOP (50001) l.ID storeId,l.NOME storeName,p.ID productId,p.NOME name,COALESCE(p.CODIGO_INTERNO,p.ID) sku,
      COALESCE(p.CATEGORIA,'Sem categoria') category,COALESCE(p.UNIDADE,'Não informada') unit,
      CAST(CASE WHEN p.ATIVO=1 AND p.SITUACAO='ativo' THEN 1 ELSE 0 END AS BIT) active,
      s.SALDO balance,p.DADOS_CATALOGO catalogData,CONVERT(varchar(33),h.trackedSince,126)+'Z' trackedSince
      FROM LOJAS l JOIN PRODUTOS p ON p.LOJA_ID=l.ID OR p.LOJA_ID IS NULL
      LEFT JOIN ESTOQUE_SALDOS s ON s.LOJA_ID=l.ID AND s.PRODUTO_ID=p.ID
      LEFT JOIN (SELECT LOJA_ID,PRODUTO_ID,MIN(CRIADO_EM) trackedSince FROM ESTOQUE_MOVIMENTOS GROUP BY LOJA_ID,PRODUTO_ID) h ON h.LOJA_ID=l.ID AND h.PRODUTO_ID=p.ID
      WHERE (@store='' OR l.ID=@store) AND (@company='' OR l.EMPRESA_ID=@company);
    SELECT TOP (100001) m.LOJA_ID storeId,m.PRODUTO_ID productId,m.TIPO type,m.QUANTIDADE quantity
      FROM ESTOQUE_MOVIMENTOS m LEFT JOIN LOJAS l ON l.ID=m.LOJA_ID WHERE m.CRIADO_EM>=@currentStart AND m.CRIADO_EM<@end
      AND (@store='' OR m.LOJA_ID=@store) AND (@company='' OR l.EMPRESA_ID=@company);
    SELECT l.ID id,l.NOME name,c.ID companyId,c.NOME companyName FROM LOJAS l JOIN EMPRESAS c ON c.ID=l.EMPRESA_ID ORDER BY c.NOME,l.NOME;
    DROP TABLE #ReportOrders;
  `);
  if (!Array.isArray(result.recordsets) || result.recordsets.length !== 5) throw Error('Resposta de relatório inválida.');
  const [orders,items,catalog,movements,stores]=result.recordsets as unknown as [ReportOrder[],ReportItem[],(Omit<ReportCatalog,'minimum'> & {catalogData:string|null})[],ReportMovement[],ReportStore[]];
  if (orders.length>50000 || movements.length>100000 || catalog.length>50000 || items.length>250000) throw Error('Volume elevado. Reduza o período ou filtre uma loja.');
  const normalizedCatalog:ReportCatalog[]=catalog.map(({catalogData,...row})=>{
    let minimum:number|null=null;
    try {const extras:unknown=JSON.parse(catalogData||'{}');if(extras&&typeof extras==='object'&&'estoqueMinimo' in extras&&typeof extras.estoqueMinimo==='number'&&Number.isFinite(extras.estoqueMinimo)&&extras.estoqueMinimo>=0)minimum=extras.estoqueMinimo;}catch{/* Cadastro antigo sem metadados válidos. */}
    return {...row,minimum};
  });
  return buildCommercialReport(filter,orders.map(row=>({...row,value:row.value==null?null:Number(row.value)})),items.map(row=>({...row,price:row.price==null?null:Number(row.price),quantity:Number(row.quantity)})),normalizedCatalog,movements,stores);
}
router.get('/comercial',asyncHandler(async(req:Request,res:Response)=>{
  try { parseReportFilter(req.query); }
  catch(error) {res.status(400).json({error:(error as Error).message});return;}
  try {res.setHeader('Cache-Control','no-store');res.json(await readCommercialReport(req.query));}
  catch(error) {console.error('[Relatórios comerciais]',(error as Error).message);res.status(503).json({error:'Não foi possível consultar o relatório. Tente novamente ou reduza o período e filtre uma loja.'});}
}));
export default router;
