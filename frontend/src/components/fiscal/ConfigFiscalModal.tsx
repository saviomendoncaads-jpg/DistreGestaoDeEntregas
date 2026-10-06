import { useEffect, useState } from 'react';
import { buscarEnderecoPorCep, mascararCep } from '../../cliente/services/cep';
import type { ConfigFiscal, CredenciaisEnvio, EstadoFiscal, FiscalApi } from './fiscalApi';
import './fiscal.css';

/**
 * Dados fiscais da loja — tudo que a empresa precisa para emitir NFC-e/NF-e:
 *  1. Emitente (CNPJ, IE, endereço)
 *  2. Emissão (provedor, ambiente, séries, tributação padrão, tributos aproximados)
 *  3. Credenciais (certificado A1, CSC, tokens da Focus NFe) — guardadas cifradas
 * O checklist do topo mostra o que falta para emitir.
 */

const PADRAO: ConfigFiscal = {
  razaoSocial: '', nomeFantasia: '', cnpj: '', inscricaoEstadual: '', regimeTributario: 1,
  logradouro: '', numero: '', bairro: '', municipio: '', uf: '', cep: '', telefone: '', email: '',
  provedor: 'SIMULADO', ambiente: 'HOMOLOGACAO', serieNfce: 1, proximoNumeroNfce: 1, serieNfe: 1, proximoNumeroNfe: 1,
  // 2106.90.90 = preparações alimentícias; 5102 = venda de mercadoria; CSOSN 102 = Simples sem crédito.
  ncmPadrao: '21069090', cfopPadrao: '5102', icmsSituacaoPadrao: '102', origemPadrao: '0', percentualTributos: 0,
};

type Aba = 'emitente' | 'emissao' | 'credenciais';

interface Props {
  api: FiscalApi;
  nomeLoja: string;
  onSalvo?: () => void;
  onFechar: () => void;
}

const lerArquivoBase64 = (f: File) => new Promise<string>((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ''));
  r.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
  r.readAsDataURL(f);
});

