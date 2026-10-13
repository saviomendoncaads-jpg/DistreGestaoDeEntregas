import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/database', () => ({ pool: undefined }));
import { getGateway, _resetGateway } from '../src/billing/gatewayFactory';
beforeEach(() => { _resetGateway(); });
afterEach(() => { vi.unstubAllEnvs(); _resetGateway(); });
describe('seleção explícita do gateway de cobrança', () => {
  it('permite simulação em desenvolvimento', () => {
    vi.stubEnv('NODE_ENV','test'); vi.stubEnv('PAYMENT_GATEWAY','MOCK'); expect(getGateway().nome).toBe('MOCK');
  });
  it('não transforma erro de configuração ASAAS em cobrança simulada', () => {
    vi.stubEnv('PAYMENT_GATEWAY','ASAAS'); vi.stubEnv('ASAAS_API_KEY',''); expect(() => getGateway()).toThrow('ASAAS_API_KEY');
  });
  it('nega provedor desconhecido e simulação em produção', () => {
    vi.stubEnv('PAYMENT_GATEWAY','STRIPE'); expect(() => getGateway()).toThrow();
    vi.stubEnv('NODE_ENV','production'); vi.stubEnv('PAYMENT_GATEWAY','MOCK'); expect(() => getGateway()).toThrow('Produção');
  });
});
