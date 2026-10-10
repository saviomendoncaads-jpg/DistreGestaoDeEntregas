import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { Server } from 'http';

vi.mock('../src/auth', () => ({
  obterSessaoDoRequest: () => ({ tipo: 'loja', lojaId: 'loja-teste' }),
  exigirLojaAdimplente: (_req: unknown, _res: unknown, next: () => void) => next()
}));
vi.mock('../src/database', () => ({
  obterProdutosDaLoja: vi.fn(), salvarProduto: vi.fn(), salvarProdutosEmLote: vi.fn(), historicoProduto: vi.fn(), deletarProduto: vi.fn(), salvarLoja: vi.fn()
}));
vi.mock('../src/tenants', () => ({ lojas: [] }));
vi.mock('../src/estoque', () => ({ listarEstoque: vi.fn(), receberMercadoria: vi.fn(), ErroEstoque: class extends Error {} }));
import router from '../src/gestaoVitrine';
import { obterProdutosDaLoja, salvarProduto, salvarProdutosEmLote } from '../src/database';

const existente = { id: 'prod-antigo', nome: 'Dipirona', preco: 12.5, lojaId: 'loja-teste', ativo: true,
  situacao: 'ativo' as const, publicado: true, codigoInterno: 'MED-001', codigoBarras: '7896094988484', ncm: '30049099', cest: '1300100',
  cfop: '5102', icmsSituacao: '102', unidade: 'UN' };
let server: Server;
let base: string;
async function enviar(body: object, id?: string) {
  const res = await fetch(`${base}/produtos${id ? `/${id}` : ''}`, {
    method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json() };
}
beforeAll(async () => {
  const app = express(); app.use(express.json()); app.use(router);
  server = await new Promise<Server>(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())));
beforeEach(() => { vi.clearAllMocks(); vi.mocked(obterProdutosDaLoja).mockResolvedValue([existente]); });

describe('cadastro de produtos separado da vitrine', () => {
  it('salva código interno e os dados fiscais do cadastro', async () => {
    const result = await enviar({ ...existente, nome: 'Paracetamol', codigoInterno: 'MED-002', codigoBarras: '4006381333931' });
    expect(result.status).toBe(201);
    expect(salvarProduto).toHaveBeenCalledWith(expect.objectContaining({ codigoInterno: 'MED-002', ncm: '30049099', cest: '1300100', cfop: '5102', icmsSituacao: '102', unidade: 'UN' }), expect.any(String), expect.any(String));
    expect(obterProdutosDaLoja).toHaveBeenCalledWith('loja-teste');
  });
  it('gera código interno quando não informado', async () => {
    const result = await enviar({ nome: 'Outro produto', preco: 20, codigoBarras: '4006381333931' });
    expect(result.status).toBe(201);
    expect(result.body.codigoInterno).toMatch(/^SKU-/);
  });
  it('impede códigos internos repetidos ignorando maiúsculas', async () => {
    const result = await enviar({ nome: 'Outro produto', preco: 20, codigoInterno: 'med-001', codigoBarras: '4006381333931' });
    expect(result.status).toBe(409);
    expect(salvarProduto).not.toHaveBeenCalled();
  });
  it('altera a visibilidade sem apagar código ou dados fiscais', async () => {
    const result = await enviar({ situacao: 'arquivado' }, existente.id);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ...existente, ativo: false, publicado: false, situacao: 'arquivado' });
  });
  it('edita código interno sem mudar a visibilidade', async () => {
    const result = await enviar({ codigoInterno: 'NOVO-001' }, existente.id);
    expect(result.status).toBe(200);
    expect(result.body.codigoInterno).toBe('NOVO-001');
    expect(result.body.ativo).toBe(true);
  });
  it('impede duplicar o código interno ao editar outro produto', async () => {
    vi.mocked(obterProdutosDaLoja).mockResolvedValue([existente, { ...existente, id: 'prod-outro', codigoInterno: 'MED-002', codigoBarras: '4006381333931' }]);
    const result = await enviar({ codigoInterno: 'med-001' }, 'prod-outro');
    expect(result.status).toBe(409);
    expect(salvarProduto).not.toHaveBeenCalled();
  });
  it('bloqueia edição de produto fora do catálogo da loja', async () => {
    const result = await enviar({ codigoInterno: 'ABC' }, 'produto-de-outra-loja');
    expect(result.status).toBe(404);
    expect(salvarProduto).not.toHaveBeenCalled();
  });
  it('preserva validação dos dados fiscais', async () => {
    const result = await enviar({ ...existente, ncm: '123' }, existente.id);
    expect(result.status).toBe(400);
    expect(salvarProduto).not.toHaveBeenCalled();
  });
});

