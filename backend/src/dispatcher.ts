import { broker } from './broker';
import { deliveries, drivers } from './gateway';
import { MensagemEvento, EstadoAgente, Motorista, Entrega } from './types';
import { salvarEntrega } from './database';
import { autoDispatchSettings } from './config';

export class DispatcherAgent {
  public state: EstadoAgente = {
    id: 'agent-dispatcher',
    name: 'Agente Dispatcher',
    status: 'idle',
    processedCount: 0,
    lastActive: new Date().toISOString(),
    latencyMs: 0
  };

  private batchTimer: NodeJS.Timeout | null = null;
  private pendingToProcess: { deliveryId: string; preferredDriverId?: string }[] = [];

  constructor() {
    this.init();
  }

  private init() {
    // Se inscreve no tópico entrega.recebida
    broker.subscribe('entrega.recebida', this.state.name, async (event: MensagemEvento) => {
      const del = deliveries.get(event.deliveryId);
      if (!del) return;

      if (del.tipoComanda === 'pedido' || del.referencia?.startsWith('Origem: Pedido')) {
        console.log(`[Dispatcher] Comanda ${event.deliveryId} é do tipo pedido ou originada de pedido. Ignorando despacho automático.`);
        return;
      }

      const lojaId = del.lojaId || 'global';
      const isAuto = autoDispatchSettings.get(lojaId) !== false;
      if (!isAuto) {
        console.log(`[Dispatcher] Despacho automático desativado para a loja ${lojaId}. Ignorando processamento automático para entrega ${event.deliveryId}.`);
        return;
      }

      this.pendingToProcess.push({
        deliveryId: event.deliveryId,
        preferredDriverId: event.payload?.driverId
      });

      if (!this.batchTimer) {
        this.batchTimer = setTimeout(async () => {
          this.batchTimer = null;
          const toProcess = [...this.pendingToProcess];
          this.pendingToProcess = [];

          this.state.status = 'active';
          this.state.lastActive = new Date().toISOString();
          const startTime = Date.now();

          for (const item of toProcess) {
            // Pode ter sido agrupada por uma iteração anterior do loop
            const del = deliveries.get(item.deliveryId);
            if (del && del.status === 'RECEBIDO') {
              await this.processDelivery(item.deliveryId, item.preferredDriverId);
            }
          }

          this.state.latencyMs = Date.now() - startTime;
          this.state.processedCount += toProcess.length;
          this.state.status = 'idle';
        }, 3000); // 3 segundos de janela de batching
      }
    });
  }

  private async processDelivery(deliveryId: string, preferredDriverId?: string) {
    const delivery = deliveries.get(deliveryId);
    if (!delivery || delivery.status !== 'RECEBIDO') return;
    const preferred = drivers.find(d => d.id === preferredDriverId && d.lojaId === delivery.lojaId);
    const driver = preferred || this.findDriverForCargo(delivery.tipoCarga, delivery.lojaId);
    if (driver) await this.manualDispatch([deliveryId], driver.id);
  }

  private findDriverForCargo(tipoCarga: string, lojaId?: string): Motorista | null {
    // Todo motorista cadastrado está online; mantém o contexto da loja.
    const frotas = lojaId ? drivers.filter(d => d.lojaId === lojaId) : drivers;

    // Tenta encontrar um veículo preferencial
    let tiposPreferenciais: string[] = [];
    if (tipoCarga === 'expressa') {
      tiposPreferenciais = ['drone', 'motorcycle'];
    } else if (tipoCarga === 'agendado') {
      tiposPreferenciais = ['refrigerated_truck', 'van'];
    } else if (tipoCarga === 'normal') {
      tiposPreferenciais = ['van', 'motorcycle', 'drone'];
    } else {
      tiposPreferenciais = ['van', 'motorcycle', 'drone', 'refrigerated_truck'];
    }

    const getActiveCount = (driverId: string) => {
      return Array.from(deliveries.values()).filter(d =>
        d.motorista?.id === driverId &&
        (d.status === 'RECEBIDO' || d.status === 'DESPACHADO' || d.status === 'EM_TRANSITO' || d.status === 'NO_LOCAL')
      ).length;
    };

    // Procura na ordem de preferência um motorista que tenha menos de 3 entregas
    for (const tipo of tiposPreferenciais) {
      const motoristasValidos = frotas
        .filter(d => d.vehicleType === tipo)
        .map(d => ({ d, count: getActiveCount(d.id) }))
        .filter(x => x.count < 3)
        .sort((a, b) => a.count - b.count);
      if (motoristasValidos.length > 0) return motoristasValidos[0].d;
    }

    // Fallback para QUALQUER motorista desta frota com menos de 3 entregas
    const motoristasFallback = frotas
      .map(d => ({ d, count: getActiveCount(d.id) }))
      .filter(x => x.count < 3)
      .sort((a, b) => a.count - b.count);
    return motoristasFallback.length > 0 ? motoristasFallback[0].d : null;
  }

  public async manualDispatch(deliveryIds: string[], driverId: string, romaneioId?: string) {
    const motorista = drivers.find(d => d.id === driverId);
    if (!motorista) throw new Error('Motorista não encontrado.');
    const ids = [...new Set(deliveryIds)];
    const batch = ids.map(id => deliveries.get(id));
    if (!batch.length || batch.some(d => !d || d.status !== 'RECEBIDO' || d.tipoComanda === 'pedido' || d.lojaId !== motorista.lojaId)) {
      throw new Error('Selecione somente entregas prontas da mesma loja.');
    }
    // Preserva a ordem selecionada no romaneio; não inventa distância, GPS ou ETA.
    const existentes = Array.from(deliveries.values()).filter(d => d.motorista?.id === motorista.id
      && ['DESPACHADO','EM_TRANSITO','NO_LOCAL','ALERTA_INCIDENTE','SLA_ALERTA','AGUARDANDO_RETORNO_CD'].includes(d.status));
    const sequencia = Math.max(0, ...existentes.map(d => d.sequenciaEsperada || 0));
    for (let i = 0; i < batch.length; i++) {
      const delivery = batch[i]!;
      const agora = new Date().toISOString();
      const updated: Entrega = { ...delivery, motorista: { ...motorista, status: 'ocupado' },
        sequenciaEsperada: sequencia + i + 1, romaneioId: romaneioId || delivery.romaneioId,
        despachadoEm: agora, atualizadoEm: agora, status: 'DESPACHADO', rota: undefined, telemetria: undefined };
      await salvarEntrega(updated);
      Object.assign(delivery, updated);
      motorista.status = 'ocupado';
      broker.publish('entrega.despachada', delivery.id, { deliveryId: delivery.id, driverId: motorista.id, priority: delivery.prioridade });
    }
  }

  public getAgentState(): EstadoAgente {
    return this.state;
  }
}

export const dispatcherAgent = new DispatcherAgent();
