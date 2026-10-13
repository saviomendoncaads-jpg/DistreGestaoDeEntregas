import { useState } from 'react';
import Sidebar from './Sidebar';
import Timeline from './Timeline';
import Icon from './Icon';
import { steps } from './types';
import './implementation.css';
export default function ImplementationPanel() {
  const [completed, setCompleted] = useState(0);
  const percent = Math.round(completed / steps.length * 100);
  function complete(index: number) { setCompleted(current => index === current ? Math.min(current + 1, steps.length) : current); }
  return <div className="imp-shell"><Sidebar /><div className="imp-page">
    <header className="imp-topbar"><span>Área do cliente <span className="imp-breadcrumb">/</span> <strong>Implantação</strong></span><span className="imp-preview-badge">PRÉVIA INTERATIVA</span></header>
    <div className="imp-layout"><main id="jornada" className="min-w-0">
      <div className="imp-intro"><span className="imp-eyebrow">SEU ERP COMEÇA AQUI</span><h1>Vamos preparar sua operação.</h1><p>Aprenda, coloque em prática e avance. Uma jornada guiada para começar com tudo organizado.</p></div>
      <section className="imp-progress-card" aria-label="Progresso da implantação"><div><strong>Minha implantação</strong><span>{completed} de {steps.length} etapas concluídas <b>{percent}%</b></span></div><div className="imp-progress-track" role="progressbar" aria-label="Implantação concluída" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${percent}%` }} /></div><p>{completed === steps.length ? 'Jornada demonstrativa concluída.' : `Agora: ${steps[completed].title}`}</p></section>
      <p className="imp-demo-note">Estrutura demonstrativa. Vídeos, modelos, manuais e integração das importações serão adicionados depois. O progresso é temporário e reinicia ao atualizar a página.</p>
      <Timeline completed={completed} onComplete={complete} />
      {completed === steps.length && <div className="imp-finished" role="status"><Icon name="check" /><div><strong>Você concluiu a prévia!</strong><p>Todos os passos foram liberados e concluídos.</p></div><a className="imp-button primary" href="/app">Abrir painel do ERP</a></div>}
      <div className="imp-bottom"><span>Seu progresso nesta sessão</span><button className="imp-text-button" onClick={() => setCompleted(0)}>Reiniciar demonstração</button></div>
      <span className="sr-only" role="status" aria-live="polite">{completed === steps.length ? 'Todas as etapas concluídas.' : `Passo ${completed + 1} liberado: ${steps[completed].title}`}</span>
    </main><aside className="imp-support" id="ajuda"><section><span className="imp-support-icon"><Icon name="help" size={25} /></span><h2>Você não precisa fazer isso sozinho.</h2><p>Uma etapa depende da anterior. Siga a sequência para preparar sua operação com segurança.</p><div className="imp-support-divider" /><h3 id="materiais">O que vem depois</h3><ul><li><Icon name="play" size={16} /> Aulas de cada etapa</li><li><Icon name="file" size={16} /> Planilhas modelo</li><li><Icon name="book" size={16} /> Manual de operação e PDV</li></ul><span className="imp-coming">Conteúdos em preparação</span></section><div className="imp-tip"><strong>Uma boa implantação começa nos dados.</strong><p>Organize códigos, nomes e saldos dos produtos antes de iniciar as importações.</p></div></aside></div>
    <footer className="imp-footer">DISTRE <span>Preparando sua próxima etapa.</span></footer>
  </div></div>;
}
