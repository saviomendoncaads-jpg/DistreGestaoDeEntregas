import type { Sessao } from '../types';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function sessaoExpirada(sessao: Sessao, agora = Date.now()): boolean {
  const prazo = sessao.expiraEm ? Date.parse(sessao.expiraEm) : Date.parse(sessao.criadoEm) + SESSION_TTL_MS;
  return !Number.isFinite(prazo) || prazo <= agora;
}

export function podeAcessarLoja(sessao: Sessao | null | undefined, lojaId: string | undefined): boolean {
  return !!sessao && (sessao.tipo === 'admin' || (!!lojaId && sessao.lojaId === lojaId));
}

export function simuladorHabilitado(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.ENABLE_SIMULATOR === 'true';
}

export function demoHabilitada(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.SEED_DEMO === 'true';
}
