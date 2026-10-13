import type { Server } from 'socket.io';
import { obterSessaoPorToken, lojaBloqueadaFinanceiro } from '../auth';
import { lojas } from '../tenants';

/** Autoriza conexão e cada pacote; logout/revogação não deixa o canal aberto. */
export function configurarAutenticacaoSocket(io: Server): void {
  io.use((socket, next) => {
    if (!obterSessaoPorToken(socket.handshake.auth?.token)) { next(new Error('Autenticação necessária.')); return; }
    socket.use(([evento], proximo) => {
      const sessao = obterSessaoPorToken(socket.handshake.auth?.token);
      if (!sessao) {
        socket.emit('session_expired'); socket.disconnect(true);
        proximo(new Error('Sessão inválida ou expirada.')); return;
      }
      const loja = sessao.tipo === 'loja' ? lojas.find(l => l.id === sessao.lojaId) : undefined;
      if (evento !== 'whatsapp_get_history' && loja && lojaBloqueadaFinanceiro(loja)) {
        proximo(new Error('Assinatura da loja suspensa.')); return;
      }
      proximo();
    });
    next();
  });
}

/** Deve ocorrer antes de qualquer snapshot destinado às salas autenticadas. */
export function desconectarSessoesInvalidas(io: Server): void {
  for (const socket of io.sockets.sockets.values()) {
    if (!obterSessaoPorToken(socket.handshake.auth?.token)) {
      socket.emit('session_expired'); socket.disconnect(true);
    }
  }
}
