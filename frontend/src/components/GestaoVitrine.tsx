import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// ============================================================================
// CONFIGURAÇÃO DA VITRINE — modal do painel da loja (aberto pelo menu lateral).
// Configura logomarca, link público e visibilidade dos produtos.
// O cadastro e os dados fiscais ficam na área Produtos.
// Consome as rotas autenticadas /api/gestao/* (gestaoVitrine.ts no backend).
// ============================================================================

interface ProdutoGestao {
  id: string;
  nome: string;
  preco: number;
  descricao?: string;
  imagemUrl?: string;
  ativo: boolean;
  publicado?: boolean;
  situacao?: 'rascunho' | 'ativo' | 'arquivado';
  categoria?: string;
  subcategoria?: string;
  ncm?: string;
  cest?: string;
  cfop?: string;
  icmsSituacao?: string;
  unidade?: string;
  codigoBarras?: string;
}

interface Props {
  backendUrl: string;
  token: string;
  lojaId: string;
  nomeLoja: string;
  onClose: () => void;
}

const MAX_IMAGEM_BYTES = 3 * 1024 * 1024;

const estiloInput: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border-thin)',
  borderRadius: '8px',
  padding: '0.55rem 0.75rem',
  color: 'var(--text-primary)',
  fontSize: '0.85rem',
  outline: 'none'
};

const estiloLabel: React.CSSProperties = {
  fontSize: '0.72rem',
  color: 'var(--text-secondary)',
  display: 'block',
  marginBottom: '0.3rem',
  fontWeight: 600
};

const estiloBotaoPrimario: React.CSSProperties = {
  background: 'var(--accent)',
  color: 'var(--accent-contrast)',
  border: 'none',
  borderRadius: '8px',
  padding: '0.55rem 1rem',
  fontWeight: 700,
  fontSize: '0.82rem',
  cursor: 'pointer'
};

const estiloBotaoSuave: React.CSSProperties = {
  background: 'transparent',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border-thin)',
  borderRadius: '8px',
  padding: '0.5rem 0.9rem',
  fontSize: '0.8rem',
  cursor: 'pointer'
};

