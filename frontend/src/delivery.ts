export type TipoEntrega = 'EXPRESS' | 'ROTEIRIZADA' | 'AGENDADA';
export interface ConfigEntrega {
  ativa: boolean; cobranca: 'tipo' | 'km'; cepOrigem: string;
  tipos: { tipo: TipoEntrega; ativo: boolean; valor: number; prazoMinutos: number | null }[];
  faixas: { ateKm: number; valor: number }[];
}
export interface ServicoEntrega {
  avisoLocalizacao?: string;
  tipo: TipoEntrega; taxa: number; prazoMinutos: number | null; previstoPara: string;
  agendadoPara?: string; distanciaKm?: number; cepOrigem?: string; cobranca: 'tipo' | 'km';
}
export interface SelecaoEntrega { tipo: TipoEntrega; agendadoPara?: string; cotacaoId?: string }
export interface CotacaoEntrega { cotacaoId: string; expiraEm: string; servico: ServicoEntrega }
export const nomeEntrega = { EXPRESS: 'EXPRESS · Rápida', ROTEIRIZADA: 'ROTEIRIZADA · Normal', AGENDADA: 'AGENDADA' };
export const dinheiro = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const horarioEntrega = (v: string) => new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export function linhasEntrega(s?: ServicoEntrega): string[] {
  return s ? [s.tipo === 'EXPRESS' ? '*** EXPRESS - ENTREGA RAPIDA ***' : nomeEntrega[s.tipo],
    s.agendadoPara ? `Agendada: ${horarioEntrega(s.agendadoPara)}` : `Prazo: até ${s.prazoMinutos} min · ${horarioEntrega(s.previstoPara)}`,
    `Taxa de entrega: ${dinheiro(s.taxa)}`, ...(s.avisoLocalizacao ? [s.avisoLocalizacao] : []),
    ...(s.distanciaKm !== undefined ? [`Distância: ${s.distanciaKm.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} km · Origem: ${s.cepOrigem}`] : [])] : [];
}
