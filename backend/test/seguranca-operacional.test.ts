import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'http';
const mocks = vi.hoisted(() => ({ salvar: vi.fn(), produtos: vi.fn(), salvarMotorista: vi.fn(), deletarMotorista: vi.fn() }));
vi.mock('../src/database', () => ({
  pool: undefined, salvarEntrega: mocks.salvar, obterEntregas: vi.fn().mockResolvedValue([]),
  obterMotoristas: vi.fn().mockResolvedValue([]), salvarMotorista: mocks.salvarMotorista, deletarMotorista: mocks.deletarMotorista,
  obterTiposVeiculos: vi.fn().mockResolvedValue([]), salvarTipoVeiculo: vi.fn(), obterProdutos: mocks.produtos,
  verificarAdminNoBanco: vi.fn().mockResolvedValue(false), salvarLoja: vi.fn(), salvarSessao: vi.fn(),
  deletarSessao: vi.fn(), deletarSessoesPorLoja: vi.fn(), deletarSessoesPorEmpresa: vi.fn(), obterSessoesValidas: vi.fn(),
}));
vi.mock('../src/tenants', () => ({
  lojas: [
    { id: 'l1', empresaId: 'e1', ativo: true, statusFinanceiro: 'REGULAR', chaveAcesso: 'ab', nome: 'Loja Um' },
    { id: 'l2', empresaId: 'e2', ativo: true, statusFinanceiro: 'REGULAR', chaveAcesso: 'cd', nome: 'Loja Dois' },
  ], empresas: [{ id: 'e1', ativo: true }, { id: 'e2', ativo: true }],
}));
vi.mock('../src/broker', () => ({ broker: { publish: vi.fn(), clearHistory: vi.fn() } }));
vi.mock('../src/geocoding', () => ({ geocodificarEndereco: vi.fn().mockResolvedValue(null) }));
import gateway, { deliveries, drivers } from '../src/gateway';
import auth, { sessions, verificarApiKeyIntegracao, obterSessaoPorToken } from '../src/auth';
import whatsapp, { whatsappBotService, whatsappSessions, obterSessaoWhatsapp } from '../src/whatsapp';
import { lojas } from '../src/tenants';
import { responderErro } from '../src/http/asyncHandler';
import type { Entrega } from '../src/types';
import type { Request, Response, NextFunction } from 'express';

