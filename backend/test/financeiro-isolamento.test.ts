import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({init:vi.fn(),cycle:vi.fn()}));
vi.mock('../src/billing/recurringBilling',()=>({inicializarRecorrencia:mocks.init,executarCicloCobranca:mocks.cycle}));
vi.mock('../src/database',()=>({pool:{request:vi.fn()}}));
import {inicializarFinanceiro,rotinaVerificacaoInadimplencia} from '../src/financeiroService';
beforeEach(()=>{vi.stubEnv('SEED_DEMO','false');mocks.init.mockReset();mocks.cycle.mockReset();});afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
describe('financeiro usa política central de contratos',()=>{
 it('encaminha a rotina à avaliação única de recorrência e acesso',async()=>{await rotinaVerificacaoInadimplencia();expect(mocks.cycle).toHaveBeenCalledTimes(1);});
 it('instância sem jobs aplica schema, mas não emite nem bloqueia contratos',async()=>{vi.stubEnv('RUN_BACKGROUND_JOBS','false');const timer=vi.spyOn(globalThis,'setInterval');await inicializarFinanceiro();expect(mocks.init).toHaveBeenCalledTimes(1);expect(mocks.cycle).not.toHaveBeenCalled();expect(timer).not.toHaveBeenCalled();});
});
