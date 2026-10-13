import {
  ContextoEmissao, EmissaoInput, EmissaoResult, FiscalProviderAdapter,
} from '../FiscalProviderAdapter';
import { DadosNota, ModeloNota, StatusNota } from '../tipos';

// Driver REAL de emissão via Focus NFe (https://focusnfe.com.br/doc/).
//  - Autenticação: HTTP Basic com o token da empresa como usuário (senha vazia).
//  - NFC-e é síncrona; NF-e é assíncrona (volta "processando_autorizacao" e é
//    reconsultada por GET /v2/nfe/{ref}).
//  - Certificado A1 e CSC da NFC-e ficam na Focus: a loja cadastra lá direto OU
//    o Distre envia pela API de empresas (sincronizarEmpresaFocus, abaixo).
//  - A numeração (série/número) é controlada pela Focus.
//  - Tokens POR LOJA e POR AMBIENTE (a Focus emite um token de homologação e
//    outro de produção) — chegam no ContextoEmissao, nunca ficam no adapter.

const BASE_URL = {
  HOMOLOGACAO: 'https://homologacao.focusnfe.com.br',
  PRODUCAO: 'https://api.focusnfe.com.br',
} as const;

const TIMEOUT_MS = 30_000;
const POLL_NFE_TENTATIVAS = 8;
const POLL_NFE_INTERVALO_MS = 2_000;

function mapearStatus(statusFocus: string | undefined): StatusNota {
  switch (statusFocus) {
    case 'autorizado': return 'AUTORIZADA';
    case 'cancelado': return 'CANCELADA';
    case 'processando_autorizacao': return 'PROCESSANDO';
    case 'erro_autorizacao':
    case 'denegado': return 'REJEITADA';
    default: return 'ERRO';
  }
}

const dinheiro = (v: number) => Number(v.toFixed(2));

export class FocusNfeAdapter implements FiscalProviderAdapter {
  readonly nome = 'FOCUSNFE' as const;
  readonly numeracaoLocal = false;

