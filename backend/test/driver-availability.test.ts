import { describe, expect, it } from 'vitest';
import { reconcileDrivers } from '../src/driverAvailability';
import type { Entrega, Motorista } from '../src/types';
describe('recuperação da frota', () => {
  it('mantém o motoboy ocupado após reiniciar, independentemente da ordem do histórico', () => {
    const driver = { id: 'driver', status: 'ocioso' } as Motorista;
    const active = { id: 'ativa', motorista: driver, status: 'AGUARDANDO_RETORNO_CD' } as Entrega;
    const finished = { id: 'encerrada', motorista: driver, status: 'ENTREGUE' } as Entrega;
    for (const orders of [[active, finished], [finished, active]]) {
      reconcileDrivers([driver], orders);
      expect(driver.status).toBe('ocupado');
    }
    reconcileDrivers([driver], [finished]);
    expect(driver.status).toBe('ocioso');
  });
});
