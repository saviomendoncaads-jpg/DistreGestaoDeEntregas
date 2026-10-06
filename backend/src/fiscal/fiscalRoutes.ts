import { Router, Request, Response, NextFunction } from 'express';
import { obterSessaoDoRequest, exigirLojaAdimplente } from '../auth';
import { deliveries } from '../gateway';
import { Sessao } from '../types';
import { CODIGO_UF } from './chaveAcesso';
import { sincronizarEmpresaFocus } from './adapters/FocusNfeAdapter';
import { ErroCertificado, lerCertificadoA1 } from './certificado';
import { getProvedorFiscal } from './fiscalFactory';
import {
  listarNotasDaLoja, obterConfigFiscal, obterCredenciais, obterNota, salvarConfigFiscal, salvarCredenciais,
} from './fiscalRepo';
import {
  ErroFiscal, atualizarNota, calcularProntidao, cancelarNota, cnpjValido, emitirNotaDaVenda, normalizarDestinatario,
  resumoCredenciais, vendaIdDaEntrega,
} from './fiscalService';
import { notaParaImpressao, resumoNota } from './notaApresentacao';
import { ConfigFiscalLoja, ModeloNota } from './tipos';

// ============================================================================
// MÓDULO FISCAL — /api/fiscal
// Sessão de LOJA opera só a própria loja; admin escolhe a loja via ?lojaId=.
// ============================================================================

const router = Router();

interface RequestComSessao extends Request {
  sessao?: Sessao;
}

function exigirSessao(req: RequestComSessao, res: Response, next: NextFunction) {
  const sessao = obterSessaoDoRequest(req);
  if (!sessao) {
    res.status(401).json({ error: 'Não autenticado' });
    return;
  }
  req.sessao = sessao;
  next();
}

function resolverLojaId(req: RequestComSessao): string | undefined {
  const sessao = req.sessao!;
  if (sessao.tipo === 'loja') return sessao.lojaId;
  const lojaId = (req.query.lojaId as string) || (req.body?.lojaId as string) || '';
  return lojaId.trim() || undefined;
}

function podeAcessarLoja(req: RequestComSessao, lojaId?: string): boolean {
  const sessao = req.sessao!;
  return sessao.tipo === 'admin' || (!!lojaId && sessao.lojaId === lojaId);
}

function responderErro(res: Response, err: any, contexto: string) {
  if (err instanceof ErroFiscal) {
    res.status(err.httpStatus).json({ error: err.message, nota: err.nota ? resumoNota(err.nota) : undefined });
    return;
  }
  console.error(`[Fiscal] ${contexto}:`, err);
  res.status(500).json({ error: err?.message || 'Erro interno no módulo fiscal.' });
}

/** Configuração + resumo das credenciais (sem segredos) + checklist de prontidão. */
async function estadoFiscal(lojaId: string) {
  const [config, cred] = await Promise.all([obterConfigFiscal(lojaId), obterCredenciais(lojaId)]);
  return { config, credenciais: resumoCredenciais(cred), prontidao: calcularProntidao(config, cred) };
}

