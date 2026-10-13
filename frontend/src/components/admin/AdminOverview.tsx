import type { AdminMasterProps } from './admin-props';
import type { MasterSection } from './AdminMasterLayout';
import { formatMoney } from './admin-utils';

export default function AdminOverview({ empresas, finDashboard: dashboard, finAssinaturas, onNavigate, onOverdue }: Pick<AdminMasterProps, 'empresas' | 'finDashboard' | 'finAssinaturas'> & { onNavigate: (section: MasterSection) => void; onOverdue: () => void }) {
  const stores = empresas.reduce((total, company) => total + (company.totalLojas ?? 0), 0);
  const activeStores = empresas.reduce((total, company) => total + (company.lojasAtivas ?? 0), 0);
  const withoutStores = empresas.filter(company => company.ativo && !company.totalLojas);
  const suspended = finAssinaturas.filter(subscription => subscription.status === 'SUSPENSA');
  const inactiveCompanies = empresas.filter(company => !company.ativo);
  const cards = [
    { label: 'Empresas da plataforma', value: empresas.length, note: `${empresas.filter(company => company.ativo).length} ativas`, section: 'empresas' as const },
    { label: 'Lojas em atividade', value: activeStores, note: `${stores} lojas cadastradas`, section: 'empresas' as const },
    { label: 'Receita recorrente mensal', value: dashboard ? formatMoney(dashboard.mrrAtual) : '—', note: 'Receita das assinaturas da plataforma', section: 'faturas' as const },
    { label: 'Valor em aberto', value: dashboard ? formatMoney(dashboard.valorEmAberto) : '—', note: dashboard ? `${dashboard.totalFaturasEmAberto} faturas em aberto` : 'Dados financeiros indisponíveis', section: 'faturas' as const },
  ];
  return <>
    <div className="master-overview-kpis">{cards.map(card => <button type="button" className="master-overview-kpi" key={card.label} onClick={() => onNavigate(card.section)}><span>{card.label}</span><strong>{card.value}</strong><small>{card.note}</small></button>)}</div>
    <div className="master-overview-grid">
      <section className="card master-attention"><div className="master-section-heading"><div><h2>Onde agir agora</h2><p>Situações da plataforma que merecem acompanhamento.</p></div><span className="master-live-label">Dados da plataforma</span></div>
        <button type="button" className="master-attention-row" onClick={onOverdue}><span className={`master-attention-number ${(dashboard?.lojasInadimplentes ?? 0) ? 'is-warning' : ''}`}>{dashboard?.lojasInadimplentes ?? '—'}</span><span><strong>Lojas com inadimplência</strong><small>Consulte as faturas atrasadas e os vencimentos.</small></span><span aria-hidden="true">→</span></button>
        <button type="button" className="master-attention-row" onClick={() => onNavigate('assinaturas')}><span className={`master-attention-number ${suspended.length ? 'is-warning' : ''}`}>{suspended.length}</span><span><strong>Assinaturas suspensas</strong><small>Confira o status e as regras de cobrança.</small></span><span aria-hidden="true">→</span></button>
        <button type="button" className="master-attention-row" onClick={() => onNavigate('empresas')}><span className="master-attention-number">{withoutStores.length}</span><span><strong>Empresas ativas sem lojas</strong><small>Continue o cadastro para iniciar a operação.</small></span><span aria-hidden="true">→</span></button>
        <p className="master-context-note">{inactiveCompanies.length} empresas inativas · {stores - activeStores} lojas inativas. A situação cadastral é independente do status da assinatura.</p>
      </section>
      <section className="card master-shortcuts"><div className="master-section-heading"><div><h2>Gestão da plataforma</h2><p>Entre direto no trabalho que precisa fazer.</p></div></div>
        {([{ section: 'empresas', title: 'Empresas e lojas', detail: 'Cadastro, acessos e operação das lojas' }, { section: 'faturas', title: 'Faturas e cobranças', detail: 'Vencimentos, baixas e contestações' }, { section: 'relatorios', title: 'Relatórios e análises', detail: 'Vendas, produtos e estoque das lojas' }, { section: 'assinaturas', title: 'Assinaturas das empresas', detail: 'Planos contratados e próximas cobranças' }] as const).map(item => <button type="button" key={item.section} onClick={() => onNavigate(item.section)}><span><strong>{item.title}</strong><small>{item.detail}</small></span><span aria-hidden="true">↗</span></button>)}
      </section>
    </div>
    <section className="card master-company-summary"><div className="master-section-heading"><div><h2>Empresas da plataforma</h2><p>Visão dos cadastros e das lojas vinculadas.</p></div><button type="button" className="btn btn-secondary" onClick={() => onNavigate('empresas')}>Ver todas as empresas</button></div>
      {empresas.length === 0 ? <p className="master-context-note">Cadastre a primeira empresa para começar.</p> : <div className="lojas-table-container"><table className="lojas-table"><thead><tr><th>Empresa</th><th>CNPJ</th><th>Lojas cadastradas</th><th>Lojas ativas</th><th>Cadastro</th></tr></thead><tbody>{[...empresas].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).slice(0, 8).map(company => <tr key={company.id}><td><strong>{company.nome}</strong></td><td>{company.cnpj}</td><td>{company.totalLojas ?? 0}</td><td>{company.lojasAtivas ?? 0}</td><td><span className={`badge-tenant ${company.ativo ? 'ativo' : 'inativo'}`}>{company.ativo ? 'Ativa' : 'Inativa'}</span></td></tr>)}</tbody></table></div>}
      {empresas.length > 8 && <p className="master-context-note">Exibindo 8 de {empresas.length} empresas. Abra o diretório para buscar e filtrar.</p>}
    </section>
  </>;
}
