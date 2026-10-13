// Tipos do Módulo Fiscal (NFC-e modelo 65 / NF-e modelo 55).
// A regra de negócio (fiscalService) depende só destes tipos e do contrato
// FiscalProviderAdapter — nunca do provedor concreto (Mock, Focus NFe...).

export type ModeloNota = 'NFCE' | 'NFE';

export type StatusNota = 'AUTORIZADA' | 'PROCESSANDO' | 'REJEITADA' | 'CANCELADA' | 'ERRO';

export type AmbienteFiscal = 'HOMOLOGACAO' | 'PRODUCAO';

/** Quem transmite a nota à SEFAZ: SIMULADO (local, sem valor fiscal) ou Focus NFe (real). */
export type ProvedorFiscal = 'SIMULADO' | 'FOCUSNFE';

/** Dados fiscais do emitente (uma configuração por loja). */
export interface ConfigFiscalLoja {
  lojaId: string;
  razaoSocial: string;
  nomeFantasia?: string;
  cnpj: string;              // só dígitos
  inscricaoEstadual: string; // só dígitos (ou "ISENTO")
  regimeTributario: 1 | 2 | 3; // 1 Simples Nacional | 2 Simples (excesso de sublimite) | 3 Regime Normal
  logradouro: string;
  numero: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;               // só dígitos
  telefone?: string;
  email?: string;
  provedor: ProvedorFiscal;
  ambiente: AmbienteFiscal;
  serieNfce: number;
  proximoNumeroNfce: number;
  serieNfe: number;
  proximoNumeroNfe: number;
  // Padrões tributários aplicados aos itens (o produto ainda não tem cadastro fiscal próprio).
  ncmPadrao: string;         // 8 dígitos
  cfopPadrao: string;        // ex.: 5102
  icmsSituacaoPadrao: string; // CSOSN (Simples, ex.: 102) ou CST (Regime Normal)
  origemPadrao: string;      // 0 = nacional
  // Lei 12.741/2012 (De Olho no Imposto): % aproximado de tributos sobre o valor da venda
  // (tabela IBPT). 0 = não informa.
  percentualTributos: number;
  atualizadoEm?: string;
}

/** Segredos da loja — guardados CIFRADOS no banco (fiscal/cofre.ts), nunca saem pela API. */
export interface CredenciaisFiscais {
  certificadoPfx?: Buffer;
  certificadoSenha?: string;
  certificadoTitular?: string;
  certificadoCnpj?: string;
  certificadoValidoAte?: string;
  cscIdHomologacao?: string;
  cscHomologacao?: string;
  cscIdProducao?: string;
  cscProducao?: string;
  focusTokenHomologacao?: string;
  focusTokenProducao?: string;
  focusTokenPrincipal?: string;   // token da conta Focus (API de empresas) — usado para sincronizar
  sincronizadoEm?: string;
  atualizadoEm?: string;
}

/** O que o painel pode ver sobre as credenciais (sem nenhum segredo). */
export interface ResumoCredenciais {
  certificado?: { titular?: string; cnpj?: string; validoAte?: string; diasRestantes?: number };
  cscHomologacao: { configurado: boolean; id?: string };
  cscProducao: { configurado: boolean; id?: string };
  focusTokenHomologacao: boolean;
  focusTokenProducao: boolean;
  focusTokenPrincipal: boolean;
  sincronizadoEm?: string;
}

export interface ItemChecklist {
  chave: string;
  rotulo: string;
  ok: boolean;
  obrigatorio: boolean;
  detalhe?: string;
}

export interface Prontidao {
  podeEmitir: boolean;            // no ambiente/provedor configurados agora
  podeEmitirEmProducao: boolean;  // tudo pronto para virar a chave
  itens: ItemChecklist[];
}

export interface DestinatarioNota {
  nome?: string;
  documento?: string;        // CPF (11) ou CNPJ (14), só dígitos
  logradouro?: string;
  numero?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  email?: string;
}

export interface ItemNota {
  numero: number;
  codigo: string;
  descricao: string;
  ncm: string;
  cest?: string;
  codigoBarras?: string;     // GTIN/EAN; ausente = "SEM GTIN"
  cfop: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  valorBruto: number;
  valorDesconto: number;
  valorOutros: number;       // taxa de entrega rateada (vOutro)
  valorTributos: number;     // Lei 12.741 (aproximado)
  origem: string;
  icmsSituacao: string;
}

export interface PagamentoNota {
  codigo: string;            // tPag: 01 dinheiro, 03 crédito, 17 PIX, 99 outros
  descricao: string;
  valor: number;
}

/** Snapshot completo do documento — persistido em NOTAS_FISCAIS.DADOS e usado na impressão do DANFE. */
export interface DadosNota {
  modelo: ModeloNota;
  naturezaOperacao: string;
  emitente: Omit<ConfigFiscalLoja, 'proximoNumeroNfce' | 'proximoNumeroNfe'>;
  destinatario?: DestinatarioNota;
  itens: ItemNota[];
  valorProdutos: number;
  valorDesconto: number;
  valorOutros: number;
  valorTotal: number;
  valorTributos: number;
  pagamento: PagamentoNota;
  informacoesAdicionais?: string;
}

export interface NotaFiscal {
  id: string;
  lojaId: string;
  entregaId?: string;
  pedidoId?: string;
  modelo: ModeloNota;
  numero?: number;
  serie?: number;
  chave?: string;
  protocolo?: string;
  status: StatusNota;
  ambiente: AmbienteFiscal;
  provedor: string;
  refProvedor: string;
  valorTotal: number;
  danfeUrl?: string;
  xmlUrl?: string;
  qrcodeUrl?: string;
  urlConsulta?: string;
  mensagem?: string;
  dados: DadosNota;
  emitidaEm?: string;
  criadoEm: string;
  atualizadoEm: string;
}
