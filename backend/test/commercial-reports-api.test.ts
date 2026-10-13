import {afterAll,beforeAll,beforeEach,describe,it,expect,vi} from 'vitest';
import express from 'express';
import type {Server} from 'http';
const mocks=vi.hoisted(()=>({query:vi.fn(),input:vi.fn()}));
vi.mock('../src/database',()=>({pool:{request:()=>({input:mocks.input,query:mocks.query})}}));
vi.mock('../src/tenants',()=>({lojas:[],empresas:[]}));
import router from '../src/commercialReports';
import {sessions} from '../src/auth';
let server:Server,url:string;
beforeAll(async()=>{
 sessions.set('reports-admin',{tipo:'admin',token:'reports-admin',criadoEm:new Date().toISOString()});
 sessions.set('reports-store',{tipo:'loja',lojaId:'s1',token:'reports-store',criadoEm:new Date().toISOString()});
 const app=express();app.use('/reports',router);
 server=await new Promise<Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const address=server.address();if(!address||typeof address==='string')throw Error('Missing test port');url=`http://127.0.0.1:${address.port}/reports/comercial`;
});
afterAll(async()=>{sessions.delete('reports-admin');sessions.delete('reports-store');await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));});
beforeEach(()=>{mocks.query.mockReset();mocks.input.mockReset();mocks.input.mockReturnValue({input:mocks.input,query:mocks.query});mocks.query.mockResolvedValue({recordsets:[[],[],[],[],[]]});});
describe('API comercial protegida',()=>{
 it('bloqueia acesso anônimo e sessão de loja',async()=>{
  expect((await fetch(url)).status).toBe(403);expect((await fetch(url,{headers:{Authorization:'Bearer reports-store'}})).status).toBe(403);expect(mocks.query).not.toHaveBeenCalled();
 });
 it('valida datas antes de acessar o banco',async()=>{
  expect((await fetch(url+'?start=2026-10-12&end=2026-10-10',{headers:{Authorization:'Bearer reports-admin'}})).status).toBe(400);expect(mocks.query).not.toHaveBeenCalled();
 });
 it('consulta com parâmetros e retorna uma análise vazia honesta',async()=>{
  const response=await fetch(url+'?start=2026-10-01&end=2026-10-11&storeId=s1',{headers:{Authorization:'Bearer reports-admin'}});expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');
  const body=await response.json();expect(body.summary.orders).toBe(0);expect(body.summary.ticket).toBeNull();expect(mocks.input.mock.calls.some(call=>call[0]==='store'&&call[2]==='s1')).toBe(true);
  const sql=mocks.query.mock.calls[0][0];expect(sql).toContain('@store');expect(sql).not.toMatch(/JSON_VALUE|ISJSON/);
 });
 it('falha sem inventar valores quando o banco falha',async()=>{
  mocks.query.mockRejectedValueOnce(new Error('Database unavailable'));const response=await fetch(url,{headers:{Authorization:'Bearer reports-admin'}});expect(response.status).toBe(503);const body=await response.json();expect(body.summary).toBeUndefined();
 });
 it('não publica totas parciais se a consulta ultrapassa o limite',async()=>{
  mocks.query.mockResolvedValueOnce({recordsets:[Array(50001).fill({}),[],[],[],[]]});expect((await fetch(url,{headers:{Authorization:'Bearer reports-admin'}})).status).toBe(503);
 });
});