export default function GestaoVitrine({ backendUrl, token, lojaId, nomeLoja, onClose }: Props) {
  const [produtos, setProdutos] = useState<ProdutoGestao[]>([]);
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviandoImagem, setEnviandoImagem] = useState(false);
  const [busca, setBusca] = useState('');
  const [alterandoProduto, setAlterandoProduto] = useState<string | null>(null);
  const inputLogoRef = useRef<HTMLInputElement>(null);

  const linkVitrine = `${window.location.origin}/loja/${lojaId}`;

  async function gestaoFetch(caminho: string, options: RequestInit = {}): Promise<any> {
    const res = await fetch(`${backendUrl}${caminho}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
    const corpo = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(corpo?.error || `Erro ${res.status} ao comunicar com o servidor.`);
    return corpo;
  }

  // URLs de /uploads são relativas ao backend (em dev o painel roda no Vite).
  function urlImagem(url?: string): string | undefined {
    if (!url) return undefined;
    return url.startsWith('/') ? `${backendUrl}${url}` : url;
  }

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [lista, cardapio] = await Promise.all([
          gestaoFetch('/api/gestao/produtos'),
          fetch(`${backendUrl}/api/vitrine/${encodeURIComponent(lojaId)}`).then(r => (r.ok ? r.json() : null))
        ]);
        if (!ativo) return;
        setProdutos(Array.isArray(lista) ? lista : []);
        setLogoUrl(cardapio?.loja?.logoUrl || '');
      } catch (e: any) {
        if (ativo) setErro(e.message || 'Erro ao carregar o catálogo.');
      } finally {
        if (ativo) setCarregando(false);
      }
    })();
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojaId]);

  function mostrarAviso(texto: string) {
    setAviso(texto);
    window.setTimeout(() => setAviso(null), 3500);
  }

  // Lê o arquivo, valida e envia ao backend; devolve a URL pública (/uploads/...).
  async function enviarImagem(arquivo: File): Promise<string | null> {
    if (!/^image\/(png|jpe?g|webp)$/.test(arquivo.type)) {
      setErro('Envie uma imagem PNG, JPG ou WEBP.');
      return null;
    }
    if (arquivo.size > MAX_IMAGEM_BYTES) {
      setErro('A imagem deve ter no máximo 3 MB.');
      return null;
    }
    setErro(null);
    setEnviandoImagem(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onload = () => resolve(String(leitor.result));
        leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
        leitor.readAsDataURL(arquivo);
      });
      const resp = await gestaoFetch('/api/gestao/upload', {
        method: 'POST',
        body: JSON.stringify({ dataUrl })
      });
      return resp.url as string;
    } catch (e: any) {
      setErro(e.message || 'Erro ao enviar a imagem.');
      return null;
    } finally {
      setEnviandoImagem(false);
    }
  }

  async function aoEscolherLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    const url = await enviarImagem(arquivo);
    if (!url) return;
    try {
      await gestaoFetch('/api/gestao/loja', { method: 'PUT', body: JSON.stringify({ logoUrl: url }) });
      setLogoUrl(url);
      mostrarAviso('Logomarca atualizada! Ela já aparece na vitrine.');
    } catch (e: any) {
      setErro(e.message);
    }
  }

  async function removerLogo() {
    try {
      await gestaoFetch('/api/gestao/loja', { method: 'PUT', body: JSON.stringify({ logoUrl: '' }) });
      setLogoUrl('');
      mostrarAviso('Logomarca removida — a vitrine volta a mostrar a inicial da loja.');
    } catch (e: any) {
      setErro(e.message);
    }
  }

  async function alternarPublicacao(p: ProdutoGestao) {
    setErro(null);
    setAlterandoProduto(p.id);
    try {
      const salvo: ProdutoGestao = await gestaoFetch(`/api/gestao/produtos/${p.id}`, {
        method: 'PUT',
        body: JSON.stringify({ publicado: !(p.publicado ?? p.ativo) })
      });
      setProdutos(lista => lista.map(item => (item.id === salvo.id ? salvo : item)));
      mostrarAviso(salvo.publicado ? 'Produto exibido na vitrine.' : 'Produto oculto da vitrine.');
    } catch (e: any) {
      setErro(e.message);
    } finally {
      setAlterandoProduto(null);
    }
  }

  async function copiarLink() {
    try {
      await navigator.clipboard.writeText(linkVitrine);
      mostrarAviso('Link copiado! Cole no WhatsApp, Instagram ou gere um QR code.');
    } catch {
      mostrarAviso('Não consegui copiar automaticamente — selecione e copie o link acima.');
    }
  }

  function Miniatura({ url, nome, tamanho }: { url?: string; nome: string; tamanho: number }) {
    const src = urlImagem(url);
    const base: React.CSSProperties = {
      width: tamanho,
      height: tamanho,
      borderRadius: '8px',
      flexShrink: 0,
      objectFit: 'cover',
      border: '1px solid var(--border-thin)'
    };
    if (src) return <img src={src} alt={nome} style={base} />;
    return (
      <div
        style={{
          ...base,
          display: 'grid',
          placeItems: 'center',
          background: 'var(--bg-secondary)',
          color: 'var(--color-amber)',
          fontWeight: 800,
          fontSize: tamanho * 0.42
        }}
        aria-hidden="true"
      >
        {nome.charAt(0).toUpperCase()}
      </div>
    );
  }

  return createPortal(
    <div className="report-modal-overlay" onClick={onClose}>
      <div className="report-modal-content" role="dialog" aria-modal="true" aria-labelledby="GestaoVitrine-titulo" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px' }}>
        <div className="report-modal-header">
          <h2>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-amber)', marginRight: '0.5rem' }}>
              <path d="M3 9 L4.4 4.5 H19.6 L21 9" />
              <path d="M4.5 9 V19.5 H19.5 V9" />
              <path d="M9.5 19.5 V14 H14.5 V19.5" />
            </svg>
            Configuração da vitrine — {nomeLoja}
          </h2>
          <button className="report-modal-close-btn" aria-label="Fechar" onClick={onClose}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="report-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem', maxHeight: '70vh', overflowY: 'auto' }}>
          {/* Link público da vitrine */}
          <section>
            <label style={estiloLabel}>Link do cardápio (divulgue aos clientes)</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input readOnly value={linkVitrine} style={{ ...estiloInput, fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }} onFocus={e => e.target.select()} />
              <button style={estiloBotaoPrimario} onClick={copiarLink}>Copiar</button>
              <a href={linkVitrine} target="_blank" rel="noreferrer" style={{ ...estiloBotaoSuave, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                Abrir
              </a>
            </div>
          </section>

          {/* Logomarca */}
          <section>
            <label style={estiloLabel}>Logomarca da loja (aparece no topo da vitrine)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Miniatura url={logoUrl} nome={nomeLoja} tamanho={52} />
              <button style={estiloBotaoSuave} onClick={() => inputLogoRef.current?.click()} disabled={enviandoImagem}>
                {enviandoImagem ? 'Enviando…' : logoUrl ? 'Trocar logo' : 'Enviar logo'}
              </button>
              {logoUrl && (
                <button style={{ ...estiloBotaoSuave, color: 'var(--color-rose)' }} onClick={removerLogo}>
                  Remover
                </button>
              )}
              <input ref={inputLogoRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={aoEscolherLogo} />
            </div>
          </section>

          <section>
            <label style={estiloLabel} htmlFor="vitrine-busca">Produtos exibidos na vitrine</label>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Cadastre e edite os dados dos produtos na área Produtos. Aqui você escolhe quais produtos ativos aparecem no catálogo público. Rascunhos e arquivados devem ser ativados em Produtos.</p>
            <input id="vitrine-busca" type="search" style={estiloInput} value={busca} onChange={e => setBusca(e.target.value)} placeholder="Pesquisar pelo nome" />
            {carregando ? <p>Carregando produtos…</p> : produtos.filter(p => p.nome.toLocaleLowerCase('pt-BR').includes(busca.toLocaleLowerCase('pt-BR'))).length === 0 ? <p>Nenhum produto encontrado.</p> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
                {produtos.filter(p => p.nome.toLocaleLowerCase('pt-BR').includes(busca.toLocaleLowerCase('pt-BR'))).map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', padding: '0.6rem', border: '1px solid var(--border-thin)', borderRadius: '8px' }}>
                    <Miniatura url={p.imagemUrl} nome={p.nome} tamanho={40} />
                    <div style={{ flex: 1 }}><strong>{p.nome}</strong><div style={estiloLabel}>{(p.publicado ?? p.ativo) ? 'Visível na vitrine' : 'Oculto da vitrine'}</div></div>
                    <button style={estiloBotaoSuave} disabled={alterandoProduto !== null || p.situacao === 'rascunho' || p.situacao === 'arquivado'} onClick={() => alternarPublicacao(p)}>{alterandoProduto === p.id ? 'Salvando…' : (p.publicado ?? p.ativo) ? 'Ocultar' : 'Exibir'}</button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {erro && (
            <p style={{ color: 'var(--color-rose)', fontSize: '0.8rem', background: 'rgba(244, 63, 94, 0.08)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: '8px', padding: '0.6rem 0.8rem', margin: 0 }} role="alert">
              {erro}
            </p>
          )}
          {aviso && (
            <p style={{ color: 'var(--color-emerald)', fontSize: '0.8rem', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '8px', padding: '0.6rem 0.8rem', margin: 0 }} role="status">
              {aviso}
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
