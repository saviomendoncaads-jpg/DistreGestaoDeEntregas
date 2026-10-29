import {afterEach,describe,expect,it,vi} from 'vitest';
import {consultarCep,buscarEnderecoPorCep} from '../../frontend/src/cliente/services/cep';
afterEach(()=>vi.unstubAllGlobals());
describe('consulta de CEP da finalização',()=>{
  it('normaliza o CEP e fornece os campos para preenchimento automático',async()=>{
    const f=vi.fn().mockResolvedValue({ok:true,json:async()=>({logradouro:'Avenida Boa Viagem',bairro:'Pina',localidade:'Recife',uf:'PE'})});vi.stubGlobal('fetch',f);
    expect(await consultarCep('51011-000')).toEqual({estado:'encontrado',endereco:{logradouro:'Avenida Boa Viagem',bairro:'Pina',cidade:'Recife',uf:'PE',ibge:undefined}});expect(String(f.mock.calls[0][0])).toContain('/51011000/json/');
  });
  it('distingue CEP não encontrado de falha de rede, sem quebrar outros formulários',async()=>{
    const f=vi.fn().mockResolvedValue({ok:true,json:async()=>({erro:'true'})});vi.stubGlobal('fetch',f);expect(await consultarCep('51011020')).toEqual({estado:'nao_encontrado'});expect(await buscarEnderecoPorCep('51011020')).toBeNull();
    f.mockRejectedValue(new Error('rede'));expect(await consultarCep('51011000')).toEqual({estado:'indisponivel'});
  });
  it('não consulta CEP incompleto',async()=>{const f=vi.fn();vi.stubGlobal('fetch',f);expect(await consultarCep('51011')).toEqual({estado:'invalido'});expect(f).not.toHaveBeenCalled();});
});
