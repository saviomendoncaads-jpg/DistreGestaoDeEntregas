import crypto from 'crypto';
import { obterProdutos } from '../database';
import { Entrega, FormaPagamento, Produto } from '../types';
import { getProvedorFiscal } from './fiscalFactory';
import { ContextoEmissao } from './FiscalProviderAdapter';
import {
  obterConfigFiscal, obterCredenciais, obterNotaAtivaDaVenda, reservarNumero, salvarNota,
} from './fiscalRepo';
import {
  ConfigFiscalLoja, CredenciaisFiscais, DadosNota, DestinatarioNota, ItemChecklist, ItemNota, ModeloNota,
  NotaFiscal, PagamentoNota, Prontidao, ResumoCredenciais,
} from './tipos';

// Regra de negócio da emissão fiscal: monta o documento a partir da comanda,
// valida, reserva numeração, chama o provedor e persiste o resultado.

export class ErroFiscal extends Error {
  constructor(message: string, readonly httpStatus = 400, readonly nota?: NotaFiscal) {
    super(message);
  }
}

// ─── Validações de documento ──────────────────────────────────────────────────

const soDigitos = (s?: string) => (s || '').replace(/\D/g, '');

export function cpfValido(cpf: string): boolean {
  const c = soDigitos(cpf);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  for (const t of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(c[i]) * (t + 1 - i);
    const dv = ((soma * 10) % 11) % 10;
    if (dv !== Number(c[t])) return false;
  }
  return true;
}

