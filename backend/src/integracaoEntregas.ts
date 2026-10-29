import { validarValoresIntegracao } from './integracaoValidation';
import { asyncHandler } from './http/asyncHandler';
import { Router, Request, Response } from 'express';
import { broker } from './broker';
import { salvarEntrega } from './database';
import { Entrega, FormaPagamento, Prioridade, TipoCarga } from './types';
import { lojas } from './tenants';
import { deliveries, gerarIdComanda } from './gateway';
import { geocodificarEndereco } from './geocoding';
import { verificarLimiteEntregasMes, erroLimite } from './billing/planLimitsService';

import { obterConfigEntrega, cotarEntrega, confirmarCotacao, type SelecaoEntrega } from './entregaService';
import { ErroEntrega } from './configEntrega';

const router = Router();

type FormaPgtoEntrada =
  | 'pix'
  | 'dinheiro'
  | 'maquininha'
  | 'credito'
  | 'debito'
  | 'cartao'
  | 'cartao_credito'
  | 'cartao_debito';

interface EntregaEntradaProduto {
  nome: string;
  quantidade: number;
  precoUnitario?: number;
  observacao?: string;
}

interface EntregaEntrada {
  entrega?: SelecaoEntrega;
  lojaId?: string;
  cliente: {
    nome: string;
    telefone?: string;
    documento?: string;
  };
  produtos: EntregaEntradaProduto[];
  valores?: {
    subtotal?: number;
    taxaEntrega?: number;
    desconto?: number;
    total?: number;
  };
  endereco: {
    logradouro: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade?: string;
    uf?: string;
    cep?: string;
    referencia?: string;
  };
  pagamento?: {
    forma?: FormaPgtoEntrada;
    troco?: number;
  };
  prioridade?: Prioridade;
  tipoCarga?: TipoCarga;
  observacao?: string;
  idPedidoExterno?: string;
  numeroPedidoErp?: string;
  origemErp?: string;
}

function normalizarFormaPagamento(forma?: FormaPgtoEntrada): FormaPagamento {
  switch (forma) {
    case 'pix':
      return 'pix';
    case 'dinheiro':
      return 'dinheiro';
    case 'maquininha':
    case 'credito':
    case 'debito':
    case 'cartao':
    case 'cartao_credito':
    case 'cartao_debito':
      return 'maquininha';
    default:
      return 'maquininha';
  }
}

function montarEndereco(end: EntregaEntrada['endereco']): string {
  const partes: string[] = [];
  if (end.logradouro) partes.push(end.logradouro);
  if (end.numero) partes.push(end.numero);
  if (end.complemento) partes.push(end.complemento);
  if (end.cidade) partes.push(end.cidade);
  if (end.uf) partes.push(end.uf);
  if (end.cep) partes.push(`CEP ${end.cep}`);
  return partes.join(', ');
}

