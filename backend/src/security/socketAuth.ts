import type { Server } from 'socket.io';
import { obterSessaoPorToken, lojaBloqueadaFinanceiro, lojaAguardandoPagamento } from '../auth';
import { lojas } from '../tenants';

/** Autoriza conexão e cada pacote; logout/revogação não deixa o canal aberto. */
export function configurarAutenticacaoSocket(io: Server): void {
  io.use((socket, next) => {
    const initial = obterSessaoPorToken(socket.handshake.auth?.token);
    if (!initial) { next(new Error('Autenticação necessária.')); return; }
    if(initial.tipo==='loja' && lojas.some(l=>l.id===initial.lojaId && lojaAguardandoPagamento(l))) {next(new Error('Confirmação do primeiro pagamento necessária.'));return;}
    socket.use(([evento], proximo) => {
      const sessao = obterSessaoPorToken(socket.handshake.auth?.token);
      if (!sessao) {
        socket.emit('session_expired'); socket.disconnect(true);
        proximo(new Error('Sessão inválida ou expirada.')); return;
      }
      const loja = sessao.tipo === 'loja' ? lojas.find(l => l.id === sessao.lojaId) : undefined;
      if(loja && lojaAguardandoPagamento(loja)) {socket.emit('payment_required');socket.disconnect(true);proximo(new Error('Confirmação do pagamento necessária.'));return;}
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
    const s = obterSessaoPorToken(socket.handshake.auth?.token);
    if (!s || (s.tipo==='loja' && lojas.some(l=>l.id===s.lojaId && lojaAguardandoPagamento(l)))) {
      socket.emit(s ? 'payment_required' : 'session_expired'); socket.disconnect(true);
    }
  }
}