export function cnpjValido(cnpj: string): boolean {
  const c = soDigitos(cnpj);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split('').reduce((acc, d, i) => acc + Number(d) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return calc(c.slice(0, 12)) === Number(c[12]) && calc(c.slice(0, 13)) === Number(c[13]);
}

export function documentoValido(doc: string): boolean {
  const d = soDigitos(doc);
  return d.length === 11 ? cpfValido(d) : d.length === 14 ? cnpjValido(d) : false;
}

// ─── Montagem dos itens ───────────────────────────────────────────────────────

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// As linhas chegam como "3x Nome do produto (observação)" (formato da vitrine / WhatsApp).
// A observação do cliente não faz parte da descrição fiscal nem do nome no cardápio.
function parseLinha(linha: string): { qtd: number; nome: string } {
  const m = linha.match(/^\s*(\d+)\s*x\s+(.*)$/i);
  const { qtd, nome } = m ? { qtd: Math.max(1, Number(m[1])), nome: m[2] } : { qtd: 1, nome: linha };
  return { qtd, nome: nome.replace(/\s*\([^()]*\)\s*$/, '').trim() };
}

/** Divide `totalCentavos` proporcionalmente aos pesos; a última fatia absorve o arredondamento. */
function ratear(totalCentavos: number, pesos: number[]): number[] {
  const somaPesos = pesos.reduce((a, b) => a + b, 0);
  if (totalCentavos === 0 || somaPesos === 0) return pesos.map(() => 0);
  const partes = pesos.map(p => Math.floor((totalCentavos * p) / somaPesos));
  partes[partes.length - 1] += totalCentavos - partes.reduce((a, b) => a + b, 0);
  return partes;
}

interface LinhaPrecificada { produto?: Produto; qtd: number; nome: string; codigo: string; brutoCentavos: number }

// Taxa de entrega digitada como "item" não é mercadoria (sem NCM): fica fora dos
// itens e entra no total como "outras despesas" pela diferença do valor da venda.
const LINHA_TAXA_ENTREGA = /^(taxa|tx)\.?\s*(de\s*)?entrega$|^frete$/i;

async function precificarLinhas(entrega: Entrega, lojaId: string): Promise<{ linhas: LinhaPrecificada[]; totalCentavos: number }> {
  const brutas = (entrega.itens || []).map(parseLinha).filter(l => l.nome && !LINHA_TAXA_ENTREGA.test(l.nome));
  const produtos = await obterProdutos(lojaId);
  const porNome = new Map(produtos.map(p => [normalizar(p.nome), p]));

  if (brutas.length === 0) {
    const total = Math.round((entrega.valor ?? 0) * 100);
    if (total <= 0) throw new ErroFiscal('A comanda não tem itens nem valor — não há o que faturar.');
    return { linhas: [{ qtd: 1, nome: 'Mercadorias diversas', codigo: 'DIVERSOS', brutoCentavos: total }], totalCentavos: total };
  }

  const linhas = brutas.map(l => {
    const p = porNome.get(normalizar(l.nome));
    return {
      produto: p,
      qtd: l.qtd,
      nome: l.nome,
      // Sem cadastro: código curto e estável derivado do nome (cProd é obrigatório).
      codigo: p?.id || normalizar(l.nome).replace(/[^a-z0-9]/g, '').slice(0, 8).toUpperCase() || 'ITEM',
      brutoCentavos: p ? Math.round(p.preco * 100) * l.qtd : -1, // -1 = sem preço de cadastro
    };
  });

  const somaConhecida = linhas.filter(l => l.brutoCentavos >= 0).reduce((a, l) => a + l.brutoCentavos, 0);
  const total = entrega.valor !== undefined && entrega.valor !== null ? Math.round(entrega.valor * 100) : somaConhecida;
  const semPreco = linhas.filter(l => l.brutoCentavos < 0);

  if (semPreco.length > 0) {
    const restante = total - somaConhecida;
    if (restante > 0) {
      // Itens sem cadastro dividem o valor que sobrou, proporcional à quantidade.
      const fatias = ratear(restante, semPreco.map(l => l.qtd));
      semPreco.forEach((l, i) => { l.brutoCentavos = fatias[i]; });
    } else {
      // Não dá para conciliar com o cadastro: distribui o total da venda por quantidade.
      const fatias = ratear(total, linhas.map(l => l.qtd));
      linhas.forEach((l, i) => { l.brutoCentavos = fatias[i]; });
    }
  }
  if (total <= 0) throw new ErroFiscal('Valor total da venda inválido para emissão.');
  return { linhas, totalCentavos: total };
}

const PAGAMENTO: Record<FormaPagamento, { codigo: string; descricao: string }> = {
  dinheiro: { codigo: '01', descricao: 'Dinheiro' },
  maquininha: { codigo: '03', descricao: 'Cartão (maquininha)' }, // ajuste p/ 04 se a loja só aceita débito
  pix: { codigo: '17', descricao: 'PIX' },
};

export async function montarDadosNota(p: {
  entrega: Entrega;
  config: ConfigFiscalLoja;
  modelo: ModeloNota;
  destinatario?: DestinatarioNota;
  vendaId: string;
}): Promise<DadosNota> {
  const { config, modelo } = p;
  const { linhas, totalCentavos } = await precificarLinhas(p.entrega, config.lojaId);

  const produtosCentavos = linhas.reduce((a, l) => a + l.brutoCentavos, 0);
  const diferenca = totalCentavos - produtosCentavos;
  // Sobra = taxa de entrega (outras despesas); falta = desconto concedido.
  const outros = ratear(Math.max(0, diferenca), linhas.map(l => l.brutoCentavos));
  const descontos = ratear(Math.max(0, -diferenca), linhas.map(l => l.brutoCentavos));

  // Lei 12.741: tributos aproximados sobre o valor líquido de cada item (percentual IBPT da loja).
  const pctTributos = Math.max(0, config.percentualTributos || 0);
  const tributos = linhas.map((l, i) =>
    Math.round(((l.brutoCentavos - descontos[i] + outros[i]) * pctTributos) / 100));

  const itens: ItemNota[] = linhas.map((l, i) => {
    // Dado fiscal do cadastro do produto tem prioridade; vazio = padrão da loja.
    const prod: Produto | undefined = l.produto;
    return {
      numero: i + 1,
      codigo: l.codigo,
      descricao: l.nome.slice(0, 120),
      ncm: prod?.ncm || config.ncmPadrao,
      cest: prod?.cest,
      codigoBarras: prod?.codigoBarras,
      cfop: prod?.cfop || config.cfopPadrao,
      unidade: prod?.unidade || 'UN',
      quantidade: l.qtd,
      valorUnitario: Number((l.brutoCentavos / 100 / l.qtd).toFixed(4)),
      valorBruto: l.brutoCentavos / 100,
      valorDesconto: descontos[i] / 100,
      valorOutros: outros[i] / 100,
      valorTributos: tributos[i] / 100,
      origem: config.origemPadrao,
      icmsSituacao: prod?.icmsSituacao || config.icmsSituacaoPadrao,
    };
  });

  const pagamentoBase = PAGAMENTO[p.entrega.formaPagamento || 'dinheiro'] || PAGAMENTO.dinheiro;
  const pagamento: PagamentoNota = { ...pagamentoBase, valor: totalCentavos / 100 };

  const { proximoNumeroNfce: _a, proximoNumeroNfe: _b, ...emitente } = config;

  return {
    modelo,
    naturezaOperacao: 'Venda de mercadoria',
    emitente,
    destinatario: p.destinatario,
    itens,
    valorProdutos: produtosCentavos / 100,
    valorDesconto: Math.max(0, -diferenca) / 100,
    valorOutros: Math.max(0, diferenca) / 100,
    valorTotal: totalCentavos / 100,
    valorTributos: tributos.reduce((a, b) => a + b, 0) / 100,
    pagamento,
    informacoesAdicionais: `Venda ${p.vendaId}${p.entrega.id !== p.vendaId ? ` - Entrega ${p.entrega.id}` : ''}. Emitido via Distre.`,
  };
}

// ─── Validação prévia (antes de mexer no status da comanda) ──────────────────

export function normalizarDestinatario(d: any): DestinatarioNota | undefined {
  if (!d || typeof d !== 'object') return undefined;
  const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '') || undefined;
  const out: DestinatarioNota = {
    nome: txt(d.nome, 60),
    documento: soDigitos(d.documento) || undefined,
    logradouro: txt(d.logradouro, 60),
    numero: txt(d.numero, 20),
    bairro: txt(d.bairro, 60),
    municipio: txt(d.municipio, 60),
    uf: txt(d.uf, 2)?.toUpperCase(),
    cep: soDigitos(d.cep) || undefined,
    email: txt(d.email, 120),
  };
  return Object.values(out).some(Boolean) ? out : undefined;
}

