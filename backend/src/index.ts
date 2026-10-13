import 'dotenv/config'; // carrega backend/.env ANTES de tudo (database.ts lê process.env no load)
import { configurarAutenticacaoSocket, desconectarSessoesInvalidas } from './security/socketAuth';
import { podeAcessarLoja } from './security/sessionPolicy';
import { responderErro } from './http/asyncHandler';
import express from 'express';
import { asyncSocketHandler } from './http/asyncSocketHandler';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import tenantsRouter, { carregarTenantsDoBanco, lojas } from './tenants';
import authRouter, { obterSessaoPorToken, carregarSessoesDoBanco, verificarApiKeyIntegracao } from './auth';
import apiRouter, { deliveries, webhooksReceived, drivers, carregarEntregasDoBanco, carregarMotoristasDoBanco, carregarVeiculosDoBanco } from './gateway';
import whatsappRouter, { whatsappBotService, obterSessaoWhatsapp } from './whatsapp';
import { broker } from './broker';
import { dispatcherAgent } from './dispatcher';
import { monitorAgent } from './monitor';
import { integratorAgent } from './integrator';
import { conectarBanco, limparSessoesExpiradas, pool } from './database';
import { Entrega, Motorista } from './types';
import financeiroRouter, { inicializarFinanceiro } from './financeiroService';
import integracaoPedidosRouter from './integracaoPedidos';
import integracaoEntregasRouter from './integracaoEntregas';
import vitrineRouter from './vitrine';
import gestaoVitrineRouter, { uploadsDir } from './gestaoVitrine';
import { inicializarEstoque } from './estoque';
import implantacaoRouter, { inicializarImplantacao } from './implantacao';
import fiscalRouter from './fiscal/fiscalRoutes';
import webhookRouter from './billing/webhookRoutes';
import { iniciarWorkerWebhooks } from './billing/webhookProcessor';
import { iniciarDunning } from './billing/dunningScheduler';
import commercialReportsRouter from './commercialReports';

const app = express();
const port = process.env.PORT || 5000;

// Atrás de load balancer/reverse proxy (deploy multi-instância ou nginx): habilita a
// leitura de X-Forwarded-* para o IP real do cliente (rate-limit correto) e protocolo.
// Gate por env: sem proxy na frente, NÃO confiar nesses headers (anti-spoofing de IP).
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
}

// Allowlist de origens do CORS. Em produção defina CORS_ORIGINS (lista separada por
// vírgula, ex.: "https://app.distre.com.br,https://admin.distre.com.br").
// O default cobre o frontend Vite em desenvolvimento.
const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    // Sem header Origin = chamada server-to-server (ERP, gateway de pagamento, curl,
    // app mobile) → liberado. Origens de navegador passam pela allowlist.
    if (!origin) return callback(null, true);
    if (corsOrigins.includes('*') || corsOrigins.includes(origin)) return callback(null, true);
    // Origem não permitida: NÃO lança erro (lançar viraria 500 e quebraria até
    // requisições de MESMA ORIGEM — o navegador manda header Origin em fetch/módulo
    // mesmo same-origin). Apenas omite os headers CORS: same-origin passa normal;
    // cross-origin não-autorizado é bloqueado pelo navegador (resposta sem ACAO).
    return callback(null, false);
  },
  credentials: true,
};

// Cabeçalhos de segurança HTTP. CSP/CORP relaxados porque este serviço é uma API
// JSON consumida por um SPA de outra origem (não serve HTML próprio).
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors(corsOptions));

// Webhooks do gateway de pagamento: montados ANTES do express.json para receber
// o corpo BRUTO (Buffer) e validar a assinatura HMAC. As demais rotas seguem JSON.
app.use('/api/billing/webhooks', express.raw({ type: '*/*' }), webhookRouter);

// Gestão da vitrine (painel da loja): CRUD de produtos, logo e upload de imagens.
// Montado ANTES do json global para usar um limite maior (imagens em base64).
app.use('/api/gestao', express.json({ limit: '5mb' }), gestaoVitrineRouter);
app.use('/api/implantacao', express.json({ limit: '20kb' }), implantacaoRouter);

// Módulo Fiscal: NFC-e / NF-e por loja (emitente, credenciais, emissão, DANFE, cancelamento).
// Antes do json global: o upload do certificado A1 (base64) passa do limite padrão.
app.use('/api/fiscal', express.json({ limit: '1mb' }), fiscalRouter);

app.use(express.json());

