import {diaCobranca,proximoMes} from './billingPolicy';
import crypto from 'crypto';
import mssql from '../db';
import { pool } from '../database';
import { getGateway } from './gatewayFactory';
import { appendLedger } from './ledgerService';
import { meiosPagamento } from './clientBilling';

// Criação de assinatura POR LOJA + primeira fatura. Usado pelo cadastro de loja
// (tenants.ts). Mantém a regra de billing no módulo billing — tenants não toca
// em pool/mssql/gateway diretamente.

export async function criarAssinaturaComPrimeiraFatura(opts: {
  empresaId: string;
  lojaId: string;
  planoId: string;
  diaVencimento?: number;
  aguardarPrimeiroPagamento?: boolean;
  trialDias?: number;
}): Promise<{
  assinaturaId: string;
  faturaId: string;
  valor: number;
  planoNome: string;
  vencimento: string;
  gatewayFaturaId: string;
  boletoUrl?: string;
  pixCopiaCola?: string;
  linkPagamento?: string;
  pixChave?: string;
  trialExpiraEm?: string;
}> {
  if (!pool) throw new Error('Banco indisponível');

  const net=(await pool.request().input('emp',mssql.VarChar,opts.empresaId).query("SELECT TOP(1) s.*,p.NOME PlanoNome,p.VALOR_MENSAL FROM ASSINATURAS_EMPRESAS s JOIN PLANOS p ON p.ID=s.PLANO_ID WHERE s.EMPRESA_ID=@emp AND s.LOJA_ID IS NULL AND s.STATUS<>'CANCELADA' ORDER BY s.CRIADO_EM DESC")).recordset[0];
  if(net)return {assinaturaId:net.ID,faturaId:'',valor:Number(net.VALOR_PERSONALIZADO??net.VALOR_MENSAL),planoNome:net.PlanoNome,vencimento:net.PROXIMO_FATURAMENTO||'',gatewayFaturaId:''};
  // Valida o plano (precisa existir e estar ativo).
  const planoRes = await pool.request()
    .input('id', mssql.VarChar, opts.planoId)
    .query('SELECT * FROM PLANOS WHERE ID = @id AND ATIVO = 1');
  if (planoRes.recordset.length === 0) {
    throw new Error('Plano inválido ou inativo');
  }
  const plano = planoRes.recordset[0];
  const valor = Number(plano.VALOR_MENSAL);
  if(!Number.isFinite(valor)||valor<=0)throw new Error('O plano precisa ter uma mensalidade válida. Contate a administração.');
  const dia = opts.diaVencimento && opts.diaVencimento >= 1 && opts.diaVencimento <= 28 ? opts.diaVencimento : 10;

  const agora = new Date();
  const agoraIso = agora.toISOString();
  const trialExpiraEm = opts.trialDias === 7 ? new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString() : undefined;

  // Cadastro público permanece pendente até a confirmação do recebimento.
  const assinaturaId = `sub-${crypto.randomUUID().substring(0, 8)}`;
  const hoje=diaCobranca();let vencIso=hoje.slice(0,8)+String(dia).padStart(2,'0');if(vencIso<hoje)vencIso=proximoMes(vencIso,dia);if(trialExpiraEm)vencIso=diaCobranca(trialExpiraEm);
  const proximoFat=proximoMes(vencIso,dia);
  // Primeira fatura PENDENTE: vence no dia escolhido (deste mês se ainda não passou; senão, do próximo).
  const refMesAno = vencIso.slice(5,7)+'/'+vencIso.slice(0,4);
  const faturaId = `fat-${crypto.randomUUID().substring(0, 8)}`;

  const pixChave = opts.aguardarPrimeiroPagamento ? meiosPagamento({STATUS:'PENDENTE',VALOR_BRUTO:valor,VALOR_DESCONTO:0}).pixChave : undefined;
  if(opts.aguardarPrimeiroPagamento && !pixChave && (process.env.PAYMENT_GATEWAY||'MOCK').toUpperCase() !== 'ASAAS') throw new Error('O pagamento da plataforma ainda não está configurado. Contate a administração.');
  const cobranca = pixChave ? {gatewayFaturaId: `manual_${faturaId}`, boletoUrl: undefined, pixCopiaCola: undefined, linkPagamento: undefined} : await getGateway().criarCobranca({
    empresaId: opts.empresaId,
    faturaId,
    valor,
    vencimento: vencIso,
    metodo: 'PIX',
    descricao: `Mensalidade ${plano.NOME} ${refMesAno}`,
  });

  const tx = new mssql.Transaction(pool);
  await tx.begin();
  try {
  await tx.request()
    .input('id', mssql.VarChar, assinaturaId)
    .input('empId', mssql.VarChar, opts.empresaId)
    .input('lojaId', mssql.VarChar, opts.lojaId)
    .input('planoId', mssql.VarChar, opts.planoId)
    .input('valorContrato',mssql.Decimal(10,2),valor)
    .input('dia', mssql.Int, dia)
    .input('criado', mssql.VarChar, agoraIso)
    .input('proximo', mssql.VarChar, proximoFat)
    .input('status', mssql.VarChar, trialExpiraEm ? 'TRIAL' : opts.aguardarPrimeiroPagamento ? 'PENDENTE' : 'ATIVA')
    .input('trial', mssql.VarChar, trialExpiraEm || null)
    .query(`INSERT INTO ASSINATURAS_EMPRESAS (ID, EMPRESA_ID, LOJA_ID, PLANO_ID, STATUS, VALOR_PERSONALIZADO, DIA_VENCIMENTO, CRIADO_EM, PROXIMO_FATURAMENTO, TRIAL_EXPIRA_EM)
            VALUES (@id, @empId, @lojaId, @planoId, @status, @valorContrato, @dia, @criado, @proximo, @trial)`);

  await tx.request()
    .input('id', mssql.VarChar, faturaId)
    .input('empId', mssql.VarChar, opts.empresaId)
    .input('lojaId', mssql.VarChar, opts.lojaId)
    .input('subId', mssql.VarChar, assinaturaId)
    .input('valor', mssql.Decimal(10, 2), valor)
    .input('emissao', mssql.VarChar, agoraIso)
    .input('venc', mssql.VarChar, vencIso)
    .input('ref', mssql.VarChar, refMesAno)
    .input('boleto', mssql.NVarChar, cobranca.boletoUrl ?? null)
    .input('pix', mssql.NVarChar, cobranca.pixCopiaCola ?? null)
    .input('gw', mssql.VarChar, cobranca.gatewayFaturaId)
    .input('criado', mssql.VarChar, agoraIso)
    .query(`INSERT INTO FATURAS
              (ID, EMPRESA_ID, LOJA_ID, ASSINATURAS_EMPRESAS_ID, VALOR_BRUTO, VALOR_DESCONTO, STATUS, DATA_EMISSAO, DATA_VENCIMENTO, REFERENCIA_MES_ANO, BOLETO_URL, PIX_COPIA_COLA, GATEWAY_FATURA_ID, CRIADO_EM)
            VALUES (@id, @empId, @lojaId, @subId, @valor, 0.00, 'PENDENTE', @emissao, @venc, @ref, @boleto, @pix, @gw, @criado)`);

  // Trilha de auditoria: abertura da assinatura/fatura da loja.
  await appendLedger({
    empresaId: opts.empresaId,
    assinaturaId,
    faturaId,
    tipo: 'ABERTURA',
    valor,
    origem: 'MANUAL_ADMIN',
    metadados: { evento: 'cadastro_loja', lojaId: opts.lojaId, planoId: opts.planoId },
    criadoPor: opts.aguardarPrimeiroPagamento ? 'CADASTRO_PUBLICO' : 'ADMIN',
  }, tx);
  if(trialExpiraEm)await tx.request().input('id',mssql.VarChar,opts.lojaId).query("UPDATE LOJAS SET STATUS_FINANCEIRO='REGULAR' WHERE ID=@id");
  await tx.commit();
  } catch (error) {
    await tx.rollback();
    if(!pixChave)await getGateway().cancelarCobranca(cobranca.gatewayFaturaId).catch(()=>{});
    throw error;
  }

  return {
    assinaturaId,
    faturaId,
    valor,
    planoNome: plano.NOME,
    vencimento: vencIso,
    gatewayFaturaId: cobranca.gatewayFaturaId,
    boletoUrl: cobranca.boletoUrl,
    pixCopiaCola: cobranca.pixCopiaCola,
    linkPagamento: cobranca.linkPagamento,
    pixChave,
    trialExpiraEm,
  };
}

/** Lista os planos ativos com campos públicos (para a página de preços / signup). */
export async function listarPlanosAtivos(): Promise<Array<{
  id: string; nome: string; descricao: string; valorMensal: number;
  limiteEntregasMes: number | null; limiteLojas: number | null; limiteMotoristas: number | null;
}>> {
  if (!pool) return [];
  const r = await pool.request().query('SELECT * FROM PLANOS WHERE ATIVO = 1 ORDER BY VALOR_MENSAL');
  return r.recordset.map((p: any) => ({
    id: p.ID,
    nome: p.NOME,
    descricao: p.DESCRICAO || '',
    valorMensal: Number(p.VALOR_MENSAL),
    limiteEntregasMes: p.LIMITE_ENTREGAS_MES ?? null,
    limiteLojas: p.LIMITE_LOJAS ?? null,
    limiteMotoristas: p.LIMITE_MOTORISTAS ?? null,
  }));
}
