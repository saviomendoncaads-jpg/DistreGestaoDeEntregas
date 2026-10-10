import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { obterSessaoDoRequest, exigirLojaAdimplente } from './auth';
import { obterProdutosDaLoja, salvarProduto, salvarProdutosEmLote, historicoProduto, deletarProduto, salvarLoja } from './database';
import { lojas } from './tenants';
import { Produto, Sessao } from './types';
import { prepararProduto, verificarIdentificadores, ErroCatalogo } from './catalogoProduto';
import { listarEstoque, receberMercadoria, ErroEstoque } from './estoque';

// ============================================================================
// GESTÃO DA VITRINE — rotas autenticadas usadas pelo painel da loja para
// montar o cardápio público: CRUD de produtos, logomarca e upload de imagens.
// Escopo de segurança: sessão de LOJA só enxerga/edita o próprio catálogo;
// admin pode operar qualquer loja via ?lojaId=.
// ============================================================================

const router = Router();

// Imagens enviadas pelo painel ficam em backend/uploads, servidas em /uploads.
export const uploadsDir = path.join(__dirname, '..', 'uploads');
try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch { /* já existe */ }

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024; // 3 MB por imagem
const PRECO_MAXIMO = 100000;

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

// Loja autenticada opera a si mesma; admin escolhe a loja via query/body.
function resolverLojaId(req: RequestComSessao): string | undefined {
  const sessao = req.sessao!;
  if (sessao.tipo === 'loja') return sessao.lojaId;
  const lojaId = (req.query.lojaId as string) || (req.body?.lojaId as string) || '';
  return lojaId.trim() || undefined;
}

function textoLimpo(valor: unknown, max: number): string {
  if (typeof valor !== 'string') return '';
  return valor.trim().slice(0, max);
}

router.use(exigirSessao);

router.get('/estoque', async (req: RequestComSessao, res: Response) => {
  const lojaId = resolverLojaId(req);
  if (!lojaId) { res.status(400).json({ error: 'Selecione uma loja.' }); return; }
  try { res.json(await listarEstoque(lojaId)); }
  catch { res.status(500).json({ error: 'Erro ao carregar estoque.' }); }
});

router.post('/estoque/entradas', exigirLojaAdimplente, async (req: RequestComSessao, res: Response) => {
  const lojaId = resolverLojaId(req);
  if (!lojaId) { res.status(400).json({ error: 'Selecione uma loja.' }); return; }
  try {
    res.status(201).json(await receberMercadoria(lojaId, textoLimpo(req.body?.produtoId, 100),
      req.body?.quantidade, textoLimpo(req.body?.chave, 100), textoLimpo(req.body?.referencia, 200)));
  } catch (e) {
    res.status(e instanceof ErroEstoque ? e.status : 500).json({ error: e instanceof ErroEstoque ? e.message : 'Erro ao registrar entrada.' });
  }
});

// GET /api/gestao/produtos — catálogo próprio da loja (inclui inativos)
router.get('/produtos', async (req: RequestComSessao, res: Response) => {
  try {
    const lojaId = resolverLojaId(req);
    if (!lojaId) {
      res.status(400).json({ error: 'lojaId é obrigatório para sessão de administrador.' });
      return;
    }
    res.json(await obterProdutosDaLoja(lojaId));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erro ao listar produtos.' });
  }
});

function responderErroCatalogo(res: Response, err: unknown) {
  if (err instanceof ErroCatalogo) { res.status(err.status).json({ error: err.message, campos: err.campos }); return; }
  console.error('[Catálogo] Falha ao salvar:', err);
  res.status(500).json({ error: 'Não foi possível salvar. Nenhuma alteração desta operação foi confirmada.' });
}
const autorCatalogo = (req: RequestComSessao) => req.sessao?.nomeLoja || (req.sessao?.tipo === 'admin' ? 'Administrador' : 'Loja');
function novoProduto(body: Record<string, unknown>, lojaId: string): Produto {
  const dados = prepararProduto(body);
  return { ...dados, id: 'prod-' + crypto.randomBytes(5).toString('hex'), codigoInterno: dados.codigoInterno || 'SKU-' + crypto.randomBytes(4).toString('hex').toUpperCase(), lojaId } as Produto;
}

