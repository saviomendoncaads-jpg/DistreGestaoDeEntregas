import { asyncHandler } from './http/asyncHandler';
import { SESSION_TTL_MS, sessaoExpirada } from './security/sessionPolicy';
import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { Sessao } from './types';
import { lojas, empresas } from './tenants';
import {
  verificarAdminNoBanco, salvarLoja,
  salvarSessao, deletarSessao, deletarSessoesPorLoja, deletarSessoesPorEmpresa, obterSessoesValidas
} from './database';
import { hashPassword, verifyPassword } from './security/password';

export function lojaBloqueadaFinanceiro(loja: typeof lojas[number]) {
  const empresa=empresas.find(e=>e.id===loja.empresaId);
  return ['SUSPENSO','CANCELADO'].includes(loja.statusFinanceiro||'') || ['SUSPENSO','CANCELADO'].includes(empresa?.statusFinanceiro||'');
}
const router = Router();

// Sessões ativas em memória (token → Sessao) — caminho de leitura rápido (socket/middleware).
export const sessions = new Map<string, Sessao>();

// TTL da sessão persistida (durável a restart/deploy). 30 dias.
// Prazo validado também em memória, HTTP e WebSocket.

/** Hidrata o Map a partir do banco no boot (sessões válidas e não expiradas). */
export async function carregarSessoesDoBanco(): Promise<void> {
  try {
    const persistidas = await obterSessoesValidas();
    let n = 0;
    for (const s of persistidas) {
      // Não restaura sessão de loja suspensa/cancelada (respeita o gate de inadimplência).
      if (s.tipo === 'loja' && s.lojaId) {
        const loja = lojas.find(l => l.id === s.lojaId);
        if (loja && (lojaBloqueadaFinanceiro(loja))) continue;
      }
      if (!sessaoExpirada(s)) sessions.set(s.token, s);
      n++;
    }
    console.log(`[Auth] ${n} sessão(ões) restaurada(s) do banco.`);
  } catch (e) {
    console.warn('[Auth] Falha ao restaurar sessões do banco (seguindo sem hidratar):', (e as Error)?.message);
  }
}

/** Cria a sessão: grava no Map (rápido) e persiste no banco (durável). */
async function registrarSessao(sessao: Sessao): Promise<void> {
  sessions.set(sessao.token, sessao);
  const expiraEm = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  try { await salvarSessao(sessao, expiraEm); }
  catch (e) { console.warn('[Auth] Falha ao persistir sessão (mantida em memória):', (e as Error)?.message); }
}

/** Revoga uma sessão específica (Map + banco). */
export async function revogarSessao(token: string): Promise<void> {
  sessions.delete(token);
  try { await deletarSessao(token); } catch { /* best-effort */ }
}

/** Revoga todas as sessões de uma LOJA (Map + banco). */
export async function revogarSessoesDaLoja(lojaId: string): Promise<void> {
  for (const [token, s] of sessions.entries()) {
    if (s.tipo === 'loja' && s.lojaId === lojaId) sessions.delete(token);
  }
  try { await deletarSessoesPorLoja(lojaId); } catch { /* best-effort */ }
}

/** Revoga todas as sessões das lojas de uma EMPRESA (Map + banco). */
export async function revogarSessoesDaEmpresa(empresaId: string): Promise<void> {
  for (const [token, s] of sessions.entries()) {
    if (s.tipo === 'loja' && s.lojaId) {
      const loja = lojas.find(l => l.id === s.lojaId);
      if (loja && loja.empresaId === empresaId) sessions.delete(token);
    }
  }
  try { await deletarSessoesPorEmpresa(empresaId); } catch { /* best-effort */ }
}

// Credenciais do administrador master (configuráveis via variável de ambiente).
const ADMIN_USUARIO = process.env.ADMIN_USUARIO;
const ADMIN_SENHA = process.env.ADMIN_SENHA;
// Sem credenciais explícitas, somente administradores cadastrados no banco podem entrar.

