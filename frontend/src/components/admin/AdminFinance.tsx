import AdminForm from './AdminForm';
import { useState } from 'react';
import type { MasterSection } from './AdminMasterLayout';
import { downloadCsv, formatDate, billingPeriod } from './admin-utils';
const money = new Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL'});
import type { AdminMasterProps } from './admin-props';
type Props = Pick<AdminMasterProps, 'adminDataState' | 'finDashboard' | 'finSubTab' | 'finFaturasFiltros' | 'setFinFaturasFiltros' | 'empresas' | 'setShowCobrarManualForm' | 'finFaturas' | 'setShowBaixaManualForm' | 'setShowContestarForm' | 'setContestarMotivo' | 'handleCancelarFatura' | 'finTotalPaginas' | 'finPaginaAtual' | 'setFinPaginaAtual' | 'finRelFaturamento' | 'finRelInadimplencia' | 'finRelChurn' | 'finRelPrevisibilidade' | 'finConfiguracoes' | 'handleSalvarConfigCobranca' | 'setFinConfiguracoes' | 'startNovoPlano' | 'finPlanos' | 'startEditPlano' | 'finAssinaturas'>;
export default function AdminFinance(props:Props & {section: MasterSection}) {
const {
  finDashboard,
  finSubTab,
  finFaturasFiltros,
  setFinFaturasFiltros,
  empresas,
  setShowCobrarManualForm,
  finFaturas,
  setShowBaixaManualForm,
  setShowContestarForm,
  setContestarMotivo,
  handleCancelarFatura,
  finTotalPaginas,
  finPaginaAtual,
  setFinPaginaAtual,
  finRelFaturamento,
  finRelInadimplencia,
  finRelChurn,
  finRelPrevisibilidade,
  finConfiguracoes,
  handleSalvarConfigCobranca,
  setFinConfiguracoes,
  startNovoPlano,
  finPlanos,
  startEditPlano,
  finAssinaturas
} = props;
const invoicesRefreshing = props.adminDataState.faturas === 'refreshing';
const revenueHistory = [...finRelFaturamento].sort((a,b) => billingPeriod(a.referencia) - billingPeriod(b.referencia));
const delinquencyHistory = [...finRelInadimplencia].sort((a,b) => billingPeriod(a.referencia) - billingPeriod(b.referencia));
const cancellationHistory = [...finRelChurn].sort((a,b) => billingPeriod(a.referencia) - billingPeriod(b.referencia));
const projectionHistory = [...finRelPrevisibilidade].sort((a,b) => a.diaVencimento - b.diaVencimento);
const [subscriptionQuery, setSubscriptionQuery] = useState('');
const [subscriptionStatus, setSubscriptionStatus] = useState('');
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
const filteredSubscriptions = finAssinaturas.filter(sub => (!subscriptionStatus || sub.status === subscriptionStatus) && normalize(sub.empresaNome + ' ' + sub.cnpj + ' ' + sub.planoNome).includes(normalize(subscriptionQuery)));
const exportInvoices = () => downloadCsv('distre-faturas-pagina-' + finPaginaAtual, ['ID','Empresa','CNPJ','Referência','Bruto','Desconto','Líquido','Vencimento','Pagamento','Status'], finFaturas.map(fat => [fat.id,fat.empresaNome,fat.cnpj,fat.referenciaMesAno,fat.valorBruto,fat.valorDesconto,fat.valorLiquido,formatDate(fat.dataVencimento),formatDate(fat.dataPagamento),fat.status]));
const exportSubscriptions = () => downloadCsv('distre-assinaturas', ['Empresa','CNPJ','Plano','Valor','Dia de vencimento','Status','Próxima cobrança'], filteredSubscriptions.map(sub => [sub.empresaNome,sub.cnpj,sub.planoNome,sub.valorEfetivo,sub.diaVencimento,sub.status,formatDate(sub.proximoFaturamento)]));
const clearInvoiceFilters = () => { setFinPaginaAtual(1); setFinFaturasFiltros(previous => ({ ...previous, status:'', empresaId:'', dataInicio:'', dataFim:'' })); };
return (
          <div className="financeiro-panel-container master-layout-28" >
            {/* KPI Cards Grid */}
            {['faturas','relatorios'].includes(props.section) && <div className="report-kpi-grid master-surface-29" >
              <div className="report-kpi-card master-surface-30" >
                <span className="kpi-label">Receita recorrente mensal</span>
                <span className="kpi-value master-text-31" >
                  R$ {finDashboard?.mrrAtual.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0,00'}
                </span>
                <span className="master-label-15" >
                  Projetado próximo mês: R$ {finDashboard?.mrrProjetado.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}
                </span>
              </div>
              <div className="report-kpi-card master-surface-32" >
                <span className="kpi-label">Cobranças em Aberto</span>
                <span className="kpi-value master-text-33" >
                  {finDashboard?.totalFaturasEmAberto || 0} faturas
                </span>
                <span className="master-label-15" >
                  Total: R$ {finDashboard?.valorEmAberto.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}
                </span>
              </div>
              <div className="report-kpi-card master-surface-34" >
                <span className="kpi-label">Inadimplência</span>
                <span className="kpi-value master-text-35" >
                  {finDashboard?.taxaInadimplencia || 0}%
                </span>
                <span className="master-label-15" >
                  {finDashboard?.lojasInadimplentes || 0} de {finDashboard?.totalLojas || 0} lojas atrasadas
                </span>
              </div>
              <div className="report-kpi-card master-surface-36" >
                <span className="kpi-label">Receita líquida do mês</span>
                <span className="kpi-value master-text-1" >
                  R$ {finDashboard?.faturamentoLiquidoMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}
                </span>
                <span className="master-label-15" >
                  Faturamento bruto: R$ {finDashboard?.faturamentoBrutoMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) || '0,00'}
                </span>
              </div>
            </div>

            }
            {/* TAB: FATURAS */}
            {props.section === 'faturas' && finSubTab === 'faturas' && (
              <div className="master-layout-37" >
                {/* Filtros e Nova Cobrança */}
                <div className="master-finance-toolbar"><div className="master-filter-tabs" role="group" aria-label="Atalhos de status de fatura">{[['','Todas'],['PENDENTE','Pendentes'],['ATRASADA','Atrasadas'],['PAGA','Pagas'],['CONTESTADA','Contestadas']].map(([value,label]) => <button type="button" key={value} aria-pressed={finFaturasFiltros.status === value} onClick={() => {setFinPaginaAtual(1); setFinFaturasFiltros(previous => ({...previous,status:value}));}}>{label}</button>)}</div><button type="button" className="btn btn-secondary" disabled={invoicesRefreshing || !finFaturas.length} onClick={exportInvoices}>Exportar página em CSV</button></div>
                <div className="card master-layout-38" >
                  <div className="master-filter-grid master-layout-39" >
                    <div className="form-group master-surface-5" >
                      <label className="master-label-15" htmlFor="master-adminfinance-field-1" >Empresa</label>
                      <select id="master-adminfinance-field-1"
                        className="form-input master-surface-40"
                        
                        value={finFaturasFiltros.empresaId}
                        onChange={e => { setFinPaginaAtual(1); setFinFaturasFiltros(prev => ({ ...prev, empresaId: e.target.value })); }}
                      >
                        <option value="">Todas as Empresas</option>
                        {empresas.map(emp => (
                          <option key={emp.id} value={emp.id}>{emp.nome}</option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group master-surface-5" >
                      <label className="master-label-15" htmlFor="master-adminfinance-field-2" >Status</label>
                      <select id="master-adminfinance-field-2"
                        className="form-input master-surface-40"
                        
                        value={finFaturasFiltros.status}
                        onChange={e => { setFinPaginaAtual(1); setFinFaturasFiltros(prev => ({ ...prev, status: e.target.value })); }}
                      >
                        <option value="">Todos os Status</option>
                        <option value="PAGA">Paga</option>
                        <option value="PENDENTE">Pendente</option>
                        <option value="ATRASADA">Atrasada</option>
                        <option value="CONTESTADA">Contestada</option>
                        <option value="CANCELADA">Cancelada</option>
                      </select>
                    </div>

                    <div className="form-group master-surface-5" >
                      <label className="master-label-15" htmlFor="master-adminfinance-field-3" >Vencimento Inicial</label>
                      <input id="master-adminfinance-field-3"
                        type="date"
                        className="form-input master-surface-40"
                        
                        max={finFaturasFiltros.dataFim || undefined}
                        value={finFaturasFiltros.dataInicio}
                        onChange={e => { setFinPaginaAtual(1); setFinFaturasFiltros(prev => ({ ...prev, dataInicio: e.target.value })); }}
                      />
                    </div>

                    <div className="form-group master-surface-5" >
                      <label className="master-label-15" htmlFor="master-adminfinance-field-4" >Vencimento Final</label>
                      <input id="master-adminfinance-field-4"
                        type="date"
                        className="form-input master-surface-40"
                        
                        min={finFaturasFiltros.dataInicio || undefined}
                        value={finFaturasFiltros.dataFim}
                        onChange={e => { setFinPaginaAtual(1); setFinFaturasFiltros(prev => ({ ...prev, dataFim: e.target.value })); }}
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn btn-success master-button-41"
                    
                    onClick={() => setShowCobrarManualForm(true)}
                  >
                    + Cobrança Manual
                  </button>
                </div>

                {(finFaturasFiltros.empresaId || finFaturasFiltros.status || finFaturasFiltros.dataInicio || finFaturasFiltros.dataFim) && <button type="button" className="master-clear" onClick={clearInvoiceFilters}>Limpar filtros de faturas</button>}
                <p className="master-context-note">{finFaturas.length} faturas nesta página · Página {finPaginaAtual} de {finTotalPaginas}. A exportação contém apenas a página exibida.</p>
                {/* Tabela de Faturas */}
                <div className="card master-surface-42" >
                  <div className="lojas-table-container">
                    <table className="lojas-table master-invoice-table">
                      <thead>
                        <tr>
                          <th>ID / Ref</th>
                          <th>Empresa</th>
                          <th>CNPJ</th>
                          <th>Mes/Ano</th>
                          <th>Bruto</th>
                          <th>Desconto</th>
                          <th>Líquido</th>
                          <th>Vencimento</th>
                          <th>Pagamento</th>
                          <th>Status</th>
                          <th className="master-surface-21" >Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoicesRefreshing ? <tr><td colSpan={11} className="master-surface-43" role="status">Atualizando faturas…</td></tr> : finFaturas.length === 0 ? (
                          <tr>
                            <td className="master-surface-43" colSpan={11} >
                              Nenhuma fatura encontrada com os filtros selecionados.
                            </td>
                          </tr>
                        ) : (
                          finFaturas.map(fat => {
                            let badgeColor = 'gray';
                            let statusText = fat.status;
                            if (fat.status === 'PAGA') { badgeColor = 'var(--color-emerald)'; statusText = 'Paga'; }
                            else if (fat.status === 'PENDENTE') { badgeColor = 'var(--color-amber)'; statusText = 'Pendente'; }
                            else if (fat.status === 'ATRASADA') { badgeColor = 'var(--color-rose)'; statusText = 'Atrasada'; }
                            else if (fat.status === 'CONTESTADA') { badgeColor = 'var(--color-purple)'; statusText = 'Contestada'; }
                            else if (fat.status === 'CANCELADA') { badgeColor = '#4b5563'; statusText = 'Cancelada'; }

                            return (
                              <tr key={fat.id}>
                                <td className="master-surface-44" >{fat.id}</td>
                                <td><strong>{fat.empresaNome}</strong></td>
                                <td className="master-surface-45" >{fat.cnpj}</td>
                                <td>{fat.referenciaMesAno}</td>
                                <td className="master-surface-46" >{money.format(fat.valorBruto)}</td>
                                <td className="master-surface-47" >-{money.format(fat.valorDesconto)}</td>
                                <td className="master-surface-48" >{money.format(fat.valorLiquido)}</td>
                                <td>{formatDate(fat.dataVencimento)}</td>
                                <td>{formatDate(fat.dataPagamento)}</td>
                                <td>
                                  <span style={{
                                    display: 'inline-block',
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '12px',
                                    fontSize: '0.7rem',
                                    fontWeight: 600,
                                    background: `rgba(${badgeColor === 'var(--color-emerald)' ? '16,185,129' : badgeColor === 'var(--color-amber)' ? '245,158,11' : badgeColor === 'var(--color-rose)' ? '244,63,94' : badgeColor === 'var(--color-purple)' ? '139,92,246' : '75,85,99'}, 0.15)`,
                                    color: badgeColor,
                                    border: `1px solid ${badgeColor}`
                                  }}>
                                    {statusText}
                                  </span>
                                </td>
                                <td>
                                  <div className="master-layout-49" >
                                    {fat.status !== 'PAGA' && fat.status !== 'CANCELADA' && (
                                      <>
                                        <button
                                          type="button"
                                          className="btn btn-small btn-success master-button-50"
                                          
                                          onClick={() => setShowBaixaManualForm(fat.id)}
                                        >
                                          Baixar
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-small master-button-51"
                                          
                                          onClick={() => {
                                            setShowContestarForm(fat.id);
                                            setContestarMotivo('');
                                          }}
                                        >
                                          Contestar
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-small master-button-52"
                                          
                                          onClick={() => handleCancelarFatura(fat.id)}
                                        >
                                          Cancelar
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Paginação */}
                  {finTotalPaginas > 1 && (
                    <div className="master-layout-53" >
                      <span className="master-label-6" >
                        Página <strong>{finPaginaAtual}</strong> de <strong>{finTotalPaginas}</strong>
                      </span>
                      <div className="master-layout-54" >
                        <button
                          type="button"
                          className="btn btn-small"
                          disabled={finPaginaAtual === 1}
                          onClick={() => setFinPaginaAtual(prev => Math.max(prev - 1, 1))}
                        >
                          Anterior
                        </button>
                        <button
                          type="button"
                          className="btn btn-small"
                          disabled={finPaginaAtual >= finTotalPaginas}
                          onClick={() => setFinPaginaAtual(prev => Math.min(prev + 1, finTotalPaginas))}
                        >
                          Próximo
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB: RELATORIOS */}
            {props.section === 'relatorios' && finSubTab === 'relatorios' && (
              <div className="master-layout-28" >
                <div className="master-fin-grid master-grid-55" >
                  {/* Gráfico 1: Faturamento Bruto vs Líquido */}
                  <div className="card master-surface-56" >
                    <h3 className="master-title-57" >Receita mensal de faturas pagas</h3><p className="master-context-note">Até cinco meses no gráfico. O CSV contém todo o histórico retornado.</p><button type="button" className="master-clear" disabled={!revenueHistory.length} onClick={() => downloadCsv('distre-receita',['Referência','Bruto','Líquido'],revenueHistory.map(row => [row.referencia,row.bruto,row.liquido]))}>Exportar receita em CSV</button>
                    {revenueHistory.length === 0 ? (
                      <div className="master-surface-58" >Sem dados históricos suficientes.</div>
                    ) : (
                      <div>
                        {/* Renderizar Gráfico SVG */}
                        <svg className="master-surface-59" width="100%" height="220" viewBox="0 0 500 220" >
                          <line x1="50" y1="20" x2="480" y2="20" stroke="#e2e8f0" strokeDasharray="3,3" />
                          <line x1="50" y1="70" x2="480" y2="70" stroke="#e2e8f0" strokeDasharray="3,3" />
                          <line x1="50" y1="120" x2="480" y2="120" stroke="#e2e8f0" strokeDasharray="3,3" />
                          <line x1="50" y1="170" x2="480" y2="170" stroke="var(--border-thin)" strokeWidth="1" />
                          
                          {/* Desenha as barras */}
                          {(() => {
                            const maxVal = Math.max(...revenueHistory.slice(-5).map(d => Math.max(d.bruto, d.liquido)), 100);
                            const scale = 150 / maxVal;
                            
                            return revenueHistory.slice(-5).map((d, idx) => {
                              const x = 80 + idx * 80;
                              const hBruto = d.bruto * scale;
                              const hLiquido = d.liquido * scale;
                              
                              return (
                                <g key={d.referencia}>
                                  {/* Barra Bruto (Blue) */}
                                  <rect x={x} y={170 - hBruto} width="18" height={hBruto} fill="url(#gradBruto)" rx="2" stroke="var(--color-blue)" strokeWidth="0.5" />
                                  {/* Barra Liquido (Emerald) */}
                                  <rect x={x + 22} y={170 - hLiquido} width="18" height={hLiquido} fill="url(#gradLiquido)" rx="2" stroke="var(--color-emerald)" strokeWidth="0.5" />
                                  
                                  {/* Labels */}
                                  <text x={x + 20} y="185" fill="var(--text-secondary)" fontSize="9" textAnchor="middle">{d.referencia}</text>
                                  {d.bruto > 0 && <text x={x + 9} y={165 - hBruto} fill="var(--color-blue)" fontSize="8" textAnchor="middle">R$ {d.bruto.toFixed(0)}</text>}
                                  {d.liquido > 0 && <text x={x + 31} y={165 - hLiquido} fill="var(--color-emerald)" fontSize="8" textAnchor="middle">R$ {d.liquido.toFixed(0)}</text>}
                                </g>
                              );
                            });
                          })()}
                          <defs>
                            <linearGradient id="gradBruto" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="var(--color-blue)" stopOpacity="1" />
                              <stop offset="100%" stopColor="rgba(59, 130, 246, 0.2)" stopOpacity="0.2" />
                            </linearGradient>
                            <linearGradient id="gradLiquido" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="var(--color-emerald)" stopOpacity="1" />
                              <stop offset="100%" stopColor="rgba(16, 185, 129, 0.2)" stopOpacity="0.2" />
                            </linearGradient>
                          </defs>
                        </svg>
                        <div className="master-layout-60" >
                          <div className="master-layout-61" >
                            <span className="master-text-62" ></span>
                            Faturamento Bruto
                          </div>
                          <div className="master-layout-61" >
                            <span className="master-text-63" ></span>
                            Faturamento Líquido
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Gráfico 2: Taxa de Inadimplência */}
                  <div className="card master-surface-56" >
                    <h3 className="master-title-57" >Inadimplência por mês</h3><button type="button" className="master-clear" disabled={!delinquencyHistory.length} onClick={() => downloadCsv('distre-inadimplencia',['Referência','Taxa de inadimplência (%)'],delinquencyHistory.map(row => [row.referencia,row.taxaInadimplencia]))}>Exportar inadimplência em CSV</button>
                    {delinquencyHistory.length === 0 ? (
                      <div className="master-surface-58" >Sem dados suficientes.</div>
                    ) : (
                      <div>
                        <svg className="master-surface-59" width="100%" height="220" viewBox="0 0 500 220" >
                          <line x1="50" y1="20" x2="480" y2="20" stroke="#e2e8f0" strokeDasharray="3,3" />
                          <line x1="50" y1="70" x2="480" y2="70" stroke="#e2e8f0" strokeDasharray="3,3" />
                          <line x1="50" y1="120" x2="480" y2="120" stroke="#e2e8f0" strokeDasharray="3,3" />
                          <line x1="50" y1="170" x2="480" y2="170" stroke="var(--border-thin)" strokeWidth="1" />
                          
                          {/* Desenhar linha/pontos */}
                          {(() => {
                            const points: string[] = [];
                            delinquencyHistory.slice(-5).forEach((d, idx) => {
                              const x = 80 + idx * 80;
                              const y = 170 - (d.taxaInadimplencia * 1.5);
                              points.push(`${x},${y}`);
                            });
                            
                            return (
                              <g>
                                {points.length > 1 && (
                                  <polyline
                                    fill="none"
                                    stroke="var(--color-rose)"
                                    strokeWidth="2.5"
                                    points={points.join(' ')}
                                  />
                                )}
                                {delinquencyHistory.slice(-5).map((d, idx) => {
                                  const x = 80 + idx * 80;
                                  const y = 170 - (d.taxaInadimplencia * 1.5);
                                  return (
                                    <g key={d.referencia}>
                                      <circle cx={x} cy={y} r="5" fill="var(--bg-card)" stroke="var(--color-rose)" strokeWidth="2.5" />
                                      <text x={x} y="185" fill="var(--text-secondary)" fontSize="9" textAnchor="middle">{d.referencia}</text>
                                      <text x={x} y={y - 10} fill="var(--color-rose)" fontSize="9" textAnchor="middle" fontWeight="bold">{d.taxaInadimplencia}%</text>
                                    </g>
                                  );
                                })}
                              </g>
                            );
                          })()}
                        </svg>
                        <div className="master-surface-64" >
                          Valor líquido das faturas atrasadas dividido pelo valor líquido de todas as faturas emitidas na referência. O indicador de lojas acima usa uma base diferente.
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="master-fin-grid master-grid-55" >
                  {/* Churn Rate Financeiro */}
                  <div className="card master-surface-56" >
                    <h3 className="master-title-57" >Receita perdida por cancelamentos</h3><button type="button" className="master-clear" disabled={!cancellationHistory.length} onClick={() => downloadCsv('distre-cancelamentos',['Referência','Faturas','Faturas canceladas','Receita total','Receita perdida','Taxa (%)'],cancellationHistory.map(row => [row.referencia,row.faturasTotal,row.faturasCanceladas,row.receitaTotal,row.receitaPerdida,row.churnRate]))}>Exportar cancelamentos em CSV</button>
                    <div className="lojas-table-container">
                      <table className="lojas-table master-surface-65" >
                        <thead>
                          <tr>
                            <th>Referência</th>
                            <th>Faturas Emitidas</th>
                            <th>Faturas Canceladas</th>
                            <th>Receita Total</th>
                            <th>Receita Perdida</th>
                            <th>Receita cancelada (%)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cancellationHistory.length === 0 ? (
                            <tr>
                              <td className="master-surface-66" colSpan={6} >Sem dados de cancelamento.</td>
                            </tr>
                          ) : (
                            cancellationHistory.map(d => (
                              <tr key={d.referencia}>
                                <td className="master-surface-67" >{d.referencia}</td>
                                <td>{d.faturasTotal}</td>
                                <td className="master-text-35" >{d.faturasCanceladas}</td>
                                <td>{money.format(d.receitaTotal)}</td>
                                <td className="master-text-35" >{money.format(d.receitaPerdida)}</td>
                                <td>
                                  <strong style={{ color: d.churnRate > 0 ? 'var(--color-rose)' : 'var(--color-emerald)' }}>
                                    {d.churnRate}%
                                  </strong>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Relatório de Previsibilidade */}
                  <div className="card master-surface-56" >
                    <h3 className="master-title-57" >Previsibilidade por dia de vencimento</h3><p className="master-context-note">Projeção baseada nas assinaturas retornadas, sem considerar novos contratos ou cancelamentos futuros.</p><button type="button" className="master-clear" disabled={!projectionHistory.length} onClick={() => downloadCsv('distre-previsibilidade',['Dia de vencimento','Assinaturas','Receita mensal projetada'],projectionHistory.map(row => [row.diaVencimento,row.totalAssinaturas,row.mrrProjetado]))}>Exportar previsibilidade em CSV</button>
                    <div className="lojas-table-container">
                      <table className="lojas-table master-surface-65" >
                        <thead>
                          <tr>
                            <th>Dia Vencimento</th>
                            <th>Total de Assinaturas</th>
                            <th>Faturamento Projetado (MRR)</th>
                            <th>Projeção Trimestral (3 Meses)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {projectionHistory.length === 0 ? (
                            <tr>
                              <td className="master-surface-66" colSpan={4} >Nenhuma assinatura ativa para previsão.</td>
                            </tr>
                          ) : (
                            projectionHistory.map(d => (
                              <tr key={d.diaVencimento}>
                                <td className="master-surface-67" >Dia {d.diaVencimento}</td>
                                <td>{d.totalAssinaturas} assinatura(s)</td>
                                <td className="master-surface-68" >{money.format(d.mrrProjetado)}</td>
                                <td className="master-surface-69" >{money.format((d.mrrProjetado * 3))}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: PLANOS E CONFIGURAÇÕES */}
            {finSubTab === 'planos_config' && (
              <div className="master-fin-grid master-grid-55" >
                
                {/* CONFIGURAÇÃO DE COBRANÇA */}
                {props.section === 'configuracoes' && <div className="card master-surface-56" >
                  <h3 className="master-title-57" >Configurações de Cobrança e Inadimplência</h3>
                  {finConfiguracoes && (
                    <AdminForm className="master-layout-37" onSubmit={handleSalvarConfigCobranca} >
                      <div className="form-group">
                        <label className="master-label-6" htmlFor="master-adminfinance-field-5" >Carência para Bloqueio de Acesso (Dias)</label>
                        <input id="master-adminfinance-field-5"
                          type="number"
                          min="0"
                          className="form-input"
                          value={finConfiguracoes.diasCarenciaBloqueio}
                          onChange={e => setFinConfiguracoes(prev => prev ? ({ ...prev, diasCarenciaBloqueio: parseInt(e.target.value) || 0 }) : prev)}
                          required
                        />
                        <span className="master-text-70" >Tempo limite com faturas vencidas antes de suspender acessos das lojas.</span>
                      </div>

                      <div className="master-fin-grid master-grid-71" >
                        <div className="form-group">
                          <label className="master-label-6" htmlFor="master-adminfinance-field-6" >Multa por Atraso (%)</label>
                          <input id="master-adminfinance-field-6"
                            type="number"
                          min="0"
                            step="0.01"
                            className="form-input"
                            value={finConfiguracoes.multaPercentual}
                            onChange={e => setFinConfiguracoes(prev => prev ? ({ ...prev, multaPercentual: parseFloat(e.target.value) || 0 }) : prev)}
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label className="master-label-6" htmlFor="master-adminfinance-field-7" >Juros ao Mês (%)</label>
                          <input id="master-adminfinance-field-7"
                            type="number"
                          min="0"
                            step="0.01"
                            className="form-input"
                            value={finConfiguracoes.jurosMesPercentual}
                            onChange={e => setFinConfiguracoes(prev => prev ? ({ ...prev, jurosMesPercentual: parseFloat(e.target.value) || 0 }) : prev)}
                            required
                          />
                        </div>
                      </div>

                      <div className="master-fin-grid master-grid-71" >
                        <div className="form-group">
                          <label className="master-label-6" htmlFor="master-adminfinance-field-8" >Notificar E-mail (Dias Antes)</label>
                          <input id="master-adminfinance-field-8"
                            type="number"
                          min="0"
                            className="form-input"
                            value={finConfiguracoes.emailNotificacaoDiasAntes}
                            onChange={e => setFinConfiguracoes(prev => prev ? ({ ...prev, emailNotificacaoDiasAntes: parseInt(e.target.value) || 0 }) : prev)}
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label className="master-label-6" htmlFor="master-adminfinance-field-9" >Notificar WhatsApp (Dias Atraso)</label>
                          <input id="master-adminfinance-field-9"
                            type="number"
                          min="0"
                            className="form-input"
                            value={finConfiguracoes.whatsappNotificacaoDiasAtraso}
                            onChange={e => setFinConfiguracoes(prev => prev ? ({ ...prev, whatsappNotificacaoDiasAtraso: parseInt(e.target.value) || 0 }) : prev)}
                            required
                          />
                        </div>
                      </div>

                      <button type="submit" className="btn btn-success master-button-72" >
                        Salvar Configurações
                      </button>
                    </AdminForm>
                  )}
                </div>

                }
                {/* PLANOS */}
                {props.section === 'planos' && <div className="card master-layout-73" >
                  <div className="master-layout-74" >
                    <h3 className="master-title-75" >Planos de Assinatura</h3>
                    <button type="button" className="btn btn-success btn-small" onClick={startNovoPlano}>
                      + Novo Plano
                    </button>
                  </div>
                  <div className="master-layout-76" >
                    {!finPlanos.length && <p className="master-context-note">Nenhum plano cadastrado. Crie um plano para definir os valores e limites da operação.</p>}
                    {finPlanos.map(plan => (
                      <div className="master-layout-77" key={plan.id} >
                        <div>
                          <strong className="master-text-31" >{plan.nome}</strong>
                          <span className="master-text-78" >
                            {money.format(plan.valorMensal)}/mês
                          </span>
                          <p className="master-surface-79" >
                            {plan.descricao}
                          </p><p className="master-context-note">Limites configurados na plataforma</p><div className="master-plan-limits"><span>{plan.limiteLojas == null ? 'Lojas ilimitadas' : plan.limiteLojas + ' lojas'}</span><span>{plan.limiteEntregasMes == null ? 'Entregas ilimitadas' : plan.limiteEntregasMes + ' entregas/mês'}</span><span>{plan.limiteMotoristas == null ? 'Entregadores ilimitados' : plan.limiteMotoristas + ' entregadores'}</span><span className={plan.ativo === false ? 'is-inactive' : ''}>{plan.ativo === false ? 'Inativo' : 'Ativo'}</span></div>
                        </div>
                        <button type="button" className="btn btn-small master-button-80" onClick={() => startEditPlano(plan)} >
                          Editar
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                }
                {/* ASSINATURAS DAS EMPRESAS */}
                {props.section === 'assinaturas' && <div className="card master-surface-81" >
                  <h3 className="master-title-57" >Assinaturas das empresas</h3><div className="master-directory-toolbar"><label className="master-search"><input type="search" aria-label="Buscar assinatura" placeholder="Empresa, CNPJ ou plano" value={subscriptionQuery} onChange={event => setSubscriptionQuery(event.target.value)}/></label><label className="master-status-filter"><span>Status</span><select aria-label="Status da assinatura" value={subscriptionStatus} onChange={event => setSubscriptionStatus(event.target.value)}><option value="">Todos</option><option value="ATIVA">Ativa</option><option value="TRIAL">Em teste</option><option value="ATRASADA">Atrasada</option><option value="SUSPENSA">Suspensa</option><option value="CANCELADA">Cancelada</option></select></label><span className="master-results" role="status">{filteredSubscriptions.length} de {finAssinaturas.length} assinaturas</span><button type="button" className="btn btn-secondary" disabled={!filteredSubscriptions.length} onClick={exportSubscriptions}>Exportar CSV</button>{(subscriptionQuery || subscriptionStatus) && <button type="button" className="master-clear" onClick={() => {setSubscriptionQuery('');setSubscriptionStatus('');}}>Limpar filtros</button>}</div>
                  <div className="lojas-table-container">
                    <table className="lojas-table master-surface-65" >
                      <thead>
                        <tr>
                          <th>Empresa</th>
                          <th>CNPJ</th>
                          <th>Plano</th>
                          <th>Valor Cobrado</th>
                          <th>Dia Vencimento</th>
                          <th>Status</th>
                          <th>Próxima Cobrança</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSubscriptions.length === 0 ? (
                          <tr>
                            <td className="master-surface-66" colSpan={7} >Nenhuma assinatura encontrada.</td>
                          </tr>
                        ) : (
                          filteredSubscriptions.map(sub => (
                            <tr key={sub.id}>
                              <td><strong>{sub.empresaNome}</strong></td>
                              <td className="master-surface-45" >{sub.cnpj}</td>
                              <td><span className="badge-tenant ativo master-text-82" >{sub.planoNome}</span></td>
                              <td className="master-surface-46" >{money.format(sub.valorEfetivo)}</td>
                              <td>Todo dia {sub.diaVencimento}</td>
                              <td>
                                {(() => {
                                  const estilos: Record<string, { bg: string; cor: string; label: string }> = {
                                    ATIVA:     { bg: 'rgba(16,185,129,0.1)', cor: 'var(--color-emerald)', label: 'Ativa' },
                                    TRIAL:     { bg: 'rgba(59,130,246,0.1)', cor: 'var(--color-blue, #3b82f6)', label: 'Trial' },
                                    ATRASADA:  { bg: 'rgba(245,158,11,0.1)', cor: 'var(--color-amber)', label: 'Atrasada' },
                                    SUSPENSA:  { bg: 'rgba(244,63,94,0.1)', cor: 'var(--color-rose)', label: 'Suspensa' },
                                    CANCELADA: { bg: 'rgba(75,85,99,0.15)', cor: '#9ca3af', label: 'Cancelada' },
                                  };
                                  const e = estilos[sub.status] ?? {bg:'#f1f5f9',cor:'#475569',label:sub.status || 'Não informado'};
                                  return (
                                    <span style={{
                                      display: 'inline-block',
                                      padding: '0.1rem 0.4rem',
                                      borderRadius: '4px',
                                      fontSize: '0.75rem',
                                      background: e.bg,
                                      color: e.cor
                                    }}>
                                      {e.label}
                                    </span>
                                  );
                                })()}
                              </td>
                              <td>{formatDate(sub.proximoFaturamento)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>}

              </div>
            )}
          </div>
        );
}
