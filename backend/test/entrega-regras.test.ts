import { describe, expect, it } from 'vitest';
import { calcularServico, configEntregaPadrao, validarConfigEntrega } from '../src/configEntrega';
import type { ConfigEntrega } from '../src/configEntrega';
const agora = Date.parse('2026-10-16T12:00:00-03:00');
const config = (): ConfigEntrega => ({ ...configEntregaPadrao('60000000'), ativa: true });
describe('tipos e faixas de entrega', () => {
  it('sugere os valores e mantém a regra desativada até a loja salvar', () => {
    expect(configEntregaPadrao().ativa).toBe(false);
    expect(config().tipos.map(t => [t.tipo,t.valor,t.prazoMinutos])).toEqual([['EXPRESS',7.9,45],['ROTEIRIZADA',6,120],['AGENDADA',6,null]]);
  });
  it('registra taxa, prazo e previsão independentes por tipo', () => {
    expect(calcularServico(config(),'EXPRESS',undefined,undefined,agora)).toMatchObject({ taxa:7.9, prazoMinutos:45, previstoPara:'2026-10-16T15:45:00.000Z' });
    expect(calcularServico(config(),'ROTEIRIZADA',undefined,undefined,agora)).toMatchObject({ taxa:6, prazoMinutos:120, previstoPara:'2026-10-16T17:00:00.000Z' });
  });
  it('registra agendamento no fuso da loja', () => expect(calcularServico(config(),'AGENDADA','2026-10-17T10:00:00-03:00',undefined,agora)).toMatchObject({ taxa:6, prazoMinutos:null, agendadoPara:'2026-10-17T13:00:00.000Z' }));
  it.each([undefined,'inválido','2026-10-17T10:00','2026-10-15T10:00:00-03:00','2027-10-17T10:00:00-03:00'])('rejeita agendamento inválido %s', data => expect(() => calcularServico(config(),'AGENDADA',data,undefined,agora)).toThrow('horário futuro'));
  it.each([[0,10],[6.9999,10],[7,10],[7.00001,15],[7.99999,15],[8,15]])('distância %s km usa taxa %s sem arredondar o limite', (km,taxa) => expect(calcularServico({...config(),cobranca:'km'},'EXPRESS',undefined,km,agora).taxa).toBe(taxa));
  it.each([8.00001,9,Infinity,NaN,-1,undefined])('bloqueia distância fora de cobertura ou inválida %s', km => expect(() => calcularServico({...config(),cobranca:'km'},'ROTEIRIZADA',undefined,km,agora)).toThrow());
  it('desativa tipos sem modificar pedidos anteriores', () => {
    const c=config(), anterior=calcularServico(c,'EXPRESS',undefined,undefined,agora);
    c.tipos[0].ativo=false; c.tipos[0].valor=99;
    expect(() => calcularServico(c,'EXPRESS')).toThrow('disponível'); expect(anterior.taxa).toBe(7.9);
  });
  it.each([-1,NaN,Infinity,7.999,'7.9',null])('recusa taxas inválidas %s', valor => { const c=config(); c.tipos[0].valor=valor as number; expect(() => validarConfigEntrega(c)).toThrow('Taxa'); });
  it.each([[7,7],[8,7],[0,8],[-1,8]])('recusa faixas sobrepostas ou fora de ordem %s', (a,b) => expect(() => validarConfigEntrega({...config(),faixas:[{ateKm:a,valor:10},{ateKm:b,valor:15}]})).toThrow('crescentes'));
  it('exige CEP, tipos únicos, prazos e pelo menos um tipo ativo', () => {
    expect(() => validarConfigEntrega({...config(),cobranca:'km',cepOrigem:''})).toThrow('CEP');
    const c=config(); c.tipos[1].tipo='EXPRESS'; expect(() => validarConfigEntrega(c)).toThrow('duplicidade');
    expect(() => validarConfigEntrega({...config(),tipos:config().tipos.map(t=>({...t,ativo:false}))})).toThrow('pelo menos');
    const p=config(); p.tipos[0].prazoMinutos=0; expect(() => validarConfigEntrega(p)).toThrow('prazo');
  });
});