function validarConfig(body: any, lojaId: string): ConfigFiscalLoja | { erro: string } {
  const txt = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const dig = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\D/g, '') : '');
  const int = (v: unknown, def: number) => {
    const n = Number(v);
    return Number.isInteger(n) ? n : def;
  };

  const cnpj = dig(body?.cnpj);
  if (!cnpjValido(cnpj)) return { erro: 'CNPJ do emitente inválido.' };
  const ieTxt = txt(body?.inscricaoEstadual, 20).toUpperCase();
  const inscricaoEstadual = ieTxt === 'ISENTO' ? 'ISENTO' : dig(ieTxt);
  if (!inscricaoEstadual) return { erro: 'Inscrição Estadual é obrigatória (ou "ISENTO").' };
  const razaoSocial = txt(body?.razaoSocial, 200);
  if (!razaoSocial) return { erro: 'Razão social é obrigatória.' };
  const regimeTributario = int(body?.regimeTributario, 1);
  if (![1, 2, 3].includes(regimeTributario)) return { erro: 'Regime tributário inválido.' };
  const uf = txt(body?.uf, 2).toUpperCase();
  if (!CODIGO_UF[uf]) return { erro: 'UF inválida.' };
  const cep = dig(body?.cep);
  if (cep.length !== 8) return { erro: 'CEP deve ter 8 dígitos.' };
  const logradouro = txt(body?.logradouro, 200);
  const numero = txt(body?.numero, 20) || 'S/N';
  const bairro = txt(body?.bairro, 120);
  const municipio = txt(body?.municipio, 120);
  if (!logradouro || !bairro || !municipio) return { erro: 'Endereço completo do emitente é obrigatório (logradouro, bairro, município).' };
  const provedor = body?.provedor === 'FOCUSNFE' ? 'FOCUSNFE' : 'SIMULADO';
  const ambiente = body?.ambiente === 'PRODUCAO' ? 'PRODUCAO' : 'HOMOLOGACAO';
  if (ambiente === 'PRODUCAO' && provedor === 'SIMULADO') return { erro: 'Produção exige o provedor Focus NFe — o modo simulado não transmite à SEFAZ.' };
  const percentualTributos = Number(String(body?.percentualTributos ?? 0).replace(',', '.'));
  if (!Number.isFinite(percentualTributos) || percentualTributos < 0 || percentualTributos > 99) return { erro: 'Percentual de tributos aproximados deve estar entre 0 e 99.' };
  const email = txt(body?.email, 120);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { erro: 'E-mail do emitente inválido.' };
  const ncmPadrao = dig(body?.ncmPadrao);
  if (ncmPadrao.length !== 8) return { erro: 'NCM padrão deve ter 8 dígitos.' };
  const cfopPadrao = dig(body?.cfopPadrao);
  if (!/^[56]\d{3}$/.test(cfopPadrao)) return { erro: 'CFOP padrão deve ser de saída (5xxx ou 6xxx).' };
  const icmsSituacaoPadrao = dig(body?.icmsSituacaoPadrao);
  if (!/^\d{2,3}$/.test(icmsSituacaoPadrao)) return { erro: 'CSOSN/CST do ICMS inválido.' };
  const origemPadrao = dig(body?.origemPadrao) || '0';
  if (!/^[0-8]$/.test(origemPadrao)) return { erro: 'Origem da mercadoria inválida (0 a 8).' };
  const serieNfce = int(body?.serieNfce, 1);
  const serieNfe = int(body?.serieNfe, 1);
  const proximoNumeroNfce = int(body?.proximoNumeroNfce, 1);
  const proximoNumeroNfe = int(body?.proximoNumeroNfe, 1);
  if ([serieNfce, serieNfe].some(s => s < 0 || s > 999)) return { erro: 'Série deve estar entre 0 e 999.' };
  if ([proximoNumeroNfce, proximoNumeroNfe].some(n => n < 1 || n > 999999999)) return { erro: 'Próximo número inválido.' };

  return {
    lojaId,
    razaoSocial,
    nomeFantasia: txt(body?.nomeFantasia, 200) || undefined,
    cnpj,
    inscricaoEstadual,
    regimeTributario: regimeTributario as 1 | 2 | 3,
    logradouro,
    numero,
    bairro,
    municipio,
    uf,
    cep,
    telefone: dig(body?.telefone) || undefined,
    email: email || undefined,
    provedor,
    ambiente,
    percentualTributos: Number(percentualTributos.toFixed(2)),
    serieNfce,
    proximoNumeroNfce,
    serieNfe,
    proximoNumeroNfe,
    ncmPadrao,
    cfopPadrao,
    icmsSituacaoPadrao,
    origemPadrao,
  };
}

router.use(exigirSessao);

// GET /api/fiscal/status — provedor/ambiente da loja e se já pode emitir
router.get('/status', async (req: RequestComSessao, res: Response) => {
  try {
    const lojaId = resolverLojaId(req);
    if (!lojaId) { res.json({ provedor: 'SIMULADO', simulado: true, ambiente: 'HOMOLOGACAO', podeEmitir: false }); return; }
    const { config, prontidao } = await estadoFiscal(lojaId);
    const provedor = config?.provedor || 'SIMULADO';
    res.json({ provedor, simulado: provedor === 'SIMULADO', ambiente: config?.ambiente || 'HOMOLOGACAO', podeEmitir: prontidao.podeEmitir });
  } catch (err) {
    responderErro(res, err, 'Erro ao obter status fiscal');
  }
});

// GET /api/fiscal/config — dados fiscais + resumo das credenciais + checklist
router.get('/config', async (req: RequestComSessao, res: Response) => {
  try {
    const lojaId = resolverLojaId(req);
    if (!lojaId) { res.status(400).json({ error: 'lojaId é obrigatório para administrador.' }); return; }
    res.json(await estadoFiscal(lojaId));
  } catch (err) {
    responderErro(res, err, 'Erro ao obter configuração fiscal');
  }
});