let server: Server, url: string;
beforeAll(async () => {
  const app = express(); app.use(express.json()); app.use('/auth', auth); app.use('/whatsapp', whatsapp); app.use('/api', gateway); app.use(responderErro);
  server = await new Promise<Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const address = server.address(); if (!address || typeof address === 'string') throw Error('Sem porta');
  url = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => {
  sessions.clear(); deliveries.clear(); drivers.length = 0; whatsappSessions.clear();
  mocks.salvar.mockReset(); mocks.salvar.mockResolvedValue(undefined); mocks.produtos.mockReset(); mocks.produtos.mockResolvedValue([]);
  mocks.salvarMotorista.mockReset(); mocks.salvarMotorista.mockResolvedValue(undefined);
  mocks.deletarMotorista.mockReset(); mocks.deletarMotorista.mockResolvedValue(undefined);
  lojas[0].ativo = true; lojas[0].statusFinanceiro = 'REGULAR';
  const now = new Date().toISOString();
  sessions.set('admin-test', { tipo: 'admin', token: 'admin-test', criadoEm: now });
  sessions.set('loja-test', { tipo: 'loja', lojaId: 'l1', token: 'loja-test', criadoEm: now });
  deliveries.set('pedido-l1', comanda('pedido-l1', 'l1')); deliveries.set('pedido-l2', comanda('pedido-l2', 'l2'));
});
afterEach(() => { vi.unstubAllEnvs(); });
function comanda(id: string, lojaId: string): Entrega {
  return { id, lojaId, nomeCliente: 'Cliente de teste', endereco: 'Endereço de teste', itens: [], prioridade: 'media', tipoCarga: 'normal', status: 'RECEBIDO', incidentes: [], logsWebhook: [], criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString() };
}
const request = (path: string, token?: string, method = 'GET', body?: unknown) => fetch(url + path, {
  method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});

describe('proteção do fluxo operacional', () => {
  it('não cria nem remove um motorista da memória se a operação no SQL falhar', async () => {
    mocks.salvarMotorista.mockRejectedValueOnce(new Error('Falha SQL'));
    expect((await request('/api/drivers', 'admin-test', 'POST', { name: 'Teste', vehicleType: 'motorcycle' })).status).toBe(503);
    expect(drivers).toHaveLength(0);
    drivers.push({ id: 'driver-l1', lojaId: 'l1', name: 'Teste', vehicleType: 'motorcycle', status: 'ocioso' });
    mocks.deletarMotorista.mockRejectedValueOnce(new Error('Falha SQL'));
    expect((await request('/api/drivers/driver-l1', 'loja-test', 'DELETE')).status).toBe(503);
    expect(drivers).toHaveLength(1);
  });
  it('não confirma entrega na memória nem libera o motoboy quando a gravação falha', async () => {
    const driver = { id: 'driver-l1', lojaId: 'l1', name: 'Teste', vehicleType: 'motorcycle', status: 'ocupado' as const };
    drivers.push(driver);
    Object.assign(deliveries.get('pedido-l1')!, { status: 'DESPACHADO', motorista: driver });
    mocks.salvar.mockRejectedValueOnce(new Error('Falha SQL'));
    expect((await request('/api/deliveries/pedido-l1/complete', 'loja-test', 'POST', {})).status).toBe(503);
    expect(deliveries.get('pedido-l1')!.status).toBe('DESPACHADO');
    expect(drivers[0].status).toBe('ocupado');
  });
  it('mantém o motoboy ocupado até a última entrega de um lote', async () => {
    const driver = { id: 'driver-l1', lojaId: 'l1', name: 'Teste', vehicleType: 'motorcycle', status: 'ocupado' as const };
    drivers.push(driver);
    Object.assign(deliveries.get('pedido-l1')!, { status: 'DESPACHADO', motorista: driver });
    deliveries.set('segunda-l1', { ...comanda('segunda-l1', 'l1'), status: 'DESPACHADO', motorista: driver });
    expect((await request('/api/deliveries/pedido-l1/complete', 'loja-test', 'POST', {})).status).toBe(200);
    expect(drivers[0].status).toBe('ocupado');
    expect((await request('/api/deliveries/segunda-l1/complete', 'loja-test', 'POST', {})).status).toBe(200);
    expect(drivers[0].status).toBe('ocioso');
  });
  it('falha de gravação do insucesso preserva a entrega e os incidentes anteriores', async () => {
    deliveries.get('pedido-l1')!.status = 'DESPACHADO';
    mocks.salvar.mockRejectedValueOnce(new Error('Falha SQL'));
    expect((await request('/api/deliveries/pedido-l1/fail', 'loja-test', 'POST', { motivoInsucesso: 'Cliente ausente' })).status).toBe(503);
    expect(deliveries.get('pedido-l1')!.status).toBe('DESPACHADO');
    expect(deliveries.get('pedido-l1')!.incidentes).toHaveLength(0);
  });
  it('baixa a comanda em PDF como arquivo e respeita a loja da sessão', async () => {
    const response = await request('/api/deliveries/pedido-l1/comanda.pdf', 'loja-test');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/pdf');
    expect(response.headers.get('content-disposition')).toContain('attachment;');
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
    expect((await request('/api/deliveries/pedido-l2/comanda.pdf', 'loja-test')).status).toBe(404);
    expect((await request('/api/deliveries/pedido-l1/comanda.pdf')).status).toBe(401);
  });
  it('finaliza com um clique sem nome do recebedor e não repete a gravação', async () => {
    deliveries.get('pedido-l1')!.status = 'DESPACHADO';
    const response = await request('/api/deliveries/pedido-l1/complete', 'loja-test', 'POST', {});
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.status).toBe('ENTREGUE');
    expect(result.recebedorNome).toBeUndefined();
    expect(result.dataHoraConclusao).toBeTruthy();
    expect(mocks.salvar).toHaveBeenCalledTimes(1);
    expect((await request('/api/deliveries/pedido-l1/complete', 'loja-test', 'POST', {})).status).toBe(200);
    expect(mocks.salvar).toHaveBeenCalledTimes(1);
  });
  it('preserva o nome opcional informado por integrações', async () => {
    deliveries.get('pedido-l1')!.status = 'EM_TRANSITO';
    const response = await request('/api/deliveries/pedido-l1/complete', 'loja-test', 'POST', { recebedorNome: ' Maria ' });
    expect(response.status).toBe(200);
    expect((await response.json()).recebedorNome).toBe('Maria');
  });
  it('não permite concluir ou falhar novamente uma entrega já devolvida ao estoque', async () => {
    deliveries.get('pedido-l1')!.status = 'PRODUTO_RETORNADO_ESTOQUE';
    for (const action of ['complete','fail']) expect((await request(`/api/deliveries/pedido-l1/${action}`, 'loja-test', 'POST', { recebedorNome: 'Recebedor' })).status).toBe(409);
    expect(mocks.salvar).not.toHaveBeenCalled();
  });
  it('não usa conclusão de entrega para concluir o pedido de separação', async () => {
    Object.assign(deliveries.get('pedido-l1')!, { tipoComanda: 'pedido', status: 'DESPACHADO' });
    expect((await request('/api/deliveries/pedido-l1/complete', 'loja-test', 'POST', { recebedorNome: 'Recebedor' })).status).toBe(409);
    expect(mocks.salvar).not.toHaveBeenCalled();
  });
  it('desativa pareamento mobile e recebimento de GPS mesmo com sessão válida', async () => {
    expect((await request('/api/drivers/vincular', 'loja-test', 'POST', { codigoVinculo: '123456' })).status).toBe(410);
    expect((await request('/api/deliveries/pedido-l1/telemetria-bulk', 'loja-test', 'POST', { coordenadas: [{ x: 10, y: 20 }] })).status).toBe(410);
    expect(mocks.salvar).not.toHaveBeenCalled();
    expect(deliveries.get('pedido-l1')?.telemetria).toBeUndefined();
  });
  it('registra chegada manual após despacho sem depender de GPS', async () => {
    deliveries.get('pedido-l1')!.status = 'DESPACHADO';
    expect((await request('/api/deliveries/pedido-l1/arrive', 'loja-test', 'POST', {})).status).toBe(200);
    expect(deliveries.get('pedido-l1')?.status).toBe('NO_LOCAL');
    expect(deliveries.get('pedido-l1')?.telemetria).toBeUndefined();
  });
  it('bloqueia todas as leituras/escritas operacionais anônimas antes de executar', async () => {
    for (const [path, method] of [['/deliveries/pedido-l1','GET'],['/deliveries','POST'],['/drivers','POST'],['/drivers/x','DELETE'],['/deliveries/pedido-l1/complete','POST'],['/simulator/clear','POST']]) {
      expect((await request('/api' + path, undefined, method, method === 'GET' ? undefined : {})).status).toBe(401);
    }
    expect(mocks.salvar).not.toHaveBeenCalled(); expect(deliveries.size).toBe(2);
  });
  it('não revela nem altera comandas de outra loja por ID', async () => {
    for (const acao of ['', '/complete', '/cancel', '/return-stock', '/telemetria-bulk']) {
      expect((await request('/api/deliveries/pedido-l2' + acao, 'loja-test', acao ? 'POST' : 'GET', acao ? {} : undefined)).status).toBe(404);
    }
    expect(mocks.salvar).not.toHaveBeenCalled(); expect(deliveries.get('pedido-l2')?.status).toBe('RECEBIDO');
    expect((await request('/api/deliveries/pedido-l1', 'loja-test')).status).toBe(200);
    expect((await request('/api/deliveries/pedido-l2', 'admin-test')).status).toBe(200);
  });
  it('não permite despacho cruzado, inclusive para o administrador', async () => {
    drivers.push({ id: 'driver-l1', name: 'Teste', vehicleType: 'motorcycle', status: 'ocioso', lojaId: 'l1' });
    for (const token of ['loja-test','admin-test']) expect((await request('/api/deliveries/dispatch-batch', token, 'POST', { deliveryIds: ['pedido-l2'], driverId: 'driver-l1' })).status).toBe(404);
  });
  it('ignora o filtro de outra loja ao consultar produtos como operador', async () => {
    expect((await request('/api/produtos?lojaId=l2', 'loja-test')).status).toBe(200);
    expect(mocks.produtos).toHaveBeenCalledWith('l1');
  });
  it('mantém sessão de loja suspensa e bloqueia escrita operacional', async () => {
    lojas[0].statusFinanceiro = 'SUSPENSO';
    expect((await request('/whatsapp/message', 'loja-test', 'POST', { lojaId:'l1',telefone:'85999999999',mensagem:'Novo pedido' })).status).toBe(402);
    expect((await request('/api/deliveries/pedido-l1/complete', 'loja-test', 'POST', {})).status).toBe(402);
    expect((await request('/api/deliveries/pedido-l1', 'loja-test')).status).toBe(200);
  });
  it('desabilita simulador por padrão e sempre em produção', async () => {
    vi.stubEnv('ENABLE_SIMULATOR', 'false');
    expect((await request('/api/simulator/clear', 'admin-test', 'POST', {})).status).toBe(404);
    vi.stubEnv('ENABLE_SIMULATOR', 'true'); vi.stubEnv('NODE_ENV', 'production');
    expect((await request('/api/simulator/clear', 'admin-test', 'POST', {})).status).toBe(404);
    expect(deliveries.size).toBe(2);
  });
  it('não deixa na memória uma comanda cuja gravação falhou', async () => {
    mocks.salvar.mockRejectedValueOnce(new Error('Falha de persistência'));
    const response = await request('/api/deliveries', 'loja-test', 'POST', { clientName: 'Teste', address: 'Rua teste', priority: 'media', cargoType: 'normal' });
    expect(response.status).toBe(503); expect(deliveries.size).toBe(2);
    expect(JSON.stringify(await response.json())).not.toContain('persistência');
  });
});

