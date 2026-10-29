import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/database', () => ({ pool: {} }));
vi.mock('../src/geocodingEntrega', () => ({ localizarEnderecoEntrega: vi.fn() }));
import { localizarEnderecoEntrega } from '../src/geocodingEntrega';
import { configEntregaPadrao } from '../src/configEntrega';
import { confirmarCotacao, cotarEntrega, distanciaRodoviaria } from '../src/entregaService';
const config = () => ({...configEntregaPadrao('60000000'),ativa:true});
const endereco = {logradouro:'Rua das Flores',numero:'100',cidade:'Fortaleza',uf:'CE',cep:'60000000'};
beforeEach(()=>{vi.mocked(localizarEnderecoEntrega).mockReset();vi.mocked(localizarEnderecoEntrega).mockResolvedValue({latitude:-3.7,longitude:-38.5});});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe('cotação autoritativa de entrega',()=>{
  it('confirma o preço do servidor e recalcula o prazo a partir da confirmação',async()=>{
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
    const c=config(),q=await cotarEntrega('l1',c,endereco,{tipo:'EXPRESS'});
    vi.advanceTimersByTime(60000);
    expect(confirmarCotacao('l1',c,endereco,{tipo:'EXPRESS',cotacaoId:q.cotacaoId})).toMatchObject({taxa:7.9,previstoPara:'2026-10-16T12:46:00.000Z'});
  });
  it('vincula a cotação à loja, endereço, tipo e configuração',async()=>{
    const c=config(),q=await cotarEntrega('l1',c,endereco,{tipo:'EXPRESS'}),s={tipo:'EXPRESS' as const,cotacaoId:q.cotacaoId};
    expect(()=>confirmarCotacao('l2',c,endereco,s)).toThrow('novamente');
    expect(()=>confirmarCotacao('l1',c,{...endereco,numero:'101'},s)).toThrow('novamente');
    expect(()=>confirmarCotacao('l1',c,endereco,{...s,tipo:'ROTEIRIZADA'})).toThrow('novamente');
    const alterada=config();alterada.tipos[0].valor=8;expect(()=>confirmarCotacao('l1',alterada,endereco,s)).toThrow('novamente');
    expect(()=>confirmarCotacao('l1',c,endereco,{...s,cotacaoId:'inventada'})).toThrow('novamente');
  });
  it('expira em dez minutos e não usa o horário de um agendamento já passado',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
    const c=config(),s={tipo:'AGENDADA' as const,agendadoPara:'2026-10-16T12:01:00Z'},q=await cotarEntrega('l1',c,endereco,s);
    vi.advanceTimersByTime(61000);expect(()=>confirmarCotacao('l1',c,endereco,{...s,cotacaoId:q.cotacaoId})).toThrow('horário futuro');
    vi.advanceTimersByTime(600000);expect(()=>confirmarCotacao('l1',c,endereco,{...s,cotacaoId:q.cotacaoId})).toThrow('expirou');
  });
  it('calcula pelas vias sem arredondar a distância para escolher a faixa',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({code:'Ok',routes:[{distance:7000.01}]})}));
    const q=await cotarEntrega('l1',{...config(),cobranca:'km'},endereco,{tipo:'EXPRESS'});
    expect(q.servico).toMatchObject({taxa:15,cepOrigem:'60000000'});
    expect(q.servico.distanciaKm).toBeCloseTo(7.00001,8);
    expect(localizarEnderecoEntrega).toHaveBeenNthCalledWith(1,{cep:'60000000'});
    expect(localizarEnderecoEntrega).toHaveBeenNthCalledWith(2,expect.objectContaining({endereco:'Rua das Flores'}));
  });
  it('não fabrica distância quando o endereço não é localizado',async()=>{
    vi.mocked(localizarEnderecoEntrega).mockResolvedValue(null);
    const fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);
    await expect(distanciaRodoviaria('60000000',endereco)).rejects.toThrow('localizar');expect(fetchMock).not.toHaveBeenCalled();
  });
  it('preserva o aviso de estimativa na cotação e na confirmação',async()=>{
    vi.mocked(localizarEnderecoEntrega).mockResolvedValueOnce({latitude:-3.7,longitude:-38.5}).mockResolvedValueOnce({latitude:-3.71,longitude:-38.51,precisao:'logradouro'});
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({code:'Ok',routes:[{distance:5000}]})}));
    const c={...config(),cobranca:'km' as const};const q=await cotarEntrega('l1',c,endereco,{tipo:'EXPRESS'});
    expect(q.servico.avisoLocalizacao).toContain('estimada');expect(confirmarCotacao('l1',c,endereco,{tipo:'EXPRESS',cotacaoId:q.cotacaoId}).avisoLocalizacao).toBe(q.servico.avisoLocalizacao);
  });
  it.each([{ok:false},{ok:true,json:async()=>({code:'NoRoute'})},{ok:true,json:async()=>({code:'Ok',routes:[{distance:-1}]})}])('bloqueia resposta de roteamento inválida',async resposta=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(resposta));await expect(distanciaRodoviaria('60000000',endereco)).rejects.toThrow('indisponível');
  });
  it('recusa campos malformados e seleção ausente antes de consultar serviços externos',async()=>{
    await expect(cotarEntrega('l1',config(),{...endereco,numero:42 as unknown as string},{tipo:'EXPRESS'})).rejects.toThrow('endereço');
    await expect(cotarEntrega('l1',config(),endereco,undefined as never)).rejects.toThrow('tipo');
    expect(localizarEnderecoEntrega).not.toHaveBeenCalled();
  });
});