export async function validarEmissao(lojaId: string, modelo: ModeloNota, destinatario?: DestinatarioNota): Promise<{ config: ConfigFiscalLoja; credenciais: CredenciaisFiscais }> {
  const config = await obterConfigFiscal(lojaId);
  if (!config) {
    throw new ErroFiscal('Dados fiscais da loja não configurados. Abra "Dados fiscais" no painel e preencha CNPJ, IE e endereço.', 412);
  }
  if (destinatario?.documento && !documentoValido(destinatario.documento)) {
    throw new ErroFiscal('CPF/CNPJ do destinatário inválido.');
  }
  if (modelo === 'NFE') {
    const d = destinatario;
    const faltando = [
      !d?.nome && 'nome',
      !d?.documento && 'CPF/CNPJ',
      !d?.logradouro && 'logradouro',
      !d?.bairro && 'bairro',
      !d?.municipio && 'município',
      !(d?.uf && d.uf.length === 2) && 'UF',
      !(d?.cep && d.cep.length === 8) && 'CEP',
    ].filter(Boolean);
    if (faltando.length) {
      throw new ErroFiscal(`NF-e exige os dados do destinatário. Faltando: ${faltando.join(', ')}.`);
    }
  }
  const credenciais = await obterCredenciais(lojaId);
  const prontidao = calcularProntidao(config, credenciais);
  if (!prontidao.podeEmitir) {
    const pendentes = prontidao.itens.filter(i => i.obrigatorio && !i.ok).map(i => i.detalhe || i.rotulo);
    throw new ErroFiscal(`Emissão bloqueada — ${pendentes.join('; ')}. Ajuste em "Dados fiscais".`, 412);
  }
  return { config, credenciais };
}