// PUT /api/fiscal/config — salva os dados fiscais da loja
router.put('/config', exigirLojaAdimplente, async (req: RequestComSessao, res: Response) => {
  try {
    const lojaId = resolverLojaId(req);
    if (!lojaId) { res.status(400).json({ error: 'lojaId é obrigatório para administrador.' }); return; }
    const validado = validarConfig(req.body, lojaId);
    if ('erro' in validado) { res.status(400).json({ error: validado.erro }); return; }
    // Numeração nunca retrocede: evita reaproveitar número já usado na SEFAZ.
    const atual = await obterConfigFiscal(lojaId);
    if (atual) {
      validado.proximoNumeroNfce = Math.max(validado.proximoNumeroNfce, validado.serieNfce === atual.serieNfce ? atual.proximoNumeroNfce : 1);
      validado.proximoNumeroNfe = Math.max(validado.proximoNumeroNfe, validado.serieNfe === atual.serieNfe ? atual.proximoNumeroNfe : 1);
    }
    // Virar a chave para produção só com tudo pronto (token de produção etc.).
    if (validado.ambiente === 'PRODUCAO') {
      const p = calcularProntidao(validado, await obterCredenciais(lojaId), 'PRODUCAO');
      if (!p.podeEmitir) {
        const pend = p.itens.filter(i => i.obrigatorio && !i.ok).map(i => i.detalhe || i.rotulo);
        res.status(400).json({ error: `Ainda não dá para emitir em produção: ${pend.join('; ')}.` });
        return;
      }
    }
    await salvarConfigFiscal(validado);
    res.json({ success: true, ...(await estadoFiscal(lojaId)) });
  } catch (err) {
    responderErro(res, err, 'Erro ao salvar configuração fiscal');
  }
});

// ─── Credenciais (certificado A1, CSC, tokens Focus) ─────────────────────────

const LIMITE_PFX_BYTES = 500 * 1024;

// PUT /api/fiscal/credenciais — envia/substitui/remove segredos. Campo ausente = mantém;
// string vazia (ou removerCertificado) = apaga. Nada disso volta pela API.
router.put('/credenciais', exigirLojaAdimplente, async (req: RequestComSessao, res: Response) => {
  try {
    const lojaId = resolverLojaId(req);
    if (!lojaId) { res.status(400).json({ error: 'lojaId é obrigatório para administrador.' }); return; }
    const b = req.body || {};
    const segredo = (v: unknown, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);
    const parcial: Parameters<typeof salvarCredenciais>[1] = {};
    const atual = await obterCredenciais(lojaId);

    if (b.removerCertificado === true) {
      Object.assign(parcial, { certificadoPfx: null, certificadoSenha: null, certificadoTitular: null, certificadoCnpj: null, certificadoValidoAte: null });
    } else if (typeof b.certificadoBase64 === 'string' && b.certificadoBase64) {
      const pfx = Buffer.from(b.certificadoBase64.replace(/^data:[^,]*,/, ''), 'base64');
      if (pfx.length === 0 || pfx.length > LIMITE_PFX_BYTES) { res.status(400).json({ error: 'Arquivo de certificado vazio ou grande demais.' }); return; }
      const senha = typeof b.certificadoSenha === 'string' ? b.certificadoSenha : '';
      let info;
      try {
        info = lerCertificadoA1(pfx, senha);
      } catch (e: any) {
        res.status(400).json({ error: e instanceof ErroCertificado ? e.message : 'Não foi possível ler o certificado.' });
        return;
      }
      if (new Date(info.validoAte).getTime() < Date.now()) {
        res.status(400).json({ error: `Este certificado venceu em ${new Date(info.validoAte).toLocaleDateString('pt-BR')}.` });
        return;
      }
      const config = await obterConfigFiscal(lojaId);
      if (config && info.cnpj && info.cnpj.slice(0, 8) !== config.cnpj.slice(0, 8)) {
        res.status(400).json({ error: `O certificado é do CNPJ ${info.cnpj}, diferente do emitente (${config.cnpj}).` });
        return;
      }
      Object.assign(parcial, {
        certificadoPfx: pfx, certificadoSenha: senha, certificadoTitular: info.titular,
        certificadoCnpj: info.cnpj || null, certificadoValidoAte: info.validoAte,
      });
    } else if (typeof b.certificadoSenha === 'string' && b.certificadoSenha && atual.certificadoPfx) {
      // Só troca a senha: valida contra o certificado já salvo.
      try { lerCertificadoA1(atual.certificadoPfx, b.certificadoSenha); } catch (e: any) { res.status(400).json({ error: e.message }); return; }
      parcial.certificadoSenha = b.certificadoSenha;
    }

    for (const [campoId, campoCsc, rotulo] of [
      ['cscIdHomologacao', 'cscHomologacao', 'homologação'],
      ['cscIdProducao', 'cscProducao', 'produção'],
    ] as const) {
      const id = segredo(b[campoId], 10);
      const csc = segredo(b[campoCsc], 100);
      if (id !== undefined) {
        if (id && !/^\d{1,6}$/.test(id)) { res.status(400).json({ error: `ID do CSC de ${rotulo} deve ser numérico (ex.: 1 ou 000001).` }); return; }
        parcial[campoId] = id || null;
      }
      if (csc !== undefined) {
        if (csc && !/^[0-9A-Za-z-]{16,64}$/.test(csc)) { res.status(400).json({ error: `CSC de ${rotulo} inválido (código alfanumérico gerado no portal da SEFAZ).` }); return; }
        parcial[campoCsc] = csc || null;
      }
    }
    for (const campo of ['focusTokenHomologacao', 'focusTokenProducao', 'focusTokenPrincipal'] as const) {
      const v = segredo(b[campo], 200);
      if (v !== undefined) parcial[campo] = v || null;
    }

    await salvarCredenciais(lojaId, parcial);
    res.json({ success: true, ...(await estadoFiscal(lojaId)) });
  } catch (err) {
    responderErro(res, err, 'Erro ao salvar credenciais fiscais');
  }
});