// ─── LOGIN DA LOJA ────────────────────────────────────────────────────────────
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const { usuario, senha } = req.body;
  if (typeof usuario !== 'string' || !usuario.trim() || typeof senha !== 'string' || !senha || senha.length > 1024) {
    res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    return;
  }

  const loja = lojas.find(l => l.usuario === usuario.trim().toLowerCase() && l.ativo);
  const verificacao = loja
    ? await verifyPassword(senha, loja.senhaHash)
    : { ok: false, needsRehash: false };
  if (!loja || !verificacao.ok) {
    res.status(401).json({ error: 'Credenciais inválidas ou loja inativa' });
    return;
  }

  // Migração transparente: credencial legada (SHA-256) é regravada em bcrypt no 1º login válido.
  if (verificacao.needsRehash) {
    try {
      loja.senhaHash = await hashPassword(senha);
      await salvarLoja(loja);
    } catch (e) {
      console.warn('[Auth] Falha ao migrar hash de senha para bcrypt (não bloqueante):', (e as Error)?.message);
    }
  }

  const empresa = empresas.find(e => e.id === loja.empresaId);
  if (!empresa || !empresa.ativo) {
    res.status(401).json({ error: 'Empresa vinculada está inativa' });
    return;
  }

  // Bloqueio por inadimplência (cobrança por LOJA): loja suspensa/cancelada não reabre sessão.
  if (lojaBloqueadaFinanceiro(loja)) {
    res.status(402).json({
      error: 'Assinatura desta loja suspensa por inadimplência. Regularize o pagamento para acessar o painel.',
      codigo: 'PAYMENT_REQUIRED'
    });
    return;
  }

  const token = crypto.randomUUID();
  const sessao: Sessao = {
    tipo: 'loja',
    lojaId: loja.id,
    nomeLoja: loja.nome,
    nomeEmpresa: empresa.nome,
    token,
    criadoEm: new Date().toISOString(),
    recebePedidos: loja.recebePedidos,
    latitude: loja.latitude,
    longitude: loja.longitude
  };
  await registrarSessao(sessao);

  res.json({
    token,
    tipo: 'loja',
    lojaId: loja.id,
    nomeLoja: loja.nome,
    nomeEmpresa: empresa.nome,
    recebePedidos: loja.recebePedidos,
    latitude: loja.latitude,
    longitude: loja.longitude
  });
}));

// ─── LOGIN ADMINISTRADOR ──────────────────────────────────────────────────────
router.post('/admin', asyncHandler(async (req: Request, res: Response) => {
  const { usuario, senha } = req.body;
  if (typeof usuario !== 'string' || !usuario.trim() || typeof senha !== 'string' || !senha || senha.length > 1024) {
    res.status(400).json({ error: 'Usuário e senha são obrigatórios' });
    return;
  }

  const usuarioLimpo = usuario.trim();
  const eValido = (await verificarAdminNoBanco(usuarioLimpo, senha)) ||
                  (!!ADMIN_USUARIO && !!ADMIN_SENHA && usuarioLimpo === ADMIN_USUARIO && senha === ADMIN_SENHA);

  if (!eValido) {
    res.status(401).json({ error: 'Credenciais administrativas incorretas' });
    return;
  }

  const token = crypto.randomUUID();
  const sessao: Sessao = {
    tipo: 'admin',
    token,
    criadoEm: new Date().toISOString(),
  };
  await registrarSessao(sessao);
  res.json({ token, tipo: 'admin' });
}));

// ─── VERIFICAR SESSÃO ATUAL ───────────────────────────────────────────────────
router.get('/me', (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) { res.status(401).json({ error: 'Não autenticado' }); return; }
  const sessao = obterSessaoPorToken(token);
  if (!sessao) { res.status(401).json({ error: 'Sessão inválida ou expirada' }); return; }
  // Retorna tudo menos o token interno
  const { token: _t, ...dadosSessao } = sessao;
  res.json({ ...dadosSessao, token });
});

// ─── LOGOUT ───────────────────────────────────────────────────────────────────
router.post('/logout', asyncHandler(async (req: Request, res: Response) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) await revogarSessao(token);
  res.json({ success: true });
}));

// ─── MIDDLEWARE DE AUTENTICAÇÃO ───────────────────────────────────────────────

/** Obter a sessão do request sem bloquear (retorna null se não autenticado) */
export function obterSessaoDoRequest(req: Request): Sessao | null {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  return obterSessaoPorToken(token);
}

