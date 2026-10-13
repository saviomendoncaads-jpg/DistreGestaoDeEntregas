import Icon from './Icon';
import {clientUrl,sectionLabels,type ClientSection} from './ClientSections';
export default function Sidebar({name,section,lojaId}:{name?:string;section:ClientSection;lojaId?:string}) {
  return <aside className="imp-sidebar flex flex-col bg-slate-950 text-white">
    <a href={lojaId?'/app?perfil=admin':'/app?perfil=loja'} className="imp-brand"><span className="imp-logo">D</span><span>DISTRE<small>SEU NEGÓCIO, ORGANIZADO</small></span></a>
    <span className="imp-nav-label">ÁREA DO CLIENTE</span>
    <nav aria-label="Área do Cliente" className="grid gap-2">
      {(Object.keys(sectionLabels) as ClientSection[]).map(s=><a key={s} href={clientUrl(s,lojaId)} aria-current={s===section?'page':undefined} className={s===section?'imp-nav-active':''}><Icon name={s==='materiais'?'book':s==='suporte'?'help':'grid'}/>{sectionLabels[s]}</a>)}
      <a href="/app?area=operacao"><Icon name="arrow"/> Acessar Operação</a>
    </nav>
    <div className="imp-sidebar-note"><span>Um passo de cada vez.</span><p>Da organização do catálogo à primeira operação, tudo em uma única jornada.</p></div>
    <div className="imp-profile"><span className="imp-avatar">{name?.[0]||'L'}</span><div>{name||'Minha loja'}<small>Jornada da loja</small></div></div>
  </aside>;
}
