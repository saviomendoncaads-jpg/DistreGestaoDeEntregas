// Cliente HTTP do Módulo Fiscal (/api/fiscal) — tipos espelham o backend (fiscal/tipos.ts).

export type ModeloNota = 'NFCE' | 'NFE';
export type StatusNota = 'AUTORIZADA' | 'PROCESSANDO' | 'REJEITADA' | 'CANCELADA' | 'ERRO';
export type EscolhaFiscal = ModeloNota | 'NENHUMA';

export interface DestinatarioNota {
  nome?: string;
  documento?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  email?: string;
}

export interface ConfigFiscal {
  razaoSocial: string;
  nomeFantasia?: string;
  cnpj: string;
  inscricaoEstadual: string;
  regimeTributario: 1 | 2 | 3;
  logradouro: string;
  numero: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  telefone?: string;
  email?: string;
  provedor: 'SIMULADO' | 'FOCUSNFE';
  ambiente: 'HOMOLOGACAO' | 'PRODUCAO';
  serieNfce: number;
  proximoNumeroNfce: number;
  serieNfe: number;
  proximoNumeroNfe: number;
  ncmPadrao: string;
  cfopPadrao: string;
  icmsSituacaoPadrao: string;
  origemPadrao: string;
  percentualTributos: number;
}

/** O que o painel vê das credenciais — nunca os segredos. */
export interface ResumoCredenciais {
  certificado?: { titular?: string; cnpj?: string; validoAte?: string; diasRestantes?: number };
  cscHomologacao: { configurado: boolean; id?: string };
  cscProducao: { configurado: boolean; id?: string };
  focusTokenHomologacao: boolean;
  focusTokenProducao: boolean;
  focusTokenPrincipal: boolean;
  sincronizadoEm?: string;
}

export interface ItemChecklist { chave: string; rotulo: string; ok: boolean; obrigatorio: boolean; detalhe?: string }
export interface Prontidao { podeEmitir: boolean; podeEmitirEmProducao: boolean; itens: ItemChecklist[] }

export interface EstadoFiscal {
  config: ConfigFiscal | null;
  credenciais: ResumoCredenciais;
  prontidao: Prontidao;
}

/** Envio de credenciais: campo ausente = mantém; string vazia = apaga. */
export interface CredenciaisEnvio {
  certificadoBase64?: string;
  certificadoSenha?: string;
  removerCertificado?: boolean;
  cscIdHomologacao?: string;
  cscHomologacao?: string;
  cscIdProducao?: string;
  cscProducao?: string;
  focusTokenHomologacao?: string;
  focusTokenProducao?: string;
  focusTokenPrincipal?: string;
}

export interface StatusFiscal { provedor: 'SIMULADO' | 'FOCUSNFE'; simulado: boolean; ambiente: 'HOMOLOGACAO' | 'PRODUCAO'; podeEmitir: boolean }

export interface ItemNota {
  numero: number;
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  valorBruto: number;
  valorDesconto: number;
  valorOutros: number;
  valorTributos?: number;
  cest?: string;
  codigoBarras?: string;
}

export interface NotaResumo {
  id: string;
  entregaId?: string;
  pedidoId?: string;
  modelo: ModeloNota;
  numero?: number;
  serie?: number;
  chave?: string;
  status: StatusNota;
  ambiente: 'HOMOLOGACAO' | 'PRODUCAO';
  provedor: string;
  valorTotal: number;
  danfeUrl?: string;
  mensagem?: string;
  emitidaEm?: string;
  criadoEm: string;
}

export interface NotaCompleta extends NotaResumo {
  protocolo?: string;
  qrcodeUrl?: string;
  qrcodeDataUrl?: string;
  urlConsulta?: string;
  dados: {
    modelo: ModeloNota;
    naturezaOperacao: string;
    emitente: Omit<ConfigFiscal, 'proximoNumeroNfce' | 'proximoNumeroNfe'>;
    destinatario?: DestinatarioNota;
    itens: ItemNota[];
    valorProdutos: number;
    valorDesconto: number;
    valorOutros: number;
    valorTotal: number;
    valorTributos?: number;
    pagamento: { codigo: string; descricao: string; valor: number };
    informacoesAdicionais?: string;
  };
}

export const NOME_MODELO: Record<ModeloNota, string> = { NFCE: 'NFC-e', NFE: 'NF-e' };

export class FiscalApi {
  private backendUrl: string;
  private token: string;
  private lojaId?: string;

  constructor(backendUrl: string, token: string, lojaId?: string) {
    this.backendUrl = backendUrl;
    this.token = token;
    this.lojaId = lojaId;
  }

  private url(caminho: string) {
    const sep = caminho.includes('?') ? '&' : '?';
    return `${this.backendUrl}/api/fiscal${caminho}${this.lojaId ? `${sep}lojaId=${encodeURIComponent(this.lojaId)}` : ''}`;
  }

  private async req<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    const res = await fetch(this.url(caminho), {
      method: metodo,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const erro = new Error(data.error || `Erro ${res.status} no módulo fiscal`) as Error & { status?: number; nota?: NotaResumo };
      erro.status = res.status;
      erro.nota = data.nota;
      throw erro;
    }
    return data as T;
  }

  status() { return this.req<StatusFiscal>('GET', '/status'); }
  obterEstado() { return this.req<EstadoFiscal>('GET', '/config'); }
  salvarConfig(c: Partial<ConfigFiscal>) { return this.req<EstadoFiscal>('PUT', '/config', c); }
  salvarCredenciais(c: CredenciaisEnvio) { return this.req<EstadoFiscal>('PUT', '/credenciais', c); }
  testarConexao(ambiente?: 'HOMOLOGACAO' | 'PRODUCAO') {
    return this.req<{ ok: boolean; mensagem: string }>('POST', '/credenciais/testar', { ambiente });
  }
  sincronizarFocus() { return this.req<EstadoFiscal & { mensagem: string }>('POST', '/credenciais/sincronizar-focus', {}); }
  listarNotas(dias = 2) { return this.req<{ notas: NotaResumo[] }>('GET', `/notas?dias=${dias}`).then(r => r.notas); }
  obterNota(id: string) { return this.req<{ nota: NotaCompleta }>('GET', `/notas/${encodeURIComponent(id)}`).then(r => r.nota); }
  emitir(entregaId: string, modelo: ModeloNota, destinatario?: DestinatarioNota) {
    return this.req<{ nota: NotaCompleta }>('POST', '/emitir', { entregaId, modelo, destinatario }).then(r => r.nota);
  }
  atualizar(id: string) { return this.req<{ nota: NotaCompleta }>('POST', `/notas/${encodeURIComponent(id)}/atualizar`).then(r => r.nota); }
  cancelar(id: string, justificativa: string) {
    return this.req<{ nota: NotaResumo }>('POST', `/notas/${encodeURIComponent(id)}/cancelar`, { justificativa }).then(r => r.nota);
  }
}
