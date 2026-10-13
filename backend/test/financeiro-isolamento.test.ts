import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), input: vi.fn(), revogarEmpresa: vi.fn() }));
vi.mock('../src/database', () => ({ pool: { request: () => ({ input: mocks.input, query: mocks.query }) } }));
vi.mock('../src/auth', () => ({ verificarAdmin: vi.fn(), revogarSessoesDaEmpresa: mocks.revogarEmpresa }));
vi.mock('../src/tenants', () => ({ empresas: [{ id: 'e1', nome: 'Empresa teste', statusFinanceiro: 'REGULAR' }], lojas: [] }));
import { empresas } from '../src/tenants';
import { inicializarFinanceiro, rotinaVerificacaoInadimplencia } from '../src/financeiroService';
beforeEach(() => {
  mocks.query.mockReset(); mocks.input.mockReset(); mocks.revogarEmpresa.mockReset();
  mocks.input.mockReturnValue({ input: mocks.input, query: mocks.query }); empresas[0].statusFinanceiro = 'REGULAR';
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
describe('rotina financeira respeita operação por loja', () => {
  it('não revoga sessões das outras filiais quando uma fatura fica atrasada', async () => {
    mocks.query.mockResolvedValueOnce({ recordset: [{ DIAS_CARENCIA_BLOQUEIO: 5 }] })
      .mockResolvedValueOnce({ recordset: [{ ID: 'fatura-teste', EMPRESA_ID: 'e1', LOJA_ID: 'l1', STATUS: 'ATRASADA', DATA_VENCIMENTO: '2020-01-01' }] })
      .mockResolvedValue({ recordset: [] });
    await rotinaVerificacaoInadimplencia();
    expect(empresas[0].statusFinanceiro).toBe('INADIMPLENTE'); expect(mocks.revogarEmpresa).not.toHaveBeenCalled();
  });
  it('não inicia rotina nem timer em instância com jobs desligados', async () => {
    vi.stubEnv('SEED_DEMO','false'); vi.stubEnv('RUN_BACKGROUND_JOBS','false'); const timer = vi.spyOn(globalThis,'setInterval');
    await inicializarFinanceiro(); expect(mocks.query).not.toHaveBeenCalled(); expect(timer).not.toHaveBeenCalled();
  });
});
