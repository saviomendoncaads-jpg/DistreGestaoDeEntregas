import AdminContracts from './AdminContracts';
import type { AdminMasterProps } from './admin-props';
import AdminMasterLayout, {type MasterSection} from './AdminMasterLayout';
import AdminCompanies from './AdminCompanies';
import AdminFinance from './AdminFinance';
import AdminDialogs from './AdminDialogs';
import { useState } from 'react';
import AdminImplementation from './AdminImplementation';
import AdminOverview from './AdminOverview';
import AdminReports from './AdminReports';
export default function AdminMaster(props: AdminMasterProps) {
  const {setAdminSubView, setFinSubTab, isConnected, handleLogout, adminDataState, refreshAdminData} = props;
  const [section, setSection] = useState<MasterSection>(()=>new URLSearchParams(location.search).get('adminArea')==='implantacao'?'implantacao':'overview');
  const navigate = (next: MasterSection) => {
    setSection(next);
    if (next === 'overview' || next === 'implantacao') return;
    setAdminSubView(next === 'empresas' ? 'operacional' : 'financeiro');
    if (next !== 'empresas') setFinSubTab(['planos', 'assinaturas', 'configuracoes'].includes(next) ? 'planos_config' : next as 'faturas' | 'relatorios');
  };
  const required = section === 'empresas' ? ['empresas'] : section === 'overview' ? ['empresas', 'dashboard', 'assinaturas'] : section === 'faturas' ? ['empresas', 'dashboard', 'faturas'] : section === 'relatorios' ? [] : section === 'planos' ? ['planos'] : section === 'assinaturas' ? ['assinaturas'] : ['configuracoes'];
  const loading = required.some(key => !adminDataState[key] || adminDataState[key] === 'loading');
  const refreshing = required.some(key => adminDataState[key] === 'refreshing');
  const failed = required.some(key => adminDataState[key] === 'error');
  const overdue = () => {
    props.setFinPaginaAtual(1);
    props.setFinFaturasFiltros(previous => ({ ...previous, status: 'ATRASADA', empresaId: '', dataInicio: '', dataFim: '' }));
    navigate('faturas');
  };
  return <AdminMasterLayout section={section} onNavigate={navigate} connected={isConnected} onLogout={handleLogout}>
    {section !== 'relatorios' && section !== 'implantacao' && <div className="master-data-toolbar"><span role="status">{loading ? 'Carregando dados da plataforma…' : refreshing ? 'Atualizando dados da plataforma…' : failed ? 'Não foi possível atualizar os dados desta área.' : 'Dados carregados da plataforma'}</span><button type="button" className="btn btn-secondary" disabled={loading || refreshing} onClick={() => void refreshAdminData()}>Atualizar dados</button></div>}
    {section === 'implantacao' ? <AdminImplementation token={props.reportAccess.token}/> : section === 'relatorios' ? <AdminReports {...props}/> : failed ? <div className="master-data-error" role="alert"><strong>Não foi possível carregar esta área.</strong><p>Confira a conexão e tente atualizar os dados. Os indicadores serão exibidos após uma consulta bem-sucedida.</p></div> : loading ? <div className="master-loading" aria-busy="true"><div/><div/><div/><span>Preparando {section === 'overview' ? 'a visão geral' : 'os dados desta área'}…</span></div> : section === 'overview' ? <AdminOverview {...props} onNavigate={navigate} onOverdue={overdue}/> : section === 'empresas' ? <AdminCompanies {...props} /> : <AdminFinance {...props} section={section} />}
    {section==='assinaturas'&&<AdminContracts {...props}/>}
    <AdminDialogs {...props} />
  </AdminMasterLayout>;
}