router.get('/produtos/:id/historico', async (req: RequestComSessao, res: Response) => {
  const lojaId = resolverLojaId(req);
  if (!lojaId) { res.status(400).json({ error: 'Selecione uma loja.' }); return; }
  try {
    if (!(await obterProdutosDaLoja(lojaId)).some(p => p.id === req.params.id)) { res.status(404).json({ error: 'Produto não encontrado.' }); return; }
    res.json(await historicoProduto(lojaId, String(req.params.id)));
  } catch (e) { responderErroCatalogo(res, e); }
});

router.post('/produtos/importar', exigirLojaAdimplente, async (req: RequestComSessao, res: Response) => {
  const lojaId = resolverLojaId(req);
  if (!lojaId) { res.status(400).json({ error: 'Selecione uma loja.' }); return; }
  try {
    const linhas = req.body?.linhas;
    if (!Array.isArray(linhas) || !linhas.length || linhas.length > 500) throw new ErroCatalogo({ arquivo: 'Importe de 1 a 500 produtos por arquivo.' });
    const existentes = await obterProdutosDaLoja(lojaId);
    const finais = [...existentes], alterados: Produto[] = [], codigos = new Set<string>();
    let novos = 0;
    for (const [i, raw] of linhas.entries()) {
      try {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ErroCatalogo({ arquivo: 'Linha inválida.' });
        const codigo = textoLimpo(raw.codigoInterno, 60);
        if (!codigo || codigos.has(codigo.toLocaleLowerCase('pt-BR'))) throw new ErroCatalogo({ codigoInterno: 'Informe um código interno único em cada linha.' });
        codigos.add(codigo.toLocaleLowerCase('pt-BR'));
        const atual = existentes.find(p => (p.codigoInterno || p.id).toLocaleLowerCase('pt-BR') === codigo.toLocaleLowerCase('pt-BR'));
        const p = atual ? { ...atual, ...prepararProduto(raw, atual) } : novoProduto(raw, lojaId);
        verificarIdentificadores(p, finais);
        const index = finais.findIndex(o => o.id === p.id);
        if (index < 0) { finais.push(p); novos++; } else finais[index] = p;
        alterados.push(p);
      } catch (e) {
        if (e instanceof ErroCatalogo) throw new ErroCatalogo({ arquivo: 'Linha ' + (i + 2) + ': ' + e.message });
        throw e;
      }
    }
    const resumo = { novos, atualizados: alterados.length - novos, total: alterados.length };
    if (req.body.confirmar !== true) { res.json({ resumo, produtos: alterados }); return; }
    await salvarProdutosEmLote(alterados, autorCatalogo(req), 'Importação por planilha');
    res.json({ resumo, produtos: alterados });
  } catch (e) { responderErroCatalogo(res, e); }
});

router.put('/produtos/lote', exigirLojaAdimplente, async (req: RequestComSessao, res: Response) => {
  const lojaId = resolverLojaId(req);
  if (!lojaId) { res.status(400).json({ error: 'Selecione uma loja.' }); return; }
  try {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => typeof id !== 'string')) throw new ErroCatalogo({ selecao: 'Selecione de 1 a 100 produtos.' });
    const existentes = await obterProdutosDaLoja(lojaId), selecionados = [...new Set(ids)].map(id => existentes.find(p => p.id === id));
    if (selecionados.some(p => !p)) { res.status(404).json({ error: 'Um produto da seleção não pertence à loja.' }); return; }
    const raw = req.body.alteracoes;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ErroCatalogo({ alteracoes: 'Escolha uma alteração.' });
    const permitidos = ['situacao', 'publicado', 'categoria', 'precoPromocional'];
    if (Object.keys(raw).some(k => !permitidos.includes(k)) || !Object.keys(raw).length) throw new ErroCatalogo({ alteracoes: 'Alteração em lote inválida.' });
    const produtos = selecionados.map(p => {
      const alteracoes = { ...raw };
      if (alteracoes.situacao && alteracoes.situacao !== 'ativo') alteracoes.publicado = false;
      return { ...p!, ...prepararProduto(alteracoes, p!) };
    });
    await salvarProdutosEmLote(produtos, autorCatalogo(req), 'Alteração em lote');
    res.json(produtos);
  } catch (e) { responderErroCatalogo(res, e); }
});

