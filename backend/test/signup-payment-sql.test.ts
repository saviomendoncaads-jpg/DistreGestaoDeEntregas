import {beforeAll,afterAll,it,expect,describe} from 'vitest';
import express from 'express';
import type {Server} from 'http';
import sql from '../src/db';
const enabled=process.env.RUN_SQL_ESTOQUE_TESTS==='1';
const databaseName=`DISTRE_TEST_SIGNUP_${Date.now()}`;
let master:any,db:any,auth:any,tenants:any,sm:any,billing:any,server:Server,url:string,account:any,token:string;
const savedEnv={DB_DATABASE:process.env.DB_DATABASE,SEED_DEMO:process.env.SEED_DEMO,NODE_ENV:process.env.NODE_ENV,PIX_PLATAFORMA_CHAVE:process.env.PIX_PLATAFORMA_CHAVE};
describe.skipIf(!enabled)('cadastro e liberação somente após Pix confirmado, com SQL real',()=>{
 beforeAll(async()=>{
  master=await new sql.ConnectionPool({server:process.env.DB_SERVER||'localhost\\SQLEXPRESS',database:'master',options:{trustedConnection:true,trustServerCertificate:true,encrypt:false} as any}).connect();
  await master.request().query(`CREATE DATABASE [${databaseName}]`);
  process.env.DB_DATABASE=databaseName;process.env.SEED_DEMO='false';process.env.NODE_ENV='production';process.env.PIX_PLATAFORMA_CHAVE='11111111-2222-4333-8444-555555555555';
  db=await import('../src/database');await db.conectarBanco();tenants=await import('../src/tenants');await tenants.carregarTenantsDoBanco();auth=await import('../src/auth');sm=await import('../src/billing/SubscriptionStateMachine');billing=await import('../src/billing/recurringBilling');await billing.inicializarRecorrencia();
  const implantation=await import('../src/implantacao');await implantation.inicializarImplantacao();
  await (await import('../src/estoque')).inicializarEstoque();
  const finance=await import('../src/financeiroService');
  await db.pool.request().query("INSERT INTO PLANOS(ID,NOME,VALOR_MENSAL,ATIVO,CRIADO_EM) VALUES('signup-plan','Plano teste',149,1,'2026-01-01')");
  const app=express();app.use(express.json());app.use('/api/auth',auth.default);app.use('/api',tenants.default);app.use('/api/cliente/cobrancas',(await import('../src/billing/clientBilling')).default);app.use('/api/implantacao',implantation.default);app.use('/api/admin/financeiro',finance.default);app.use('/protected',auth.verificarSessao,auth.exigirPrimeiroPagamento,(_req,res)=>res.json({ok:true}));
  server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});url=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 },60000);
 afterAll(async()=>{if(server)await new Promise<void>(r=>server.close(()=>r()));await db?.pool?.close();if(master?.connected&&/^DISTRE_TEST_SIGNUP_\d+$/.test(databaseName))await master.request().query(`ALTER DATABASE [${databaseName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${databaseName}]`);await master?.close();for(const [key,value]of Object.entries(savedEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value;}},30000);
 const data=()=>({empresa:{nome:'Empresa de teste',cnpj:'12.345.678/0001-95',email:'teste@example.com'},loja:{nome:'Loja de teste',usuario:'conta-teste',senha:'teste-seguro-123',endereco:'Rua de teste',cidade:'Recife',uf:'PE'},planoId:'signup-plan',diaVencimento:28});
 async function request(path:string,method='GET',body?:any,bearer?:string){return fetch(url+path,{method,headers:{'Content-Type':'application/json',...(bearer?{Authorization:`Bearer ${bearer}`}:{})},...(body&&method!=='GET'?{body:JSON.stringify(body)}:{})});}
 it('rejeita dados malformados e planos inválidos sem deixar cadastro e cobrança órfãos',async()=>{
  expect((await request('/api/signup','POST',{...data(),loja:{...data().loja,senha:{}}})).status).toBe(400);
  expect((await request('/api/signup','POST',{...data(),planoId:'inexistente'})).status).toBe(400);
  for(const table of ['EMPRESAS','LOJAS','ASSINATURAS_EMPRESAS','FATURAS'])expect((await db.pool.request().query(`SELECT COUNT(*) n FROM ${table}`)).recordset[0].n).toBe(0);
 });
 it('cria conta com sete dias gratuitos e informa a chave Pix configurada sem código fictício',async()=>{
  const response=await request('/api/signup','POST',data());expect(response.status).toBe(201);account=await response.json();expect(account.pagamento).toMatchObject({pixChave:process.env.PIX_PLATAFORMA_CHAVE,confirmacaoPagamento:'MANUAL'});expect(account.pagamento.pixCopiaCola).toBeUndefined();expect(account.loja.chaveAcesso).toBeUndefined();
  const sub=(await db.pool.request().input('id',sql.VarChar,account.assinatura.id).query('SELECT STATUS,CRIADO_EM,TRIAL_EXPIRA_EM FROM ASSINATURAS_EMPRESAS WHERE ID=@id')).recordset[0];expect(sub.STATUS).toBe('TRIAL');expect(Date.parse(sub.TRIAL_EXPIRA_EM)-Date.parse(sub.CRIADO_EM)).toBe(7*24*60*60*1000);
  const login=await request('/api/auth/login','POST',{usuario:data().loja.usuario,senha:data().loja.senha});const session=await login.json();expect(session.aguardandoPagamento).toBe(false);expect(session.operacaoBloqueada).toBe(false);token=session.token;
  expect((await request('/protected','GET',undefined,token)).status).toBe(200);expect((await request('/api/implantacao','GET',undefined,token)).status).toBe(200);
 });
 it('ao encerrar sete dias, permite cobrança e bloqueia operação e implantação sem esperar a rotina horária',async()=>{
  await db.pool.request().input('id',sql.VarChar,account.assinatura.id).input('expiry',sql.VarChar,new Date(Date.now()-1).toISOString()).query('UPDATE ASSINATURAS_EMPRESAS SET TRIAL_EXPIRA_EM=@expiry WHERE ID=@id');await tenants.carregarTenantsDoBanco();
  expect((await request('/protected','GET',undefined,token)).status).toBe(402);
  for(const path of ['/api/implantacao','/api/implantacao/inicio'])expect((await request(path,path.endsWith('inicio')?'POST':'GET',{},token)).status).toBe(402);
  const bill=await request('/api/cliente/cobrancas','GET',undefined,token);expect(bill.status).toBe(200);expect((await bill.json()).aguardandoPagamento).toBe(true);
  expect((await request(`/api/admin/financeiro/faturas/${account.pagamento.faturaId}/baixa-manual`,'PUT',{},token)).status).toBe(403);
  expect(await sm.transicionar(account.assinatura.id,'payment.confirmed')).toMatchObject({ok:false,motivo:'primeiro_pagamento_nao_confirmado'});
  await billing.reconciliarAcessoCobranca();expect(tenants.lojas.find((l:any)=>l.id===account.loja.id).statusFinanceiro).toBe('AGUARDANDO_PAGAMENTO');
 });
 it('baixa administrativa confirmada libera os dois perfis, preserva usuário e registra pagamento',async()=>{
  auth.sessions.set('admin-fixture',{tipo:'admin',token:'admin-fixture',criadoEm:new Date().toISOString()});
  const response=await request(`/api/admin/financeiro/faturas/${account.pagamento.faturaId}/baixa-manual`,'PUT',{comprovanteReferencia:'PIX_TESTE_CONFIRMADO'},'admin-fixture');expect(response.status).toBe(200);
  expect((await request('/protected','GET',undefined,token)).status).toBe(200);expect((await request('/api/implantacao','GET',undefined,token)).status).toBe(200);
  const session=await (await request('/api/auth/me','GET',undefined,token)).json();expect(session.aguardandoPagamento).toBe(false);expect(session.operacaoBloqueada).toBe(false);
  const duplicate=await request('/api/signup','POST',data());expect(duplicate.status).toBe(409);
  expect((await db.pool.request().query('SELECT COUNT(*) n FROM HISTORICO_PAGAMENTOS')).recordset[0].n).toBe(1);
 });
 it('pagamento durante o teste mantém acesso liberado, inclusive depois da data original do teste',async()=>{
  const input=data();input.empresa.cnpj='98.765.432/0001-11';input.loja.usuario='pagamento-antecipado';
  const created=await (await request('/api/signup','POST',input)).json();
  expect((await request(`/api/admin/financeiro/faturas/${created.pagamento.faturaId}/baixa-manual`,'PUT',{comprovanteReferencia:'PIX_ANTECIPADO_TESTE'},'admin-fixture')).status).toBe(200);
  await db.pool.request().input('id',sql.VarChar,created.assinatura.id).query("UPDATE ASSINATURAS_EMPRESAS SET TRIAL_EXPIRA_EM='2020-01-01T00:00:00Z' WHERE ID=@id");await tenants.carregarTenantsDoBanco();
  const logged=await (await request('/api/auth/login','POST',{usuario:input.loja.usuario,senha:input.loja.senha})).json();expect(logged.operacaoBloqueada).toBe(false);expect(logged.trialExpiraEm).toBeUndefined();expect((await request('/protected','GET',undefined,logged.token)).status).toBe(200);
 });
});
