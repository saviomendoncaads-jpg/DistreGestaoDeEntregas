import { useState } from 'react';
import { buscarEnderecoPorCep, mascararCep } from '../../cliente/services/cep';
import type { DestinatarioNota, EscolhaFiscal } from './fiscalApi';
import './fiscal.css';

/**
 * Escolha do documento fiscal da venda — aberto ao "Concluir Separação" (e pelo
 * card do Kanban para reemitir). Uma venda tem UM documento: NFC-e (cupom 80mm,
 * consumidor final) OU NF-e (DANFE A4, exige destinatário completo).
 */

export interface ComandaFiscal {
  id: string;
  nomeCliente: string;
  clienteDocumento?: string;
  endereco: string;
  bairro?: string;
  cidade?: string;
  valor: number;
}

interface Props {
  titulo: string;
  comanda: ComandaFiscal;
  escolhaInicial: EscolhaFiscal;
  permitirSemNota: boolean;
  simulado: boolean;
  onConfirmar: (escolha: EscolhaFiscal, destinatario?: DestinatarioNota) => Promise<void>;
  onAbrirConfig: () => void;
  onFechar: () => void;
}

const UFS = new Set(['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']);

// Endereço da vitrine: "Rua das Flores, 123, Apto 4, São Paulo, SP, CEP 01001-000".
// Extrai o que der (logradouro, número, UF, CEP); o resto a loja completa no formulário.
function separarEndereco(endereco: string): { logradouro: string; numero: string; uf: string; cep: string } {
  const partes = endereco.split(',').map(p => p.trim()).filter(Boolean);
  const numero = (partes[1]?.match(/^(\d+[A-Za-z]?)\b/) || [])[1] || '';
  const uf = partes.find(p => UFS.has(p.toUpperCase()) && p.length === 2)?.toUpperCase() || '';
  const cep = (endereco.match(/CEP\s*(\d{5}-?\d{3})/i) || [])[1] || '';
  return { logradouro: partes[0] || '', numero, uf, cep: cep ? mascararCep(cep) : '' };
}

const mascaraDoc = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
};