// ─── Prontidão (checklist exibido no painel) ─────────────────────────────────

const diasAte = (iso?: string) => (iso ? Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000) : undefined);

export function resumoCredenciais(c: CredenciaisFiscais): ResumoCredenciais {
  return {
    certificado: c.certificadoPfx
      ? { titular: c.certificadoTitular, cnpj: c.certificadoCnpj, validoAte: c.certificadoValidoAte, diasRestantes: diasAte(c.certificadoValidoAte) }
      : undefined,
    cscHomologacao: { configurado: !!(c.cscIdHomologacao && c.cscHomologacao), id: c.cscIdHomologacao },
    cscProducao: { configurado: !!(c.cscIdProducao && c.cscProducao), id: c.cscIdProducao },
    focusTokenHomologacao: !!c.focusTokenHomologacao,
    focusTokenProducao: !!c.focusTokenProducao,
    focusTokenPrincipal: !!c.focusTokenPrincipal,
    sincronizadoEm: c.sincronizadoEm,
  };
}

/**
 * O que falta para emitir. `ambienteAlvo` permite perguntar "e se fosse produção?".
 * Com a Focus, certificado/CSC podem ter sido cadastrados direto no painel dela —
 * por isso só viram bloqueio quando foram enviados aqui e estão inválidos.
 */
export function calcularProntidao(config: ConfigFiscalLoja | null, c: CredenciaisFiscais, ambienteAlvo?: ConfigFiscalLoja['ambiente']): Prontidao {
  const itens: ItemChecklist[] = [];
  const ambiente = ambienteAlvo || config?.ambiente || 'HOMOLOGACAO';
  const amb = ambiente === 'PRODUCAO' ? 'produção' : 'homologação';

  itens.push({ chave: 'emitente', rotulo: 'Dados do emitente (CNPJ, IE, endereço)', ok: !!config, obrigatorio: true, detalhe: config ? undefined : 'preencha e salve os dados do emitente' });

  if (!config || config.provedor === 'SIMULADO') {
    itens.push({ chave: 'provedor', rotulo: 'Provedor: SIMULADO (notas sem valor fiscal)', ok: ambiente !== 'PRODUCAO', obrigatorio: true,
      detalhe: ambiente === 'PRODUCAO' ? 'produção exige o provedor Focus NFe' : 'para valer de verdade, escolha Focus NFe' });
  } else {
    const token = ambiente === 'PRODUCAO' ? c.focusTokenProducao : c.focusTokenHomologacao;
    itens.push({ chave: 'token', rotulo: `Token Focus NFe de ${amb}`, ok: !!token, obrigatorio: true, detalhe: token ? undefined : `informe o token de ${amb} da Focus NFe (ou use "Sincronizar com a Focus")` });

    const dias = diasAte(c.certificadoValidoAte);
    if (c.certificadoPfx) {
      const vencido = dias !== undefined && dias < 0;
      const raizOk = !c.certificadoCnpj || c.certificadoCnpj.slice(0, 8) === config.cnpj.slice(0, 8);
      itens.push({
        chave: 'certificado', rotulo: 'Certificado digital A1', ok: !vencido && raizOk, obrigatorio: true,
        detalhe: vencido ? 'certificado A1 vencido — envie o novo' : !raizOk ? 'certificado é de outro CNPJ (raiz diferente do emitente)'
          : dias !== undefined && dias <= 30 ? `vence em ${dias} dia(s)` : undefined,
      });
    } else {
      itens.push({ chave: 'certificado', rotulo: 'Certificado digital A1', ok: false, obrigatorio: false, detalhe: 'não enviado aqui — ok se já está cadastrado no painel da Focus' });
    }
    const cscOk = ambiente === 'PRODUCAO' ? !!(c.cscIdProducao && c.cscProducao) : !!(c.cscIdHomologacao && c.cscHomologacao);
    itens.push({ chave: 'csc', rotulo: `CSC da NFC-e (${amb})`, ok: cscOk, obrigatorio: false, detalhe: cscOk ? undefined : 'não enviado aqui — ok se já está cadastrado no painel da Focus' });
  }

  const podeEmitir = itens.every(i => i.ok || !i.obrigatorio);
  const prod = ambiente === 'PRODUCAO' ? null : calcularProntidao(config, c, 'PRODUCAO');
  return { podeEmitir, podeEmitirEmProducao: prod ? prod.podeEmitir : podeEmitir, itens };
}

