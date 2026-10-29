import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(()=>({enriquecer:vi.fn(),osm:vi.fn()}));
vi.mock('../src/geocoding',()=>({enriquecerComViaCep:mocks.enriquecer,geocodificarEndereco:mocks.osm}));
const endereco={endereco:'Rua Sessenta e Um',numero:'36',bairro:'Planalto',cidade:'Abreu e Lima',uf:'PE',cep:'53550811'};
const candidato=()=>({score:100,location:{x:-34.91144,y:-7.910788},attributes:{Addr_type:'PointAddress',Country:'BRA',City:'Abreu E Lima',RegionAbbr:'PE',StName:'Sessenta e Um',AddNum:'36'}});
beforeEach(()=>{vi.resetModules();mocks.enriquecer.mockReset();mocks.enriquecer.mockImplementation(async e=>e.endereco?e:{...endereco,numero:undefined});mocks.osm.mockReset();mocks.osm.mockResolvedValue(null);});
afterEach(()=>vi.unstubAllGlobals());
describe('resolução de ruas ausentes no OpenStreetMap',()=>{
  it('resolve CEP de origem usando ViaCEP e um logradouro verificado',async()=>{
    const c=candidato();c.attributes.Addr_type='StreetName';c.attributes.AddNum='';vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({candidates:[c]})}));
    const {localizarEnderecoEntrega}=await import('../src/geocodingEntrega');
    expect(await localizarEnderecoEntrega({cep:'53550811'})).toMatchObject({latitude:-7.910788,longitude:-34.91144});expect(mocks.enriquecer).toHaveBeenCalledWith({cep:'53550811'});expect(mocks.osm).not.toHaveBeenCalled();
  });
  it.each(['cidade','uf','rua','numero','tipo','score','coordenada'])('recusa candidato incorreto: %s',async campo=>{
    const c=candidato();if(campo==='cidade')c.attributes.City='Recife';if(campo==='uf')c.attributes.RegionAbbr='SP';if(campo==='rua')c.attributes.StName='Outra rua';if(campo==='numero')c.attributes.AddNum='37';if(campo==='tipo')c.attributes.Addr_type='Locality';if(campo==='score')c.score=80;if(campo==='coordenada')c.location.x=0;
    const {coordenadaDoCandidato}=await import('../src/geocodingEntrega');expect(coordenadaDoCandidato(c,endereco)).toBeNull();
  });
  it('não memoriza falhas transitórias e reaproveita apenas localização bem sucedida',async()=>{
    const fetchMock=vi.fn().mockRejectedValueOnce(new Error('rede')).mockResolvedValue({ok:true,json:async()=>({candidates:[candidato()]})});vi.stubGlobal('fetch',fetchMock);
    const {localizarEnderecoEntrega}=await import('../src/geocodingEntrega');expect(await localizarEnderecoEntrega(endereco)).toBeNull();
    expect(await localizarEnderecoEntrega(endereco)).not.toBeNull();expect(await localizarEnderecoEntrega(endereco)).not.toBeNull();expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('mantém alternativa de localização estrita quando o provedor não responde',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:false}));mocks.osm.mockResolvedValue({latitude:-7.91,longitude:-34.91});
    const {localizarEnderecoEntrega}=await import('../src/geocodingEntrega');expect(await localizarEnderecoEntrega(endereco)).toMatchObject({latitude:-7.91,longitude:-34.91,precisao:'logradouro'});expect(mocks.osm).toHaveBeenCalledWith(endereco,false);
  });
  it('Cais do Apolo não vira Rua do Apolo; sem número localizado, sinaliza o ponto da mesma rua',async()=>{
    const cais={...endereco,endereco:'Cais do Apolo',bairro:'Recife',cidade:'Recife',cep:'50030908'};
    const errado={...candidato(),attributes:{...candidato().attributes,City:'Recife',StPreType:'Rua do',StName:'Apolo'}};
    const certo={...candidato(),attributes:{...candidato().attributes,City:'Recife',Addr_type:'StreetName',AddNum:'',StPreType:'Cais do',StName:'Apolo'}};
    const f=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({candidates:[errado]})}).mockResolvedValueOnce({ok:true,json:async()=>({candidates:[certo]})});vi.stubGlobal('fetch',f);
    const {localizarEnderecoEntrega,coordenadaDoCandidato}=await import('../src/geocodingEntrega');expect(coordenadaDoCandidato(errado,cais)).toBeNull();
    expect(await localizarEnderecoEntrega(cais)).toMatchObject({precisao:'logradouro'});expect(f).toHaveBeenCalledTimes(2);expect(new URL(f.mock.calls[1][0]).searchParams.get('SingleLine')).not.toContain(', 36,');
  });
});
