import crypto from 'crypto';
import { destinoWebhookPermitido, assinaturaWebhook } from './security/webhookPolicy';
import { broker } from './broker';
import { deliveries } from './gateway';
import { MensagemEvento, EstadoAgente, LogWebhook, StatusEntrega } from './types';

export class IntegratorAgent {
  public state: EstadoAgente = {
    id: 'agent-integrator',
    name: 'Agente Integrador (Egress)',
    status: 'idle',
    processedCount: 0,
    lastActive: new Date().toISOString(),
    latencyMs: 0
  };

  private lastSentStatus = new Map<string, StatusEntrega>();

  constructor() {
    this.init();
  }

  private init() {
    // Escuta o tópico entrega.monitorada (inclui atualizações de telemetria e estados finais)
    broker.subscribe('entrega.monitorada', this.state.name, async (event: MensagemEvento) => {
      const { deliveryId, status } = event.payload;
      
      // Só dispara webhooks quando o status mudar para evitar spam com atualizações de telemetria pura
      const statusAnterior = this.lastSentStatus.get(deliveryId);
      if (statusAnterior === status) {
        return; // Sem alteração de status, pula o webhook
      }

      this.state.status = 'active';
      this.state.lastActive = new Date().toISOString();
      const startTime = Date.now();

      this.lastSentStatus.set(deliveryId, status);
      await this.dispatchWebhook(deliveryId, status, event.payload);

      this.state.latencyMs = Date.now() - startTime;
      this.state.processedCount++;
      this.state.status = 'idle';

      // Limpa mapeamento se for um estado terminal (concluido ou devolvido)
      if (status === 'ENTREGUE' || status === 'RECUSADO_INSUCESSO') {
        this.lastSentStatus.delete(deliveryId);
      }
    });

    // Também escuta o evento de despacho (primeira atribuição de rota)
    broker.subscribe('entrega.despachada', this.state.name, async (event: MensagemEvento) => {
      const { deliveryId } = event.payload;
      
      this.state.status = 'active';
      this.state.lastActive = new Date().toISOString();
      const startTime = Date.now();

      this.lastSentStatus.set(deliveryId, 'DESPACHADO');
      const delivery = deliveries.get(deliveryId);
      
      if (delivery) {
        await this.dispatchWebhook(deliveryId, 'DESPACHADO', delivery);
      }

      this.state.latencyMs = Date.now() - startTime;
      this.state.processedCount++;
      this.state.status = 'idle';
    });
  }

  private async dispatchWebhook(
    deliveryId: string, 
    status: StatusEntrega, 
    payload: any, 
    attempt: number = 1
  ): Promise<void> {
    const delivery = deliveries.get(deliveryId);
    if (!delivery || !delivery.urlWebhook) return;

    const url = delivery.urlWebhook;
    // O callback antigo do simulador não representa integração de uma loja real.
    if (url === 'http://localhost:5000/api/simulator/webhook') return;
    if (!destinoWebhookPermitido(url, process.env.DELIVERY_WEBHOOK_ALLOWED_HOSTS || '')) {
      console.warn('[Integrator] Destino de webhook não autorizado.'); return;
    }
    const segredo = process.env.DELIVERY_WEBHOOK_SECRET || '';
    if (Buffer.byteLength(segredo) < 32) { console.warn('[Integrator] Segredo de assinatura não configurado.'); return; }
    
    // Constrói payload do webhook padrão com a estrutura do Módulo 4
    
    const webhookPayload = attempt > 1 ? payload : {
      event_id: crypto.randomUUID(),
      event_type: status === 'ENTREGUE' ? 'delivery.completed' : 
                  status === 'PRODUTO_RETORNADO_ESTOQUE' ? 'delivery.canceled' : 
                  `delivery.${status.toLowerCase()}`,
      timestamp: new Date().toISOString(),
      data: {
        comanda_id: deliveryId,
        cliente: delivery.nomeCliente,
        entregador: delivery.motorista ? {
          id: delivery.motorista.id,
          nome: delivery.motorista.name
        } : null,
        conclusao: status === 'ENTREGUE' ? {
          recebedor_nome: delivery.recebedorNome,
          recebedor_documento: delivery.recebedorCPF,
          assinatura_base64: delivery.assinaturaBase64,
          foto_fachada_url: delivery.comprovanteFotoUrl
        } : undefined
      }
    };

    console.log(`[Integrator] Disparando webhook para ${deliveryId} (${status}), Tentativa ${attempt}...`);

    try {
      const corpo = JSON.stringify(webhookPayload);
      const response = await fetch(url, {
        redirect: 'error',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Delivery-Engine-Signature': assinaturaWebhook(corpo, segredo)
        },
        body: corpo,
        signal: AbortSignal.timeout(4000) // 4 segundos de timeout
      });

      const logEntry: LogWebhook = {
        timestamp: new Date().toISOString(),
        url,
        payload: webhookPayload,
        status: response.ok ? 'sucesso' : 'falha',
        statusCode: response.status,
        attempt
      };

      if (!response.ok) {
        logEntry.errorMessage = `HTTP error status ${response.status}`;
      }

      delivery.logsWebhook.push(logEntry);
      
      if (response.ok) {
        console.log(`[Integrator] Webhook enviado com sucesso para ${url}`);
      } else {
        console.warn(`[Integrator] Webhook falhou com status ${response.status}.`);
        this.scheduleRetry(deliveryId, status, webhookPayload, attempt);
      }
    } catch (err: any) {
      console.error(`[Integrator] Erro ao disparar webhook para ${url}:`, err.message);

      const logEntry: LogWebhook = {
        timestamp: new Date().toISOString(),
        url,
        payload: webhookPayload,
        status: 'falha',
        errorMessage: err.message || 'Erro de Rede/Timeout',
        attempt
      };
      
      delivery.logsWebhook.push(logEntry);
      this.scheduleRetry(deliveryId, status, webhookPayload, attempt);
    }
  }

  private scheduleRetry(deliveryId: string, status: StatusEntrega, payload: any, attempt: number) {
    if (attempt >= 4) {
      console.error(`[Integrator] Webhook para ${deliveryId} (${status}) falhou após 4 tentativas. Movendo para DLQ.`);
      
      const delivery = deliveries.get(deliveryId);
      if (delivery) {
        delivery.logsWebhook.push({
          timestamp: new Date().toISOString(),
          url: delivery.urlWebhook || '',
          payload: null,
          status: 'falha',
          errorMessage: 'Fila DLQ (Dead Letter Queue) - Excedeu limite de 4 retentativas.',
          attempt: 5
        });
      }
      return;
    }

    const nextAttempt = attempt + 1;
    let delay = 5000; // 5s
    if (nextAttempt === 3) delay = 25000; // 25s
    if (nextAttempt === 4) delay = 120000; // 2m (120s)

    console.log(`[Integrator] Agendando tentativa #${nextAttempt} para ${deliveryId} em ${delay}ms`);

    const delivery = deliveries.get(deliveryId);
    if (delivery) {
      delivery.logsWebhook.push({
        timestamp: new Date().toISOString(),
        url: delivery.urlWebhook || '',
        payload: null,
        status: 'tentando',
        errorMessage: `Tentativa agendada #${nextAttempt} em ${delay / 1000}s`,
        attempt: nextAttempt
      });
    }

    setTimeout(() => {
      void this.dispatchWebhook(deliveryId, status, payload, nextAttempt).catch(error => console.error('[Integrator] Falha na retentativa:', error?.message));
    }, delay);
  }

  public getAgentState(): EstadoAgente {
    return this.state;
  }
}

export const integratorAgent = new IntegratorAgent();
