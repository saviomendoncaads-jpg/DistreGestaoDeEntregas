import Icon from './Icon';
export default function Sidebar() {
  return <aside className="imp-sidebar flex flex-col bg-slate-950 text-white">
    <a href="/app" className="imp-brand"><span className="imp-logo">D</span><span>DISTRE<small>SEU NEGÓCIO, ORGANIZADO</small></span></a>
    <span className="imp-nav-label">ÁREA DO CLIENTE</span>
    <nav aria-label="Navegação da implantação" className="grid gap-2">
      <a href="#jornada" aria-current="page" className="imp-nav-active"><Icon name="grid" /> Minha implantação</a>
      <a href="#materiais"><Icon name="book" /> Materiais da jornada</a>
      <a href="#ajuda"><Icon name="help" /> Ajuda e orientação</a>
    </nav>
    <div className="imp-sidebar-note"><span>Um passo de cada vez.</span><p>Da organização do catálogo à primeira operação, tudo em uma única jornada.</p></div>
    <div className="imp-profile"><span className="imp-avatar">L</span><div>Minha loja<small>Implantação demonstrativa</small></div></div>
  </aside>;
}
