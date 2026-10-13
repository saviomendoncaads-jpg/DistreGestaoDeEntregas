import { describe, expect, it } from 'vitest';
import crypto from 'crypto';
import { assinaturaWebhook, destinoWebhookPermitido } from '../src/security/webhookPolicy';
describe('webhook de entregas', () => {
  it('aceita somente host explicitamente autorizado em HTTPS', () => {
    expect(destinoWebhookPermitido('https://erp.example.com/events', 'erp.example.com')).toBe(true);
    for (const url of ['http://erp.example.com/events','https://erp.example.com.evil.test/events','https://evil.test/events','https://user:pass@erp.example.com/events','https://erp.example.com:8443/events','https://127.0.0.1/events','https://[::1]/events','https://localhost/events','inválido']) expect(destinoWebhookPermitido(url, 'erp.example.com,127.0.0.1,localhost,[::1]')).toBe(false);
    expect(destinoWebhookPermitido('https://erp.example.com/events','')).toBe(false);
  });
  it('assina o corpo exato e muda a assinatura quando o conteúdo muda', () => {
    const body = '{"event_id":"evento-teste"}', secret = 'segredo-apenas-de-teste-com-32-bytes';
    expect(assinaturaWebhook(body,secret)).toBe('sha256='+crypto.createHmac('sha256',secret).update(body).digest('hex'));
    expect(assinaturaWebhook(body,secret)).not.toBe(assinaturaWebhook(body+' ',secret));
    expect(() => assinaturaWebhook(body,'curto')).toThrow();
  });
});
