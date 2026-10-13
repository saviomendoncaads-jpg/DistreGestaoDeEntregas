import type { ReactNode } from 'react';
import { useState } from 'react';
import './admin-master.css';
import './admin-content.css';
import './admin-overview.css';

export type MasterSection = 'overview' | 'empresas' | 'implantacao' | 'faturas' | 'relatorios' | 'planos' | 'assinaturas' | 'configuracoes';
const sections: {key: MasterSection; label: string; title: string; description: string; path: string}[] = [
  {key:'implantacao',label:'Implantação das lojas',title:'Implantação das lojas',description:'Acompanhe o progresso e as pendências de cada loja.',path:'M5 3v18M5 6h14M5 12h14M5 18h14'},
  {key:'overview',label:'Visão geral',title:'Visão geral da plataforma',description:'Acompanhe empresas, lojas e assinaturas e veja onde sua atenção é necessária.',path:'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z'},
  {key:'empresas',label:'Empresas e lojas',title:'Empresas e lojas',description:'Gerencie as empresas da plataforma e acesse a operação de cada loja.',path:'M3 21V3h12v18M15 9h6v12M7 7h4M7 11h4M7 15h4M2 21h20'},
  {key:'faturas',label:'Faturas e cobranças',title:'Faturas e cobranças',description:'Acompanhe vencimentos, pagamentos e pendências das assinaturas da plataforma.',path:'M6 3h9l4 4v14H6ZM14 3v5h5M9 12h7M9 16h5'},
  {key:'relatorios',label:'Relatórios e análises',title:'Relatórios e análises',description:'Entenda vendas, produtos, saída de estoque e desempenho das lojas com os registros da operação.',path:'M4 3v18h17M8 17v-4M13 17V9M18 17V5'},
  {key:'assinaturas',label:'Assinaturas',title:'Assinaturas das empresas',description:'Consulte o plano contratado, a situação da assinatura e a próxima cobrança de cada empresa.',path:'M5 3h14v18H5ZM8 8h8M8 12h8M8 16h5'},
  {key:'planos',label:'Planos',title:'Planos de assinatura',description:'Defina os planos oferecidos e os limites de lojas, entregas e entregadores.',path:'M3 5h18v14H3ZM3 10h18M7 15h4'},
  {key:'configuracoes',label:'Regras de cobrança',title:'Regras de cobrança',description:'Configure carência, encargos e os prazos de notificação usados pela plataforma.',path:'M4 7h16M4 17h16M8 4v6M16 14v6'},
];
export default function AdminMasterLayout({section,onNavigate,onLogout,connected,children}: {section: MasterSection; onNavigate:(section:MasterSection)=>void; onLogout:()=>void; connected:boolean; children:ReactNode}) {
  const current=sections.find(item=>item.key===section)!;
  const [menuOpen,setMenuOpen]=useState(false);
  return <div className="master-app">
    <aside className="master-sidebar" aria-label="Navegação administrativa">
      <a className="master-brand" href="/" aria-label="DISTRE — página inicial"><svg viewBox="0 0 40 32" fill="currentColor" aria-hidden="true"><path d="m1 3 12 13L1 29h9l12-13L10 3Zm16 0 12 13-12 13h9l12-13L26 3Z" /></svg><span>DISTRE</span></a>
      <span className="master-sidebar-label">ADMINISTRAÇÃO</span>
      <button type="button" className="master-mobile-menu" aria-label={menuOpen ? 'Fechar menu administrativo' : 'Abrir menu administrativo'} aria-expanded={menuOpen} aria-controls="master-navigation" onClick={()=>setMenuOpen(previous=>!previous)}><span>{current.label}</span><span>Menu <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d={menuOpen ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'}/></svg></span></button>
      <nav id="master-navigation" className={menuOpen ? 'is-mobile-open' : ''}>{sections.map(item=><button type="button" key={item.key} onClick={()=>{onNavigate(item.key);setMenuOpen(false);}} className={`master-nav ${item.key===section?'is-active':''}`} aria-current={item.key===section?'page':undefined}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={item.path}/></svg>{item.label}</button>)}</nav>
      <div className="master-sidebar-foot"><span className="master-avatar">AD</span><div><strong>Administrador</strong><small>Gestão da plataforma</small></div><button type="button" onClick={onLogout} aria-label="Sair da conta" title="Sair"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M9 4H4v16h5M10 12h11m-4-4 4 4-4 4"/></svg></button></div>
    </aside>
    <div className="master-main">
      <header className="master-topbar"><span>Plataforma <span aria-hidden="true">/</span> <strong>{current.label}</strong></span><div className="master-topbar-actions"><span className={`master-connection ${connected?'is-online':''}`} role="status"><i aria-hidden="true"/>{connected?'Conectado':'Reconectando'}</span><button type="button" className="master-mobile-logout" onClick={onLogout}>Sair</button></div></header>
      <main className="master-content"><div className="master-page-heading"><span>GESTÃO DO DISTRE</span><h1>{current.title}</h1><p>{current.description}</p></div>{children}</main>
    </div>
  </div>;
}
