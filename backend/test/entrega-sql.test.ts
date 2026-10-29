import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import mssql from '../src/db';
import { calcularServico, configEntregaPadrao, ENTREGA_SCHEMA } from '../src/configEntrega';
import type { Entrega } from '../src/types';

describe.skipIf(process.env.RUN_SQL_ESTOQUE_TESTS !== '1')('regras de entrega no SQL real isolado',()=>{
  const nome=`DISTRE_TEST_ENTREGA_${Date.now()}`;
  const anterior={banco:process.env.DB_DATABASE,seed:process.env.SEED_DEMO};
  let master:InstanceType<typeof mssql.ConnectionPool>, banco:typeof import('../src/database'), servico:typeof import('../src/entregaService');
  beforeAll(async()=>{
    const sqlAuth=!!(process.env.DB_USER&&process.env.DB_PASSWORD);
    master=await new mssql.ConnectionPool({server:process.env.DB_SERVER||'localhost\\SQLEXPRESS',database:'master',...(sqlAuth?{user:process.env.DB_USER,password:process.env.DB_PASSWORD}:{}),options:{trustedConnection:!sqlAuth,trustServerCertificate:true,encrypt:false} as never}).connect();
    await master.request().query(`CREATE DATABASE [${nome}]`);
    process.env.DB_DATABASE=nome;process.env.SEED_DEMO='false';
    banco=await import('../src/database');await banco.conectarBanco();servico=await import('../src/entregaService');
  },60000);
  afterAll(async()=>{
    await banco?.pool?.close();
    if(master?.connected&&/^DISTRE_TEST_ENTREGA_\d+$/.test(nome))await master.request().query(`ALTER DATABASE [${nome}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${nome}]`);
    await master?.close();
    if(anterior.banco===undefined)delete process.env.DB_DATABASE;else process.env.DB_DATABASE=anterior.banco;
    if(anterior.seed===undefined)delete process.env.SEED_DEMO;else process.env.SEED_DEMO=anterior.seed;
  },30000);
  it('salva configurações por loja e mantém o padrão em outra loja',async()=>{
    const c={...configEntregaPadrao('60000000'),ativa:true};await servico.salvarConfigEntrega('l1',c);
    expect(await servico.obterConfigEntrega('l1')).toEqual(c);expect((await servico.obterConfigEntrega('l2')).ativa).toBe(false);
  });
  it('preserva a taxa e o prazo já contratados após editar a configuração e reconectar',async()=>{
    const c=await servico.obterConfigEntrega('l1'),snapshot=calcularServico(c,'EXPRESS');
    const e:Entrega={id:'teste-snapshot',lojaId:'l1',nomeCliente:'Teste',endereco:'Rua',itens:[],prioridade:'media',tipoCarga:'expressa',status:'RECEBIDO',incidentes:[],logsWebhook:[],criadoEm:new Date().toISOString(),atualizadoEm:new Date().toISOString(),servicoEntrega:snapshot,valor:17.9};
    await banco.salvarEntrega(e);c.tipos[0].valor=99;await servico.salvarConfigEntrega('l1',c);
    await banco.pool.close();await banco.conectarBanco();
    expect((await banco.obterEntregas()).find(e=>e.id==='teste-snapshot')?.servicoEntrega).toEqual(snapshot);
    expect((await servico.obterConfigEntrega('l1')).tipos[0].valor).toBe(99);
  });
  it('migração aditiva pode repetir sem apagar registros',async()=>{
    await banco.pool.request().query(ENTREGA_SCHEMA);await banco.pool.request().query(ENTREGA_SCHEMA);
    expect((await banco.obterEntregas()).some(e=>e.id==='teste-snapshot')).toBe(true);
  });
});
