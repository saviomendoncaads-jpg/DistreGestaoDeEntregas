export type TipoEntrega = 'EXPRESS' | 'ROTEIRIZADA' | 'AGENDADA';
export const ENTREGA_SCHEMA = `
IF OBJECT_ID('ENTREGA_CONFIG', 'U') IS NULL
CREATE TABLE ENTREGA_CONFIG (LOJA_ID VARCHAR(100) PRIMARY KEY, CONFIG NVARCHAR(MAX) NOT NULL);
IF COL_LENGTH('ENTREGAS', 'SERVICO_ENTREGA') IS NULL
ALTER TABLE ENTREGAS ADD SERVICO_ENTREGA NVARCHAR(MAX) NULL;`;
export interface ConfigEntrega {
  ativa: boolean;
  cobranca: 'tipo' | 'km';
  cepOrigem: string;
  tipos: { tipo: TipoEntrega; ativo: boolean; valor: number; prazoMinutos: number | null }[];
  faixas: { ateKm: number; valor: number }[];
}
export interface ServicoEntrega {
  avisoLocalizacao?: string;
  tipo: TipoEntrega; taxa: number; prazoMinutos: number | null; previstoPara: string;
  agendadoPara?: string; distanciaKm?: number; cepOrigem?: string; cobranca: 'tipo' | 'km';
}
export class ErroEntrega extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const configEntregaPadrao = (cepOrigem = ''): ConfigEntrega => ({
  ativa: false, cobranca: 'tipo', cepOrigem,
  tipos: [
    { tipo: 'EXPRESS', ativo: true, valor: 7.9, prazoMinutos: 45 },
    { tipo: 'ROTEIRIZADA', ativo: true, valor: 6, prazoMinutos: 120 },
    { tipo: 'AGENDADA', ativo: true, valor: 6, prazoMinutos: null },
  ], faixas: [{ ateKm: 7, valor: 10 }, { ateKm: 8, valor: 15 }],
});
export function validarConfigEntrega(v: ConfigEntrega): ConfigEntrega {
  const erro = (s: string): never => { throw new ErroEntrega(s); };
  if (!v || typeof v !== 'object' || typeof v.ativa !== 'boolean' || !['tipo', 'km'].includes(v.cobranca)) erro('Configuração de entrega inválida.');
  if (typeof v.cepOrigem !== 'string') erro('Informe o CEP de origem.');
  const cepOrigem = v.cepOrigem.replace(/\D/g, '');
  if ((cepOrigem && cepOrigem.length !== 8) || (v.ativa && v.cobranca === 'km' && cepOrigem.length !== 8)) erro('Informe um CEP de origem com 8 dígitos.');
  const valor = (n: number) => { if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100000 || Math.abs(n * 100 - Math.round(n * 100)) > 0.000001) erro('Taxa deve ser um valor entre R$ 0 e R$ 100.000, com até 2 casas decimais.'); return n; };
  if (!Array.isArray(v.tipos) || v.tipos.length !== 3 || new Set(v.tipos.map(t => t?.tipo)).size !== 3) erro('Cadastre os três tipos de entrega sem duplicidade.');
  const tipos = v.tipos.map(t => {
    if (!t || !['EXPRESS', 'ROTEIRIZADA', 'AGENDADA'].includes(t.tipo) || typeof t.ativo !== 'boolean') erro('Tipo de entrega inválido.');
    if (t.tipo === 'AGENDADA' ? t.prazoMinutos !== null : !Number.isInteger(t.prazoMinutos) || Number(t.prazoMinutos) < 1 || Number(t.prazoMinutos) > 10080) erro('Informe um prazo entre 1 e 10.080 minutos. Agendada usa o horário escolhido.');
    return { tipo: t.tipo, ativo: t.ativo, valor: valor(t.valor), prazoMinutos: t.prazoMinutos };
  });
  if (v.ativa && !tipos.some(t => t.ativo)) erro('Ative pelo menos um tipo de entrega.');
  if (!Array.isArray(v.faixas) || !v.faixas.length || v.faixas.length > 30) erro('Cadastre de 1 a 30 faixas de distância.');
  let anterior = 0;
  const faixas = v.faixas.map(f => {
    if (!f || typeof f.ateKm !== 'number' || !Number.isFinite(f.ateKm) || f.ateKm <= anterior || f.ateKm > 1000) erro('As distâncias devem ser crescentes, maiores que zero e até 1.000 km.');
    anterior = f.ateKm; return { ateKm: f.ateKm, valor: valor(f.valor) };
  });
  return { ativa: v.ativa, cobranca: v.cobranca, cepOrigem, tipos, faixas };
}
export function calcularServico(c: ConfigEntrega, tipo: TipoEntrega, agendadoPara?: string, distanciaKm?: number, agora = Date.now()): ServicoEntrega {
  const t = c.tipos.find(t => t.tipo === tipo && t.ativo);
  if (!c.ativa || !t) throw new ErroEntrega('Selecione um tipo de entrega disponível.');
  let previstoPara: string;
  if (tipo === 'AGENDADA') {
    const data = typeof agendadoPara === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(agendadoPara) ? Date.parse(agendadoPara) : NaN;
    if (!Number.isFinite(data) || data <= agora || data > agora + 90 * 86400000) throw new ErroEntrega('Escolha um horário futuro para entrega, em até 90 dias.');
    previstoPara = new Date(data).toISOString();
  } else previstoPara = new Date(agora + t.prazoMinutos! * 60000).toISOString();
  let taxa = t.valor;
  if (c.cobranca === 'km') {
    if (typeof distanciaKm !== 'number' || !Number.isFinite(distanciaKm) || distanciaKm < 0) throw new ErroEntrega('Não foi possível calcular a distância da entrega.', 422);
    const faixa = c.faixas.find(f => distanciaKm <= f.ateKm);
    if (!faixa) throw new ErroEntrega('Endereço fora da área de entrega da loja.', 422);
    taxa = faixa.valor;
  }
  return { tipo, taxa, prazoMinutos: t.prazoMinutos, previstoPara, cobranca: c.cobranca,
    ...(tipo === 'AGENDADA' ? { agendadoPara: previstoPara } : {}),
    ...(c.cobranca === 'km' ? { distanciaKm, cepOrigem: c.cepOrigem } : {}) };
}
