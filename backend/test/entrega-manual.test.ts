import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entrega } from '../src/types';
const mocks = vi.hoisted(() => ({ save: vi.fn(), saveDriver: vi.fn(), publish: vi.fn(), subscribe: vi.fn() }));
vi.mock('../src/database', () => ({ salvarEntrega: mocks.save, salvarMotorista: mocks.saveDriver }));
vi.mock('../src/gateway', () => ({ deliveries: new Map(), drivers: [] }));
vi.mock('../src/broker', () => ({ broker: { publish: mocks.publish, subscribe: mocks.subscribe } }));
vi.mock('../src/config', () => ({ autoDispatchSettings: new Map() }));
import { deliveries, drivers } from '../src/gateway';
import { dispatcherAgent } from '../src/dispatcher';
import { MonitorAgent } from '../src/monitor';
function delivery(id: string): Entrega {
  const now = new Date().toISOString();
  return { id, lojaId: 'loja', tipoComanda: 'entrega', nomeCliente: id, endereco: 'Rua', itens: [],
    prioridade: 'media', tipoCarga: 'normal', status: 'RECEBIDO', incidentes: [], logsWebhook: [], criadoEm: now, atualizadoEm: now };
}
beforeEach(() => {
  deliveries.clear(); drivers.length = 0;
  mocks.save.mockReset(); mocks.save.mockResolvedValue(undefined); mocks.saveDriver.mockClear(); mocks.publish.mockClear();
  drivers.push({ id: 'driver', lojaId: 'loja', name: 'Entregador', vehicleType: 'motorcycle', status: 'ocioso' });
  for (const id of ['primeira','segunda']) deliveries.set(id, delivery(id));
});
describe('entrega operada pela central', () => {
  it('despacha na ordem escolhida sem inventar trajeto, GPS, distância ou ETA', async () => {
    await dispatcherAgent.manualDispatch(['segunda','primeira'], 'driver', 'romaneio');
    expect(deliveries.get('segunda')).toMatchObject({ status: 'DESPACHADO', sequenciaEsperada: 1, romaneioId: 'romaneio' });
    expect(deliveries.get('primeira')?.sequenciaEsperada).toBe(2);
    for (const d of deliveries.values()) { expect(d.rota).toBeUndefined(); expect(d.telemetria).toBeUndefined(); expect(d.destino).toBeUndefined(); }
    expect(mocks.publish.mock.calls.every(call => !call[2].route)).toBe(true);
  });
  it('recusa lote misturado com outra loja antes de gravar ou alterar a frota', async () => {
    deliveries.get('segunda')!.lojaId = 'outra';
    await expect(dispatcherAgent.manualDispatch(['primeira','segunda'], 'driver')).rejects.toThrow('mesma loja');
    expect(mocks.save).not.toHaveBeenCalled(); expect(drivers[0].status).toBe('ocioso');
  });
  it('falha de gravação não confirma a entrega despachada na memória', async () => {
    mocks.save.mockRejectedValueOnce(new Error('SQL indisponível'));
    await expect(dispatcherAgent.manualDispatch(['primeira'], 'driver')).rejects.toThrow('SQL');
    expect(deliveries.get('primeira')?.status).toBe('RECEBIDO'); expect(drivers[0].status).toBe('ocioso');
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it('mantém entregador ocupado com outra entrega ativa ou produtos aguardando retorno', async () => {
    new MonitorAgent();
    const listener = mocks.subscribe.mock.calls.at(-1)![2];
    deliveries.get('primeira')!.motorista = drivers[0]; deliveries.get('primeira')!.status = 'ENTREGUE';
    deliveries.get('segunda')!.motorista = drivers[0]; deliveries.get('segunda')!.status = 'AGUARDANDO_RETORNO_CD';
    await listener({ deliveryId: 'primeira', payload: { status: 'ENTREGUE' } });
    expect(drivers[0].status).toBe('ocupado');
    deliveries.get('segunda')!.status = 'PRODUTO_RETORNADO_ESTOQUE';
    await listener({ deliveryId: 'segunda', payload: { status: 'PRODUTO_RETORNADO_ESTOQUE' } });
    expect(drivers[0].status).toBe('ocioso'); expect(mocks.saveDriver).toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
