import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
beforeEach(()=>{vi.resetModules();vi.useFakeTimers();});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe('localização para cobrança',()=>{
  it('recusa resultado de cidade mesmo quando a consulta contém uma rua',async()=>{
    const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>[{lat:'-3.7',lon:'-38.5',address:{city:'Fortaleza'}}]});
    vi.stubGlobal('fetch',fetchMock);const {geocodificarEndereco}=await import('../src/geocoding');
    const promessa=geocodificarEndereco({endereco:'Rua inexistente',numero:'100',cidade:'Fortaleza',uf:'CE'},false);
    await vi.runAllTimersAsync();expect(await promessa).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('aceita resultado de logradouro e mantém o cache específico para cobrança',async()=>{
    const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>[{lat:'-3.7',lon:'-38.5',address:{road:'Rua teste',city:'Fortaleza'}}]});
    vi.stubGlobal('fetch',fetchMock);const {geocodificarEndereco}=await import('../src/geocoding');
    const endereco={endereco:'Rua teste',numero:'100',cidade:'Fortaleza',uf:'CE'};
    expect(await geocodificarEndereco(endereco,false)).toEqual({latitude:-3.7,longitude:-38.5});
    expect(await geocodificarEndereco(endereco,false)).toEqual({latitude:-3.7,longitude:-38.5});expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
