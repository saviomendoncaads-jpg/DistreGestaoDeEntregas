import crypto from 'crypto';
import mssql from '../db';
import {pool} from '../database';
import {diaCobranca,proximoMes} from './billingPolicy';
import {appendLedger} from './ledgerService';
import {reconciliarAcessoCobranca,gerarMensalidades} from './recurringBilling';
export async function criarContratoRede(input:{empresaId:string;lojaId?:string;escopo:'REDE'|'LOJA';planoId:string;valor:number;primeiroVencimento:string;chave:string}){
 if(!['REDE','LOJA'].includes(input.escopo)||!Number.isFinite(input.valor)||input.valor<=0||!/^[-a-zA-Z0-9]{8,100}$/.test(input.chave||''))throw new Error('Informe modalidade, valor positivo e chave da operação');
 const due=diaCobranca(input.primeiroVencimento),day=Number(due.slice(8));if(due<diaCobranca()||day<1||day>28)throw new Error('Primeiro vencimento deve ser hoje ou futuro, entre os dias 1 e 28');
 const id='sub-'+crypto.createHash('sha256').update(input.empresaId+':'+input.chave).digest('hex').slice(0,32),fatId='fat-'+crypto.createHash('sha256').update(id).digest('hex').slice(0,32);
 await gerarMensalidades();
 const tx=new mssql.Transaction(pool);await tx.begin(mssql.ISOLATION_LEVEL.SERIALIZABLE);try{
 await tx.request().input('resource',mssql.NVarChar,'contrato:'+input.empresaId).query("DECLARE @r int; EXEC @r=sp_getapplock @Resource=@resource,@LockMode='Exclusive',@LockOwner='Transaction',@LockTimeout=10000; IF @r<0 THROW 51000,'Contrato ocupado, tente novamente',1;");
 const existing=(await tx.request().input('id',mssql.VarChar,id).query('SELECT * FROM ASSINATURAS_EMPRESAS WHERE ID=@id')).recordset[0];if(existing){if(existing.EMPRESA_ID!==input.empresaId||existing.PLANO_ID!==input.planoId||Number(existing.VALOR_PERSONALIZADO)!==input.valor||existing.LOJA_ID!==(input.escopo==='LOJA'?input.lojaId:null))throw new Error('Chave já utilizada com outro contrato');await tx.commit();return {id,faturaId:fatId,repetido:true};}
 const emp=(await tx.request().input('emp',mssql.VarChar,input.empresaId).query('SELECT ID FROM EMPRESAS WHERE ID=@emp AND ATIVO=1')).recordset[0];const plan=(await tx.request().input('id',mssql.VarChar,input.planoId).query('SELECT ID FROM PLANOS WHERE ID=@id AND ATIVO=1')).recordset[0];if(!emp||!plan)throw new Error('Empresa ou plano inválido');
 if(input.escopo==='LOJA'){if(!input.lojaId)throw new Error('Selecione a loja');const shop=(await tx.request().input('id',mssql.VarChar,input.lojaId).input('emp',mssql.VarChar,input.empresaId).query('SELECT ID FROM LOJAS WHERE ID=@id AND EMPRESA_ID=@emp AND ATIVO=1')).recordset[0];if(!shop)throw new Error('Loja não pertence à empresa');const net=(await tx.request().input('emp',mssql.VarChar,input.empresaId).query("SELECT ID FROM ASSINATURAS_EMPRESAS WHERE EMPRESA_ID=@emp AND LOJA_ID IS NULL AND STATUS<>'CANCELADA'")).recordset[0];if(net)throw new Error('Esta rede já possui contrato consolidado; não gere uma segunda mensalidade para a filial');}
 const loja=input.escopo==='LOJA'?input.lojaId!:null,now=new Date().toISOString(),ref=due.slice(5,7)+'/'+due.slice(0,4);
 const old=(await tx.request().input('emp',mssql.VarChar,input.empresaId).input('loja',mssql.VarChar,loja).query("SELECT ID FROM ASSINATURAS_EMPRESAS WHERE EMPRESA_ID=@emp AND (@loja IS NULL OR LOJA_ID=@loja) AND STATUS<>'CANCELADA'")).recordset;
 for(const sub of old){
 const future=(await tx.request().input('sub',mssql.VarChar,sub.ID).input('due',mssql.VarChar,due).query("SELECT * FROM FATURAS WHERE ASSINATURAS_EMPRESAS_ID=@sub AND TRY_CONVERT(date,DATA_VENCIMENTO)>=TRY_CONVERT(date,@due) AND STATUS IN ('PENDENTE','ATRASADA','VENCIDA','PAGA')")).recordset;
 if(future.some(f=>f.GATEWAY_FATURA_ID&&!String(f.GATEWAY_FATURA_ID).startsWith('mock_')))throw new Error('Cancele ou concilie as cobranças futuras no gateway antes de substituir o contrato');
 if(future.some(f=>f.STATUS==='PAGA'))throw new Error('Há período futuro já pago; concilie esse crédito antes de substituir o contrato');
 for(const f of future){await tx.request().input('id',mssql.VarChar,f.ID).query("UPDATE FATURAS SET STATUS='CANCELADA' WHERE ID=@id");await appendLedger({empresaId:input.empresaId,assinaturaId:sub.ID,faturaId:f.ID,tipo:'CANCELAMENTO',valor:-Number(f.VALOR_BRUTO-f.VALOR_DESCONTO),origem:'MANUAL_ADMIN',metadados:{evento:'substituicao_cobranca_futura',novoContrato:id},criadoPor:'ADMIN'},tx);}
 await tx.request().input('id',mssql.VarChar,sub.ID).input('now',mssql.VarChar,now).query("UPDATE ASSINATURAS_EMPRESAS SET STATUS='CANCELADA',CANCELADO_EM=@now WHERE ID=@id");await appendLedger({empresaId:input.empresaId,assinaturaId:sub.ID,tipo:'TRANSICAO',valor:0,origem:'MANUAL_ADMIN',metadados:{evento:'substituicao_contrato',novoContrato:id},criadoPor:'ADMIN'},tx);}
 await tx.request().input('id',mssql.VarChar,id).input('emp',mssql.VarChar,input.empresaId).input('loja',mssql.VarChar,loja).input('plano',mssql.VarChar,input.planoId).input('valor',mssql.Decimal(10,2),input.valor).input('dia',mssql.Int,day).input('next',mssql.VarChar,proximoMes(due,day)).input('now',mssql.VarChar,now).query("INSERT INTO ASSINATURAS_EMPRESAS(ID,EMPRESA_ID,LOJA_ID,PLANO_ID,STATUS,VALOR_PERSONALIZADO,DIA_VENCIMENTO,PROXIMO_FATURAMENTO,CRIADO_EM) VALUES(@id,@emp,@loja,@plano,'ATIVA',@valor,@dia,@next,@now)");
 await tx.request().input('id',mssql.VarChar,fatId).input('emp',mssql.VarChar,input.empresaId).input('loja',mssql.VarChar,loja).input('sub',mssql.VarChar,id).input('valor',mssql.Decimal(10,2),input.valor).input('due',mssql.VarChar,due).input('ref',mssql.VarChar,ref).input('now',mssql.VarChar,now).query("INSERT INTO FATURAS(ID,EMPRESA_ID,LOJA_ID,ASSINATURAS_EMPRESAS_ID,VALOR_BRUTO,VALOR_DESCONTO,STATUS,DATA_EMISSAO,DATA_VENCIMENTO,REFERENCIA_MES_ANO,CRIADO_EM) VALUES(@id,@emp,@loja,@sub,@valor,0,'PENDENTE',@now,@due,@ref,@now)");
 await appendLedger({empresaId:input.empresaId,assinaturaId:id,faturaId:fatId,tipo:'ABERTURA',valor:input.valor,origem:'MANUAL_ADMIN',metadados:{evento:'contrato',escopo:input.escopo,lojaId:loja,substituidos:old.map(s=>s.ID)},criadoPor:'ADMIN'},tx);
 await tx.commit();
 }catch(e){await tx.rollback();throw e;}
 await reconciliarAcessoCobranca();return {id,faturaId:fatId,repetido:false};
}