/** O mesmo controle vale para HTTP, conexão e pacotes do WebSocket. */
export function obterSessaoPorToken(token: unknown): Sessao | null {
  if (typeof token !== 'string') return null;
  const sessao = sessions.get(token);
  if (!sessao) return null;
  if (sessao.tipo !== 'admin' && sessao.tipo !== 'loja') { sessions.delete(token); return null; }
  if (sessaoExpirada(sessao)) { sessions.delete(token); return null; }
  if (sessao.tipo === 'loja') {
    const loja = lojas.find(l => l.id === sessao.lojaId);
    const empresa = loja && empresas.find(e => e.id === loja.empresaId);
    if (!loja || !loja.ativo || !empresa || !empresa.ativo || lojaBloqueadaFinanceiro(loja)) { sessions.delete(token); return null; }
  }
  return sessao;
}

/** Middleware que exige autenticação válida */
export function verificarSessao(req: Request & { sessao?: Sessao }, res: Response, next: NextFunction) {
  const sessao = obterSessaoDoRequest(req);
  if (!sessao) {
    res.status(401).json({ error: 'Autenticação necessária' });
    return;
  }
  req.sessao = sessao;
  next();
}

/**
 * Middleware que bloqueia ações de escrita de uma LOJA suspensa/cancelada por
 * inadimplência (grace period D+7 esgotado). Cobrança é por loja: uma loja
 * suspensa não derruba as outras lojas da mesma empresa. Admin e leitura não afetados.
 */
export function exigirLojaAdimplente(req: Request & { sessao?: Sessao }, res: Response, next: NextFunction) {
  const sessao = obterSessaoDoRequest(req);
  if (sessao?.tipo === 'loja' && sessao.lojaId) {
    const loja = lojas.find(l => l.id === sessao.lojaId);
    if (loja && (lojaBloqueadaFinanceiro(loja))) {
      res.status(402).json({
        error: 'Assinatura desta loja suspensa por inadimplência. Regularize o pagamento para continuar operando.',
        codigo: 'PAYMENT_REQUIRED'
      });
      return;
    }
  }
  next();
}

/** Middleware que exige perfil de administrador */
export function verificarAdmin(req: Request & { sessao?: Sessao }, res: Response, next: NextFunction) {
  const sessao = obterSessaoDoRequest(req);
  if (!sessao || sessao.tipo !== 'admin') {
    res.status(403).json({ error: 'Acesso restrito ao administrador' });
    return;
  }
  req.sessao = sessao;
  next();
}

/**
 * Middleware de autenticação para os endpoints de integração ERP (/api/integracao/*).
 * Exige o header X-Api-Key com a chaveAcesso da loja identificada por X-Loja-Id.
 * Usa comparação em tempo constante para evitar timing attacks.
 */
export function verificarApiKeyIntegracao(req: Request, res: Response, next: NextFunction) {
  const apiKey = (req.header('x-api-key') || '').trim();
  const valorLojaId = req.header('x-loja-id') || req.body?.lojaId;
  const lojaId = typeof valorLojaId === 'string' ? valorLojaId.trim() : '';

  if (!apiKey) {
    res.status(401).json({ error: 'Header X-Api-Key é obrigatório.' });
    return;
  }
  if (!lojaId) {
    res.status(400).json({ error: 'Header X-Loja-Id (ou campo lojaId) é obrigatório.' });
    return;
  }

  const loja = lojas.find(l => l.id === lojaId);
  if (!loja) {
    res.status(404).json({ error: 'Loja não encontrada.' });
    return;
  }

  const empresa = empresas.find(e => e.id === loja.empresaId);
  if (!loja.ativo || !empresa?.ativo) { res.status(403).json({ error: 'Loja ou empresa inativa.' }); return; }
  if (lojaBloqueadaFinanceiro(loja)) {
    res.status(402).json({ error: 'Assinatura da loja suspensa.', codigo: 'PAYMENT_REQUIRED' }); return;
  }
  const chave = loja.chaveAcesso || '';
  const match =
    Buffer.byteLength(apiKey) === Buffer.byteLength(chave) &&
    crypto.timingSafeEqual(Buffer.from(apiKey), Buffer.from(chave));

  if (!match) {
    res.status(403).json({ error: 'API key inválida.' });
    return;
  }

  next();
}

export default router;
