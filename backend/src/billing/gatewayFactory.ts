import { PaymentGatewayAdapter } from './PaymentGatewayAdapter';
import { MockAdapter } from './adapters/MockAdapter';
import { AsaasAdapter } from './adapters/AsaasAdapter';

// Seleção do driver de gateway por variável de ambiente. Default = MOCK, para
// que dev/seed continuem funcionando sem credenciais reais.
//
// PAYMENT_GATEWAY=ASAAS + ASAAS_API_KEY ativa a cobrança real (Pix/Boleto/Cartão).
// Nenhuma regra de negócio muda — só esta função conhece os drivers concretos.

let instancia: PaymentGatewayAdapter | null = null;

export function getGateway(): PaymentGatewayAdapter {
  if (instancia) return instancia;

  const escolhido = (process.env.PAYMENT_GATEWAY || 'MOCK').toUpperCase();
  if (process.env.NODE_ENV === 'production' && escolhido !== 'ASAAS') {
    throw new Error('Produção requer PAYMENT_GATEWAY=ASAAS e credenciais reais.');
  }
  switch (escolhido) {
    case 'ASAAS': {
      const apiKey = process.env.ASAAS_API_KEY;
      if (!apiKey) {
        throw new Error('PAYMENT_GATEWAY=ASAAS exige ASAAS_API_KEY.');
      }
      console.log('[Billing] Gateway de pagamento ativo: ASAAS (cobrança real).');
      instancia = new AsaasAdapter(apiKey);
      return instancia;
    }
    default: throw new Error('Gateway de pagamento não suportado.');
    case 'MOCK':

      instancia = new MockAdapter();
      return instancia;
  }
}

/** Reseta o singleton (útil em testes). */
export function _resetGateway() {
  instancia = null;
}