export default function ConfigFiscalModal({ api, nomeLoja, onSalvo, onFechar }: Props) {
  const [aba, setAba] = useState<Aba>('emitente');
  const [c, setC] = useState<ConfigFiscal>({ ...PADRAO, nomeFantasia: nomeLoja });
  const [estado, setEstado] = useState<EstadoFiscal | null>(null);
  const [cred, setCred] = useState<CredenciaisEnvio>({});
  const [arquivoCert, setArquivoCert] = useState<File | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const aplicarEstado = (e: EstadoFiscal) => {
    setEstado(e);
    if (e.config) setC({ ...PADRAO, ...e.config });
  };

  useEffect(() => {
    api.obterEstado().then(aplicarEstado).catch(e => setMsg({ tipo: 'erro', texto: e.message })).finally(() => setCarregando(false));
  }, [api]);

  const set = <K extends keyof ConfigFiscal>(k: K, v: ConfigFiscal[K]) => setC(p => ({ ...p, [k]: v }));
  const txt = (k: keyof ConfigFiscal) => ({
    value: String(c[k] ?? ''),
    onChange: (ev: React.ChangeEvent<HTMLInputElement>) => set(k, ev.target.value as never),
  });
  const num = (k: 'serieNfce' | 'proximoNumeroNfce' | 'serieNfe' | 'proximoNumeroNfe') => ({
    type: 'number' as const, min: k.startsWith('serie') ? 0 : 1, value: c[k],
    onChange: (ev: React.ChangeEvent<HTMLInputElement>) => set(k, Number(ev.target.value)),
  });
  const credCampo = (k: keyof CredenciaisEnvio) => ({
    value: String(cred[k] ?? ''),
    onChange: (ev: React.ChangeEvent<HTMLInputElement>) => setCred(p => ({ ...p, [k]: ev.target.value })),
    autoComplete: 'off',
  });

  const aoMudarCep = async (valor: string) => {
    const cep = mascararCep(valor);
    set('cep', cep);
    if (cep.replace(/\D/g, '').length === 8) {
      const r = await buscarEnderecoPorCep(cep);
      if (r) setC(p => ({ ...p, logradouro: r.logradouro || p.logradouro, bairro: r.bairro || p.bairro, municipio: r.cidade || p.municipio, uf: r.uf || p.uf }));
    }
  };

  const executar = async (rotulo: string, fn: () => Promise<string | void>) => {
    setOcupado(rotulo);
    setMsg(null);
    try {
      const texto = await fn();
      setMsg({ tipo: 'ok', texto: texto || 'Salvo.' });
      onSalvo?.();
    } catch (e: any) {
      setMsg({ tipo: 'erro', texto: e.message });
    } finally {
      setOcupado(null);
    }
  };

  const salvarConfig = () => executar('config', async () => {
    aplicarEstado(await api.salvarConfig(c));
    return 'Dados fiscais salvos.';
  });

  const salvarCredenciais = () => executar('cred', async () => {
    const envio: CredenciaisEnvio = {};
    for (const [k, v] of Object.entries(cred)) if (typeof v === 'string' && v.trim()) (envio as any)[k] = v.trim();
    if (arquivoCert) {
      if (!cred.certificadoSenha) throw new Error('Informe a senha do certificado.');
      envio.certificadoBase64 = await lerArquivoBase64(arquivoCert);
    }
    if (Object.keys(envio).length === 0) throw new Error('Nada para salvar: preencha algum campo.');
    aplicarEstado(await api.salvarCredenciais(envio));
    setCred({});
    setArquivoCert(null);
    return 'Credenciais salvas com segurança (cifradas).';
  });

  const removerCertificado = () => {
    if (!window.confirm('Remover o certificado A1 salvo?')) return;
    executar('cred', async () => { aplicarEstado(await api.salvarCredenciais({ removerCertificado: true })); return 'Certificado removido.'; });
  };

  const testar = (amb: 'HOMOLOGACAO' | 'PRODUCAO') => executar(`teste-${amb}`, async () => {
    const r = await api.testarConexao(amb);
    if (!r.ok) throw new Error(r.mensagem);
    return r.mensagem;
  });

  const sincronizar = () => executar('sync', async () => {
    const r = await api.sincronizarFocus();
    aplicarEstado(r);
    return r.mensagem;
  });

  const cr = estado?.credenciais;
  const pr = estado?.prontidao;
  const ok = (b?: boolean) => (b ? '✓ configurado' : '— não configurado');
  const ocupadoAlgo = !!ocupado;

  return (
    <div className="kanban-modal-overlay" onClick={() => !ocupadoAlgo && onFechar()}>
      <div className="kanban-modal fiscal-modal fiscal-modal--config" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Dados fiscais">
        <div className="fiscal-head">
          <div>
            <h3 className="kanban-modal-title">Dados fiscais da loja</h3>
            <span className="fiscal-sub">NFC-e e NF-e de {nomeLoja}</span>
          </div>
          <button className="kanban-detalhe-close" onClick={onFechar} aria-label="Fechar">✕</button>
        </div>

        {pr && (
          <div className={`fiscal-checklist ${pr.podeEmitir ? 'pronto' : ''}`}>
            <div className="fiscal-checklist-titulo">
              {pr.podeEmitir
                ? `✅ Pronto para emitir${c.provedor === 'SIMULADO' ? ' (simulado)' : c.ambiente === 'PRODUCAO' ? ' em PRODUÇÃO' : ' em homologação'}`
                : '⚠️ Falta configurar para emitir'}
              {c.provedor === 'FOCUSNFE' && c.ambiente === 'HOMOLOGACAO' && (
                <span className="fiscal-sub"> · produção: {pr.podeEmitirEmProducao ? 'liberada' : 'pendente'}</span>
              )}
            </div>
            <ul>
              {pr.itens.map(i => (
                <li key={i.chave} className={i.ok ? 'ok' : i.obrigatorio ? 'falta' : 'opcional'}>
                  <span>{i.ok ? '✓' : i.obrigatorio ? '✗' : '○'}</span> {i.rotulo}{i.detalhe ? <em> — {i.detalhe}</em> : null}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="fiscal-abas" role="tablist">
          {([['emitente', '1. Emitente'], ['emissao', '2. Emissão'], ['credenciais', '3. Credenciais']] as [Aba, string][]).map(([k, r]) => (
            <button key={k} type="button" role="tab" aria-selected={aba === k} className={`fiscal-aba ${aba === k ? 'ativa' : ''}`} onClick={() => setAba(k)}>{r}</button>
          ))}
        </div>

        {carregando ? <div className="fiscal-sub">Carregando…</div> : (
          <>
            {aba === 'emitente' && (
              <div className="fiscal-form">
                <label className="fiscal-campo fiscal-campo--full"><span>Razão social</span><input className="form-input" {...txt('razaoSocial')} /></label>
                <label className="fiscal-campo fiscal-campo--full"><span>Nome fantasia</span><input className="form-input" {...txt('nomeFantasia')} /></label>
                <label className="fiscal-campo"><span>CNPJ</span><input className="form-input" inputMode="numeric" {...txt('cnpj')} /></label>
                <label className="fiscal-campo"><span>Inscrição estadual</span><input className="form-input" placeholder='Números ou "ISENTO"' {...txt('inscricaoEstadual')} /></label>
                <label className="fiscal-campo"><span>Regime tributário</span>
                  <select className="form-select" value={c.regimeTributario} onChange={ev => set('regimeTributario', Number(ev.target.value) as 1 | 2 | 3)}>
                    <option value={1}>Simples Nacional</option>
                    <option value={2}>Simples (excesso de sublimite)</option>
                    <option value={3}>Regime Normal</option>
                  </select>
                </label>
                <label className="fiscal-campo"><span>Telefone</span><input className="form-input" inputMode="tel" {...txt('telefone')} /></label>
                <label className="fiscal-campo fiscal-campo--full"><span>E-mail (recebe cópia dos XML)</span><input className="form-input" type="email" {...txt('email')} /></label>
                <label className="fiscal-campo"><span>CEP</span><input className="form-input" inputMode="numeric" value={c.cep} onChange={ev => aoMudarCep(ev.target.value)} /></label>
                <label className="fiscal-campo"><span>Número</span><input className="form-input" {...txt('numero')} /></label>
                <label className="fiscal-campo fiscal-campo--full"><span>Logradouro</span><input className="form-input" {...txt('logradouro')} /></label>
                <label className="fiscal-campo"><span>Bairro</span><input className="form-input" {...txt('bairro')} /></label>
                <label className="fiscal-campo"><span>Município</span><input className="form-input" {...txt('municipio')} /></label>
                <label className="fiscal-campo"><span>UF</span><input className="form-input" maxLength={2} value={c.uf} onChange={ev => set('uf', ev.target.value.toUpperCase())} /></label>
              </div>
            )}

            {aba === 'emissao' && (
              <>
                <h4 className="fiscal-secao">Provedor de emissão</h4>
                <div className="fiscal-opcoes" role="radiogroup">
                  <button type="button" role="radio" aria-checked={c.provedor === 'SIMULADO'} className={`fiscal-opcao ${c.provedor === 'SIMULADO' ? 'ativa' : ''}`}
                    onClick={() => setC(p => ({ ...p, provedor: 'SIMULADO', ambiente: 'HOMOLOGACAO' }))}>
                    <span className="fiscal-opcao-titulo">Simulado</span>
                    <span className="fiscal-opcao-desc">Para treinar a equipe. Notas sem valor fiscal.</span>
                  </button>
                  <button type="button" role="radio" aria-checked={c.provedor === 'FOCUSNFE'} className={`fiscal-opcao ${c.provedor === 'FOCUSNFE' ? 'ativa' : ''}`}
                    onClick={() => set('provedor', 'FOCUSNFE')}>
                    <span className="fiscal-opcao-titulo">Focus NFe</span>
                    <span className="fiscal-opcao-desc">Emissão real na SEFAZ (tokens em "Credenciais").</span>
                  </button>
                </div>
                <div className="fiscal-form">
                  <label className="fiscal-campo fiscal-campo--full"><span>Ambiente SEFAZ</span>
                    <select className="form-select" value={c.ambiente} disabled={c.provedor === 'SIMULADO'} onChange={ev => set('ambiente', ev.target.value as ConfigFiscal['ambiente'])}>
                      <option value="HOMOLOGACAO">Homologação (testes, sem valor fiscal)</option>
                      <option value="PRODUCAO">Produção (valor fiscal)</option>
                    </select>
                  </label>
                  <label className="fiscal-campo"><span>Série NFC-e</span><input className="form-input" {...num('serieNfce')} /></label>
                  <label className="fiscal-campo"><span>Próximo nº NFC-e</span><input className="form-input" {...num('proximoNumeroNfce')} /></label>
                  <label className="fiscal-campo"><span>Série NF-e</span><input className="form-input" {...num('serieNfe')} /></label>
                  <label className="fiscal-campo"><span>Próximo nº NF-e</span><input className="form-input" {...num('proximoNumeroNfe')} /></label>
                </div>
                {c.provedor === 'FOCUSNFE' && <p className="fiscal-dica">Com a Focus NFe a numeração é controlada por ela; série/número acima valem para o modo simulado.</p>}

                <h4 className="fiscal-secao">Tributação padrão (produtos sem dado fiscal próprio)</h4>
                <div className="fiscal-form">
                  <label className="fiscal-campo"><span>NCM</span><input className="form-input" inputMode="numeric" maxLength={8} {...txt('ncmPadrao')} /></label>
                  <label className="fiscal-campo"><span>CFOP</span><input className="form-input" inputMode="numeric" maxLength={4} {...txt('cfopPadrao')} /></label>
                  <label className="fiscal-campo"><span>{c.regimeTributario === 3 ? 'CST ICMS' : 'CSOSN'}</span><input className="form-input" inputMode="numeric" maxLength={3} {...txt('icmsSituacaoPadrao')} /></label>
                  <label className="fiscal-campo"><span>Origem</span>
                    <select className="form-select" value={c.origemPadrao} onChange={ev => set('origemPadrao', ev.target.value)}>
                      <option value="0">0 - Nacional</option>
                      <option value="1">1 - Estrangeira (importação direta)</option>
                      <option value="2">2 - Estrangeira (mercado interno)</option>
                    </select>
                  </label>
                  <label className="fiscal-campo fiscal-campo--full"><span>Tributos aproximados % (Lei 12.741 / tabela IBPT)</span>
                    <input className="form-input" inputMode="decimal" value={String(c.percentualTributos ?? 0)} onChange={ev => set('percentualTributos', Number(ev.target.value.replace(',', '.')) || 0)} />
                  </label>
                </div>
                <p className="fiscal-dica">NCM/CEST/código de barras de cada produto: Vitrine &amp; Produtos → Editar produto → Dados fiscais. Confirme os códigos com seu contador.</p>
              </>
            )}

            {aba === 'credenciais' && (
              <>
                <h4 className="fiscal-secao">Certificado digital A1 (.pfx / .p12)</h4>
                {cr?.certificado ? (
                  <p className="fiscal-dica">
                    ✓ <b>{cr.certificado.titular}</b> · CNPJ {cr.certificado.cnpj || '—'} · válido até{' '}
                    {cr.certificado.validoAte ? new Date(cr.certificado.validoAte).toLocaleDateString('pt-BR') : '—'}
                    {cr.certificado.diasRestantes !== undefined && ` (${cr.certificado.diasRestantes} dias)`}{' '}
                    <button type="button" className="fiscal-link" onClick={removerCertificado}>remover</button>
                  </p>
                ) : <p className="fiscal-dica">Nenhum certificado enviado.</p>}
                <div className="fiscal-form">
                  <label className="fiscal-campo"><span>{cr?.certificado ? 'Trocar certificado' : 'Arquivo do certificado'}</span>
                    <input className="form-input" type="file" accept=".pfx,.p12,application/x-pkcs12" onChange={ev => setArquivoCert(ev.target.files?.[0] || null)} />
                  </label>
                  <label className="fiscal-campo"><span>Senha do certificado</span><input className="form-input" type="password" {...credCampo('certificadoSenha')} /></label>
                </div>

                <h4 className="fiscal-secao">CSC da NFC-e (portal da SEFAZ do seu estado)</h4>
                <div className="fiscal-form">
                  <label className="fiscal-campo"><span>ID CSC homologação {cr?.cscHomologacao.configurado ? `(✓ id ${cr.cscHomologacao.id})` : ''}</span><input className="form-input" inputMode="numeric" {...credCampo('cscIdHomologacao')} /></label>
                  <label className="fiscal-campo"><span>CSC homologação</span><input className="form-input" type="password" {...credCampo('cscHomologacao')} placeholder={cr?.cscHomologacao.configurado ? '••••••' : ''} /></label>
                  <label className="fiscal-campo"><span>ID CSC produção {cr?.cscProducao.configurado ? `(✓ id ${cr.cscProducao.id})` : ''}</span><input className="form-input" inputMode="numeric" {...credCampo('cscIdProducao')} /></label>
                  <label className="fiscal-campo"><span>CSC produção</span><input className="form-input" type="password" {...credCampo('cscProducao')} placeholder={cr?.cscProducao.configurado ? '••••••' : ''} /></label>
                </div>

                <h4 className="fiscal-secao">Focus NFe</h4>
                <div className="fiscal-form">
                  <label className="fiscal-campo"><span>Token homologação {ok(cr?.focusTokenHomologacao)}</span><input className="form-input" type="password" {...credCampo('focusTokenHomologacao')} /></label>
                  <label className="fiscal-campo"><span>Token produção {ok(cr?.focusTokenProducao)}</span><input className="form-input" type="password" {...credCampo('focusTokenProducao')} /></label>
                  <label className="fiscal-campo fiscal-campo--full"><span>Token principal da conta (opcional, para sincronizar) {ok(cr?.focusTokenPrincipal)}</span><input className="form-input" type="password" {...credCampo('focusTokenPrincipal')} /></label>
                </div>
                <p className="fiscal-dica">
                  Duas formas: <b>(a)</b> cadastre certificado e CSC no painel da Focus e cole aqui os tokens de homologação/produção; ou
                  <b> (b)</b> envie certificado + CSC + token principal aqui e clique em <b>Sincronizar com a Focus</b> — os tokens de emissão chegam sozinhos.
                  {cr?.sincronizadoEm && ` Última sincronização: ${new Date(cr.sincronizadoEm).toLocaleString('pt-BR')}.`}
                </p>
                <div className="fiscal-acoes">
                  <button type="button" className="kanban-btn kanban-btn-emerald" disabled={ocupadoAlgo} onClick={salvarCredenciais}>{ocupado === 'cred' ? 'Salvando…' : 'Salvar credenciais'}</button>
                  <button type="button" className="kanban-btn kanban-btn-ghost" disabled={ocupadoAlgo || !cr?.focusTokenPrincipal} onClick={sincronizar} title="Precisa do token principal e do certificado salvos">{ocupado === 'sync' ? 'Sincronizando…' : 'Sincronizar com a Focus'}</button>
                  <button type="button" className="kanban-btn kanban-btn-ghost" disabled={ocupadoAlgo || c.provedor !== 'FOCUSNFE'} onClick={() => testar('HOMOLOGACAO')}>{ocupado === 'teste-HOMOLOGACAO' ? 'Testando…' : 'Testar homologação'}</button>
                  <button type="button" className="kanban-btn kanban-btn-ghost" disabled={ocupadoAlgo || c.provedor !== 'FOCUSNFE'} onClick={() => testar('PRODUCAO')}>{ocupado === 'teste-PRODUCAO' ? 'Testando…' : 'Testar produção'}</button>
                </div>
                <p className="fiscal-dica">🔒 Certificado, senha, CSC e tokens ficam cifrados (AES-256) e nunca são exibidos de volta.</p>
              </>
            )}
          </>
        )}

        {msg && <div className={msg.tipo === 'ok' ? 'fiscal-ok' : 'fiscal-erro'} role="status">{msg.texto}</div>}

        <div className="kanban-modal-actions">
          <button className="kanban-btn kanban-btn-ghost" onClick={onFechar} disabled={ocupadoAlgo}>Fechar</button>
          {aba !== 'credenciais' && (
            <button className="kanban-btn kanban-btn-emerald" onClick={salvarConfig} disabled={ocupadoAlgo || carregando}>{ocupado === 'config' ? 'Salvando…' : 'Salvar dados fiscais'}</button>
          )}
        </div>
      </div>
    </div>
  );
}