  private async chamar(metodo: 'GET' | 'POST' | 'DELETE', caminho: string, ctx: ContextoEmissao, corpo?: unknown): Promise<any> {
    const token = ctx.tokenProvedor;
    if (!token) {
      const amb = ctx.ambiente === 'PRODUCAO' ? 'produção' : 'homologação';
      throw new Error(`Token de ${amb} da Focus NFe não configurado (Dados fiscais → Credenciais).`);
    }
    const url = `${BASE_URL[ctx.ambiente]}${caminho}`;
    const resp = await fetch(url, {
      method: metodo,
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${token}:`).toString('base64'),
        'Content-Type': 'application/json',
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const texto = await resp.text();
    let json: any = {};
    try { json = texto ? JSON.parse(texto) : {}; } catch { json = { mensagem: texto }; }
    if (!resp.ok && resp.status !== 422) {
      const detalhes = Array.isArray(json.erros) ? json.erros.map((e: any) => e.mensagem).join('; ') : '';
      throw new Error(`Focus NFe ${resp.status}: ${json.mensagem || json.codigo || 'erro'}${detalhes ? ` — ${detalhes}` : ''}`);
    }
    return json;
  }

  private traduzir(json: any, ctx: ContextoEmissao): EmissaoResult {
    const base = BASE_URL[ctx.ambiente];
    const abs = (p?: string) => (p ? (p.startsWith('http') ? p : `${base}${p}`) : undefined);
    const chave = typeof json.chave_nfe === 'string' ? json.chave_nfe.replace(/\D/g, '') : undefined;
    return {
      status: mapearStatus(json.status),
      numero: json.numero ? Number(json.numero) : undefined,
      serie: json.serie ? Number(json.serie) : undefined,
      chave,
      protocolo: json.protocolo || json.numero_protocolo || undefined,
      danfeUrl: abs(json.caminho_danfe),
      xmlUrl: abs(json.caminho_xml_nota_fiscal),
      qrcodeUrl: json.qrcode_url || undefined,
      urlConsulta: json.url_consulta_nf || undefined,
      mensagem: json.mensagem_sefaz || json.mensagem || undefined,
      emitidaEm: json.status === 'autorizado' ? new Date().toISOString() : undefined,
    };
  }

  private montarPayload(dados: DadosNota, ctx: ContextoEmissao): Record<string, unknown> {
    const d = dados.destinatario;
    const doc = d?.documento?.replace(/\D/g, '');
    const payload: Record<string, unknown> = {
      cnpj_emitente: ctx.cnpjEmitente,
      data_emissao: new Date().toISOString(),
      natureza_operacao: dados.naturezaOperacao,
      presenca_comprador: 4, // operação com entrega a domicílio
      modalidade_frete: 9,   // sem ocorrência de transporte (taxa de entrega vai em "outras despesas")
      local_destino: d?.uf && d.uf.toUpperCase() !== ctx.uf.toUpperCase() ? 2 : 1,
      items: dados.itens.map(i => ({
        numero_item: i.numero,
        codigo_produto: i.codigo,
        descricao: i.descricao,
        codigo_ncm: i.ncm,
        cfop: i.cfop,
        unidade_comercial: i.unidade,
        quantidade_comercial: i.quantidade,
        valor_unitario_comercial: i.valorUnitario,
        valor_bruto: i.valorBruto,
        unidade_tributavel: i.unidade,
        quantidade_tributavel: i.quantidade,
        valor_unitario_tributavel: i.valorUnitario,
        valor_desconto: i.valorDesconto || undefined,
        valor_outras_despesas: i.valorOutros || undefined,
        valor_total_tributos: i.valorTributos || undefined,
        // Sem código de barras cadastrado a SEFAZ exige o literal "SEM GTIN".
        codigo_barras_comercial: i.codigoBarras || 'SEM GTIN',
        codigo_barras_tributavel: i.codigoBarras || 'SEM GTIN',
        cest: i.cest || undefined,
        icms_origem: i.origem,
        icms_situacao_tributaria: i.icmsSituacao,
        pis_situacao_tributaria: '07',
        cofins_situacao_tributaria: '07',
      })),
      formas_pagamento: [{
        forma_pagamento: dados.pagamento.codigo,
        valor_pagamento: dinheiro(dados.pagamento.valor),
        ...(dados.pagamento.codigo === '03' ? { tipo_integracao: 2 } : {}), // cartão via maquininha não integrada
      }],
      informacoes_adicionais_contribuinte: dados.informacoesAdicionais,
    };

    if (doc) payload[doc.length === 14 ? 'cnpj_destinatario' : 'cpf_destinatario'] = doc;
    if (d?.nome) payload.nome_destinatario = d.nome;

    // Regras da SEFAZ para homologação (senão a nota é rejeitada): texto fixo no
    // 1º item da NFC-e e no nome do destinatário da NF-e.
    if (ctx.ambiente === 'HOMOLOGACAO') {
      const itens = payload.items as Array<Record<string, unknown>>;
      if (dados.modelo === 'NFCE' && itens[0]) {
        itens[0].descricao = 'NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL';
      }
      if (dados.modelo === 'NFE') {
        payload.nome_destinatario = 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL';
      }
    }

    if (dados.modelo === 'NFE') {
      Object.assign(payload, {
        tipo_documento: 1,       // saída
        finalidade_emissao: 1,   // normal
        consumidor_final: 1,
        indicador_inscricao_estadual_destinatario: 9, // não contribuinte
        logradouro_destinatario: d?.logradouro,
        numero_destinatario: d?.numero || 'S/N',
        bairro_destinatario: d?.bairro,
        municipio_destinatario: d?.municipio,
        uf_destinatario: d?.uf,
        cep_destinatario: d?.cep?.replace(/\D/g, ''),
        pais_destinatario: 'Brasil',
        email_destinatario: d?.email,
      });
    }
    return payload;
  }

  async emitir(input: EmissaoInput): Promise<EmissaoResult> {
    const rota = input.dados.modelo === 'NFCE' ? 'nfce' : 'nfe';
    const ref = encodeURIComponent(input.ref);
    const json = await this.chamar('POST', `/v2/${rota}?ref=${ref}`, input.ctx, this.montarPayload(input.dados, input.ctx));
    let resultado = this.traduzir(json, input.ctx);

    // NF-e: aguarda a SEFAZ por alguns segundos antes de devolver PROCESSANDO.
    for (let i = 0; rota === 'nfe' && resultado.status === 'PROCESSANDO' && i < POLL_NFE_TENTATIVAS; i++) {
      await new Promise(r => setTimeout(r, POLL_NFE_INTERVALO_MS));
      resultado = await this.consultar(input.ref, 'NFE', input.ctx);
    }
    return resultado;
  }

  async consultar(ref: string, modelo: ModeloNota, ctx: ContextoEmissao): Promise<EmissaoResult> {
    const rota = modelo === 'NFCE' ? 'nfce' : 'nfe';
    const json = await this.chamar('GET', `/v2/${rota}/${encodeURIComponent(ref)}?completa=0`, ctx);
    return this.traduzir(json, ctx);
  }

  async cancelar(ref: string, modelo: ModeloNota, justificativa: string, ctx: ContextoEmissao): Promise<EmissaoResult> {
    const rota = modelo === 'NFCE' ? 'nfce' : 'nfe';
    const json = await this.chamar('DELETE', `/v2/${rota}/${encodeURIComponent(ref)}`, ctx, { justificativa });
    return this.traduzir(json, ctx);
  }

  // Consulta uma referência que não existe: 404 = token aceito; 401/403 = token recusado.
  async testarConexao(ctx: ContextoEmissao): Promise<{ ok: boolean; mensagem: string }> {
    const amb = ctx.ambiente === 'PRODUCAO' ? 'produção' : 'homologação';
    if (!ctx.tokenProvedor) return { ok: false, mensagem: `Token de ${amb} da Focus NFe não informado.` };
    try {
      const resp = await fetch(`${BASE_URL[ctx.ambiente]}/v2/nfce/distre-teste-conexao`, {
        headers: { Authorization: 'Basic ' + Buffer.from(`${ctx.tokenProvedor}:`).toString('base64') },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (resp.status === 404 || resp.ok) return { ok: true, mensagem: `Conectado à Focus NFe (${amb}): token aceito.` };
      if (resp.status === 401 || resp.status === 403) return { ok: false, mensagem: `A Focus NFe recusou o token de ${amb} (HTTP ${resp.status}). Confira o token no painel da Focus.` };
      return { ok: false, mensagem: `Resposta inesperada da Focus NFe (HTTP ${resp.status}).` };
    } catch (err: any) {
      return { ok: false, mensagem: `Sem conexão com a Focus NFe: ${err?.message || err}` };
    }
  }
}

// ─── API de Empresas da Focus (cadastro do emitente + certificado + CSC) ─────
// Usa o token PRINCIPAL da conta Focus. Cria a empresa (ou atualiza, se o CNPJ já
// existir) enviando dados cadastrais, certificado A1 e CSC; a Focus devolve os
// tokens de emissão de homologação e de produção da empresa.

export interface DadosSincronizacaoFocus {
  tokenPrincipal: string;
  emitente: {
    razaoSocial: string; nomeFantasia?: string; cnpj: string; inscricaoEstadual: string; regimeTributario: number;
    logradouro: string; numero: string; bairro: string; municipio: string; uf: string; cep: string; telefone?: string; email?: string;
  };
  certificadoPfx?: Buffer;
  certificadoSenha?: string;
  cscIdHomologacao?: string;
  cscHomologacao?: string;
  cscIdProducao?: string;
  cscProducao?: string;
}

export async function sincronizarEmpresaFocus(d: DadosSincronizacaoFocus): Promise<{ empresaId?: string; tokenHomologacao?: string; tokenProducao?: string; criada: boolean }> {
  const auth = 'Basic ' + Buffer.from(`${d.tokenPrincipal}:`).toString('base64');
  const chamar = async (metodo: string, caminho: string, corpo?: unknown) => {
    const resp = await fetch(`${BASE_URL.PRODUCAO}${caminho}`, {
      method: metodo,
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const texto = await resp.text();
    let json: any = {};
    try { json = texto ? JSON.parse(texto) : {}; } catch { json = { mensagem: texto }; }
    if (resp.status === 401 || resp.status === 403) {
      throw new Error('A Focus NFe recusou o token principal da conta (API de empresas). Confira o token em Minha Conta → Tokens no painel da Focus.');
    }
    if (!resp.ok) {
      const detalhes = Array.isArray(json.erros) ? json.erros.map((e: any) => e.mensagem).join('; ') : '';
      throw new Error(`Focus NFe ${resp.status}: ${json.mensagem || json.codigo || 'erro'}${detalhes ? ` — ${detalhes}` : ''}`);
    }
    return json;
  };

  const e = d.emitente;
  const corpo: Record<string, unknown> = {
    nome: e.razaoSocial,
    nome_fantasia: e.nomeFantasia || e.razaoSocial,
    cnpj: e.cnpj,
    inscricao_estadual: e.inscricaoEstadual,
    regime_tributario: e.regimeTributario,
    logradouro: e.logradouro,
    numero: e.numero,
    bairro: e.bairro,
    municipio: e.municipio,
    uf: e.uf,
    cep: e.cep,
    telefone: e.telefone,
    email: e.email,
    habilita_nfe: true,
    habilita_nfce: true,
  };
  if (d.certificadoPfx && d.certificadoSenha) {
    corpo.arquivo_certificado_base64 = d.certificadoPfx.toString('base64');
    corpo.senha_certificado = d.certificadoSenha;
  }
  if (d.cscIdHomologacao && d.cscHomologacao) {
    corpo.id_token_nfce_homologacao = d.cscIdHomologacao;
    corpo.csc_nfce_homologacao = d.cscHomologacao;
  }
  if (d.cscIdProducao && d.cscProducao) {
    corpo.id_token_nfce_producao = d.cscIdProducao;
    corpo.csc_nfce_producao = d.cscProducao;
  }

  const existentes = await chamar('GET', `/v2/empresas?cnpj=${encodeURIComponent(e.cnpj)}`);
  const atual = Array.isArray(existentes) ? existentes.find((x: any) => String(x.cnpj || '').replace(/\D/g, '') === e.cnpj) : undefined;
  const r = atual?.id
    ? await chamar('PUT', `/v2/empresas/${encodeURIComponent(atual.id)}`, corpo)
    : await chamar('POST', '/v2/empresas', corpo);
  return {
    empresaId: r.id ? String(r.id) : atual?.id ? String(atual.id) : undefined,
    tokenHomologacao: r.token_homologacao || atual?.token_homologacao || undefined,
    tokenProducao: r.token_producao || atual?.token_producao || undefined,
    criada: !atual?.id,
  };
}
