import { Router } from 'express';
import { lojas } from '../tenants';
import { verificarSessao, obterSessaoDoRequest, lojaBloqueadaFinanceiro } from '../auth';
import { pool } from '../database';
import mssql from '../db';
import { asyncHandler } from '../http/asyncHandler';

/** Pix direto da plataforma: chave configurada, confirmação administrativa de recebimento. */
export function meiosPagamento(fatura: any) {
  const valor=Number(fatura.VALOR_BRUTO)-Number(fatura.VALOR_DESCONTO);
  if (!['PENDENTE','ATRASADA','VENCIDA'].includes(fatura.STATUS) || !Number.isFinite(valor) || valor<=0) return {};
  const chave = (process.env.PIX_PLATAFORMA_CHAVE || '').trim();
  // Apenas chave aleatória nesta etapa; sem boleto, QR fictício ou confirmação automática.
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(chave)) return {};
  return { pixChave:chave, confirmacaoPagamento:'MANUAL' as const };
}

const router = Router();
router.get('/', verificarSessao, asyncHandler(async (req,res) => {
  const sessao = obterSessaoDoRequest(req)!;
  if(sessao.tipo!=='loja') { res.status(403).json({error:'Cobranças disponíveis na conta da loja.'}); return; }
  const loja=lojas.find(l=>l.id===sessao.lojaId)!;
  // O escopo vem da sessão, nunca de lojaId/empresaId informados pelo cliente.
  const result=await pool.request().input('empresa',mssql.VarChar,loja.empresaId).input('loja',mssql.VarChar,loja.id).query(`
    SELECT F.*, COALESCE(F.LOJA_ID,A.LOJA_ID) AS ESCOPO_LOJA FROM FATURAS F
    LEFT JOIN ASSINATURAS_EMPRESAS A ON A.ID=F.ASSINATURAS_EMPRESAS_ID
    WHERE F.EMPRESA_ID=@empresa AND (F.LOJA_ID=@loja OR (F.LOJA_ID IS NULL AND (A.LOJA_ID=@loja OR A.LOJA_ID IS NULL)))
    ORDER BY CASE WHEN F.STATUS IN ('PENDENTE','ATRASADA','VENCIDA') THEN 0 ELSE 1 END, F.DATA_VENCIMENTO DESC`);
  res.json({operacaoBloqueada:lojaBloqueadaFinanceiro(loja),nomeLoja:loja.nome,faturas:result.recordset.map((f:any)=>({
    id:f.ID,escopo:f.ESCOPO_LOJA?'LOJA':'REDE',referencia:f.REFERENCIA_MES_ANO,valor:Number(f.VALOR_BRUTO)-Number(f.VALOR_DESCONTO),status:f.STATUS,
    vencimento:f.DATA_VENCIMENTO,pagamento:f.DATA_PAGAMENTO,...meiosPagamento(f)
  }))});
}));
export default router;
