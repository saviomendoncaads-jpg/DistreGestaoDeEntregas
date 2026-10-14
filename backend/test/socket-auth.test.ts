import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'socket.io';
const mocks = vi.hoisted(() => ({ sessao: vi.fn() }));
vi.mock('../src/auth', () => ({ obterSessaoPorToken: mocks.sessao, lojaBloqueadaFinanceiro: (loja:any)=>['SUSPENSO','CANCELADO'].includes(loja.statusFinanceiro), lojaAguardandoPagamento: (loja:any)=>loja.statusFinanceiro==='AGUARDANDO_PAGAMENTO' }));
vi.mock('../src/tenants', () => ({ lojas: [{ id: 'l1', statusFinanceiro: 'SUSPENSO' }] }));
import { configurarAutenticacaoSocket, desconectarSessoesInvalidas } from '../src/security/socketAuth';
beforeEach(() => { mocks.sessao.mockReset(); });
function canal() {
  const socket = { handshake: { auth: { token: 'teste' } }, use: vi.fn(), emit: vi.fn(), disconnect: vi.fn() };
  const io = { use: vi.fn(), sockets: { sockets: new Map([['socket', socket]]) } };
  configurarAutenticacaoSocket(io as unknown as Server);
  return { socket, io, autorizar: io.use.mock.calls[0][0] };
}
describe('autenticação do canal em tempo real', () => {
  it('rejeita handshake anônimo antes de registrar listeners ou enviar dados', () => {
    const { socket, autorizar } = canal(); mocks.sessao.mockReturnValue(null); const next = vi.fn();
    autorizar(socket, next); expect(next.mock.calls[0][0]).toBeInstanceOf(Error); expect(socket.use).not.toHaveBeenCalled();
  });
  it('revalida sessão a cada pacote e desconecta depois da revogação', () => {
    const { socket, autorizar } = canal(); mocks.sessao.mockReturnValue({ tipo: 'admin' }); autorizar(socket, vi.fn());
    mocks.sessao.mockReturnValue(null); const next = vi.fn(); socket.use.mock.calls[0][0](['driver_register', {}], next);
    expect(socket.disconnect).toHaveBeenCalledWith(true); expect(socket.emit).toHaveBeenCalledWith('session_expired'); expect(next.mock.calls[0][0]).toBeInstanceOf(Error);
  });
  it('interrompe conexões revogadas antes dos snapshots periódicos', () => {
    const { socket, io } = canal(); mocks.sessao.mockReturnValue(null); desconectarSessoesInvalidas(io as unknown as Server);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });
  it('nega escrita por socket de loja suspensa e permite consultar o próprio histórico', () => {
    const { socket, autorizar } = canal(); mocks.sessao.mockReturnValue({ tipo: 'loja', lojaId: 'l1' }); autorizar(socket, vi.fn());
    const next = vi.fn(); const pacote = socket.use.mock.calls[0][0]; pacote(['driver_gps_update', {}], next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(Error); next.mockClear(); pacote(['whatsapp_get_history', {}], next); expect(next).toHaveBeenCalledWith();
  });
});
