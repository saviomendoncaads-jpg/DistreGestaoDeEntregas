import Icon from './Icon';
export default function VideoStep({ title, final = false, onComplete }: { title: string; final?: boolean; onComplete: () => void }) {
  return <div>
    <div className="imp-video" role="img" aria-label={`Espaço reservado para o vídeo: ${title}`}>
      <span className="imp-video-top">DISTRE ACADEMY <span>AULA {final ? 'FINAL' : 'DE IMPLANTAÇÃO'}</span></span>
      <div className="imp-video-center"><span className="imp-play"><Icon name="play" size={28} /></span><strong>{title}</strong><span>O vídeo será disponibilizado aqui.</span></div>
      <div className="imp-video-bottom"><span className="imp-video-progress" /><span>Conteúdo em preparação</span></div>
    </div>
    {final && <div className="imp-resource"><Icon name="file" /><div><strong>Guia da operação e PDV</strong><p>O manual será adicionado após a preparação dos conteúdos.</p></div><button className="imp-button secondary" disabled title="PDF ainda não disponível">Baixar PDF com Passo a Passo da Operação</button></div>}
    <div className="imp-action-row"><span>Prévia da jornada · conclusão simulada</span><button className="imp-button primary" onClick={onComplete}>Marcar aula como concluída <Icon name="check" size={17} /></button></div>
  </div>;
}
