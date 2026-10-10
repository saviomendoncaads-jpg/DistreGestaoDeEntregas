import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './gestao-estoque.css';

type Produto = { id: string; nome: string; unidade?: string; saldo: number | null; ativo: boolean };
type Movimento = { id: number; nome?: string; produtoId: string; tipo: string; quantidade: number; referencia?: string; criadoEm: string };
type Dados = { produtos: Produto[]; movimentos: Movimento[] };
type Props = { backendUrl: string; token: string; onClose: () => void; onProdutos: () => void };

export default function GestaoEstoque({ backendUrl, token, onClose, onProdutos }: Props) {
  const [dados, setDados] = useState<Dados>({ produtos: [], movimentos: [] });
  const [busca, setBusca] = useState('');
  const [produtoId, setProdutoId] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [referencia, setReferencia] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const chave = useRef(crypto.randomUUID());
  const modal = useRef<HTMLDivElement>(null);

  async function api(path: string, options: RequestInit = {}) {
    const res = await fetch(`${backendUrl}/api/gestao/estoque${path}`, { ...options,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Não foi possível acessar o estoque.');
    return body;
  }
  async function carregar() {
    setCarregando(true);
    try { setDados(await api('')); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao carregar.'); }
    finally { setCarregando(false); }
  }
  useEffect(() => { void carregar(); }, [backendUrl, token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    modal.current?.focus();
    return () => anterior?.focus();
  }, []);

  async function receber(e: React.FormEvent) {
    e.preventDefault(); setErro(''); setAviso('');
    const qtd = Number(quantidade);
    if (!produtoId || !Number.isSafeInteger(qtd) || qtd < 1 || qtd > 1000000) { setErro('Selecione o produto e informe uma quantidade inteira positiva.'); return; }
    setSalvando(true);
    try {
      await api('/entradas', { method: 'POST', body: JSON.stringify({ produtoId, quantidade: qtd, referencia, chave: chave.current }) });
      setAviso('Recebimento registrado. O saldo já está disponível na vitrine.');
      setQuantidade(''); setReferencia(''); chave.current = crypto.randomUUID();
      await carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao registrar entrada.'); }
    finally { setSalvando(false); }
  }
  const produtos = dados.produtos.filter(p => `${p.nome} ${p.id}`.toLocaleLowerCase('pt-BR').includes(busca.toLocaleLowerCase('pt-BR')));
  const controlados = dados.produtos.filter(p => p.saldo !== null);
  function teclado(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape' && !salvando) onClose();
    if (e.key !== 'Tab') return;
    const itens = [...(modal.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]') || [])];
    const primeiro = itens[0], ultimo = itens[itens.length - 1];
    if (e.shiftKey && (document.activeElement === primeiro || document.activeElement === modal.current)) { e.preventDefault(); ultimo?.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro?.focus(); }
  }
  return createPortal(<div className="stock-overlay"><div className="stock-panel" ref={modal} role="dialog" aria-modal="true" aria-labelledby="stock-title" tabIndex={-1} onKeyDown={teclado}>
    <header className="stock-header"><div><span>GESTÃO DE MERCADORIAS</span><h2 id="stock-title">Estoque</h2><p>Receba produtos e acompanhe o saldo das vendas da vitrine.</p></div><button className="stock-close" onClick={onClose} disabled={salvando} aria-label="Fechar estoque">×</button></header>
    {erro && <p className="stock-error" role="alert">{erro}</p>}{aviso && <p className="stock-success" role="status">{aviso}</p>}
    <div className="stock-metrics"><div><span>Produtos controlados</span><strong>{controlados.length}</strong></div><div><span>Unidades em estoque</span><strong>{controlados.reduce((n, p) => n + (p.saldo || 0), 0)}</strong></div><div><span>Sem saldo</span><strong>{controlados.filter(p => p.saldo === 0).length}</strong></div></div>
    <form className="stock-receipt" onSubmit={receber}><h3>Receber mercadorias</h3><p>O primeiro recebimento ativa o controle de saldo do produto. Cadastre o produto em Produtos antes de recebê-lo.</p><div className="stock-fields">
      <label>Produto<select required value={produtoId} disabled={salvando || carregando} onChange={e => { setProdutoId(e.target.value); chave.current = crypto.randomUUID(); }}><option value="">Selecione um produto</option>{dados.produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
      <label>Quantidade<input required type="number" min="1" max="1000000" step="1" value={quantidade} disabled={salvando} onChange={e => { setQuantidade(e.target.value); chave.current = crypto.randomUUID(); }} /></label>
      <label>Documento / fornecedor (opcional)<input maxLength={200} value={referencia} disabled={salvando} placeholder="NF de entrada ou fornecedor" onChange={e => { setReferencia(e.target.value); chave.current = crypto.randomUUID(); }} /></label>
      <button className="stock-primary" disabled={salvando || carregando || !dados.produtos.length}>{salvando ? 'Registrando…' : 'Registrar entrada'}</button>
    </div></form>
    <section><div className="stock-toolbar"><h3>Saldo por produto</h3><input aria-label="Buscar produto no estoque" placeholder="Buscar produto" value={busca} onChange={e => setBusca(e.target.value)} /><button type="button" onClick={() => { setErro(''); void carregar(); }} disabled={carregando || salvando}>Atualizar</button><button type="button" onClick={onProdutos} disabled={salvando}>Produtos</button></div>
      <div className="stock-table-wrap"><table><thead><tr><th>Produto</th><th>Unidade</th><th>Saldo</th><th>Situação</th></tr></thead><tbody>{produtos.map(p => <tr key={p.id}><td>{p.nome}</td><td>{p.unidade || 'UN'}</td><td><strong>{p.saldo ?? '—'}</strong></td><td><span className={`stock-tag ${p.saldo === 0 ? 'stock-tag--empty' : ''}`}>{p.saldo === null ? 'Sem controle' : p.saldo === 0 ? 'Esgotado' : 'Disponível'}</span></td></tr>)}</tbody></table></div>
      {!produtos.length && <p className="stock-empty">{carregando ? 'Carregando estoque…' : 'Nenhum produto encontrado.'}</p>}
    </section>
    <section className="stock-history"><h3>Últimas movimentações</h3><div className="stock-table-wrap"><table><thead><tr><th>Data</th><th>Produto</th><th>Movimento</th><th>Quantidade</th><th>Referência</th></tr></thead><tbody>{dados.movimentos.map(m => <tr key={m.id}><td>{new Date(m.criadoEm.endsWith('Z') ? m.criadoEm : `${m.criadoEm}Z`).toLocaleString('pt-BR')}</td><td>{m.nome || m.produtoId}</td><td>{({ ENTRADA: 'Recebimento', VENDA: 'Venda na vitrine', ESTORNO: 'Cancelamento / item em falta', AJUSTE: 'Ajuste (produto em falta)' } as Record<string, string>)[m.tipo] || m.tipo}</td><td>{m.tipo === 'VENDA' || m.tipo === 'AJUSTE' ? '−' : '+'}{m.quantidade}</td><td>{m.referencia || '—'}</td></tr>)}</tbody></table></div>{!dados.movimentos.length && <p className="stock-empty">Sem movimentações registradas.</p>}</section>
  </div></div>, document.body);
}
