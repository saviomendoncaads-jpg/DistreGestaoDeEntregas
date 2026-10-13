import { useEffect, useRef, useState } from 'react';
import type { ProdutoVitrine } from '../types';
import { formatarPreco } from '../types';
import { urlImagem } from '../services/api';
import { useCarrinho } from '../context/CarrinhoContext';
import { limiteQuantidade } from '../quantidadeCompra';
import { IcoCarrinho, IcoX } from './icones';
import './detalhe-produto.css';

export default function DetalheProduto({ produto, podePedir, onClose }: { produto: ProdutoVitrine; podePedir: boolean; onClose: () => void }) {
  const { adicionar, quantidadeDe } = useCarrinho();
  const [foto, setFoto] = useState(0);
  const [quantidade, setQuantidade] = useState(1);
  const [falhas, setFalhas] = useState<string[]>([]);
  const dialog = useRef<HTMLDivElement>(null);
  const fechar = useRef<HTMLButtonElement>(null);
  const fotos = [...new Set(produto.imagens?.length ? produto.imagens : produto.imagemUrl ? [produto.imagemUrl] : [])];
  const src = urlImagem(fotos[foto]);
  const naSacola = quantidadeDe(produto.id);
  const restante = Math.max(0, limiteQuantidade(produto.estoqueDisponivel) - naSacola);
  const escolhida = Math.min(quantidade, restante);
  const disponivel = podePedir && restante > 0;
  const informacoes = [['Marca', produto.marca], ['Fabricante', produto.fabricante], ['Categoria', produto.categoria], ['Subcategoria', produto.subcategoria], ['Unidade comercial', produto.unidade], ['Código do produto', produto.codigoInterno], ['EAN / GTIN', produto.codigoBarras]].filter(([,valor]) => !!valor);

  useEffect(() => {
    const doc = dialog.current?.ownerDocument;
    if (!doc) return;
    const anterior = doc.activeElement as HTMLElement | null;
    const overflow = doc.body.style.overflow;
    doc.body.style.overflow = 'hidden';
    fechar.current?.focus();
    const teclado = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
      if (e.key !== 'Tab') return;
      const elementos = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]') ?? [])].filter(el => el.getClientRects().length > 0);
      const primeiro = elementos[0], ultimo = elementos[elementos.length - 1];
      if (e.shiftKey && doc.activeElement === primeiro) { e.preventDefault(); ultimo?.focus(); }
      if (!e.shiftKey && doc.activeElement === ultimo) { e.preventDefault(); primeiro?.focus(); }
    };
    doc.addEventListener('keydown', teclado, true);
    return () => { doc.body.style.overflow = overflow; doc.removeEventListener('keydown', teclado, true); if (anterior?.isConnected) anterior.focus(); };
  }, [onClose]);

  return <div className="vd-fundo" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="vd-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby={`vd-titulo-${produto.id}`}>
      <header className="vd-topo"><span>Detalhes do produto</span><button ref={fechar} type="button" onClick={onClose} aria-label="Fechar detalhes do produto"><IcoX /></button></header>
      <div className="vd-conteudo">
        <div className="vd-galeria"><div className="vd-foto">{src && !falhas.includes(src) ? <img src={src} alt={`${produto.nome}${fotos.length > 1 ? ` — foto ${foto + 1}` : ''}`} onError={() => setFalhas(v => [...v,src])} /> : <div className="vd-sem-foto"><strong>{produto.nome.charAt(0)}</strong><span>Imagem não disponível</span></div>}</div>
          {fotos.length > 1 && <div className="vd-miniaturas" aria-label="Fotos do produto">{fotos.map((url,i) => <button type="button" key={url} aria-label={`Ver foto ${i+1} de ${produto.nome}`} aria-pressed={foto === i} onClick={() => setFoto(i)}><img src={urlImagem(url)} alt="" /></button>)}</div>}
          <small>Imagem ilustrativa. Confira a apresentação na descrição.</small>
        </div>
        <div className="vd-compra"><div className="vd-categoria">{[produto.categoria,produto.subcategoria].filter(Boolean).join(' / ')}</div><h2 id={`vd-titulo-${produto.id}`}>{produto.nome}</h2>{produto.marca && <p className="vd-marca">{produto.marca}</p>}
          <div className="vd-preco">{produto.precoOriginal && produto.precoOriginal > produto.preco && <del>{formatarPreco(produto.precoOriginal)}</del>}<strong>{formatarPreco(produto.preco)}</strong><small>Preço por unidade comercial</small></div>
          <p className={`vd-disponibilidade ${!disponivel ? 'vd-indisponivel' : ''}`}>{!podePedir ? 'Pedidos indisponíveis no momento' : produto.estoqueDisponivel === 0 ? 'Produto indisponível' : !restante ? 'Limite de unidades na sacola atingido' : 'Disponível para adicionar à sacola'}</p>
          {naSacola > 0 && <p className="vd-na-sacola">Você já tem {naSacola} {naSacola === 1 ? 'unidade' : 'unidades'} deste produto na sacola.</p>}
          <div className="vd-adicionar"><div className="vd-quantidade" role="group" aria-label="Quantidade a adicionar"><button type="button" aria-label="Diminuir quantidade" disabled={!disponivel || escolhida <= 1} onClick={() => setQuantidade(Math.max(1,escolhida-1))}>−</button><span aria-live="polite">{restante ? escolhida : 0}</span><button type="button" aria-label="Aumentar quantidade" disabled={!disponivel || escolhida >= restante} onClick={() => setQuantidade(escolhida+1)}>+</button></div><button type="button" className="vd-botao" disabled={!disponivel} onClick={() => { adicionar(produto,escolhida); onClose(); }}><IcoCarrinho size={19} />{disponivel ? `Adicionar ${escolhida} à sacola` : 'Indisponível'}</button></div>
          {disponivel && <p className="vd-total">Total dos itens: <strong>{formatarPreco(produto.preco*escolhida)}</strong></p>}
        </div>
        <section className="vd-descricao"><h3>Descrição do produto</h3><p>{produto.descricao?.trim() || 'A loja ainda não cadastrou a descrição deste produto.'}</p></section>
        {informacoes.length > 0 && <section className="vd-informacoes"><h3>Informações do produto</h3><dl>{informacoes.map(([titulo,valor]) => <div key={titulo}><dt>{titulo}</dt><dd>{valor}</dd></div>)}</dl></section>}
      </div>
    </div>
  </div>;
}
