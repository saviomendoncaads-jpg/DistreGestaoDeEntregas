export interface Empresa {
  id: string;
  nome: string;
  cnpj: string;
  telefone?: string;
  email?: string;
  ativo: boolean;
  criadoEm: string;
  totalLojas?: number;
  lojasAtivas?: number;
}

export interface BillingConfiguration {
  diasCarenciaBloqueio: number;
  multaPercentual: number;
  jurosMesPercentual: number;
  emailNotificacaoDiasAntes: number;
  whatsappNotificacaoDiasAtraso: number;
}

export interface SubscriptionPlan {
  id: string;
  nome: string;
  descricao: string;
  valorMensal: number;
  limiteEntregasMes: number | null;
  limiteLojas: number | null;
  limiteMotoristas: number | null;
  ativo: boolean;
}

export interface Loja {
  id: string;
  empresaId: string;
  nome: string;
  cnpj?: string;
  endereco?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  usuario: string;
  chaveAcesso: string;
  ativo: boolean;
  criadoEm: string;
  recebePedidos?: boolean;
  latitude?: number;
  longitude?: number;
}