// ─── Emissão ──────────────────────────────────────────────────────────────────

function contexto(config: ConfigFiscalLoja, c: CredenciaisFiscais, ambiente = config.ambiente): ContextoEmissao {
  return {
    ambiente,
    cnpjEmitente: config.cnpj,
    uf: config.uf,
    tokenProvedor: ambiente === 'PRODUCAO' ? c.focusTokenProducao : c.focusTokenHomologacao,
  };
}

/** Provedor que EMITIU a nota (para consultar/cancelar no mesmo lugar, mesmo se a loja trocar depois). */
const provedorDaNota = (n: NotaFiscal) => getProvedorFiscal(n.provedor === 'FOCUSNFE' ? 'FOCUSNFE' : 'SIMULADO');

/** Id da VENDA: pedido de origem quando a entrega nasceu de um pedido; senão a própria entrega. */
export function vendaIdDaEntrega(entrega: Entrega): string {
  const m = (entrega.referencia || '').match(/Origem: Pedido (\S+)/);
  return m ? m[1] : entrega.id;
}

export async function emitirNotaDaVenda(p: {
  lojaId: string;
  entrega: Entrega;
  vendaId: string;
  modelo: ModeloNota;
  destinatario?: DestinatarioNota;
}): Promise<NotaFiscal> {
  const { config, credenciais } = await validarEmissao(p.lojaId, p.modelo, p.destinatario);

  const ativa = await obterNotaAtivaDaVenda(p.vendaId);
  if (ativa) {
    const tipo = ativa.modelo === 'NFCE' ? 'NFC-e' : 'NF-e';
    throw new ErroFiscal(
      `Esta venda já tem ${tipo}${ativa.numero ? ` nº ${ativa.numero}` : ''} ${ativa.status === 'PROCESSANDO' ? 'em processamento' : 'autorizada'}. ` +
      'Uma venda não pode ter NFC-e e NF-e ao mesmo tempo: reimprima a nota existente ou cancele-a antes de emitir outra.',
      409, ativa,
    );
  }

  const dados = await montarDadosNota({ entrega: p.entrega, config, modelo: p.modelo, destinatario: p.destinatario, vendaId: p.vendaId });
  const provedor = getProvedorFiscal(config.provedor);
  const serie = p.modelo === 'NFCE' ? config.serieNfce : config.serieNfe;
  const numero = provedor.numeracaoLocal ? await reservarNumero(config.lojaId, p.modelo) : undefined;
  const agora = new Date().toISOString();
  const id = `nf-${crypto.randomBytes(6).toString('hex')}`;

  const nota: NotaFiscal = {
    id,
    lojaId: p.lojaId,
    entregaId: p.entrega.id,
    pedidoId: p.vendaId,
    modelo: p.modelo,
    numero,
    serie,
    status: 'PROCESSANDO',
    // O Mock é sempre simulado: nunca marca PRODUCAO para não sugerir valor fiscal.
    ambiente: provedor.nome === 'MOCK' ? 'HOMOLOGACAO' : config.ambiente,
    provedor: provedor.nome,
    refProvedor: id,
    valorTotal: dados.valorTotal,
    dados,
    criadoEm: agora,
    atualizadoEm: agora,
  };
  // Grava antes de chamar o provedor: se o processo cair no meio, a nota fica
  // rastreável como PROCESSANDO e pode ser reconsultada (sem emissão fantasma).
  await salvarNota(nota);

  try {
    const r = await provedor.emitir({ ref: nota.refProvedor, numero, serie, dados, ctx: contexto(config, credenciais, nota.ambiente) });
    Object.assign(nota, {
      status: r.status,
      numero: r.numero ?? nota.numero,
      serie: r.serie ?? nota.serie,
      chave: r.chave,
      protocolo: r.protocolo,
      danfeUrl: r.danfeUrl,
      xmlUrl: r.xmlUrl,
      qrcodeUrl: r.qrcodeUrl,
      urlConsulta: r.urlConsulta,
      mensagem: r.mensagem,
      emitidaEm: r.emitidaEm,
    });
  } catch (err: any) {
    nota.status = 'ERRO';
    nota.mensagem = err?.message || String(err);
    console.error(`[Fiscal] Falha ao emitir ${p.modelo} da venda ${p.vendaId}:`, nota.mensagem);
  }
  nota.atualizadoEm = new Date().toISOString();
  await salvarNota(nota);
  console.log(`[Fiscal] ${p.modelo} ${nota.numero ?? ''} da venda ${p.vendaId}: ${nota.status}`);
  return nota;
}

