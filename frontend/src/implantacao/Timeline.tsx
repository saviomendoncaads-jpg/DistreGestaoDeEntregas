import { steps, statusAt } from './types';
import TimelineItem from './TimelineItem';
import VideoStep from './VideoStep';
import UploadStep from './UploadStep';
import Icon from './Icon';
export default function Timeline({ completed, onComplete }: { completed: number; onComplete: (index: number) => void }) {
  return <ol className="imp-timeline" aria-label="Etapas da implantação">{steps.map((step, index) => <TimelineItem key={step.id} step={step} type={step.type} status={statusAt(index, completed)} last={index === steps.length - 1}>
    {step.type === 'video' ? <VideoStep title={step.title} final={step.id === 6} onComplete={() => onComplete(index)} /> : step.type === 'upload' ? <UploadStep kind={step.id === 2 ? 'products' : step.id === 4 ? 'stock' : 'images'} onComplete={() => onComplete(index)} /> : <div className="imp-launch"><span className="imp-launch-icon"><Icon name="check" size={30} /></span><h3>Tudo pronto para o próximo capítulo.</h3><p>Você percorreu todas as etapas. Esta prévia simula a conclusão da implantação.</p><button className="imp-button primary imp-launch-button" onClick={() => onComplete(index)}>Iniciar Utilização do ERP <Icon name="arrow" size={22} /></button><small>O botão conclui a demonstração. Não ativa dados ou serviços reais.</small></div>}
  </TimelineItem>)}</ol>;
}
