import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'http';
const state = vi.hoisted(()=>({configs:new Map<string,string>(),save:vi.fn(),counter:0}));
vi.mock('../src/database',()=>({
  pool:{request:()=>{const params:Record<string,unknown>={};const request={input:(k:string,_t:unknown,v:unknown)=>{params[k]=v;return request;},query:vi.fn(async(sql:string)=>{
    if(sql.includes('MERGE ENTREGA_CONFIG')){state.configs.set(String(params.loja),String(params.config));return {};}
    return {recordset:state.configs.has(String(params.loja))?[{CONFIG:state.configs.get(String(params.loja))}]:[]};
  })};return request;}},
  obterProdutos:async()=>[{id:'p1',nome:'Produto',preco:10,ativo:true,publicado:true,lojaId:'l1'}],
  salvarEntrega:state.save,
}));
vi.mock('../src/tenants',()=>({lojas:[{id:'l1',nome:'Loja 1',ativo:true,recebePedidos:true,cep:'60000000'},{id:'l2',nome:'Loja 2',ativo:true}],empresas:[]}));
vi.mock('../src/auth',()=>({obterSessaoDoRequest:(r:{headers:Record<string,string>})=>r.headers.authorization==='Bearer loja1'?{tipo:'loja',lojaId:'l1'}:undefined,exigirLojaAdimplente:(_r:unknown,_s:unknown,next:()=>void)=>next(),lojaBloqueadaFinanceiro:()=>false}));
vi.mock('../src/gateway',()=>({deliveries:new Map(),gerarIdComanda:()=>`p-${++state.counter}`}));
vi.mock('../src/geocoding',()=>({geocodificarEndereco:async()=>null}));
vi.mock('../src/broker',()=>({broker:{publish:vi.fn()}}));
vi.mock('../src/estoque',()=>({saldosPublicos:async()=>new Map(),salvarVendaComEstoque:state.save,ErroEstoque:class extends Error {}}));
vi.mock('../src/billing/planLimitsService',()=>({verificarLimiteEntregasMes:async()=>({permitido:true}),erroLimite:vi.fn()}));
import vitrine from '../src/vitrine';
import gestao from '../src/gestaoVitrine';
import integracaoPedidos from '../src/integracaoPedidos';
import integracaoEntregas from '../src/integracaoEntregas';
import { configEntregaPadrao } from '../src/configEntrega';
import { responderErro } from '../src/http/asyncHandler';
let server:Server,base:string;
beforeAll(async()=>{const app=express();app.use(express.json());app.use('/vitrine',vitrine);app.use('/gestao',gestao);app.use('/integracao',integracaoPedidos,integracaoEntregas);app.use(responderErro);server=await new Promise<Server>(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;});
afterAll(()=>new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve())));
beforeEach(()=>{state.configs.clear();state.save.mockClear();state.configs.set('l1',JSON.stringify({...configEntregaPadrao('60000000'),ativa:true}));});
const endereco={logradouro:'Rua teste',numero:'100',cidade:'Fortaleza',uf:'CE'};
const payload={cliente:{nome:'Maria',cpf:'52998224725'},endereco,itens:[{produtoId:'p1',quantidade:1}],pagamento:{forma:'pix'}};
async function post(path:string,data:unknown){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});return {status:r.status,body:await r.json()};}
const cotar=()=>post('/vitrine/l1/entrega/cotacao',{endereco,entrega:{tipo:'EXPRESS'}});
describe('configuração e finalização da pré-venda',()=>{
  it.each(['pedidos','entregas'])('aplica as regras também à integração de %s do ERP',async caminho=>{
    const b={lojaId:'l1',cliente:{nome:'Maria'},produtos:[{nome:'Produto',quantidade:1,precoUnitario:10}],endereco,entrega:{tipo:'EXPRESS'}};
    const r=await post('/integracao/'+caminho,b);expect(r.status).toBe(201);expect(r.body).toMatchObject({total:17.9,taxaEntrega:7.9,servicoEntrega:{tipo:'EXPRESS'}});
    expect((await post('/integracao/'+caminho,{...b,tipoCarga:'expressa',entrega:{tipo:'ROTEIRIZADA'}})).body.total).toBe(16);
    expect(state.save.mock.calls.at(-1)![0].tipoCarga).toBe('normal');
    expect((await post('/integracao/'+caminho,{...b,valores:{taxaEntrega:0}})).status).toBe(409);
    expect((await post('/integracao/'+caminho,{...b,entrega:undefined})).status).toBe(400);
  });
  it('bloqueia configuração anônima e impede loja de ler ou salvar a configuração de outra',async()=>{
    expect((await fetch(base+'/gestao/entrega')).status).toBe(401);
    const headers={Authorization:'Bearer loja1','Content-Type':'application/json'};
    const r=await fetch(base+'/gestao/entrega?lojaId=l2',{headers});expect((await r.json()).cepOrigem).toBe('60000000');
    const c={...configEntregaPadrao('60000000'),ativa:true};c.tipos[0].valor=9;
    expect((await fetch(base+'/gestao/entrega?lojaId=l2',{method:'PUT',headers,body:JSON.stringify(c)})).status).toBe(200);
    expect(JSON.parse(state.configs.get('l1')!).tipos[0].valor).toBe(9);expect(state.configs.has('l2')).toBe(false);
  });
  it('finaliza com a taxa do servidor, ignorando preços forjados no navegador',async()=>{
    const q=await cotar();expect(q.status).toBe(200);
    const r=await post('/vitrine/l1/pedidos',{...payload,entrega:{tipo:'EXPRESS',cotacaoId:q.body.cotacaoId,taxa:0},taxaEntrega:0,total:0});
    expect(r.status).toBe(201);expect(r.body).toMatchObject({subtotal:10,taxaEntrega:7.9,total:17.9,servicoEntrega:{tipo:'EXPRESS'}});
    expect(state.save.mock.calls[0][0]).toMatchObject({valor:17.9,tipoCarga:'expressa',servicoEntrega:{taxa:7.9,tipo:'EXPRESS'}});
  });
  it('exige cotação válida e não grava estoque quando endereço ou regra muda',async()=>{
    expect((await post('/vitrine/l1/pedidos',payload)).status).toBe(409);
    const q=await cotar();const entrega={tipo:'EXPRESS',cotacaoId:q.body.cotacaoId};
    expect((await post('/vitrine/l1/pedidos',{...payload,endereco:{...endereco,numero:'200'},entrega})).status).toBe(409);
    state.configs.set('l1',JSON.stringify({...configEntregaPadrao(),ativa:true}));
    expect((await post('/vitrine/l1/pedidos',{...payload,entrega})).status).toBe(409);expect(state.save).not.toHaveBeenCalled();
  });
  it('valida o troco sobre produtos mais taxa',async()=>{
    const q=await cotar();expect((await post('/vitrine/l1/pedidos',{...payload,entrega:{tipo:'EXPRESS',cotacaoId:q.body.cotacaoId},pagamento:{forma:'dinheiro',troco:10}})).status).toBe(400);expect(state.save).not.toHaveBeenCalled();
  });
  it('mantém pedidos antigos em lojas com regras desativadas e rejeita seleção obsoleta',async()=>{
    state.configs.clear();expect(await (await fetch(base+'/vitrine/l1/entrega')).json()).toBeNull();
    expect((await post('/vitrine/l1/pedidos',payload)).body).toMatchObject({total:10,taxaEntrega:0});
    expect((await post('/vitrine/l1/pedidos',{...payload,entrega:{tipo:'EXPRESS',cotacaoId:'velha'}})).status).toBe(409);
  });
});
