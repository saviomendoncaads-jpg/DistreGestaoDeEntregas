// Contrato único de provedor de emissão fiscal (Adapter Pattern), no mesmo
// molde do PaymentGatewayAdapter do billing: o fiscalService NUNCA importa um
// provedor concreto. Trocar de provedor = trocar FISCAL_PROVIDER no .env.

import { AmbienteFiscal, DadosNota, ModeloNota, StatusNota } from './tipos';

export type NomeProvedorFiscal = 'MOCK' | 'FOCUSNFE';

export interface ContextoEmissao {
  ambiente: AmbienteFiscal;
  cnpjEmitente: string;
  uf: string;
  tokenProvedor?: string;
}

export interface EmissaoInput {
  ref: string;               // referência única nossa (idempotência no provedor)
  numero?: number;           // só quando o provedor usa numeração local (Mock)
  serie: number;
  dados: DadosNota;
  ctx: ContextoEmissao;
}

export interface EmissaoResult {
  status: StatusNota;
  numero?: number;
  serie?: number;
  chave?: string;
  protocolo?: string;
  danfeUrl?: string;
  xmlUrl?: string;
  qrcodeUrl?: string;
  urlConsulta?: string;
  mensagem?: string;
  emitidaEm?: string;
}

export interface FiscalProviderAdapter {
  readonly nome: NomeProvedorFiscal;
  /** true = o Distre controla a numeração (série/número) da nota. */
  readonly numeracaoLocal: boolean;

  emitir(input: EmissaoInput): Promise<EmissaoResult>;

  /** Reconsulta uma nota (NF-e é assíncrona: pode voltar PROCESSANDO na emissão). */
  consultar(ref: string, modelo: ModeloNota, ctx: ContextoEmissao): Promise<EmissaoResult>;

  /** Cancela uma nota autorizada (justificativa de 15 a 255 caracteres). */
  cancelar(ref: string, modelo: ModeloNota, justificativa: string, ctx: ContextoEmissao): Promise<EmissaoResult>;

  /** Verifica se as credenciais do ambiente atual são aceitas pelo provedor (sem emitir nada). */
  testarConexao(ctx: ContextoEmissao): Promise<{ ok: boolean; mensagem: string }>;
}
