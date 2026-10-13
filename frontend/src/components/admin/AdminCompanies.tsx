import StoreImplementationBadge from './StoreImplementationBadge';
import AdminForm from './AdminForm';
import { useState } from 'react';
import AccessKey from './AccessKey';
import { downloadCsv } from './admin-utils';
import type { AdminMasterProps } from './admin-props';
type Props = Pick<AdminMasterProps, 'reportAccess' | 'adminDataState' | 'refreshAdminData' | 'empresas' | 'setShowNovaEmpresaForm' | 'showNovaEmpresaForm' | 'handleCadastrarEmpresa' | 'novaEmpresaNome' | 'setNovaEmpresaNome' | 'novaEmpresaCnpj' | 'setNovaEmpresaCnpj' | 'novaEmpresaTelefone' | 'setNovaEmpresaTelefone' | 'novaEmpresaEmail' | 'setNovaEmpresaEmail' | 'expandedEmpresas' | 'lojasDaEmpresa' | 'showNovaLojaForm' | 'toggleEmpresaExpandida' | 'handleToggleEmpresa' | 'handleDeleteEmpresa' | 'setShowNovaLojaForm' | 'finPlanos' | 'carregarFinanceiroPlanos' | 'handleCadastrarLoja' | 'novaLojaNome' | 'setNovaLojaNome' | 'novaLojaCnpj' | 'setNovaLojaCnpj' | 'novaLojaUsuario' | 'setNovaLojaUsuario' | 'novaLojaSenha' | 'setNovaLojaSenha' | 'novaLojaPlanoId' | 'setNovaLojaPlanoId' | 'novaLojaCep' | 'setNovaLojaCep' | 'novaLojaEndereco' | 'setNovaLojaEndereco' | 'novaLojaNumero' | 'setNovaLojaNumero' | 'novaLojaBairro' | 'setNovaLojaBairro' | 'novaLojaCidade' | 'setNovaLojaCidade' | 'novaLojaUf' | 'setNovaLojaUf' | 'novaLojaRecebePedidos' | 'setNovaLojaRecebePedidos' | 'handleRegenerarChaveLoja' | 'handleToggleRecebePedidos' | 'setLojaVisualizada' | 'startEditLoja' | 'handleToggleLoja' | 'handleDeleteLoja'>;
export default function AdminCompanies(props:Props) {
const {
  empresas,
  setShowNovaEmpresaForm,
  showNovaEmpresaForm,
  handleCadastrarEmpresa,
  novaEmpresaNome,
  setNovaEmpresaNome,
  novaEmpresaCnpj,
  setNovaEmpresaCnpj,
  novaEmpresaTelefone,
  setNovaEmpresaTelefone,
  novaEmpresaEmail,
  setNovaEmpresaEmail,
  expandedEmpresas,
  lojasDaEmpresa,
  showNovaLojaForm,
  toggleEmpresaExpandida,
  handleToggleEmpresa,
  handleDeleteEmpresa,
  setShowNovaLojaForm,
  finPlanos,
  carregarFinanceiroPlanos,
  handleCadastrarLoja,
  novaLojaNome,
  setNovaLojaNome,
  novaLojaCnpj,
  setNovaLojaCnpj,
  novaLojaUsuario,
  setNovaLojaUsuario,
  novaLojaSenha,
  setNovaLojaSenha,
  novaLojaPlanoId,
  setNovaLojaPlanoId,
  novaLojaCep,
  setNovaLojaCep,
  novaLojaEndereco,
  setNovaLojaEndereco,
  novaLojaNumero,
  setNovaLojaNumero,
  novaLojaBairro,
  setNovaLojaBairro,
  novaLojaCidade,
  setNovaLojaCidade,
  novaLojaUf,
  setNovaLojaUf,
  novaLojaRecebePedidos,
  setNovaLojaRecebePedidos,
  handleRegenerarChaveLoja,
  handleToggleRecebePedidos,
  setLojaVisualizada,
  startEditLoja,
  handleToggleLoja,
  handleDeleteLoja
} = props;
const [query,setQuery]=useState(''); const [status,setStatus]=useState('todas'); const [sort,setSort]=useState('nome');
const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
const filteredEmpresas=empresas.filter(empresa => {
  const digits = query.replace(/\D/g, '');
  const matches = normalize(empresa.nome+' '+empresa.cnpj).includes(normalize(query)) || (digits.length > 0 && /^[\d\s./-]+$/.test(query) && empresa.cnpj.replace(/\D/g, '').includes(digits));
  return (status==='todas'||(status==='ativas'?empresa.ativo:!empresa.ativo)) && matches;
}).sort((a,b)=>sort==='lojas' ? (b.totalLojas ?? 0)-(a.totalLojas ?? 0) || a.nome.localeCompare(b.nome,'pt-BR') : a.nome.localeCompare(b.nome,'pt-BR'));
const totalLojas=empresas.reduce((sum,empresa)=>sum+(empresa.totalLojas||0),0);const lojasAtivas=empresas.reduce((sum,empresa)=>sum+(empresa.lojasAtivas||0),0);
return (
          <>
            {/* Stats Grid */}
            <div className="admin-stats-grid">
          <div className="admin-stat-card">
            <span className="admin-stat-label">Total de Empresas</span>
            <span className="admin-stat-value">{empresas.length}</span>
          </div>
          <div className="admin-stat-card">
            <span className="admin-stat-label">Lojas Cadastradas</span>
            <span className="admin-stat-value">{totalLojas}</span>
          </div>
          <div className="admin-stat-card">
            <span className="admin-stat-label">Lojas Ativas</span>
            <span className="admin-stat-value master-text-1" >{lojasAtivas}</span>
          </div>
        </div>

        {/* Botão de Nova Empresa */}
        <div className="admin-header">
          <h2>Empresas cadastradas</h2>
          <button
            className="btn btn-success"
            onClick={() => setShowNovaEmpresaForm(!showNovaEmpresaForm)}
          >
            {showNovaEmpresaForm ? 'Cancelar' : '+ Nova Empresa'}
          </button>
        </div>

        {/* Formulário de Nova Empresa */}
        {showNovaEmpresaForm && (
          <div className="card master-surface-2" >
            <h3 className="master-title-3" >Cadastrar empresa</h3>
            <AdminForm className="master-grid-4" onSubmit={handleCadastrarEmpresa} >
              <div className="form-group master-surface-5" >
                <label className="master-label-6" htmlFor="master-admincompanies-field-1" >Razão Social / Nome</label>
                <input id="master-admincompanies-field-1"
                  type="text"
                  className="form-input"
                  value={novaEmpresaNome}
                  onChange={e => setNovaEmpresaNome(e.target.value)}
                  placeholder="Ex.: Comércio Central Ltda"
                  required
                />
              </div>
              <div className="form-group master-surface-5" >
                <label className="master-label-6" htmlFor="master-admincompanies-field-2" >CNPJ</label>
                <input id="master-admincompanies-field-2"
                  type="text"
                  className="form-input"
                  value={novaEmpresaCnpj}
                  onChange={e => setNovaEmpresaCnpj(e.target.value)}
                  placeholder="Ex: 12.345.678/0001-99"
                  required
                />
              </div>
              <div className="form-group master-surface-5" >
                <label className="master-label-6" htmlFor="master-admincompanies-field-3" >Telefone (opcional)</label>
                <input id="master-admincompanies-field-3"
                  type="text"
                  className="form-input"
                  value={novaEmpresaTelefone}
                  onChange={e => setNovaEmpresaTelefone(e.target.value)}
                  placeholder="(11) 99999-9999"
                />
              </div>
              <div className="form-group master-surface-5" >
                <label className="master-label-6" htmlFor="master-admincompanies-field-4" >Email (opcional)</label>
                <input id="master-admincompanies-field-4"
                  type="email"
                  className="form-input"
                  value={novaEmpresaEmail}
                  onChange={e => setNovaEmpresaEmail(e.target.value)}
                  placeholder="email@empresa.com"
                />
              </div>
              <button type="submit" className="btn btn-success master-button-7" >Salvar Empresa</button>
            </AdminForm>
          </div>
        )}

        {/* Listagem de Empresas */}
        <div className="master-directory-toolbar"><label className="master-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></svg><input type="search" placeholder="Buscar empresa ou CNPJ" aria-label="Buscar empresa ou CNPJ" value={query} onChange={event=>setQuery(event.target.value)}/></label><label className="master-status-filter"><span>Status</span><select value={status} onChange={event=>setStatus(event.target.value)} aria-label="Filtrar empresas por status"><option value="todas">Todas</option><option value="ativas">Ativas</option><option value="inativas">Inativas</option></select></label><label className="master-status-filter"><span>Ordenar</span><select aria-label="Ordenar empresas" value={sort} onChange={event=>setSort(event.target.value)}><option value="nome">Nome A–Z</option><option value="lojas">Mais lojas</option></select></label><button type="button" className="btn btn-secondary" disabled={!filteredEmpresas.length} onClick={() => downloadCsv('distre-empresas',['Empresa','CNPJ','Telefone','Email','Lojas','Lojas ativas','Status'],filteredEmpresas.map(company=>[company.nome,company.cnpj,company.telefone,company.email,company.totalLojas ?? 0,company.lojasAtivas ?? 0,company.ativo ? 'Ativa' : 'Inativa']))}>Exportar CSV</button><span className="master-results" role="status">{filteredEmpresas.length} de {empresas.length} empresas</span>{(query || status !== 'todas') && <button type="button" className="master-clear" onClick={()=>{setQuery('');setStatus('todas');}}>Limpar filtros</button>}</div><div className="empresas-container">
          {filteredEmpresas.length === 0 ? (
            <div className="master-surface-8" >
              Nenhuma empresa encontrada. Ajuste a busca ou cadastre uma empresa.
            </div>
          ) : (
            filteredEmpresas.map(empresa => {
              const isExpanded = expandedEmpresas.includes(empresa.id);
              const lojas = lojasDaEmpresa[empresa.id] || [];
              const isNovaLojaAberta = showNovaLojaForm === empresa.id;

              return (
                <div key={empresa.id} className="empresa-card">
                  {/* Cabeçalho da Empresa */}
                  <div className="empresa-card-header">
                    <button type="button" className="empresa-header-info" aria-expanded={isExpanded} aria-label={`${isExpanded?'Recolher':'Ver lojas de'} ${empresa.nome}`} onClick={() => toggleEmpresaExpandida(empresa.id)}>
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        style={{
                          transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                          transition: 'transform 0.2s ease',
                          color: empresa.ativo ? 'var(--color-cyan)' : 'var(--text-secondary)'
                        }}
                      >
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                      <span className="empresa-name" style={{ textDecoration: empresa.ativo ? 'none' : 'line-through', opacity: empresa.ativo ? 1 : 0.6 }}>{empresa.nome}</span>
                      <span className="empresa-cnpj">{empresa.cnpj}</span>
                      <span className={`badge-tenant ${empresa.ativo ? 'ativo' : 'inativo'}`}>
                        {empresa.ativo ? 'Ativa' : 'Inativa'}
                      </span>
                    </button>

                    <div className="empresa-actions" onClick={e => e.stopPropagation()}>
                      <span className="master-text-9" >
                        {empresa.totalLojas || 0} loja(s)
                      </span>
                      <button
                        className="btn btn-small"
                        style={{
                          fontSize: '0.7rem',
                          padding: '0.2rem 0.5rem',
                          background: empresa.ativo ? 'rgba(244, 63, 94, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                          color: empresa.ativo ? 'var(--color-rose)' : 'var(--color-emerald)',
                          border: empresa.ativo ? '1px solid rgba(244, 63, 94, 0.2)' : '1px solid rgba(16, 185, 129, 0.2)'
                        }}
                        onClick={() => handleToggleEmpresa(empresa.id)}
                      >
                        {empresa.ativo ? 'Desativar' : 'Ativar'}
                      </button>
                      <button
                        className="icon-btn danger"
                        title="Excluir Empresa"
                        onClick={() => handleDeleteEmpresa(empresa.id)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Lojas da Empresa (Conteúdo Expandido) */}
                  {isExpanded && (props.adminDataState['lojas:' + empresa.id] === 'error' ? <div className="master-data-error" role="alert">Não foi possível carregar as lojas. <button type="button" className="master-clear" onClick={() => void props.refreshAdminData()}>Tentar novamente</button></div> : props.adminDataState['lojas:' + empresa.id] !== 'ready' ? <p className="master-context-note" role="status">Carregando lojas da empresa…</p> : (
                    <div className="empresa-card-content">
                      <div className="master-layout-10" >
                        <h4 className="master-title-11" >Lojas da empresa</h4>
                        <button
                          className="btn btn-success btn-small"
                          onClick={() => {
                            const abrindo = !isNovaLojaAberta;
                            setShowNovaLojaForm(abrindo ? empresa.id : null);
                            if (abrindo && finPlanos.length === 0) carregarFinanceiroPlanos();
                          }}
                        >
                          {isNovaLojaAberta ? 'Cancelar' : '+ Nova Loja'}
                        </button>
                      </div>

                      {/* Form Nova Loja */}
                      {isNovaLojaAberta && (
                        <div className="master-surface-12" >
                          <h5 className="master-title-13" >Cadastrar Nova Loja na Rede {empresa.nome}</h5>
                          <AdminForm className="master-grid-14" onSubmit={e => handleCadastrarLoja(e, empresa.id)} >
                            <div className="form-group master-surface-5" >
                              <label className="master-label-15" htmlFor="master-admincompanies-field-5" >Nome Fantasia</label>
                              <input id="master-admincompanies-field-5"
                                type="text"
                                className="form-input"
                                value={novaLojaNome}
                                onChange={e => setNovaLojaNome(e.target.value)}
                                placeholder="Loja Centro"
                                required
                              />
                            </div>
                            <div className="form-group master-surface-5" >
                              <label className="master-label-15" htmlFor="master-admincompanies-field-6" >CNPJ da Loja</label>
                              <input id="master-admincompanies-field-6"
                                type="text"
                                className="form-input"
                                value={novaLojaCnpj}
                                onChange={e => setNovaLojaCnpj(e.target.value)}
                                placeholder="00.000.000/0000-00"
                                required
                              />
                            </div>
                            <div className="form-group master-surface-5" >
                              <label className="master-label-15" htmlFor="master-admincompanies-field-7" >Usuário de Acesso</label>
                              <input id="master-admincompanies-field-7"
                                type="text"
                                className="form-input"
                                value={novaLojaUsuario}
                                onChange={e => setNovaLojaUsuario(e.target.value)}
                                placeholder="ex: lojacentro"
                                required
                              />
                            </div>
                            <div className="form-group master-surface-5" >
                              <label className="master-label-15" htmlFor="master-admincompanies-field-8" >Senha Inicial</label>
                              <input id="master-admincompanies-field-8"
                                type="password"
                                className="form-input"
                                value={novaLojaSenha}
                                onChange={e => setNovaLojaSenha(e.target.value)}
                                placeholder="Senha da loja"
                                required
                              />
                            </div>
                            <div className="form-group master-surface-5" >
                              <label className="master-label-15" htmlFor="master-admincompanies-field-9" >Plano de Assinatura</label>
                              <select id="master-admincompanies-field-9"
                                className="form-input"
                                value={novaLojaPlanoId}
                                onChange={e => setNovaLojaPlanoId(e.target.value)}
                                required
                              >
                                <option value="">Selecione o plano...</option>
                                {finPlanos.filter(p => p.ativo !== false).map(p => (
                                  <option key={p.id} value={p.id}>
                                    {p.nome} — R$ {Number(p.valorMensal).toFixed(2)}/mês
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="form-group master-surface-5" >
                              <label className="master-label-15" htmlFor="master-admincompanies-field-10" >CEP</label>
                              <input id="master-admincompanies-field-10"
                                type="text"
                                className="form-input"
                                value={novaLojaCep}
                                onChange={e => setNovaLojaCep(e.target.value)}
                                placeholder="00000-000"
                                maxLength={9}
                              />
                            </div>
                            <div className="form-group master-surface-5" >
                              <label className="master-label-15" htmlFor="master-admincompanies-field-11" >Endereço (Logradouro)</label>
                              <input id="master-admincompanies-field-11"
                                type="text"
                                className="form-input"
                                value={novaLojaEndereco}
                                onChange={e => setNovaLojaEndereco(e.target.value)}
                                placeholder="Rua das Flores"
                              />
                            </div>
                            <div className="form-group master-surface-5" >
                              <label className="master-label-15" htmlFor="master-admincompanies-field-12" >Número</label>
                              <input id="master-admincompanies-field-12"
                                type="text"
                                className="form-input"
                                value={novaLojaNumero}
                                onChange={e => setNovaLojaNumero(e.target.value)}
                                placeholder="123"
                              />
                            </div>
                            <div className="form-group master-surface-5" >
                              <label className="master-label-15" htmlFor="master-admincompanies-field-13" >Bairro</label>
                              <input id="master-admincompanies-field-13"
                                type="text"
                                className="form-input"
                                value={novaLojaBairro}
                                onChange={e => setNovaLojaBairro(e.target.value)}
                                placeholder="Bairro"
                              />
                            </div>
                            <div className="form-group master-surface-5" >
                              <label className="master-label-15" htmlFor="master-admincompanies-field-14" >Cidade</label>
                              <input id="master-admincompanies-field-14"
                                type="text"
                                className="form-input"
                                value={novaLojaCidade}
                                onChange={e => setNovaLojaCidade(e.target.value)}
                                placeholder="São Paulo"
                              />
                            </div>
                            <div className="form-group master-surface-5" >
                              <label className="master-label-15" htmlFor="master-admincompanies-field-15" >UF</label>
                              <input id="master-admincompanies-field-15"
                                type="text"
                                className="form-input"
                                value={novaLojaUf}
                                onChange={e => setNovaLojaUf(e.target.value.toUpperCase())}
                                placeholder="SP"
                                maxLength={2}
                              />
                            </div>
                            <div className="form-group master-layout-16" >
                              <input className="master-surface-17"
                                type="checkbox"
                                id="novaLojaRecebePedidos"
                                checked={novaLojaRecebePedidos}
                                onChange={e => setNovaLojaRecebePedidos(e.target.checked)}

                              />
                              <label className="master-label-18" htmlFor="novaLojaRecebePedidos" >
                                Separar pedidos antes da entrega
                              </label>
                            </div>
                            <button type="submit" className="btn btn-success master-button-19" >Salvar Loja</button>
                          </AdminForm>
                        </div>
                      )}

                      {/* Tabela de Lojas */}
                      <div className="lojas-table-container">
                        {lojas.length === 0 ? (
                          <div className="master-surface-20" >
                            {lojasDaEmpresa[empresa.id] === undefined ? 'Carregando lojas…' : 'Nenhuma loja cadastrada nesta empresa.'}
                          </div>
                        ) : (
                          <table className="lojas-table master-store-table">
                            <thead>
                              <tr>
                                <th>Loja</th>
                                <th>CNPJ</th>
                                <th>Usuário</th>
                                <th>Endereço</th>
                                <th>Chave de Acesso</th>
                                <th>Separação de pedidos</th>
                                <th>Status</th>
                                <th className="master-surface-21" >Ações</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lojas.map(loja => (
                                <tr key={loja.id}>
                                  <td><strong>{loja.nome}</strong><StoreImplementationBadge token={props.reportAccess.token} lojaId={loja.id}/><a className="master-store-link" href={`/loja/${encodeURIComponent(loja.id)}`} target="_blank" rel="noreferrer">Abrir loja online ↗</a></td>
                                  <td className="font-mono master-surface-22" >
                                    {loja.cnpj || <em className="master-surface-23" >Não informado</em>}
                                  </td>
                                  <td className="font-mono">{loja.usuario}</td>
                                  <td className="master-surface-24" >
                                    {loja.endereco ? (
                                      <>
                                        {loja.endereco}
                                        {loja.bairro && `, ${loja.bairro}`}
                                        {loja.cidade && ` - ${loja.cidade}`}
                                      </>
                                    ) : (
                                      <em className="master-surface-23" >Não informado</em>
                                    )}
                                  </td>
                                  <td>
                                    <div className="chave-acesso-box">
                                      <AccessKey value={loja.chaveAcesso} />
                                      <button
                                        type="button"
                                        className="icon-btn"
                                        title="Copiar Chave de Acesso"
                                        onClick={() => {
                                          navigator.clipboard.writeText(loja.chaveAcesso);
                                          alert('Chave copiada para a área de transferência!');
                                        }}
                                      >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                        </svg>
                                      </button>
                                      <button
                                        type="button"
                                        className="icon-btn"
                                        title="Regenerar Chave"
                                        onClick={() => handleRegenerarChaveLoja(empresa.id, loja.id)}
                                      >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                                        </svg>
                                      </button>
                                    </div>
                                  </td>
                                  <td>
                                    <button type="button"
                                      className={`badge-tenant ${loja.recebePedidos ? 'ativo' : 'inativo'}`}
                                      style={{ cursor: 'pointer', border: loja.recebePedidos ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(156, 163, 175, 0.3)', background: loja.recebePedidos ? 'rgba(245, 158, 11, 0.08)' : 'rgba(156, 163, 175, 0.08)', color: loja.recebePedidos ? 'var(--color-amber)' : '#9ca3af' }}
                                      onClick={() => handleToggleRecebePedidos(empresa.id, loja)}
                                      title="Clique para alternar Separação de pedidos"
                                    >
                                      {loja.recebePedidos ? 'Habilitada' : 'Desabilitada'}
                                    </button>
                                  </td>
                                  <td>
                                    <span className={`badge-tenant ${loja.ativo ? 'ativo' : 'inativo'}`}>
                                      {loja.ativo ? 'Ativa' : 'Inativa'}
                                    </span>
                                  </td>
                                  <td>
                                    <div className="master-layout-25" >
                                      <button
                                        className="btn btn-small btn-success master-button-26"

                                        onClick={() => setLojaVisualizada({ id: loja.id, nome: loja.nome, nomeEmpresa: empresa.nome })}
                                        disabled={!loja.ativo || !empresa.ativo}
                                        title={(!loja.ativo || !empresa.ativo) ? 'Não é possível visualizar painel de loja ou empresa inativa' : 'Visualizar Dashboard'}
                                      >
                                        Painel
                                      </button>
                                      <button
                                        className="btn btn-small master-button-27"

                                        onClick={() => startEditLoja(loja)}
                                        title="Editar Informações da Loja"
                                      >
                                        Editar
                                      </button>
                                      <button
                                        className="btn btn-small"
                                        style={{
                                          fontSize: '0.7rem',
                                          padding: '0.15rem 0.4rem',
                                          background: loja.ativo ? 'rgba(244, 63, 94, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                          color: loja.ativo ? 'var(--color-rose)' : 'var(--color-emerald)',
                                          border: loja.ativo ? '1px solid rgba(244, 63, 94, 0.2)' : '1px solid rgba(16, 185, 129, 0.2)'
                                        }}
                                        onClick={() => handleToggleLoja(empresa.id, loja.id)}
                                      >
                                        {loja.ativo ? 'Bloquear' : 'Liberar'}
                                      </button>
                                      <button
                                        className="icon-btn danger"
                                        title="Excluir Loja"
                                        onClick={() => handleDeleteLoja(empresa.id, loja.id)}
                                      >
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <polyline points="3 6 5 6 21 6" />
                                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                        </svg>
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>
      </>
    );
}
