import type { ReactNode } from 'react';
import type { Step, StepStatus, StepType } from './types';
import Icon from './Icon';
import Materiais from './Materiais';
export default function TimelineItem({ step, status, type, last, children }: { step: Step; status: StepStatus; type: StepType; last: boolean; children: ReactNode }) {
  return <li className={`imp-timeline-item ${status}`} aria-current={status === 'active' ? 'step' : undefined}>
    <div className="imp-track" aria-hidden="true">
      <span className={`imp-node ${status === 'completed' ? 'bg-green-500 text-white' : status === 'active' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
        {status === 'completed' ? <Icon name="check" size={17} /> : status === 'locked' ? <Icon name="lock" size={15} /> : step.id}
      </span>
      {!last && <span className={`imp-line border-l-2 ${status === 'completed' ? 'border-green-500' : 'border-gray-300'}`} />}
    </div>
    <article className={`imp-step-card ${status === 'locked' ? 'pointer-events-none opacity-60' : status === 'completed' ? 'opacity-80' : ''}`} aria-disabled={status === 'locked'}>
      <div className="imp-step-heading">
        <span className={`imp-step-icon ${status === 'completed' ? 'text-green-600' : 'text-blue-600'}`}><Icon name={status === 'completed' ? 'check' : type === 'video' ? 'play' : type === 'upload' ? 'upload' : 'arrow'} /></span>
        <div className="min-w-0 flex-1"><div className="imp-step-label">PASSO {step.id} <span>·</span> {step.label}</div><h2>{step.title}</h2><p>{step.description}</p></div>
        <span className={`imp-status ${status}`}>{status === 'completed' ? 'Concluído' : status === 'active' ? 'Sua próxima etapa' : 'Bloqueado'}</span>
      </div>
      {status === 'active' && <div className="imp-step-content">{children}</div>}
      {status === 'completed' && <details className="imp-step-content imp-completed-materials">
        <summary>Rever vídeos e baixar materiais</summary>
        <Materiais passo={step.id}/>
      </details>}
    </article>
  </li>;
}
