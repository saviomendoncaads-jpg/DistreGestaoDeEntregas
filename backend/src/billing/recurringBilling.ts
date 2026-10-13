import crypto from 'crypto';
import mssql from '../db';
import { pool } from '../database';
import { empresas,lojas } from '../tenants';
import { appendLedger } from './ledgerService';
import { diaCobranca,proximoMes,carenciaValida,diasAtraso,bloqueiaFatura } from './billingPolicy';
export async function inicializarRecorrencia(){await pool.request().query(`IF OBJECT_ID('CICLOS_COBRANCA','U') IS NULL CREATE TABLE CICLOS_COBRANCA(ASSINATURA_ID VARCHAR(50) NOT NULL,COMPETENCIA VARCHAR(20) NOT NULL,FATURA_ID VARCHAR(50) NOT NULL,CRIADO_EM DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),PRIMARY KEY(ASSINATURA_ID,COMPETENCIA));`);}
/** Uma obrigação por contrato e competência; empresa sem LOJA_ID é contrato consolidado da rede. */
export async function gerarMensalidades(hoje=diaCobranca()){
 const ids=await pool.request().query("SELECT ID FROM ASSINATURAS_EMPRESAS WHERE STATUS IN ('ATIVA','ATRASADA','SUSPENSA') AND PROXIMO_FATURAMENTO IS NOT NULL ORDER BY ID");
 for(const {ID:id} of ids.recordset){const tx=new mssql.Transaction(pool);await tx.begin(mssql.ISOLATION_LEVEL.SERIALIZABLE);try{
 const sub=(await tx.request().input('id',mssql.VarChar,id).query(`SELECT s.*,p.VALOR_MENSAL,h.VALOR_BRUTO ULTIMO_VALOR_FATURADO FROM ASSINATURAS_EMPRESAS s WITH(UPDLOCK,HOLDLOCK) JOIN PLANOS p ON p.ID=s.PLANO_ID OUTER APPLY(SELECT TOP(1) f.VALOR_BRUTO FROM FATURAS f WHERE f.ASSINATURAS_EMPRESAS_ID=s.ID AND f.STATUS<>'CANCELADA' ORDER BY TRY_CONVERT(datetimeoffset,f.DATA_VENCIMENTO) DESC,f.ID) h WHERE s.ID=@id`)).recordset[0];
 if(!sub||!['ATIVA','ATRASADA','SUSPENSA'].includes(sub.STATUS)){await tx.commit();continue;}
 let due=diaCobranca(sub.PROXIMO_FATURAMENTO);const valor=Number(sub.VALOR_PERSONALIZADO??sub.ULTIMO_VALOR_FATURADO??sub.VALOR_MENSAL);if(!Number.isFinite(valor)||valor<0)throw new Error('Valor de contrato inválido');
 if(sub.VALOR_PERSONALIZADO==null){await tx.request().input('id',mssql.VarChar,id).input('valor',mssql.Decimal(10,2),valor).query('UPDATE ASSINATURAS_EMPRESAS SET VALOR_PERSONALIZADO=@valor WHERE ID=@id');await appendLedger({empresaId:sub.EMPRESA_ID,assinaturaId:id,tipo:'AJUSTE',valor:0,origem:'SYSTEM',metadados:{evento:'valor_contratado_fixado',valorMensal:valor,fonte:sub.ULTIMO_VALOR_FATURADO!=null?'ultima_fatura':'plano_atual'},criadoPor:'SYSTEM'},tx);}
 let n=0;while(due<=hoje){if(++n>240)throw new Error('Contrato exige revisão de mais de 240 competências');const competencia=due.slice(5,7)+'/'+due.slice(0,4);
 const existing=(await tx.request().input('sub',mssql.VarChar,id).input('ref',mssql.VarChar,competencia).query('SELECT TOP(1) ID FROM FATURAS WITH(UPDLOCK,HOLDLOCK) WHERE ASSINATURAS_EMPRESAS_ID=@sub AND REFERENCIA_MES_ANO=@ref ORDER BY ID')).recordset[0];
 const fatId=existing?.ID||'fat-'+crypto.randomUUID().slice(0,12);
 if(!existing){await tx.request().input('id',mssql.VarChar,fatId).input('empresa',mssql.VarChar,sub.EMPRESA_ID).input('loja',mssql.VarChar,sub.LOJA_ID??null).input('sub',mssql.VarChar,id).input('valor',mssql.Decimal(10,2),valor).input('vence',mssql.VarChar,due).input('ref',mssql.VarChar,competencia).input('agora',mssql.VarChar,new Date().toISOString()).query(`INSERT INTO FATURAS(ID,EMPRESA_ID,LOJA_ID,ASSINATURAS_EMPRESAS_ID,VALOR_BRUTO,VALOR_DESCONTO,STATUS,DATA_EMISSAO,DATA_VENCIMENTO,REFERENCIA_MES_ANO,CRIADO_EM) VALUES(@id,@empresa,@loja,@sub,@valor,0,'PENDENTE',@agora,@vence,@ref,@agora)`);
 await appendLedger({empresaId:sub.EMPRESA_ID,assinaturaId:id,faturaId:fatId,tipo:'ABERTURA',valor,origem:'SYSTEM',metadados:{evento:'mensalidade',competencia,escopo:sub.LOJA_ID?'LOJA':'REDE'},criadoPor:'SYSTEM'},tx);}
 await tx.request().input('sub',mssql.VarChar,id).input('ref',mssql.VarChar,competencia).input('fat',mssql.VarChar,fatId).query(`IF NOT EXISTS(SELECT 1 FROM CICLOS_COBRANCA WHERE ASSINATURA_ID=@sub AND COMPETENCIA=@ref) INSERT INTO CICLOS_COBRANCA(ASSINATURA_ID,COMPETENCIA,FATURA_ID) VALUES(@sub,@ref,@fat)`);
 due=proximoMes(due,sub.DIA_VENCIMENTO);}
 await tx.request().input('id',mssql.VarChar,id).input('next',mssql.VarChar,due).query('UPDATE ASSINATURAS_EMPRESAS SET PROXIMO_FATURAMENTO=@next WHERE ID=@id');await tx.commit();
 }catch(e){await tx.rollback();throw e;}}
}
export async function reconciliarAcessoCobranca(hoje=diaCobranca()){
 const tx=new mssql.Transaction(pool);await tx.begin(mssql.ISOLATION_LEVEL.SERIALIZABLE);let updated:any[]=[];try{
 const subs=(await tx.request().query('SELECT * FROM ASSINATURAS_EMPRESAS WITH(UPDLOCK,HOLDLOCK)')).recordset;
 const fats=(await tx.request().query('SELECT f.*,a.LOJA_ID assinaturaLoja FROM FATURAS f WITH(UPDLOCK,HOLDLOCK) LEFT JOIN ASSINATURAS_EMPRESAS a ON a.ID=f.ASSINATURAS_EMPRESAS_ID')).recordset;
 const config=(await tx.request().query('SELECT TOP(1) DIAS_CARENCIA_BLOQUEIO FROM CONFIGURACOES_COBRANCA ORDER BY ID')).recordset[0];const grace=carenciaValida(config?.DIAS_CARENCIA_BLOQUEIO??5);
 for(const f of fats){if(['PENDENTE','ATRASADA','VENCIDA'].includes(f.STATUS)){const status=diasAtraso(f.DATA_VENCIMENTO,hoje)>0?'ATRASADA':'PENDENTE';if(f.STATUS!==status)await tx.request().input('id',mssql.VarChar,f.ID).input('s',mssql.VarChar,status).query('UPDATE FATURAS SET STATUS=@s WHERE ID=@id');f.STATUS=status;}}
 const pending=fats.filter(f=>['PENDENTE','ATRASADA','VENCIDA'].includes(f.STATUS));
 for(const sub of subs){if(sub.STATUS==='TRIAL'&&sub.TRIAL_EXPIRA_EM&&diaCobranca(sub.TRIAL_EXPIRA_EM)<hoje){await tx.request().input('id',mssql.VarChar,sub.ID).query("UPDATE ASSINATURAS_EMPRESAS SET STATUS='CANCELADA',CANCELADO_EM=CONVERT(varchar(40),SYSUTCDATETIME(),127)+'Z' WHERE ID=@id");await appendLedger({empresaId:sub.EMPRESA_ID,assinaturaId:sub.ID,tipo:'TRANSICAO',valor:0,origem:'SYSTEM',metadados:{de:'TRIAL',para:'CANCELADA',evento:'trial.expired'},criadoPor:'SYSTEM'},tx);sub.STATUS='CANCELADA';}if(!['ATIVA','ATRASADA','SUSPENSA'].includes(sub.STATUS))continue;const obligations=pending.filter(f=>f.ASSINATURAS_EMPRESAS_ID===sub.ID);const blocked=obligations.some(f=>bloqueiaFatura(f.STATUS,f.DATA_VENCIMENTO,grace,hoje));const late=obligations.some(f=>diasAtraso(f.DATA_VENCIMENTO,hoje)>0);const next=blocked?'SUSPENSA':late?'ATRASADA':'ATIVA';if(next!==sub.STATUS){await tx.request().input('id',mssql.VarChar,sub.ID).input('s',mssql.VarChar,next).query("UPDATE ASSINATURAS_EMPRESAS SET STATUS=@s,SUSPENSA_EM=CASE WHEN @s='SUSPENSA' THEN COALESCE(SUSPENSA_EM,CONVERT(varchar(40),SYSUTCDATETIME(),127)+'Z') ELSE SUSPENSA_EM END WHERE ID=@id");await appendLedger({empresaId:sub.EMPRESA_ID,assinaturaId:sub.ID,tipo:'TRANSICAO',valor:0,origem:'SYSTEM',metadados:{de:sub.STATUS,para:next,evento:'avaliacao_obrigacoes',carencia:grace},criadoPor:'SYSTEM'},tx);sub.STATUS=next;}}
 // O contrato da rede e o da filial são avaliados juntos, sem somar faturas ou afetar outras redes.
 for(const l of lojas){const contracts=subs.filter(s=>s.EMPRESA_ID===l.empresaId&&(s.LOJA_ID===l.id||!s.LOJA_ID));const obligations=pending.filter(f=>f.EMPRESA_ID===l.empresaId&&((f.LOJA_ID??f.assinaturaLoja)===l.id||!(f.LOJA_ID??f.assinaturaLoja)));
 if(!contracts.length&&!obligations.length)continue;const effective=contracts.filter(s=>s.STATUS!=='CANCELADA');const blocked=(!effective.length&&contracts.length>0)||effective.some(s=>s.STATUS==='SUSPENSA')||obligations.some(f=>bloqueiaFatura(f.STATUS,f.DATA_VENCIMENTO,grace,hoje));const late=obligations.some(f=>diasAtraso(f.DATA_VENCIMENTO,hoje)>0);
 const status=blocked?'SUSPENSO':late?'INADIMPLENTE':'REGULAR';
 await tx.request().input('id',mssql.VarChar,l.id).input('s',mssql.VarChar,status).query('UPDATE LOJAS SET STATUS_FINANCEIRO=@s WHERE ID=@id');updated.push({loja:l,status});}
 for(const e of empresas){const net=subs.filter(s=>s.EMPRESA_ID===e.id&&!s.LOJA_ID);const debts=pending.filter(f=>f.EMPRESA_ID===e.id&&!(f.LOJA_ID??f.assinaturaLoja));if(!net.length&&!debts.length)continue;const status=(net.length>0&&net.every(s=>s.STATUS==='CANCELADA'))||net.some(s=>s.STATUS==='SUSPENSA')||debts.some(f=>bloqueiaFatura(f.STATUS,f.DATA_VENCIMENTO,grace,hoje))?'SUSPENSO':debts.some(f=>diasAtraso(f.DATA_VENCIMENTO,hoje)>0)?'INADIMPLENTE':'REGULAR';await tx.request().input('id',mssql.VarChar,e.id).input('s',mssql.VarChar,status).query('UPDATE EMPRESAS SET STATUS_FINANCEIRO=@s WHERE ID=@id');updated.push({empresa:e,status});}
 await tx.commit();for(const u of updated)(u.loja||u.empresa).statusFinanceiro=u.status;
 }catch(e){await tx.rollback();throw e;}
 // Banco e memória primeiro; a checagem de cada sessão impede novo login e canal já conectado.
 const {revogarSessoesDaLoja,revogarSessoesDaEmpresa}=await import('../auth');for(const u of updated){if(['SUSPENSO','CANCELADO'].includes(u.status)){if(u.loja)await revogarSessoesDaLoja(u.loja.id);else await revogarSessoesDaEmpresa(u.empresa.id);}}
}
let running=false;
export async function executarCicloCobranca(){if(running)return;running=true;try{await gerarMensalidades();await reconciliarAcessoCobranca();}finally{running=false;}}