export default function EmissaoNotaModal({
  titulo, comanda, escolhaInicial, permitirSemNota, simulado, onConfirmar, onAbrirConfig, onFechar,
}: Props) {
  const [escolha, setEscolha] = useState<EscolhaFiscal>(escolhaInicial);
  const end = separarEndereco(comanda.endereco || '');
  const [dest, setDest] = useState<DestinatarioNota>({
    nome: comanda.nomeCliente || '',
    documento: comanda.clienteDocumento ? mascaraDoc(comanda.clienteDocumento) : '',
    logradouro: end.logradouro,
    numero: end.numero,
    bairro: comanda.bairro || '',
    municipio: comanda.cidade || '',
    uf: end.uf,
    cep: end.cep,
    email: '',
  });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [precisaConfig, setPrecisaConfig] = useState(false);

  const campo = (k: keyof DestinatarioNota) => ({
    value: dest[k] || '',
    onChange: (ev: React.ChangeEvent<HTMLInputElement>) => setDest(p => ({ ...p, [k]: ev.target.value })),
  });

  const aoMudarCep = async (valor: string) => {
    const cep = mascararCep(valor);
    setDest(p => ({ ...p, cep }));
    if (cep.replace(/\D/g, '').length === 8) {
      const r = await buscarEnderecoPorCep(cep);
      if (r) {
        setDest(p => ({
          ...p,
          logradouro: p.logradouro || r.logradouro,
          bairro: p.bairro || r.bairro,
          municipio: r.cidade || p.municipio,
          uf: r.uf || p.uf,
        }));
      }
    }
  };

  const confirmar = async () => {
    setErro(null);
    setPrecisaConfig(false);
    const docDigitos = (dest.documento || '').replace(/\D/g, '');
    if (docDigitos && docDigitos.length !== 11 && docDigitos.length !== 14) {
      setErro('CPF deve ter 11 dígitos e CNPJ 14.');
      return;
    }
    let destinatario: DestinatarioNota | undefined;
    if (escolha === 'NFE') {
      destinatario = { ...dest, documento: docDigitos, cep: (dest.cep || '').replace(/\D/g, ''), uf: (dest.uf || '').toUpperCase() };
    } else if (escolha === 'NFCE' && docDigitos) {
      destinatario = { documento: docDigitos, nome: dest.nome || undefined };
    }
    setEnviando(true);
    try {
      await onConfirmar(escolha, destinatario);
    } catch (e: any) {
      setErro(e?.message || 'Falha ao processar.');
      if (e?.status === 412 || /Dados fiscais da loja/.test(e?.message || '')) setPrecisaConfig(true);
    } finally {
      setEnviando(false);
    }
  };

  const rotuloConfirmar =
    escolha === 'NENHUMA' ? 'Concluir sem nota'
      : escolha === 'NFCE' ? 'Emitir NFC-e e imprimir'
        : 'Emitir NF-e e imprimir';

  return (
    <div className="kanban-modal-overlay" onClick={() => !enviando && onFechar()}>
      <div className="kanban-modal fiscal-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="fiscal-head">
          <div>
            <h3 className="kanban-modal-title">{titulo}</h3>
            <span className="fiscal-sub font-mono">{comanda.id} · {comanda.nomeCliente} · R$ {comanda.valor.toFixed(2)}</span>
          </div>
          <button className="kanban-detalhe-close" onClick={onFechar} disabled={enviando} aria-label="Fechar">✕</button>
        </div>

        {simulado && (
          <div className="fiscal-aviso">Ambiente de testes: a nota sai em homologação/simulada, <b>sem valor fiscal</b>. Para valer, ative Produção em "Dados fiscais".</div>
        )}

        <div className="kanban-modal-label">Documento fiscal da venda</div>
        <div className="fiscal-opcoes" role="radiogroup">
          <button type="button" role="radio" aria-checked={escolha === 'NFCE'} className={`fiscal-opcao ${escolha === 'NFCE' ? 'ativa' : ''}`} onClick={() => setEscolha('NFCE')}>
            <span className="fiscal-opcao-titulo">NFC-e</span>
            <span className="fiscal-opcao-desc">Cupom fiscal 80mm · consumidor final</span>
          </button>
          <button type="button" role="radio" aria-checked={escolha === 'NFE'} className={`fiscal-opcao ${escolha === 'NFE' ? 'ativa' : ''}`} onClick={() => setEscolha('NFE')}>
            <span className="fiscal-opcao-titulo">NF-e</span>
            <span className="fiscal-opcao-desc">DANFE A4 · exige CPF/CNPJ e endereço</span>
          </button>
          {permitirSemNota && (
            <button type="button" role="radio" aria-checked={escolha === 'NENHUMA'} className={`fiscal-opcao ${escolha === 'NENHUMA' ? 'ativa' : ''}`} onClick={() => setEscolha('NENHUMA')}>
              <span className="fiscal-opcao-titulo">Sem nota</span>
              <span className="fiscal-opcao-desc">Só conclui a separação</span>
            </button>
          )}
        </div>

        {escolha === 'NFCE' && (
          <div className="fiscal-form">
            <label className="fiscal-campo fiscal-campo--full">
              <span>CPF/CNPJ na nota (opcional)</span>
              <input className="form-input" inputMode="numeric" placeholder="Consumidor não identificado"
                value={dest.documento || ''} onChange={ev => setDest(p => ({ ...p, documento: mascaraDoc(ev.target.value) }))} />
            </label>
          </div>
        )}

        {escolha === 'NFE' && (
          <div className="fiscal-form">
            <label className="fiscal-campo fiscal-campo--full"><span>Nome / Razão social</span><input className="form-input" {...campo('nome')} /></label>
            <label className="fiscal-campo"><span>CPF / CNPJ</span>
              <input className="form-input" inputMode="numeric" value={dest.documento || ''} onChange={ev => setDest(p => ({ ...p, documento: mascaraDoc(ev.target.value) }))} />
            </label>
            <label className="fiscal-campo"><span>CEP</span>
              <input className="form-input" inputMode="numeric" placeholder="00000-000" value={dest.cep || ''} onChange={ev => aoMudarCep(ev.target.value)} />
            </label>
            <label className="fiscal-campo fiscal-campo--full"><span>Logradouro</span><input className="form-input" {...campo('logradouro')} /></label>
            <label className="fiscal-campo"><span>Número</span><input className="form-input" {...campo('numero')} /></label>
            <label className="fiscal-campo"><span>Bairro</span><input className="form-input" {...campo('bairro')} /></label>
            <label className="fiscal-campo"><span>Município</span><input className="form-input" {...campo('municipio')} /></label>
            <label className="fiscal-campo"><span>UF</span>
              <input className="form-input" maxLength={2} value={dest.uf || ''} onChange={ev => setDest(p => ({ ...p, uf: ev.target.value.toUpperCase() }))} />
            </label>
            <label className="fiscal-campo fiscal-campo--full"><span>E-mail (opcional, recebe o XML)</span><input className="form-input" type="email" {...campo('email')} /></label>
          </div>
        )}

        {erro && (
          <div className="fiscal-erro" role="alert">
            {erro}
            {precisaConfig && <button type="button" className="fiscal-link" onClick={onAbrirConfig}>Abrir dados fiscais</button>}
          </div>
        )}

        <div className="kanban-modal-actions">
          <button className="kanban-btn kanban-btn-ghost" onClick={onFechar} disabled={enviando}>Cancelar</button>
          <button className="kanban-btn kanban-btn-emerald" onClick={confirmar} disabled={enviando}>
            {enviando ? 'Processando…' : rotuloConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
