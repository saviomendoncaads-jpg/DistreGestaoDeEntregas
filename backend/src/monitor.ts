import { broker } from './broker';
import { deliveries, drivers } from './gateway';
import { EstadoAgente, MensagemEvento } from './types';
import { salvarMotorista } from './database';

// Nesta etapa a central registra os marcos da entrega; não há GPS nem simulação de movimento.
export class MonitorAgent {
  public state: EstadoAgente = {
    id: 'agent-monitor', name: 'Acompanhamento operacional', status: 'idle',
    processedCount: 0, lastActive: new Date().toISOString(), latencyMs: 0
  };
  constructor() {
    broker.subscribe('entrega.monitorada', this.state.name, async (event: MensagemEvento) => {
      const started = Date.now();
      const delivery = deliveries.get(event.deliveryId);
      const driver = drivers.find(d => d.id === delivery?.motorista?.id);
      if (driver) {
        const occupied = Array.from(deliveries.values()).some(d => d.motorista?.id === driver.id
          && ['DESPACHADO','EM_TRANSITO','NO_LOCAL','ALERTA_INCIDENTE','SLA_ALERTA','AGUARDANDO_RETORNO_CD'].includes(d.status));
        driver.status = occupied ? 'ocupado' : 'ocioso';
        await salvarMotorista(driver);
      }
      this.state.processedCount++;
      this.state.lastActive = new Date().toISOString();
      this.state.latencyMs = Date.now() - started;
    });
  }
  public getAgentState(): EstadoAgente { return this.state; }
}
export const monitorAgent = new MonitorAgent();
