import crypto from 'crypto';

/** Destinos externos precisam ser autorizados pela implantação, não pelo payload da loja. */
export function destinoWebhookPermitido(valor: string, hosts: string): boolean {
  try {
    const url = new URL(valor);
    const autorizados = hosts.split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443')
      && autorizados.includes(url.hostname.toLowerCase()) && !url.hostname.includes(':')
      && !/^\d+(\.\d+){3}$/.test(url.hostname) && url.hostname !== 'localhost';
  } catch { return false; }
}

export function assinaturaWebhook(corpo: string, segredo: string): string {
  if (Buffer.byteLength(segredo) < 32) throw new Error('DELIVERY_WEBHOOK_SECRET deve ter pelo menos 32 bytes.');
  return 'sha256=' + crypto.createHmac('sha256', segredo).update(corpo).digest('hex');
}