// POST /api/integracao/entregas — Ingestão de comandas de entrega prontas (ERPs externos)
// A mercadoria já está faturada/separada no ERP de origem. Sempre cria comanda do tipo
// 'entrega' e publica imediatamente no broker para despacho automático pelo Agente
// Dispatcher, independente do flag `recebePedidos` da loja.
router.post('/entregas', asyncHandler(async (req: Request, res: Response) => {
  try {
    const lojaId = (req.header('x-loja-id') || (req.body?.lojaId as string | undefined) || '').trim();
    if (!lojaId) {
      res.status(400).json({ error: 'Header X-Loja-Id (ou campo lojaId) é obrigatório.' });
      return;
    }

    const loja = lojas.find(l => l.id === lojaId);
    if (!loja) {
      res.status(404).json({ error: 'Loja não encontrada.' });
      return;
    }

    // Enforcement de plano: respeita o teto mensal de entregas do tier da loja.
    const limite = await verificarLimiteEntregasMes(lojaId);
    if (!limite.permitido) {
      res.status(403).json(erroLimite(limite));
      return;
    }

    const payload = req.body as EntregaEntrada;
    if (!payload || typeof payload !== 'object') {
      res.status(400).json({ error: 'Payload inválido.' });
      return;
    }

    const {
      cliente,
      produtos,
      endereco,
      valores,
      pagamento,
      observacao,
      idPedidoExterno,
      numeroPedidoErp,
      origemErp
    } = payload;

    if (typeof cliente?.nome !== 'string' || !cliente.nome.trim()) {
      res.status(400).json({ error: 'cliente.nome é obrigatório.' });
      return;
    }
    if (!Array.isArray(produtos) || produtos.length === 0) {
      res.status(400).json({ error: 'produtos[] é obrigatório e não pode estar vazio.' });
      return;
    }
    if (typeof endereco?.logradouro !== 'string' || !endereco.logradouro.trim()) {
      res.status(400).json({ error: 'endereco.logradouro é obrigatório.' });
      return;
    }

    for (const [i, p] of produtos.entries()) {
      if (typeof p?.nome !== 'string' || !p.nome.trim() || !Number.isFinite(p.quantidade) || p.quantidade <= 0) {
        res.status(400).json({ error: `produtos[${i}] inválido: nome e quantidade (>0) são obrigatórios.` });
        return;
      }
    }

    const erroValores = validarValoresIntegracao(produtos, valores);
    if (erroValores) { res.status(400).json({ error: erroValores }); return; }
    const subtotalCalc = produtos.reduce(
      (acc, p) => acc + Math.round((Number(p.precoUnitario) || 0) * 100) * Number(p.quantidade) / 100,
      0
    );
    const subtotal = valores?.subtotal ?? subtotalCalc;
    const regrasEntrega = await obterConfigEntrega(lojaId, loja.cep);
    let servicoEntrega;
    if (regrasEntrega.ativa) {
      if (!payload.entrega) throw new ErroEntrega('Selecione o tipo de entrega na pré-venda.');
      servicoEntrega = payload.entrega.cotacaoId
        ? confirmarCotacao(lojaId, regrasEntrega, endereco, payload.entrega)
        : (await cotarEntrega(lojaId, regrasEntrega, endereco, payload.entrega)).servico;
    }
    const taxaEntrega = servicoEntrega?.taxa ?? valores?.taxaEntrega ?? 0;
    if (servicoEntrega && valores?.taxaEntrega !== undefined && Math.round(valores.taxaEntrega*100) !== Math.round(taxaEntrega*100)) throw new ErroEntrega('A taxa informada diverge das regras de entrega. Atualize a cotação.', 409);
    const desconto = valores?.desconto ?? 0;
    const totalCalculado = Number((subtotal + taxaEntrega - desconto).toFixed(2));
    if (servicoEntrega && valores?.total !== undefined && Math.round(valores.total*100) !== Math.round(totalCalculado*100)) throw new ErroEntrega('O total informado diverge do total com a entrega.', 409);
    const total = servicoEntrega ? totalCalculado : valores?.total ?? totalCalculado;

    const itensTexto = produtos.map(p => `${p.quantidade}x ${p.nome}`);
    const enderecoTexto = montarEndereco(endereco);

    // Geocodifica o endereço do destino para que o pino caia no lugar real no mapa.
    const destinoCoord = await geocodificarEndereco({
      endereco: endereco.logradouro,
      numero: endereco.numero,
      bairro: endereco.bairro,
      cidade: endereco.cidade,
      uf: endereco.uf,
      cep: endereco.cep
    });

    const id = gerarIdComanda();
    const nowIso = new Date().toISOString();

    const novaEntrega: Entrega = {
      id,
      nomeCliente: cliente.nome,
      clienteDocumento: cliente.documento || undefined,
      endereco: enderecoTexto,
      itens: itensTexto,
      prioridade: (payload.prioridade || 'media') as Prioridade,
      tipoCarga: servicoEntrega?.tipo === 'EXPRESS' ? 'expressa' : servicoEntrega?.tipo === 'AGENDADA' ? 'agendado' : servicoEntrega ? 'normal' : (payload.tipoCarga || 'normal') as TipoCarga,
      servicoEntrega,
      status: 'RECEBIDO',
      valor: total,
      incidentes: [],
      urlWebhook: 'http://localhost:5000/api/simulator/webhook',
      logsWebhook: [],
      criadoEm: nowIso,
      atualizadoEm: nowIso,
      formaPagamento: normalizarFormaPagamento(pagamento?.forma),
      bairro: endereco.bairro || undefined,
      cidade: endereco.cidade || undefined,
      referencia: [
        endereco.referencia,
        observacao,
        pagamento?.troco ? `Troco para R$ ${pagamento.troco.toFixed(2)}` : undefined,
        numeroPedidoErp ? `ERP: ${numeroPedidoErp}` : undefined,
        origemErp ? `Origem: ${origemErp}` : undefined,
        idPedidoExterno ? `Pedido externo: ${idPedidoExterno}` : undefined
      ].filter(Boolean).join(' | ') || undefined,
      lojaId,
      nomeLoja: loja.nome,
      nomeEmpresa: undefined,
      tipoComanda: 'entrega',
      destinoLatitude: destinoCoord?.latitude,
      destinoLongitude: destinoCoord?.longitude
    };

    await salvarEntrega(novaEntrega);
    deliveries.set(id, novaEntrega);

    // ERP: sempre publica no broker para despacho imediato (mercadoria já pronta)
    broker.publish('entrega.recebida', id, {
      deliveryId: id,
      cargoType: novaEntrega.tipoCarga,
      priority: novaEntrega.prioridade,
      clientName: novaEntrega.nomeCliente,
      address: novaEntrega.endereco
    });

    res.status(201).json({
      success: true,
      entregaId: id,
      status: novaEntrega.status,
      tipoComanda: novaEntrega.tipoComanda,
      total,
      subtotal,
      taxaEntrega,
      servicoEntrega,
      desconto
    });
  } catch (err: any) {
    console.error('[IntegracaoEntregas] Erro ao receber entrega:', err);
    res.status(err instanceof ErroEntrega ? err.status : 500).json({ error: err.message || 'Erro interno ao processar entrega.' });
  }
}));

export default router;
