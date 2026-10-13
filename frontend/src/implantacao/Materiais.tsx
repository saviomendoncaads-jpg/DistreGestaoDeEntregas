import { useState } from 'react';
import Icon from './Icon';
import { aulasDoPasso, manualDoPasso, modeloDoPasso, urlAula, urlCapa, urlManual, urlModelo, type Aula } from './conteudos';
import { steps } from './types';
import './conteudos.css';

/** Player de uma aula. O vídeo traz narração e legenda gravadas; o arquivo também pode ser baixado. */
export function AulaVideo({ aula }: { aula: Aula }) {
  return <figure className="imp-aula">
    <video controls preload="metadata" playsInline poster={urlCapa(aula)} aria-label={`Aula: ${aula.titulo}`}>
      <source src={urlAula(aula)} type="video/mp4" />
      Seu navegador não reproduz este vídeo. <a href={urlAula(aula)} download>Baixe o arquivo da aula.</a>
    </video>
    <figcaption><strong>{aula.titulo}</strong><span>{aula.duracao} · {aula.resumo}</span></figcaption>
  </figure>;
}

/** Aula(s), manual em PDF e modelo de uma etapa da jornada. */
export default function Materiais({ passo }: { passo: number }) {
  const lista = aulasDoPasso(passo), manual = manualDoPasso(passo), modelo = modeloDoPasso(passo);
  const [atual, setAtual] = useState(0);
  const aula = lista[Math.min(atual, lista.length - 1)];
  return <section className="imp-materiais" aria-label="Aula e manual desta etapa">
    {lista.length > 1 && <div className="imp-aulas-abas" role="tablist" aria-label="Aulas desta etapa">
      {lista.map((a, i) => <button key={a.id} role="tab" aria-selected={i === atual} className={i === atual ? 'on' : ''} onClick={() => setAtual(i)}>Aula {i + 1} · {a.titulo}</button>)}
    </div>}
    {aula && <AulaVideo key={aula.id} aula={aula} />}
    {!aula && <p className="imp-upload-note">{manual || modelo ? 'A aula em vídeo desta etapa está em produção. O manual já está disponível abaixo.' : 'A aula e o manual desta etapa estão em produção.'}</p>}
    <div className="imp-materiais-acoes">
      {manual && <a className="imp-button secondary" href={urlManual(manual)} target="_blank" rel="noopener noreferrer" download={`distre-${manual.id}.pdf`}><Icon name="file" size={16} /> {manual.rotulo ?? 'Baixar manual em PDF'} <small>PDF · {manual.paginas} páginas</small></a>}
      {modelo && <a className="imp-button secondary" href={urlModelo(modelo)} download={modelo.arquivo}><Icon name="upload" size={16} /> {modelo.titulo}</a>}
    </div>
    {modelo && <p className="imp-upload-note">{modelo.descricao}</p>}
  </section>;
}

/** Página "Treinamentos e manuais": todas as aulas e manuais, na ordem das etapas. */
export function Biblioteca() {
  const [abertas, setAbertas] = useState<string[]>([]);
  return <div className="imp-biblioteca">
    {steps.map(step => {
      const lista = aulasDoPasso(step.id), manual = manualDoPasso(step.id), modelo = modeloDoPasso(step.id);
      return <section className="client-card" key={step.id}>
        <span className="imp-etapa">ETAPA {step.id} DE {steps.length}</span>
        <h2>{step.title}</h2>
        <p>{step.description}</p>
        {lista.map((aula, i) => abertas.includes(aula.id)
          ? <AulaVideo key={aula.id} aula={aula} />
          : <button key={aula.id} type="button" className="imp-capa-aula" onClick={() => setAbertas(a => [...a, aula.id])} aria-label={'Assistir à aula: ' + aula.titulo}>
              <img src={urlCapa(aula)} alt="" loading="lazy" /><span className="imp-play"><Icon name="play" size={18} /></span><span className="imp-duracao">{lista.length > 1 ? 'Aula ' + (i + 1) + ' · ' : ''}{aula.duracao}</span>
            </button>)}
        <div className="imp-biblioteca-acoes">
          {manual && <a className="imp-button secondary" href={urlManual(manual)} target="_blank" rel="noopener noreferrer" download={'distre-' + manual.id + '.pdf'}><Icon name="file" size={16} /> {manual.rotulo ?? 'Manual em PDF'} <small>{manual.paginas} páginas</small></a>}
          {modelo && <a className="imp-button secondary" href={urlModelo(modelo)} download={modelo.arquivo}><Icon name="upload" size={16} /> {modelo.titulo}</a>}
        </div>
      </section>;
    })}
  </div>;
}