describe('importação e operações em lote', () => {
  it('valida a importação sem salvar antes da confirmação', async () => {
    const r = await fetch(base + '/produtos/importar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ linhas: [{ codigoInterno: 'MED-002', nome: 'Novo rascunho', preco: 15 }] }) });
    expect(r.status).toBe(200); const dados = await r.json(); expect(dados.resumo).toEqual({ novos: 1, atualizados: 0, total: 1 });
    expect(salvarProdutosEmLote).not.toHaveBeenCalled();
  });
  it('salva importação confirmada pela transação de lote', async () => {
    const r = await fetch(base + '/produtos/importar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmar: true, linhas: [{ codigoInterno: 'MED-002', nome: 'Novo rascunho', preco: 15 }] }) });
    expect(r.status).toBe(200); expect(salvarProdutosEmLote).toHaveBeenCalledWith([expect.objectContaining({ lojaId: 'loja-teste', situacao: 'rascunho', publicado: false })], expect.any(String), 'Importação por planilha');
  });
  it('não salva parte do arquivo quando outra linha é inválida', async () => {
    const r = await fetch(base + '/produtos/importar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmar: true, linhas: [{ codigoInterno: 'MED-002', nome: 'Válido', preco: 15 }, { codigoInterno: 'MED-003', nome: '', preco: 15 }] }) });
    expect(r.status).toBe(400); expect((await r.json()).error).toContain('Linha 3'); expect(salvarProdutosEmLote).not.toHaveBeenCalled();
  });
  it('atualiza um cadastro existente pelo código interno preservando dados omitidos', async () => {
    const r = await fetch(base + '/produtos/importar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ linhas: [{ codigoInterno: 'MED-001', nome: 'Novo nome', preco: 16 }] }) });
    const dados = await r.json(); expect(r.status).toBe(200); expect(dados.resumo.atualizados).toBe(1); expect(dados.produtos[0]).toMatchObject({ id: existente.id, ncm: existente.ncm, codigoBarras: existente.codigoBarras });
  });
  it('oculta produtos em lote sem arquivar nem apagar fiscal', async () => {
    const r = await fetch(base + '/produtos/lote', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [existente.id], alteracoes: { publicado: false } }) });
    expect(r.status).toBe(200); expect(salvarProdutosEmLote).toHaveBeenCalledWith([expect.objectContaining({ ativo: true, situacao: 'ativo', publicado: false, ncm: existente.ncm })], expect.any(String), 'Alteração em lote');
  });
  it('bloqueia lote com produto de outra loja antes de salvar qualquer item', async () => {
    const r = await fetch(base + '/produtos/lote', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [existente.id, 'outra-loja'], alteracoes: { publicado: false } }) });
    expect(r.status).toBe(404); expect(salvarProdutosEmLote).not.toHaveBeenCalled();
  });
  it('não permite alterar preços normais ou lojaId por operação de publicação', async () => {
    const r = await fetch(base + '/produtos/lote', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [existente.id], alteracoes: { lojaId: 'outra', preco: 1 } }) });
    expect(r.status).toBe(400); expect(salvarProdutosEmLote).not.toHaveBeenCalled();
  });
});