// Proteção contra força-bruta de credenciais nas rotas de autenticação.
const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de autenticação. Aguarde um minuto e tente novamente.' },
});

// Roteador de autenticação
app.use('/api/auth', authLimiter, authRouter);

// Roteador de gestão de empresas e lojas (multi-tenant)
app.use('/api', tenantsRouter);

// Roteador do assistente virtual WhatsApp
app.use('/api/whatsapp', whatsappRouter);

// Roteador do Módulo Financeiro (admin)
app.use('/api/admin/financeiro', financeiroRouter);
app.use('/api/admin/relatorios', commercialReportsRouter);

// Roteadores de integração ERP: autenticados por API key (X-Api-Key = chaveAcesso da loja)
app.use('/api/integracao', verificarApiKeyIntegracao, integracaoPedidosRouter);
app.use('/api/integracao', verificarApiKeyIntegracao, integracaoEntregasRouter);

// Vitrine pública (Painel do Cliente): cardápio + checkout consumidos direto pelo
// navegador do cliente final. Sem credencial — os preços são validados no servidor
// (vitrine.ts) — e com rate limit próprio por ser rota aberta.
const vitrineLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Aguarde um instante e tente novamente.' },
});
app.use('/api/vitrine', vitrineLimiter, vitrineRouter);

// Monta o Roteador de API do Gateway Ingress
app.use('/api', apiRouter);

