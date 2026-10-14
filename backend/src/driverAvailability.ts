import type { Entrega, Motorista } from './types';
const ACTIVE = new Set(['DESPACHADO', 'EM_TRANSITO', 'NO_LOCAL', 'ALERTA_INCIDENTE', 'SLA_ALERTA', 'AGUARDANDO_RETORNO_CD']);
export function driverOccupied(id: string, orders: Iterable<Entrega>, excludedOrder?: string): boolean {
  for (const order of orders) if (order.id !== excludedOrder && order.motorista?.id === id && ACTIVE.has(order.status)) return true;
  return false;
}
export function reconcileDrivers(drivers: Motorista[], orders: Iterable<Entrega>): void {
  const occupied = new Set<string>();
  for (const order of orders) if (order.motorista && ACTIVE.has(order.status)) occupied.add(order.motorista.id);
  for (const driver of drivers) driver.status = occupied.has(driver.id) ? 'ocupado' : 'ocioso';
}
