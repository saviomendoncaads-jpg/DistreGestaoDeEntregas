import AdminForm from './AdminForm';
import AdminDialog from './AdminDialog';
import { createPortal } from 'react-dom';
import type { AdminMasterProps } from './admin-props';
type Props = Pick<AdminMasterProps, 'showCobrarManualForm' | 'setShowCobrarManualForm' | 'handleCobrarManual' | 'manualCobrarEmpresaId' | 'setManualCobrarEmpresaId' | 'empresas' | 'manualCobrarValor' | 'setManualCobrarValor' | 'manualCobrarDescricao' | 'setManualCobrarDescricao' | 'manualCobrarVencimento' | 'setManualCobrarVencimento' | 'manualCobrarError' | 'showBaixaManualForm' | 'setShowBaixaManualForm' | 'handleBaixaManual' | 'baixaManualComprovante' | 'setBaixaManualComprovante' | 'baixaManualObservacoes' | 'setBaixaManualObservacoes' | 'showContestarForm' | 'setShowContestarForm' | 'handleContestarFatura' | 'contestarMotivo' | 'setContestarMotivo' | 'showPlanoForm' | 'setShowPlanoForm' | 'handleSalvarPlano' | 'planoNome' | 'setPlanoNome' | 'planoDescricao' | 'setPlanoDescricao' | 'planoValorMensal' | 'setPlanoValorMensal' | 'planoLimiteEntregas' | 'setPlanoLimiteEntregas' | 'planoLimiteLojas' | 'setPlanoLimiteLojas' | 'planoLimiteMotoristas' | 'setPlanoLimiteMotoristas' | 'planoError' | 'editingLoja' | 'setEditingLoja' | 'handleUpdateLoja' | 'editLojaNome' | 'setEditLojaNome' | 'editLojaCnpj' | 'setEditLojaCnpj' | 'editLojaUsuario' | 'setEditLojaUsuario' | 'editLojaSenha' | 'setEditLojaSenha' | 'editLojaCep' | 'setEditLojaCep' | 'editLojaUf' | 'setEditLojaUf' | 'editLojaEndereco' | 'setEditLojaEndereco' | 'editLojaNumero' | 'setEditLojaNumero' | 'editLojaBairro' | 'setEditLojaBairro' | 'editLojaCidade' | 'setEditLojaCidade' | 'editLojaRecebePedidos' | 'setEditLojaRecebePedidos'>;
export default function AdminDialogs(props:Props) {
const {
  showCobrarManualForm,
  setShowCobrarManualForm,
  handleCobrarManual,
  manualCobrarEmpresaId,
  setManualCobrarEmpresaId,
  empresas,
  manualCobrarValor,
  setManualCobrarValor,
  manualCobrarDescricao,
  setManualCobrarDescricao,
  manualCobrarVencimento,
  setManualCobrarVencimento,
  manualCobrarError,
  showBaixaManualForm,
  setShowBaixaManualForm,
  handleBaixaManual,
  baixaManualComprovante,
  setBaixaManualComprovante,
  baixaManualObservacoes,
  setBaixaManualObservacoes,
  showContestarForm,
  setShowContestarForm,
  handleContestarFatura,
  contestarMotivo,
  setContestarMotivo,
  showPlanoForm,
  setShowPlanoForm,
  handleSalvarPlano,
  planoNome,
  setPlanoNome,
  planoDescricao,
  setPlanoDescricao,
  planoValorMensal,
  setPlanoValorMensal,
  planoLimiteEntregas,
  setPlanoLimiteEntregas,
  planoLimiteLojas,
  setPlanoLimiteLojas,
  planoLimiteMotoristas,
  setPlanoLimiteMotoristas,
  planoError,
  editingLoja,
  setEditingLoja,
  handleUpdateLoja,
  editLojaNome,
  setEditLojaNome,
  editLojaCnpj,
  setEditLojaCnpj,
  editLojaUsuario,
  setEditLojaUsuario,
  editLojaSenha,
  setEditLojaSenha,
  editLojaCep,
  setEditLojaCep,
  editLojaUf,
  setEditLojaUf,
  editLojaEndereco,
  setEditLojaEndereco,
  editLojaNumero,
  setEditLojaNumero,
  editLojaBairro,
  setEditLojaBairro,
  editLojaCidade,
  setEditLojaCidade,
  editLojaRecebePedidos,
  setEditLojaRecebePedidos
} = props;
return <>{showCobrarManualForm && createPortal(
          <AdminDialog title="Gerar Cobrança Manual (Fatura Avulsa)" onClose={() => setShowCobrarManualForm(false)}>
            <div className="report-modal-content master-surface-83" onClick={(e) => e.stopPropagation()} >
              <div className="report-modal-header">
                <h2>Gerar Cobrança Manual (Fatura Avulsa)</h2>
                <button aria-label="Fechar formulário" type="button" className="report-modal-close-btn" onClick={() => setShowCobrarManualForm(false)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="report-modal-body">
                <AdminForm className="master-layout-84" onSubmit={handleCobrarManual} >
                  <div className="form-group">
                    <label className="master-label-6" htmlFor="master-admindialogs-field-1" >Empresa</label>
                    <select id="master-admindialogs-field-1"
                      className="form-input"
                      value={manualCobrarEmpresaId}
                      onChange={e => setManualCobrarEmpresaId(e.target.value)}
                      required
                    >
                      <option value="">Selecione uma empresa...</option>
                      {empresas.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.nome}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="master-label-6" htmlFor="master-admindialogs-field-2" >Valor Cobrado (R$)</label>
                    <input id="master-admindialogs-field-2"
                      type="number" min="0"
                      step="0.01"
                      className="form-input"
                      value={manualCobrarValor}
                      onChange={e => setManualCobrarValor(e.target.value)}
                      placeholder="Ex: 299.00"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="master-label-6" htmlFor="master-admindialogs-field-3" >Referência / Descrição</label>
                    <input id="master-admindialogs-field-3"
                      type="text"
                      className="form-input"
                      value={manualCobrarDescricao}
                      onChange={e => setManualCobrarDescricao(e.target.value)}
                      placeholder="Ex: Mensalidade extra"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="master-label-6" htmlFor="master-admindialogs-field-4" >Data de Vencimento</label>
                    <input id="master-admindialogs-field-4"
                      type="date"
                      className="form-input"
                      value={manualCobrarVencimento}
                      onChange={e => setManualCobrarVencimento(e.target.value)}
                      required
                    />
                  </div>
                  {manualCobrarError && (
                    <div className="master-surface-85" >{manualCobrarError}</div>
                  )}
                  <button type="submit" className="btn btn-success master-button-86" >Gerar Cobrança</button>
                </AdminForm>
              </div>
            </div>
          </AdminDialog>
        , document.body)}
{showBaixaManualForm && createPortal(
          <AdminDialog title="Dar Baixa Manual na Fatura" onClose={() => setShowBaixaManualForm(null)}>
            <div className="report-modal-content master-surface-83" onClick={(e) => e.stopPropagation()} >
              <div className="report-modal-header">
                <h2>Dar Baixa Manual na Fatura</h2>
                <button aria-label="Fechar formulário" type="button" className="report-modal-close-btn" onClick={() => setShowBaixaManualForm(null)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="report-modal-body">
                <AdminForm className="master-layout-84" onSubmit={handleBaixaManual} >
                  <div className="form-group">
                    <label className="master-label-6" htmlFor="master-admindialogs-field-5" >Fatura ID</label>
                    <input id="master-admindialogs-field-5" type="text" className="form-input" value={showBaixaManualForm} readOnly disabled />
                  </div>
                  <div className="form-group">
                    <label className="master-label-6" htmlFor="master-admindialogs-field-6" >Comprovante de Referência / Transação</label>
                    <input id="master-admindialogs-field-6"
                      type="text"
                      className="form-input"
                      value={baixaManualComprovante}
                      onChange={e => setBaixaManualComprovante(e.target.value)}
                      placeholder="Ex: Autenticação Pix E123456"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="master-label-6" htmlFor="master-admindialogs-field-7" >Observações</label>
                    <textarea id="master-admindialogs-field-7"
                      className="form-input master-surface-87"
                      value={baixaManualObservacoes}
                      onChange={e => setBaixaManualObservacoes(e.target.value)}
                      placeholder="Ex: Recebido via transferência bancária direta."
                      rows={3}
                      
                    />
                  </div>
                  <button type="submit" className="btn btn-success master-button-88" >Confirmar Pagamento</button>
                </AdminForm>
              </div>
            </div>
          </AdminDialog>
        , document.body)}
{showContestarForm && createPortal(
          <AdminDialog title="Marcar Fatura como Contestada" onClose={() => setShowContestarForm(null)}>
            <div className="report-modal-content master-surface-83" onClick={(e) => e.stopPropagation()} >
              <div className="report-modal-header">
                <h2>Marcar Fatura como Contestada</h2>
                <button aria-label="Fechar formulário" type="button" className="report-modal-close-btn" onClick={() => setShowContestarForm(null)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="report-modal-body">
                <AdminForm className="master-layout-84" onSubmit={handleContestarFatura} >
                  <div className="form-group">
                    <label className="master-label-6" htmlFor="master-admindialogs-field-8" >Fatura ID</label>
                    <input id="master-admindialogs-field-8" type="text" className="form-input" value={showContestarForm} readOnly disabled />
                  </div>
                  <div className="form-group">
                    <label className="master-label-6" htmlFor="master-admindialogs-field-9" >Motivo da Contestação</label>
                    <textarea id="master-admindialogs-field-9"
                      className="form-input master-surface-89"
                      value={contestarMotivo}
                      onChange={e => setContestarMotivo(e.target.value)}
                      placeholder="Descreva o motivo relatado pela empresa para a contestação da cobrança..."
                      rows={4}
                      required
                      
                    />
                  </div>
                  <button type="submit" className="btn btn-success master-button-90" >Registrar Contestação</button>
                </AdminForm>
              </div>
            </div>
          </AdminDialog>
        , document.body)}
{showPlanoForm && createPortal(
          <AdminDialog title={showPlanoForm.id ? 'Editar plano de assinatura' : 'Criar plano de assinatura'} onClose={() => setShowPlanoForm(null)}>
            <div className="report-modal-content master-surface-83" onClick={(e) => e.stopPropagation()} >
              <div className="report-modal-header">
                <h2>{showPlanoForm.id ? 'Editar Plano de Assinatura' : 'Criar Novo Plano de Assinatura'}</h2>
                <button aria-label="Fechar formulário" type="button" className="report-modal-close-btn" onClick={() => setShowPlanoForm(null)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="report-modal-body">
                <AdminForm className="master-layout-84" onSubmit={handleSalvarPlano} >
                  <div className="form-group">
                    <label className="master-label-6" htmlFor="master-admindialogs-field-10" >Nome do Plano</label>
                    <input id="master-admindialogs-field-10"
                      type="text"
                      className="form-input"
                      value={planoNome}
                      onChange={e => setPlanoNome(e.target.value)}
                      placeholder="Ex: Silver Plus"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="master-label-6" htmlFor="master-admindialogs-field-11" >Descrição do Plano</label>
                    <input id="master-admindialogs-field-11"
                      type="text"
                      className="form-input"
                      value={planoDescricao}
                      onChange={e => setPlanoDescricao(e.target.value)}
                      placeholder="Ex: Recomendado para redes médias"
                    />
                  </div>
                  <div className="form-group">
                    <label className="master-label-6" htmlFor="master-admindialogs-field-12" >Valor Mensal (R$)</label>
                    <input id="master-admindialogs-field-12"
                      type="number" min="0"
                      step="0.01"
                      className="form-input"
                      value={planoValorMensal}
                      onChange={e => setPlanoValorMensal(e.target.value)}
                      placeholder="Ex: 349.00"
                      required
                    />
                  </div>
                  <div className="master-fin-grid master-grid-91" >
                    <div className="form-group">
                      <label className="master-label-6" htmlFor="master-admindialogs-field-13" >Limite Entregas/Mês</label>
                      <input id="master-admindialogs-field-13"
                        type="number" min="0"
                        className="form-input"
                        value={planoLimiteEntregas}
                        onChange={e => setPlanoLimiteEntregas(e.target.value)}
                        placeholder="Sem limite"
                      />
                    </div>
                    <div className="form-group">
                      <label className="master-label-6" htmlFor="master-admindialogs-field-14" >Limite Lojas</label>
                      <input id="master-admindialogs-field-14"
                        type="number" min="0"
                        className="form-input"
                        value={planoLimiteLojas}
                        onChange={e => setPlanoLimiteLojas(e.target.value)}
                        placeholder="Sem limite"
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="master-label-6" htmlFor="master-admindialogs-field-15" >Limite de entregadores</label>
                    <input id="master-admindialogs-field-15"
                      type="number" min="0"
                      className="form-input"
                      value={planoLimiteMotoristas}
                      onChange={e => setPlanoLimiteMotoristas(e.target.value)}
                      placeholder="Sem limite"
                    />
                  </div>
                  {showPlanoForm.id && <label className="master-status-filter"><input type="checkbox" checked={showPlanoForm.ativo !== false} onChange={event => setShowPlanoForm(previous => previous ? ({...previous, ativo:event.target.checked}) : previous)}/>Plano ativo</label>}
                  {planoError && (
                    <div className="master-surface-85" >{planoError}</div>
                  )}
                  <button type="submit" className="btn btn-success master-button-88" >Salvar Plano</button>
                </AdminForm>
              </div>
            </div>
          </AdminDialog>
        , document.body)}
{editingLoja && createPortal(
          <AdminDialog title="Editar Informações da Loja" onClose={() => setEditingLoja(null)}>
            <div className="report-modal-content master-surface-83" onClick={(e) => e.stopPropagation()} >
              <div className="report-modal-header">
                <h2>Editar Informações da Loja</h2>
                <button aria-label="Fechar formulário" className="report-modal-close-btn" onClick={() => setEditingLoja(null)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="report-modal-body">
                <AdminForm className="master-layout-84" onSubmit={handleUpdateLoja} >
                  <div className="form-group">
                    <label className="master-label-6" htmlFor="master-admindialogs-field-16" >Nome Fantasia</label>
                    <input id="master-admindialogs-field-16" 
                      type="text" 
                      className="form-input" 
                      value={editLojaNome} 
                      onChange={e => setEditLojaNome(e.target.value)} 
                      required 
                    />
                  </div>
                  <div className="form-group">
                    <label className="master-label-6" htmlFor="master-admindialogs-field-17" >CNPJ da Loja</label>
                    <input id="master-admindialogs-field-17" 
                      type="text" 
                      className="form-input" 
                      value={editLojaCnpj} 
                      onChange={e => setEditLojaCnpj(e.target.value)} 
                      required 
                    />
                  </div>
                  <div className="form-group">
                    <label className="master-label-6" htmlFor="master-admindialogs-field-18" >Usuário de Acesso</label>
                    <input id="master-admindialogs-field-18" 
                      type="text" 
                      className="form-input" 
                      value={editLojaUsuario} 
                      onChange={e => setEditLojaUsuario(e.target.value)} 
                      required 
                    />
                  </div>
                  <div className="form-group">
                    <label className="master-label-6" htmlFor="master-admindialogs-field-19" >Alterar Senha (deixe em branco para manter a atual)</label>
                    <input id="master-admindialogs-field-19" 
                      type="password" 
                      className="form-input" 
                      value={editLojaSenha} 
                      onChange={e => setEditLojaSenha(e.target.value)} 
                      placeholder="Nova senha da loja"
                    />
                  </div>
                  <div className="master-fin-grid master-grid-91" >
                    <div className="form-group">
                      <label className="master-label-6" htmlFor="master-admindialogs-field-20" >CEP</label>
                      <input id="master-admindialogs-field-20"
                        type="text"
                        className="form-input"
                        value={editLojaCep}
                        onChange={e => setEditLojaCep(e.target.value)}
                        placeholder="00000-000"
                        maxLength={9}
                      />
                    </div>
                    <div className="form-group">
                      <label className="master-label-6" htmlFor="master-admindialogs-field-21" >UF</label>
                      <input id="master-admindialogs-field-21"
                        type="text"
                        className="form-input"
                        value={editLojaUf}
                        onChange={e => setEditLojaUf(e.target.value.toUpperCase())}
                        placeholder="SP"
                        maxLength={2}
                      />
                    </div>
                  </div>
                  <div className="master-fin-grid master-grid-92" >
                    <div className="form-group">
                      <label className="master-label-6" htmlFor="master-admindialogs-field-22" >Endereço (Logradouro)</label>
                      <input id="master-admindialogs-field-22"
                        type="text"
                        className="form-input"
                        value={editLojaEndereco}
                        onChange={e => setEditLojaEndereco(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="master-label-6" htmlFor="master-admindialogs-field-23" >Número</label>
                      <input id="master-admindialogs-field-23"
                        type="text"
                        className="form-input"
                        value={editLojaNumero}
                        onChange={e => setEditLojaNumero(e.target.value)}
                        placeholder="123"
                      />
                    </div>
                  </div>
                  <div className="master-fin-grid master-grid-91" >
                    <div className="form-group">
                      <label className="master-label-6" htmlFor="master-admindialogs-field-24" >Bairro</label>
                      <input id="master-admindialogs-field-24"
                        type="text"
                        className="form-input"
                        value={editLojaBairro}
                        onChange={e => setEditLojaBairro(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="master-label-6" htmlFor="master-admindialogs-field-25" >Cidade</label>
                      <input id="master-admindialogs-field-25"
                        type="text"
                        className="form-input"
                        value={editLojaCidade}
                        onChange={e => setEditLojaCidade(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="form-group master-layout-93" >
                    <input className="master-surface-17"
                      type="checkbox"
                      id="editLojaRecebePedidosMaster"
                      checked={editLojaRecebePedidos} 
                      onChange={e => setEditLojaRecebePedidos(e.target.checked)} 
                      
                    />
                    <label className="master-label-18" htmlFor="editLojaRecebePedidosMaster" >
                      Separar pedidos antes da entrega
                    </label>
                  </div>
                  <button type="submit" className="btn btn-success master-button-88" >Salvar Alterações</button>
                </AdminForm>
              </div>
            </div>
          </AdminDialog>
        , document.body)}</>;
}