// POST /api/fiscal/credenciais/testar — { ambiente? } valida o token no provedor
router.post('/credenciais/testar', async (req: RequestComSessao, res: Response) => {
  try {
    const lojaId = resolverLojaId(req);
    if (!lojaId) { res.status(400).json({ error: 'lojaId é obrigatório para administrador.' }); return; }
    const config = await obterConfigFiscal(lojaId);
    if (!config) { res.status(412).json({ error: 'Salve os dados do emitente primeiro.' }); return; }
    const cred = await obterCredenciais(lojaId);
    const ambiente = req.body?.ambiente === 'PRODUCAO' ? 'PRODUCAO' : req.body?.ambiente === 'HOMOLOGACAO' ? 'HOMOLOGACAO' : config.ambiente;
    const r = await getProvedorFiscal(config.provedor).testarConexao({
      ambiente, cnpjEmitente: config.cnpj, uf: config.uf,
      tokenProvedor: ambiente === 'PRODUCAO' ? cred.focusTokenProducao : cred.focusTokenHomologacao,
    });
    res.json(r);
  } catch (err) {
    responderErro(res, err, 'Erro ao testar conexão fiscal');
  }
});

// POST /api/fiscal/credenciais/sincronizar-focus — cadastra/atualiza a empresa na
// Focus (dados + certificado + CSC) e guarda os tokens de emissão devolvidos.
router.post('/credenciais/sincronizar-focus', exigirLojaAdimplente, async (req: RequestComSessao, res: Response) => {
  try {
    const lojaId = resolverLojaId(req);
    if (!lojaId) { res.status(400).json({ error: 'lojaId é obrigatório para administrador.' }); return; }
    const config = await obterConfigFiscal(lojaId);
    if (!config) { res.status(412).json({ error: 'Salve os dados do emitente primeiro.' }); return; }
    const cred = await obterCredenciais(lojaId);
    if (!cred.focusTokenPrincipal) { res.status(400).json({ error: 'Informe o token principal da conta Focus NFe para sincronizar.' }); return; }
    if (!cred.certificadoPfx) { res.status(400).json({ error: 'Envie o certificado A1 antes de sincronizar.' }); return; }

    const r = await sincronizarEmpresaFocus({
      tokenPrincipal: cred.focusTokenPrincipal,
      emitente: config,
      certificadoPfx: cred.certificadoPfx,
      certificadoSenha: cred.certificadoSenha,
      cscIdHomologacao: cred.cscIdHomologacao,
      cscHomologacao: cred.cscHomologacao,
      cscIdProducao: cred.cscIdProducao,
      cscProducao: cred.cscProducao,
    });
    await salvarCredenciais(lojaId, {
      ...(r.tokenHomologacao ? { focusTokenHomologacao: r.tokenHomologacao } : {}),
      ...(r.tokenProducao ? { focusTokenProducao: r.tokenProducao } : {}),
      sincronizadoEm: new Date().toISOString(),
    });
    const semTokens = !r.tokenHomologacao && !r.tokenProducao;
    res.json({
      success: true,
      mensagem: `${r.criada ? 'Empresa cadastrada' : 'Empresa atualizada'} na Focus NFe com certificado e CSC.` +
        (semTokens ? ' A Focus não devolveu os tokens: copie-os do painel da Focus e cole aqui.' : ' Tokens de emissão salvos automaticamente.'),
      ...(await estadoFiscal(lojaId)),
    });
  } catch (err) {
    responderErro(res, err, 'Erro ao sincronizar com a Focus NFe');
  }
});

