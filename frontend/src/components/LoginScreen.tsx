import { useRef, useState, type FormEvent } from 'react';
import './login-screen.css';

type AccessMode = 'loja' | 'admin';
interface Props {
  mode: AccessMode;
  username: string;
  password: string;
  error: string | null;
  onModeChange: (mode: AccessMode) => void;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

export default function LoginScreen(props: Props) {
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const admin = props.mode === 'admin';
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try { await props.onSubmit(event); }
    finally { submittingRef.current = false; setSubmitting(false); }
  };
  const changeMode = () => {
    setShowPassword(false);
    props.onModeChange(admin ? 'loja' : 'admin');
  };
  return <div className="distre-access">
    <section className="access-main" aria-labelledby="access-title">
      <header className="access-header">
        <a className="access-brand" href="/" aria-label="DISTRE — página inicial">
          <svg viewBox="0 0 40 32" fill="currentColor" aria-hidden="true"><path d="m1 3 12 13L1 29h9l12-13L10 3Zm16 0 12 13-12 13h9l12-13L26 3Z" /></svg>
          <span>DISTRE</span>
        </a>
        <a className="access-home" href="/">Voltar ao site <span aria-hidden="true">↗</span></a>
      </header>
      <main className="access-form-region">
        <div className="access-form-content">
          <span className="access-eyebrow">{admin ? 'ADMINISTRAÇÃO DA PLATAFORMA' : 'PAINEL DA LOJA'}</span>
          <h1 id="access-title">{admin ? 'Acesso administrativo' : 'Acesse sua loja'}</h1>
          <p className="access-description">{admin ? 'Entre com as credenciais de administrador do DISTRE.' : 'Entre para gerenciar sua loja online, seus pedidos e suas entregas.'}</p>
          <form className="access-form" onSubmit={submit} aria-busy={submitting}>
            <div className="access-field">
              <label htmlFor="access-username">Usuário</label>
              <input id="access-username" name="username" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="Digite seu usuário" value={props.username} onChange={event => props.onUsernameChange(event.target.value)} disabled={submitting} required aria-describedby={props.error ? 'access-error' : undefined} />
            </div>
            <div className="access-field">
              <label htmlFor="access-password">Senha</label>
              <div className="access-password">
                <input id="access-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Digite sua senha" value={props.password} onChange={event => props.onPasswordChange(event.target.value)} disabled={submitting} required aria-describedby={props.error ? 'access-error' : undefined} />
                <button className="access-reveal" type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} aria-pressed={showPassword} disabled={submitting}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{showPassword && <path d="m3 3 18 18" />}</svg>
                </button>
              </div>
            </div>
            {props.error && <div id="access-error" className="access-error" role="alert">{props.error}</div>}
            <button className="access-submit" type="submit" disabled={submitting}>{submitting ? 'Entrando…' : admin ? 'Entrar na administração' : 'Entrar na loja'}</button>
            <p className="access-help">Precisa de acesso? Fale com quem administra {admin ? 'a plataforma' : 'sua loja'}.</p>
          </form>
          <div className="access-mode-switch">
            <span>{admin ? 'Vai acessar uma loja?' : 'Administrador da plataforma?'}</span>
            <button type="button" onClick={changeMode} disabled={submitting}>{admin ? 'Voltar ao acesso da loja' : 'Acessar administração'} <span aria-hidden="true">→</span></button>
          </div>
        </div>
      </main>
      <footer className="access-footer"><span>© {new Date().getFullYear()} DISTRE</span><a href="/#loja-online">Conhecer a plataforma</a></footer>
    </section>
    <aside className="access-product" aria-label="Sobre o DISTRE">
      <div className="access-product-content">
        <span className="access-product-eyebrow">E-COMMERCE, PEDIDOS E LOGÍSTICA</span>
        <h2>Da sua loja online<br />à entrega do pedido.</h2>
        <p>Uma plataforma para acompanhar cada etapa da operação da sua loja.</p>
        <div className="access-product-flow">
          <div><span className="access-product-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 9 5 3h14l2 6M4 10v11h16V10M9 21v-7h6v7M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" /></svg></span><div><h3>Sua loja online</h3><p>Catálogo, carrinho e captação de pedidos.</p></div></div>
          <div><span className="access-product-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 9 5v9l-9 5-9-5V8ZM3 8l9 5 9-5M12 13v9" /></svg></span><div><h3>Pedidos organizados</h3><p>Separação, conferência e situação fiscal.</p></div></div>
          <div><span className="access-product-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 5h11v12H3ZM14 10h4l3 4v3h-7" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></svg></span><div><h3>Entregas acompanhadas</h3><p>Despacho e acompanhamento da entrega.</p></div></div>
        </div>
      </div>
      <span className="access-product-foot">Sua loja. Seus pedidos. Sua operação.</span>
    </aside>
  </div>;
}