describe('sessões e integração', () => {
  it('aplica expiração por prazo explícito ou por criação, também ao /me', async () => {
    sessions.set('expirada', { tipo: 'admin', token: 'expirada', criadoEm: new Date(Date.now() - 31 * 86400000).toISOString() });
    sessions.set('prazo', { tipo: 'admin', token: 'prazo', criadoEm: new Date().toISOString(), expiraEm: new Date(Date.now() - 1000).toISOString() });
    for (const token of ['expirada','prazo']) { expect((await request('/auth/me', token)).status).toBe(401); expect(sessions.has(token)).toBe(false); }
  });
  it('revoga o acesso de loja inativa e rejeita prazo inválido', () => {
    lojas[0].ativo = false; expect(obterSessaoPorToken('loja-test')).toBeNull();
    sessions.set('invalida', { tipo: 'admin', token: 'invalida', criadoEm: 'invalido' }); expect(obterSessaoPorToken('invalida')).toBeNull();
  });
  it('valida tipos do login sem lançar exceções', async () => {
    for (const path of ['/auth/login','/auth/admin']) expect((await request(path, undefined, 'POST', { usuario: 123, senha: {} })).status).toBe(400);
  });
  it('rejeita API key Unicode sem erro de tamanho e bloqueia integração suspensa', () => {
    const req = { header: (name: string) => name === 'x-api-key' ? 'éx' : 'l1', body: {} } as unknown as Request;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    const next = vi.fn() as NextFunction;
    verificarApiKeyIntegracao(req, res, next); expect(res.status).toHaveBeenCalledWith(403); expect(next).not.toHaveBeenCalled();
    lojas[0].statusFinanceiro = 'SUSPENSO'; verificarApiKeyIntegracao(req, res, next); expect(res.status).toHaveBeenCalledWith(402);
  });
});

describe('isolamento do WhatsApp', () => {
  it('mantém históricos diferentes para o mesmo telefone em duas lojas', async () => {
    await whatsappBotService.processMessage('9999', 'Olá', 'l1'); await whatsappBotService.processMessage('9999', 'Olá', 'l2');
    expect(whatsappSessions.size).toBe(2); expect(obterSessaoWhatsapp('l1','9999')?.messages?.[1].text).toContain('Loja Um');
    expect(obterSessaoWhatsapp('l2','9999')?.messages?.[1].text).toContain('Loja Dois');
    const response = await request('/whatsapp/sessions', 'loja-test'); const body = await response.json();
    expect(body).toHaveLength(1); expect(body[0][1].lojaId).toBe('l1');
  });
  it('bloqueia históricos anônimos e mensagens forjadas para outra loja', async () => {
    expect((await request('/whatsapp/sessions')).status).toBe(401);
    expect((await request('/whatsapp/message','loja-test','POST',{phone:'9999',text:'Olá',lojaId:'l2'})).status).toBe(403);
    expect(whatsappSessions.size).toBe(0);
  });
});