// GET /api/fiscal/notas?dias=2 — notas recentes da loja (resumo)
router.get('/notas', async (req: RequestComSessao, res: Response) => {
  try {
    const lojaId = resolverLojaId(req);
    if (!lojaId) { res.status(400).json({ error: 'lojaId é obrigatório para administrador.' }); return; }
    const dias = Math.min(Math.max(Number(req.query.dias) || 2, 1), 90);
    const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
    const notas = await listarNotasDaLoja(lojaId, desde);
    res.json({ notas: notas.map(resumoNota) });
  } catch (err) {
    responderErro(res, err, 'Erro ao listar notas');
  }
});

// GET /api/fiscal/notas/:id — nota completa para impressão do DANFE
router.get('/notas/:id', async (req: RequestComSessao, res: Response) => {
  try {
    const nota = await obterNota(req.params.id as string);
    if (!nota || !podeAcessarLoja(req, nota.lojaId)) { res.status(404).json({ error: 'Nota não encontrada.' }); return; }
    res.json({ nota: await notaParaImpressao(nota) });
  } catch (err) {
    responderErro(res, err, 'Erro ao obter nota');
  }
});

// POST /api/fiscal/emitir — emite (ou re-emite após erro) a nota de uma comanda
router.post('/emitir', exigirLojaAdimplente, async (req: RequestComSessao, res: Response) => {
  try {
    const { entregaId, modelo } = req.body || {};
    if (modelo !== 'NFCE' && modelo !== 'NFE') { res.status(400).json({ error: 'modelo deve ser NFCE ou NFE.' }); return; }
    const entrega = deliveries.get(String(entregaId || ''));
    if (!entrega || !entrega.lojaId || !podeAcessarLoja(req, entrega.lojaId)) {
      res.status(404).json({ error: 'Comanda não encontrada.' });
      return;
    }
    const nota = await emitirNotaDaVenda({
      lojaId: entrega.lojaId,
      entrega,
      vendaId: vendaIdDaEntrega(entrega),
      modelo: modelo as ModeloNota,
      destinatario: normalizarDestinatario(req.body?.destinatario),
    });
    const falhou = nota.status === 'ERRO' || nota.status === 'REJEITADA';
    res.status(falhou ? 502 : 201).json({
      error: falhou ? `Nota não autorizada: ${nota.mensagem || nota.status}` : undefined,
      nota: await notaParaImpressao(nota),
    });
  } catch (err) {
    responderErro(res, err, 'Erro ao emitir nota');
  }
});

// POST /api/fiscal/notas/:id/atualizar — reconsulta no provedor (NF-e em processamento)
router.post('/notas/:id/atualizar', async (req: RequestComSessao, res: Response) => {
  try {
    const nota = await obterNota(req.params.id as string);
    if (!nota || !podeAcessarLoja(req, nota.lojaId)) { res.status(404).json({ error: 'Nota não encontrada.' }); return; }
    res.json({ nota: await notaParaImpressao(await atualizarNota(nota)) });
  } catch (err) {
    responderErro(res, err, 'Erro ao atualizar nota');
  }
});

// POST /api/fiscal/notas/:id/cancelar — { justificativa }
router.post('/notas/:id/cancelar', exigirLojaAdimplente, async (req: RequestComSessao, res: Response) => {
  try {
    const nota = await obterNota(req.params.id as string);
    if (!nota || !podeAcessarLoja(req, nota.lojaId)) { res.status(404).json({ error: 'Nota não encontrada.' }); return; }
    const cancelada = await cancelarNota(nota, String(req.body?.justificativa || ''));
    res.json({ nota: resumoNota(cancelada) });
  } catch (err) {
    responderErro(res, err, 'Erro ao cancelar nota');
  }
});

export default router;
