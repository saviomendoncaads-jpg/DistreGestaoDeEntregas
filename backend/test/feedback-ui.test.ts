import {afterEach,describe,expect,it} from 'vitest';
import {confirmarAcao,solicitarCancelamento,lerFeedback,responderAcao,limparFeedback,avisarErro} from '../../frontend/src/ui/feedback';

afterEach(limparFeedback);
describe('confirmações na página',()=>{
  it('não autoriza exclusão antes da confirmação explícita e permite voltar',async()=>{
    let autorizada=false;
    const resposta=confirmarAcao('Excluir esta loja?').then(ok=>{autorizada=ok;return ok;});
    await Promise.resolve();expect(autorizada).toBe(false);
    responderAcao(lerFeedback().acao!.id,false);expect(await resposta).toBe(false);expect(lerFeedback().acao).toBeNull();
  });
  it('inclui motivo opcional no mesmo controle de cancelamento',async()=>{
    const p=solicitarCancelamento('Cancelar pedido A?');expect(lerFeedback().acao?.campo).toContain('opcional');
    responderAcao(lerFeedback().acao!.id,true,'Cliente desistiu');expect(await p).toBe('Cliente desistiu');
  });
  it('não executa duas ações por clique repetido e ignora resposta antiga',async()=>{
    const a=confirmarAcao('Excluir A?'),id=lerFeedback().acao!.id,b=confirmarAcao('Excluir A?');
    expect(await b).toBe(false);responderAcao(id,true);expect(await a).toBe(true);
    const c=confirmarAcao('Excluir C?');responderAcao(id,true);expect(lerFeedback().acao?.mensagem).toBe('Excluir C?');
    responderAcao(lerFeedback().acao!.id,false);expect(await c).toBe(false);
  });
  it('troca de sessão cancela as ações pendentes e limpa avisos',async()=>{
    const a=confirmarAcao('Excluir A?'),b=confirmarAcao('Excluir B?');avisarErro('Falha de teste');
    limparFeedback();expect(await a).toBe(false);expect(await b).toBe(false);expect(lerFeedback()).toEqual({aviso:null,acao:null});
  });
});
