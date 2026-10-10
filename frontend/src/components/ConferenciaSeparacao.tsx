import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './gestao-estoque.css';
import './conferencia-separacao.css';

type Item = { produtoId: string; nome: string; ean?: string; quantidade: number; conferida: number; preco?: number | null; controlado?: boolean };
type Falta = { produtoId: string; nome: string; quantidade: number; motivo: string; desfecho: 'ITEM_REMOVIDO' | 'PEDIDO_CANCELADO' };
type Pedido = { valor?: number | null; cliente?: string; telefone?: string | null };
type Props = { pedidoId: string; backendUrl: string; token: string; onClose: () => void; onComplete: (e: React.MouseEvent) => void };

const MOTIVOS = ['Sem estoque físico', 'Produto vencido ou avariado', 'Produto recolhido pelo fabricante', 'Outro motivo'];
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function ConferenciaSeparacao({ pedidoId, backendUrl, token, onClose, onComplete }: Props) {
  const [itens, setItens] = useState<Item[]>([]);
  const [faltas, setFaltas] = useState<Falta[]>([]);
  const [pedido, setPedido] = useState<Pedido>({});
  const [ean, setEan] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [busy, setBusy] = useState(false);
  const [cancelado, setCancelado] = useState(false);
  // Produto em falta: formulário aberto para um item.
  const [faltaItem, setFaltaItem] = useState<Item | null>(null);
  const [qtdFalta, setQtdFalta] = useState('1');
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [detalhe, setDetalhe] = useState('');
  const [zerar, setZerar] = useState(true);
  const [desfecho, setDesfecho] = useState<'ITEM' | 'PEDIDO'>('ITEM');
  const busyRef = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const qtdRef = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const chave = useRef(crypto.randomUUID());
  const chaveFalta = useRef(crypto.randomUUID());

  async function enviar(acao: string, body = {}) {
    const r = await fetch(`${backendUrl}/api/deliveries/${encodeURIComponent(pedidoId)}/conferencia/${acao}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Erro ao conferir pedido.');
    setItens(data.itens);
    if (data.faltas) setFaltas(data.faltas);
    if (data.pedido) setPedido(data.pedido);
    return data;
  }
  async function carregar() {
    setBusy(true); setErro('');
    try { await enviar('iniciar'); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao carregar.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void carregar(); }, [pedidoId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!busy && !faltaItem && !cancelado) input.current?.focus(); }, [busy, faltaItem, cancelado]);
  useEffect(() => { if (faltaItem) qtdRef.current?.focus(); }, [faltaItem]);
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    return () => anterior?.focus();
  }, []);

  async function ler(e: React.FormEvent) {
    e.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setErro(''); setAviso('');
    try {
      await enviar('ler', { ean: ean.trim(), chave: chave.current });
      setAviso('Unidade conferida.'); setEan(''); chave.current = crypto.randomUUID();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro na leitura.'); input.current?.select(); }
    finally { busyRef.current = false; setBusy(false); }
  }

  function abrirFalta(item: Item) {
    setErro(''); setAviso('');
    setQtdFalta(String(item.quantidade - item.conferida));
    setMotivo(MOTIVOS[0]); setDetalhe(''); setDesfecho('ITEM');
    setZerar(!!item.controlado);
    chaveFalta.current = crypto.randomUUID(); // uma chave por abertura: repetir o envio nunca aplica duas vezes
    setFaltaItem(item);
  }

  // Valores derivados do formulário de falta.
  const pendentes = faltaItem ? faltaItem.quantidade - faltaItem.conferida : 0;
  const qtd = Math.min(Math.max(1, Math.floor(Number(qtdFalta)) || 1), Math.max(1, pendentes));
  const outrasUnidades = faltaItem ? itens.filter(i => i.produtoId !== faltaItem.produtoId).reduce((n, i) => n + i.quantidade, 0) : 0;
  const retiraTudo = !!faltaItem && outrasUnidades === 0 && qtd === faltaItem.quantidade; // era tudo o que o pedido tinha
  const semPreco = !!faltaItem && faltaItem.preco == null;
  const itemBloqueado = retiraTudo || semPreco;
  const efetivo: 'ITEM' | 'PEDIDO' = itemBloqueado ? 'PEDIDO' : desfecho;
  const desconto = faltaItem && faltaItem.preco != null ? faltaItem.preco * qtd : null;
  const novoTotal = desconto != null && pedido.valor != null ? Math.max(0, pedido.valor - desconto) : null;

  async function confirmarFalta() {
    if (busyRef.current || !faltaItem) return;
    busyRef.current = true; setBusy(true); setErro('');
    try {
      const data = await enviar('falta', {
        produtoId: faltaItem.produtoId, quantidade: qtd, desfecho: efetivo, zerarSaldo: zerar && !!faltaItem.controlado,
        motivo: detalhe.trim() ? `${motivo}: ${detalhe.trim()}` : motivo, chave: chaveFalta.current,
      });
      setFaltaItem(null);
      if (data.cancelado) setCancelado(true);
      else {
        chave.current = crypto.randomUUID();
        setAviso(`${qtd === 1 ? '1 unidade retirada' : `${qtd} unidades retiradas`} do pedido${data.pedido?.valor != null ? `. Novo total: ${brl(data.pedido.valor)}` : ''}.`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro ao registrar a falta.';
      if (msg.includes('Chave já usada')) { // resposta perdida numa tentativa anterior: recarrega o estado real
        setFaltaItem(null); await carregar(); setAviso('Atualizamos os dados do pedido. Confira os itens antes de tentar de novo.');
      } else setErro(msg);
    } finally { busyRef.current = false; setBusy(false); }
  }

  const total = itens.reduce((n, i) => n + i.quantidade, 0);
  const conferidas = itens.reduce((n, i) => n + i.conferida, 0);
  const completo = itens.length > 0 && total === conferidas;
  const lista = faltas.length > 0 && (
    <section className="conference-faults" aria-label="Itens retirados do pedido"><h3>{cancelado ? 'Motivo do cancelamento' : 'Retirados do pedido'}</h3>
      <ul>{faltas.map((f, k) => <li key={k}><strong>{f.quantidade}× {f.nome}</strong><span>{f.motivo}</span></li>)}</ul></section>
  );

  function aoTeclar(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape' && !busy) { if (faltaItem) setFaltaItem(null); else onClose(); return; }
    if (e.key !== 'Tab') return;
    const elements = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)') || [])];
    const first = elements[0], last = elements[elements.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }

  let corpo;
  if (cancelado) {
    corpo = <>
      <header className="stock-header"><div><span>SEPARAÇÃO · {pedidoId}</span><h2 id="conference-title">Pedido cancelado</h2><p>A separação foi encerrada por falta de produto.</p></div></header>
      <p className="stock-success" role="status">O pedido {pedidoId} foi cancelado e o que já estava baixado voltou ao estoque. Nada deve ser cobrado do cliente; se ele já pagou online, faça o estorno integral.</p>
      <ContatoCliente pedido={pedido} />
      {lista}
      <footer className="conference-actions conference-actions--end"><button className="stock-primary" onClick={onClose} autoFocus>Fechar</button></footer>
    </>;
  } else if (faltaItem) {
    corpo = <>
      <header className="stock-header"><div><span>PRODUTO EM FALTA · {pedidoId}</span><h2 id="conference-title">Produto não encontrado</h2><p>Informe o que aconteceu com <strong>{faltaItem.nome}</strong> e como o pedido deve seguir.</p></div><button className="stock-close" onClick={() => setFaltaItem(null)} disabled={busy} aria-label="Voltar à conferência">×</button></header>
      <div className="fault-grid">
        <label className="fault-field">Quantidade que faltou
          <input ref={qtdRef} type="number" min={1} max={pendentes} step={1} inputMode="numeric" value={qtdFalta} disabled={busy} onChange={e => setQtdFalta(e.target.value)} />
          <small>{pendentes === 1 ? '1 unidade ainda não conferida' : `${pendentes} unidades ainda não conferidas`} (as já conferidas não entram)</small>
        </label>
        <label className="fault-field">Motivo
          <select value={motivo} disabled={busy} onChange={e => setMotivo(e.target.value)}>{MOTIVOS.map(m => <option key={m}>{m}</option>)}</select>
        </label>
        <label className="fault-field fault-field--wide">Observação (opcional)
          <input value={detalhe} maxLength={100} disabled={busy} placeholder="Ex.: caixa danificada, lote vencido" onChange={e => setDetalhe(e.target.value)} />
        </label>
      </div>
      {faltaItem.controlado && (
        <label className="fault-check"><input type="checkbox" checked={zerar} disabled={busy} onChange={e => setZerar(e.target.checked)} />
          <span><strong>Zerar o saldo deste produto no sistema</strong><small>A vitrine para de vender até um novo recebimento em Estoque. Fica registrado como ajuste.</small></span></label>
      )}
      <fieldset className="fault-choice" disabled={busy}><legend>O que fazer com o pedido?</legend>
        <label className={`fault-option ${efetivo === 'ITEM' ? 'is-on' : ''} ${itemBloqueado ? 'is-off' : ''}`}>
          <input type="radio" name="falta-desfecho" checked={efetivo === 'ITEM'} disabled={itemBloqueado} onChange={() => setDesfecho('ITEM')} />
          <span><strong>Retirar só este item</strong><small>{retiraTudo ? 'Indisponível: era tudo o que o pedido tinha.' : semPreco ? 'Indisponível: não foi possível recalcular o valor deste item.' : 'O pedido segue com o restante e o total é recalculado.'}</small></span>
        </label>
        <label className={`fault-option ${efetivo === 'PEDIDO' ? 'is-on' : ''}`}>
          <input type="radio" name="falta-desfecho" checked={efetivo === 'PEDIDO'} onChange={() => setDesfecho('PEDIDO')} />
          <span><strong>Cancelar o pedido inteiro</strong><small>Encerra a comanda e devolve ao estoque o que já estava baixado.</small></span>
        </label>
      </fieldset>
      <div className={`fault-summary ${efetivo === 'PEDIDO' ? 'fault-summary--danger' : ''}`} role="status">
        {efetivo === 'ITEM'
          ? <>O pedido segue sem <strong>{qtd}× {faltaItem.nome}</strong>.{novoTotal != null && desconto != null && <> Novo total: <strong>{brl(novoTotal)}</strong> (−{brl(desconto)}). Se o cliente já pagou online, devolva a diferença.</>}</>
          : <>O pedido <strong>{pedidoId}</strong> será cancelado{retiraTudo ? ' (era o único item)' : ''}. <strong>Não dá para desfazer.</strong></>}
      </div>
      <ContatoCliente pedido={pedido} />
      {erro && <p className="stock-error" role="alert">{erro}</p>}
      <footer className="conference-actions">
        <button onClick={() => setFaltaItem(null)} disabled={busy}>Voltar à conferência</button>
        <button className={efetivo === 'PEDIDO' ? 'conference-danger' : 'stock-primary'} onClick={() => void confirmarFalta()} disabled={busy}>
          {busy ? 'Registrando…' : efetivo === 'PEDIDO' ? 'Cancelar pedido' : 'Retirar item do pedido'}
        </button>
      </footer>
    </>;
  } else {
    corpo = <>
      <header className="stock-header"><div><span>SEPARAÇÃO · {pedidoId}</span><h2 id="conference-title">Conferir produtos pelo EAN</h2><p>Leia o código de barras de cada unidade com o leitor, ou digite e pressione Enter.</p></div><button className="stock-close" onClick={onClose} disabled={busy} aria-label="Fechar conferência">×</button></header>
      <form className="conference-scanner" onSubmit={ler}><label htmlFor="conference-ean">Código de barras (EAN / GTIN)</label><div><input id="conference-ean" ref={input} value={ean} inputMode="numeric" autoComplete="off" maxLength={14} disabled={busy || completo} onChange={e => { setEan(e.target.value.replace(/\D/g, '')); chave.current = crypto.randomUUID(); }} placeholder="Posicione o leitor no código da embalagem" /><button className="stock-primary" disabled={busy || completo || !ean}>{busy ? 'Conferindo…' : 'Conferir unidade'}</button></div></form>
      {erro && <p className="stock-error" role="alert">{erro}</p>}{aviso && <p className="stock-success" role="status">{aviso}</p>}
      <div className="conference-progress" role="status"><strong>{conferidas} de {total} unidades conferidas</strong><span>{completo ? 'Conferência completa' : 'Leia uma vez para cada unidade'}{pedido.valor != null && <> · Total {brl(pedido.valor)}</>}</span></div>
      <div className="stock-table-wrap"><table><thead><tr><th>Produto</th><th>EAN</th><th>Conferência</th><th>Falta?</th></tr></thead><tbody>{itens.map(i => <tr key={i.produtoId} className={i.conferida === i.quantidade ? 'conference-done' : ''}><td>{i.nome}</td><td>{i.ean || 'Cadastre o EAN deste produto'}</td><td><strong>{i.conferida} / {i.quantidade}</strong>{i.conferida === i.quantidade && ' ✓'}</td><td>{i.conferida < i.quantidade && <button type="button" className="conference-fault-btn" disabled={busy} onClick={() => abrirFalta(i)} aria-label={`Produto em falta: ${i.nome}`}>Em falta</button>}</td></tr>)}</tbody></table></div>
      {!itens.length && !busy && <p className="stock-empty">Não foi possível carregar os itens para conferência.</p>}
      {itens.length > 0 && !completo && <p className="conference-hint">Não encontrou algum produto na prateleira? Use <strong>Em falta</strong> na linha dele para retirar o item ou cancelar o pedido.</p>}
      {itens.some(i => !i.ean) && <p className="stock-error">Há produtos sem EAN. Edite-os em Vitrine & Produtos e atualize esta conferência.</p>}
      {lista}
      <footer className="conference-actions"><button onClick={carregar} disabled={busy}>Atualizar produtos</button><button className="stock-primary" disabled={busy || !completo} onClick={onComplete}>Concluir separação</button></footer>
    </>;
  }

  return createPortal(<div className="stock-overlay"><div ref={panel} className="stock-panel conference-panel" role="dialog" aria-modal="true" aria-labelledby="conference-title" tabIndex={-1} onKeyDown={aoTeclar}>{corpo}</div></div>, document.body);
}

// Quem avisar quando um item sai ou o pedido é cancelado.
function ContatoCliente({ pedido }: { pedido: Pedido }) {
  if (!pedido.cliente) return null;
  const digitos = (pedido.telefone || '').replace(/\D/g, '');
  return <p className="fault-contact">Avise o cliente: <strong>{pedido.cliente}</strong>{pedido.telefone && <> · {digitos.length >= 10 ? <a href={`tel:+55${digitos.replace(/^55/, '')}`}>{pedido.telefone}</a> : pedido.telefone}</>}</p>;
}