// Endpoint básico de status de saúde do servidor
app.get('/health', async (_req, res) => {
  try {
    if (!pool?.connected) throw new Error('Banco desconectado');
    await pool.request().query('SELECT 1 AS pronto');
  } catch { res.status(503).json({ status: 'indisponivel' }); return; }
  res.json({
    status: 'saudavel',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Produção (1 servidor, 1 origem), com a LANDING pública como porta de entrada:
//   /          -> LANDING (site/index.html): marketing + cadastro self-service + planos
//   /app[/...] -> APP React (frontend/dist): login + painel da loja/admin (SPA)
//   /assets/*  -> assets do app React (referenciados de forma absoluta no build)
// Rotas de API/WebSocket/health são montadas ANTES e têm prioridade.
const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
const siteDir = path.join(__dirname, '..', '..', 'site');

// Assets do app React (sempre na raiz /assets).
app.use('/assets', express.static(path.join(frontendDist, 'assets')));

// Imagens enviadas pelo painel (produtos da vitrine, logomarca da loja).
app.use('/uploads', express.static(uploadsDir, { maxAge: '7d', immutable: true }));

// APP em /app — SPA: /app e subrotas servem o index.html do app.
app.get(['/app', '/app/*'], (_req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
app.get(['/implantacao', '/implantacao/', '/area-cliente', '/area-cliente/'], (_req, res) => res.sendFile(path.join(frontendDist, 'index.html')));

// Cardápio público (Painel do Cliente) em /loja/<lojaId> — mesma SPA React;
// o main.tsx roteia pelo pathname e carrega só o chunk da vitrine.
app.get(['/loja', '/loja/*'], (_req, res) => res.sendFile(path.join(frontendDist, 'index.html')));

// LANDING pública na raiz (serve site/index.html, favicon, etc.).
app.use(express.static(siteDir));

// Fallback: qualquer outra rota não-API/WS/health/assets cai na LANDING.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io') || req.path === '/health' || req.path.startsWith('/assets') || req.path.startsWith('/uploads')) return next();
  res.sendFile(path.join(siteDir, 'index.html'));
});

app.use(responderErro);

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: corsOrigins.includes('*') ? '*' : corsOrigins,
    methods: ['GET', 'POST']
  }
});

configurarAutenticacaoSocket(io);

// Multi-instância: com REDIS_URL definido, os broadcasts do socket.io são propagados
// entre réplicas via Redis pub/sub. Sem REDIS_URL = instância única (idêntico ao atual).
// NOTA: o estado autoritativo (deliveries/drivers) ainda é por-instância — ver
// docs/ESCALA_MULTI_INSTANCIA.md para o roadmap de estado compartilhado + sticky sessions.
async function configurarAdapterRedis(): Promise<void> {
  const url = process.env.REDIS_URL;
  if (!url) return;
  try {
    const pubClient = createClient({ url });
    const subClient = pubClient.duplicate();
    pubClient.on('error', (e) => console.error('[Redis] pub error:', e?.message));
    subClient.on('error', (e) => console.error('[Redis] sub error:', e?.message));
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    console.log('[Socket] Adapter Redis ativo — broadcasts propagados entre instâncias.');
  } catch (e) {
    console.error('[Socket] Falha ao configurar adapter Redis (seguindo single-instance):', (e as Error)?.message);
  }
}

// Transmite eventos do Broker para todos os clientes WebSocket
broker.registerBroadcastCallback((event, queueSize) => {
  const lojaId = deliveries.get(event.deliveryId)?.lojaId;
  const destino = lojaId ? io.to('admin').to(`loja-${lojaId}`) : io.to('admin');
  destino.emit('broker_event', {
    event,
    queueSize,
    metrics: broker.getQueueMetrics()
  });
});

// Lógica de conexão do Socket.io com autenticação de sessão
io.on('connection', (socket) => {
  console.log(`[Socket] Cliente conectado: ${socket.id}`);

  // Identifica a sessão pelo token enviado no handshake
  const token = socket.handshake.auth?.token as string | undefined;
  const sessao = obterSessaoPorToken(token);
  if (!sessao) { socket.disconnect(true); return; }

  // Coloca o socket na sala correta
  if (sessao?.tipo === 'loja' && sessao.lojaId) {
    socket.join(`loja-${sessao.lojaId}`);
  } else if (sessao?.tipo === 'admin') {
    socket.join('admin');
  }

  // Filtra entregas e drivers pela loja da sessão
  const todasEntregas = Array.from(deliveries.values());
  let entregasFiltradas: Entrega[] = [];
  let driversFiltrados: Motorista[] = [];

  if (sessao?.tipo === 'loja' && sessao.lojaId) {
    entregasFiltradas = todasEntregas.filter(d => d.lojaId === sessao.lojaId);
    driversFiltrados = drivers.filter(d => d.lojaId === sessao.lojaId);
  } else if (sessao?.tipo === 'admin') {
    entregasFiltradas = todasEntregas;
    driversFiltrados = drivers;
  }

  // Envia dados iniciais ao se conectar (somente se autenticado/admin)
  socket.emit('initial_state', {
    deliveries: entregasFiltradas,
    drivers: driversFiltrados,
    eventHistory: sessao?.tipo === 'admin' ? broker.getHistory() : [],
    webhooksReceived: sessao?.tipo === 'admin' ? webhooksReceived : [],
    agents: {
      dispatcher: dispatcherAgent.getAgentState(),
      monitor: monitorAgent.getAgentState(),
      integrator: integratorAgent.getAgentState()
    },
    queue: broker.getQueueMetrics()
  });

  // Listeners para o Simulador de WhatsApp
  socket.on('whatsapp_send_msg', asyncSocketHandler(async (data: { phone: string; text: string; lojaId: string }) => {
    if (!data || typeof data.phone !== 'string' || typeof data.text !== 'string' || data.text.length > 2000) return;
    const { phone, text, lojaId } = data;
    const targetLojaId = sessao?.tipo === 'loja' && sessao.lojaId ? sessao.lojaId : lojaId;
    if (!targetLojaId || !lojas.some(l => l.id === targetLojaId && l.ativo) || !podeAcessarLoja(sessao, targetLojaId)) return;
    const room = `loja-${targetLojaId}`;

    // 1. Transmite a mensagem enviada pelo cliente (para atualizar todos os painéis da loja/admin)
    io.to(room).to('admin').emit('whatsapp_msg_received', {
      phone,
      sender: 'customer',
      text,
      timestamp: new Date().toISOString()
    });

    // 2. Simula o indicador "digitando..."
    io.to(room).to('admin').emit('whatsapp_typing', {
      phone,
      isTyping: true
    });

    try {
      // 3. Processa a mensagem do bot
      const reply = await whatsappBotService.processMessage(phone, text, targetLojaId);

      // 4. Aguarda 1.5s antes de enviar a resposta do bot para parecer realista
      setTimeout(() => {
        // Desliga o indicador de digitando
        io.to(room).to('admin').emit('whatsapp_typing', {
          phone,
          isTyping: false
        });

        // Envia a resposta do bot
        io.to(room).to('admin').emit('whatsapp_msg_received', {
          phone,
          sender: 'bot',
          text: reply,
          timestamp: new Date().toISOString()
        });
      }, 1500);
    } catch (error: any) {
      console.error('[Socket WhatsApp Error]', error);
      io.to(room).to('admin').emit('whatsapp_typing', {
        phone,
        isTyping: false
      });
    }
  }));

  socket.on('whatsapp_get_history', (data: { phone: string; lojaId: string }) => {
    if (!data || typeof data.phone !== 'string') return;
    const { phone, lojaId } = data;
    const targetLojaId = sessao?.tipo === 'loja' && sessao.lojaId ? sessao.lojaId : lojaId;
    if (!targetLojaId || !podeAcessarLoja(sessao, targetLojaId)) return;
    const session = obterSessaoWhatsapp(targetLojaId, phone);
    socket.emit('whatsapp_history', {
      phone,
      messages: session?.messages || []
    });
  });

  socket.on('disconnect', () => console.log(`[Socket] Cliente desconectado: ${socket.id}`));

});

// Transmissão periódica do status do sistema (a cada 1 segundo) — filtrado por sala
setInterval(() => {
  desconectarSessoesInvalidas(io);
  const agentStates = {
    dispatcher: dispatcherAgent.getAgentState(),
    monitor: monitorAgent.getAgentState(),
    integrator: integratorAgent.getAgentState()
  };
  const todasEntregas = Array.from(deliveries.values());

  // Emite para admin/sem-sessão: todos os dados.
  // io.local: cada instância envia o snapshot do SEU estado só aos SEUS clientes —
  // evita snapshots conflitantes entre réplicas (o adapter Redis propagaria o full-state).
  io.local.to('admin').emit('system_status', {
    deliveries: todasEntregas,
    drivers,
    agents: agentStates,
    queue: broker.getQueueMetrics(),
    webhooksReceived,
    timestamp: new Date().toISOString()
  });

  // Emite para cada loja: somente seus próprios dados
  for (const loja of lojas) {
    const entregasLoja = todasEntregas.filter(d => d.lojaId === loja.id);
    const driversLoja = drivers.filter(d => d.lojaId === loja.id);
    io.local.to(`loja-${loja.id}`).emit('system_status', {
      deliveries: entregasLoja,
      drivers: driversLoja,
      agents: agentStates,
      queue: broker.getQueueMetrics(),
      webhooksReceived: [],
      recebePedidos: loja.recebePedidos,
      lojaLat: loja.latitude,
      lojaLng: loja.longitude,
      timestamp: new Date().toISOString()
    });
  }
}, 1000);

async function startServer() {
  // Conecta ao SQL Server
  await conectarBanco();
  await inicializarEstoque();
  await inicializarImplantacao();

  // Carrega os tenants (empresas/lojas) do banco de dados / realiza migração se necessário
  await carregarTenantsDoBanco();

  // Restaura as sessões persistidas (sobrevive a restart/deploy) e agenda a limpeza
  // das expiradas. Depende dos tenants já carregados (gate de loja suspensa na hidratação).
  await carregarSessoesDoBanco();
  setInterval(() => { limparSessoesExpiradas().catch(() => {}); }, 60 * 60 * 1000);

  // Carrega os motoristas cadastrados na tabela do banco de dados
  await carregarMotoristasDoBanco();

  // Carrega os tipos de veículos do banco de dados
  await carregarVeiculosDoBanco();
  
  // Carrega entregas do banco de dados para a memória
  await carregarEntregasDoBanco();

  // Inicializa o módulo financeiro (seed + rotina de inadimplência)
  await inicializarFinanceiro();

  // Workers singleton (webhook + dunning): em deploy multi-instância, rode-os em UMA
  // instância (RUN_BACKGROUND_JOBS=true) e desligue nas demais (web) para evitar
  // processamento duplicado da fila de pagamentos e da régua de cobrança. Default = ligado.
  const runJobs = (process.env.RUN_BACKGROUND_JOBS ?? 'true').toLowerCase() !== 'false';
  if (runJobs) {
    iniciarWorkerWebhooks();
    iniciarDunning();
  } else {
    console.log('[Boot] RUN_BACKGROUND_JOBS=false — workers de webhook/dunning desligados nesta instância.');
  }

  // Multi-instância: liga o adapter Redis do socket.io se REDIS_URL estiver definido.
  await configurarAdapterRedis();

  httpServer.listen(port, () => {
    console.log(`==================================================`);
    console.log(`🚀 Motor de Orquestração de Entregas Backend Rodando`);
    console.log(`📡 Porta: ${port}`);
    console.log(`👉 Health Check: http://localhost:${port}/health`);
    console.log(`==================================================`);
  });
}

startServer().catch(error => {
  console.error('[Boot] Inicialização interrompida:', error?.message);
  process.exit(1);
});
