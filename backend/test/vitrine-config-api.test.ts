import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express'; import type { Server } from 'http';
vi.mock('../src/auth', () => ({ obterSessaoDoRequest: () => ({ tipo:'loja',lojaId:'loja-teste' }), exigirLojaAdimplente: (_r:unknown,_s:unknown,next:()=>void) => next() }));
vi.mock('../src/database', () => ({ obterProdutosDaLoja:vi.fn(),salvarProduto:vi.fn(),salvarProdutosEmLote:vi.fn(),historicoProduto:vi.fn(),deletarProduto:vi.fn(),salvarConfiguracaoVitrine:vi.fn() }));
vi.mock('../src/estoque', () => ({ listarEstoque:vi.fn(),receberMercadoria:vi.fn(),ErroEstoque:class extends Error {} }));
vi.mock('../src/tenants', () => ({ lojas:[{ id:'loja-teste',nome:'Loja original',logoUrl:'/uploads/original.png',senhaHash:'privado' },{ id:'outra',nome:'Outra loja' }] }));
import router from '../src/gestaoVitrine'; import { lojas } from '../src/tenants'; import { obterProdutosDaLoja,salvarConfiguracaoVitrine } from '../src/database'; import { configPadrao } from '../src/configVitrine';
let server:Server; let base:string;
beforeAll(async () => { const app=express(); app.use(express.json()); app.use(router); server=await new Promise<Server>(resolve => { const s=app.listen(0,'127.0.0.1',()=>resolve(s)); }); base=`http://127.0.0.1:${(server.address() as {port:number}).port}`; });
afterAll(() => new Promise<void>((resolve,reject)=>server.close(e=>e ? reject(e) : resolve())));
beforeEach(()=> { vi.clearAllMocks(); delete lojas[0].configVitrine; lojas[0].logoUrl='/uploads/original.png'; vi.mocked(obterProdutosDaLoja).mockResolvedValue([{ id:'p1',nome:'Produto',preco:10,lojaId:'loja-teste',ativo:true,publicado:true }]); vi.mocked(salvarConfiguracaoVitrine).mockResolvedValue(undefined); });
async function put(config:object) { const r=await fetch(`${base}/loja?lojaId=outra`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(config)}); return {status:r.status,body:await r.json()}; }
describe('publicação de configurações da vitrine',()=> {
 it('retorna apenas configurações públicas da própria loja',async()=> { const r=await fetch(`${base}/loja?lojaId=outra`); const b=await r.json(); expect(b).toEqual({logoUrl:'/uploads/original.png',configVitrine:configPadrao()}); expect(b.senhaHash).toBeUndefined(); });
 it('salva a própria loja mesmo que a requisição peça outra',async()=> { const r=await put({configVitrine:{...configPadrao(),nomePublico:'Minha vitrine',produtosDestaque:['p1']}}); expect(r.status).toBe(200); expect(salvarConfiguracaoVitrine).toHaveBeenCalledWith(expect.objectContaining({id:'loja-teste',nome:'Loja original'})); expect(lojas[1].configVitrine).toBeUndefined(); expect(lojas[0].configVitrine?.nomePublico).toBe('Minha vitrine'); });
 it('não altera a vitrine em memória quando o banco falha',async()=> { vi.mocked(salvarConfiguracaoVitrine).mockRejectedValueOnce(new Error('Falha simulada')); const r=await put({logoUrl:'/uploads/nova.png',configVitrine:{...configPadrao(),pausada:true}}); expect(r.status).toBe(500); expect(lojas[0].logoUrl).toBe('/uploads/original.png'); expect(lojas[0].configVitrine).toBeUndefined(); });
 it('rejeita destaque de outra loja e configuração inválida antes de salvar',async()=> { expect((await put({configVitrine:{...configPadrao(),produtosDestaque:['p-outra']}})).status).toBe(400); expect((await put({configVitrine:{pagamentos:[]}})).status).toBe(400); expect(salvarConfiguracaoVitrine).not.toHaveBeenCalled(); });
});