export async function atualizarNota(nota: NotaFiscal): Promise<NotaFiscal> {
  const config = await obterConfigFiscal(nota.lojaId);
  if (!config) throw new ErroFiscal('Configuração fiscal da loja não encontrada.', 412);
  const cred = await obterCredenciais(nota.lojaId);
  const r = await provedorDaNota(nota).consultar(nota.refProvedor, nota.modelo, contexto(config, cred, nota.ambiente));
  Object.assign(nota, {
    status: r.status,
    numero: r.numero ?? nota.numero,
    serie: r.serie ?? nota.serie,
    chave: r.chave ?? nota.chave,
    protocolo: r.protocolo ?? nota.protocolo,
    danfeUrl: r.danfeUrl ?? nota.danfeUrl,
    xmlUrl: r.xmlUrl ?? nota.xmlUrl,
    qrcodeUrl: r.qrcodeUrl ?? nota.qrcodeUrl,
    urlConsulta: r.urlConsulta ?? nota.urlConsulta,
    mensagem: r.mensagem ?? nota.mensagem,
    emitidaEm: r.emitidaEm ?? nota.emitidaEm,
    atualizadoEm: new Date().toISOString(),
  });
  await salvarNota(nota);
  return nota;
}

export async function cancelarNota(nota: NotaFiscal, justificativa: string): Promise<NotaFiscal> {
  if (nota.status !== 'AUTORIZADA') throw new ErroFiscal('Só é possível cancelar nota AUTORIZADA.');
  const j = justificativa.trim();
  if (j.length < 15 || j.length > 255) throw new ErroFiscal('A justificativa do cancelamento deve ter de 15 a 255 caracteres.');
  const config = await obterConfigFiscal(nota.lojaId);
  if (!config) throw new ErroFiscal('Configuração fiscal da loja não encontrada.', 412);
  const cred = await obterCredenciais(nota.lojaId);
  const r = await provedorDaNota(nota).cancelar(nota.refProvedor, nota.modelo, j, contexto(config, cred, nota.ambiente));
  if (r.status !== 'CANCELADA') {
    throw new ErroFiscal(`Cancelamento não homologado: ${r.mensagem || r.status}`, 502);
  }
  nota.status = 'CANCELADA';
  nota.mensagem = r.mensagem || `Cancelada: ${j}`;
  nota.atualizadoEm = new Date().toISOString();
  await salvarNota(nota);
  return nota;
}