router.post('/produtos', exigirLojaAdimplente, async (req: RequestComSessao, res: Response) => {
  const lojaId = resolverLojaId(req);
  if (!lojaId) { res.status(400).json({ error: 'Selecione uma loja.' }); return; }
  try {
    const p = novoProduto(req.body || {}, lojaId);
    verificarIdentificadores(p, await obterProdutosDaLoja(lojaId));
    await salvarProduto(p, autorCatalogo(req), 'Cadastro do produto');
    res.status(201).json(p);
  } catch (e) { responderErroCatalogo(res, e); }
});
router.put('/produtos/:id', exigirLojaAdimplente, async (req: RequestComSessao, res: Response) => {
  const lojaId = resolverLojaId(req);
  if (!lojaId) { res.status(400).json({ error: 'Selecione uma loja.' }); return; }
  try {
    const existentes = await obterProdutosDaLoja(lojaId), atual = existentes.find(p => p.id === req.params.id);
    if (!atual) { res.status(404).json({ error: 'Produto não encontrado no catálogo desta loja.' }); return; }
    const raw = { ...(req.body || {}) };
    if ('ativo' in raw && !('situacao' in raw)) { raw.situacao = raw.ativo ? 'ativo' : 'arquivado'; if (!raw.ativo) raw.publicado = false; }
    if (raw.situacao && raw.situacao !== 'ativo') raw.publicado = false;
    const atualizado = { ...atual, ...prepararProduto(raw, atual) };
    atualizado.codigoInterno ||= atual.codigoInterno || atual.id;
    verificarIdentificadores(atualizado, existentes);
    await salvarProduto(atualizado, autorCatalogo(req), 'Edição do produto');
    res.json(atualizado);
  } catch (e) { responderErroCatalogo(res, e); }
});

// DELETE /api/gestao/produtos/:id — remove definitivamente do catálogo
router.delete('/produtos/:id', exigirLojaAdimplente, async (req: RequestComSessao, res: Response) => {
  try {
    const lojaId = resolverLojaId(req);
    if (!lojaId) {
      res.status(400).json({ error: 'lojaId é obrigatório para sessão de administrador.' });
      return;
    }
    const estoque = await listarEstoque(lojaId);
    if (estoque.produtos.some(p => p.id === req.params.id && p.saldo !== null)) {
      res.status(409).json({ error: 'Produto com controle de estoque não pode ser excluído. Desative-o para preservar saldo e histórico.' });
      return;
    }
    const removeu = await deletarProduto(String(req.params.id), lojaId);
    if (!removeu) {
      res.status(404).json({ error: 'Produto não encontrado no catálogo desta loja.' });
      return;
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error('[GestaoVitrine] Erro ao excluir produto:', err);
    res.status(500).json({ error: 'Erro ao excluir o produto.' });
  }
});

// PUT /api/gestao/loja — configurações da vitrine (hoje: logomarca)
router.put('/loja', exigirLojaAdimplente, async (req: RequestComSessao, res: Response) => {
  try {
    const lojaId = resolverLojaId(req);
    const loja = lojas.find(l => l.id === lojaId);
    if (!loja) {
      res.status(404).json({ error: 'Loja não encontrada.' });
      return;
    }
    if ('logoUrl' in (req.body || {})) {
      loja.logoUrl = textoLimpo(req.body.logoUrl, 600) || undefined;
    }
    await salvarLoja(loja);
    res.json({ success: true, logoUrl: loja.logoUrl });
  } catch (err: any) {
    console.error('[GestaoVitrine] Erro ao salvar loja:', err);
    res.status(500).json({ error: 'Erro ao salvar as configurações da loja.' });
  }
});

// POST /api/gestao/upload — recebe { dataUrl } (base64) e devolve a URL pública.
// O router é montado com express.json({ limit: '5mb' }) no index.ts.
router.post('/upload', exigirLojaAdimplente, (req: RequestComSessao, res: Response) => {
  try {
    const dataUrl = String(req.body?.dataUrl || '');
    const match = dataUrl.match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) {
      res.status(400).json({ error: 'Envie uma imagem PNG, JPG ou WEBP (campo dataUrl em base64).' });
      return;
    }
    const buffer = Buffer.from(match[2], 'base64');
    if (buffer.length === 0 || buffer.length > MAX_UPLOAD_BYTES) {
      res.status(400).json({ error: 'Imagem deve ter entre 1 byte e 3 MB.' });
      return;
    }
    const extensao = match[1] === 'jpeg' ? 'jpg' : match[1];
    const nomeArquivo = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${extensao}`;
    fs.writeFileSync(path.join(uploadsDir, nomeArquivo), buffer);
    res.status(201).json({ url: `/uploads/${nomeArquivo}` });
  } catch (err: any) {
    console.error('[GestaoVitrine] Erro no upload:', err);
    res.status(500).json({ error: 'Erro ao salvar a imagem.' });
  }
});

export default router;
