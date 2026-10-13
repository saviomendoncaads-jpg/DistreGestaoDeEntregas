import {describe,it,expect} from 'vitest';
import {diaCobranca,diasAtraso,bloqueiaFatura,proximoMes,carenciaValida} from '../src/billing/billingPolicy';
describe('calendário e carência da cobrança',()=>{
 it('usa o dia civil de Fortaleza na virada UTC',()=>{expect(diaCobranca('2026-10-14T01:00:00Z')).toBe('2026-10-13');});
 it('não bloqueia vencimento de hoje ou durante cinco dias de carência',()=>{expect(bloqueiaFatura('PENDENTE','2026-10-10',5,'2026-10-10')).toBe(false);expect(bloqueiaFatura('ATRASADA','2026-10-10',5,'2026-10-15')).toBe(false);expect(bloqueiaFatura('ATRASADA','2026-10-10',5,'2026-10-16')).toBe(true);});
 it('carência zero bloqueia a partir do dia seguinte, sem bloquear fatura paga',()=>{expect(bloqueiaFatura('PENDENTE','2026-10-10',0,'2026-10-11')).toBe(true);expect(bloqueiaFatura('PAGA','2020-01-01',0,'2026-10-13')).toBe(false);});
 it('avança dezembro e respeita fevereiro sem deriva de data',()=>{expect(proximoMes('2026-12-28',28)).toBe('2027-01-28');expect(proximoMes('2026-01-28',28)).toBe('2026-02-28');expect(diasAtraso('2026-10-01','2026-10-13')).toBe(12);});
 it('rejeita datas inválidas, dias e carências incoerentes',()=>{expect(()=>diaCobranca('2026-02-31')).toThrow();expect(()=>proximoMes('2026-10-10',31)).toThrow();expect(()=>carenciaValida(-1)).toThrow();expect(()=>carenciaValida(2.5)).toThrow();});
});
