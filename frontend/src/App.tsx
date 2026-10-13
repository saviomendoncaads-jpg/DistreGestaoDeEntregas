import { solicitarCancelamento, avisarErro, confirmarAcao, avisarInfo, limparFeedback } from './ui/feedback';
import {pinPanelRole,getPanelSession,savePanelSession,clearPanelSession,sessionKey} from './auth/sessions';
import ManualDeliveryActions from './components/ManualDeliveryActions';
import ImplementationCard from './implantacao/ImplementationCard';
import type { ImplementationState } from './implantacao/api';
import ReturnStockAction from './components/ReturnStockAction';
import { comandasOperacionais } from './operationOrders';
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { io, Socket } from 'socket.io-client';
import CentroOperacoes, { type BrokerEvento } from './components/CentroOperacoes';
import OperationsWorkspace from './components/OperationsWorkspace';
import GestaoVitrine from './components/GestaoVitrine';
import GestaoProdutos from './components/GestaoProdutos';
import GestaoEstoque from './components/GestaoEstoque';
import OperationSettingsModal from './components/OperationSettingsModal';
import ConferenciaSeparacao from './components/ConferenciaSeparacao';
import EmissaoNotaModal from './components/fiscal/EmissaoNotaModal';
import ConfigFiscalModal from './components/fiscal/ConfigFiscalModal';
import {
  FiscalApi, NOME_MODELO,
  type DestinatarioNota, type EscolhaFiscal, type NotaCompleta, type NotaResumo, type StatusFiscal,
} from './components/fiscal/fiscalApi';
import { imprimirNota } from './components/fiscal/danfe';
import LoginScreen from './components/LoginScreen';
import AdminMaster from './components/admin/AdminMaster';
import type { Empresa, Loja } from './components/admin/admin-types';
import './App.css';

interface Localizacao {
  x: number;
  y: number;
}

interface NoRota extends Localizacao {
  name?: string;
}

interface Motorista {
  id: string;
  name: string;
  vehicleType: string;
  status: 'ocioso' | 'ocupado';
  codigoVinculo: string;
  dispositivoConectado: boolean;
  localizacaoAtual?: Localizacao;
  ultimaAtualizacao?: string;
  lojaId?: string;
}

interface Rota {
  distanceKm: number;
  durationSec: number;
  cost: number;
  path: NoRota[];
}

interface Telemetria {
  velocidadeKmh: number;
  temperaturaCelsius?: number;
  combustivelBateriaPct: number;
  localizacaoAtual: Localizacao;
  timestamp: string;
}

interface Incidente {
  id: string;
  tipo: 'traffic_jam' | 'flat_tire' | 'temperature_spike' | 'route_deviation' | 'webhook_timeout';
  descricao: string;
  gravidade: 'aviso' | 'critico';
  timestamp: string;
  resolvido: boolean;
}

interface LogWebhook {
  timestamp: string;
  url: string;
  payload: any;
  status: 'sucesso' | 'falha' | 'tentando';
  statusCode?: number;
  errorMessage?: string;
  attempt: number;
}

interface TipoVeiculo {
  id: string;
  name: string;
}

interface Entrega {
  id: string;
  nomeCliente: string;
  clienteDocumento?: string;
  endereco: string;
  itens: string[];
  prioridade: 'baixa' | 'media' | 'alta' | 'critica';
  tipoCarga: 'normal' | 'expressa' | 'agendado';
  status: 'RECEBIDO' | 'EM_PREPARO' | 'DESPACHADO' | 'EM_TRANSITO' | 'NO_LOCAL' | 'ENTREGUE' | 'RECUSADO_INSUCESSO' | 'ALERTA_INCIDENTE' | 'AGUARDANDO_RETORNO_CD' | 'PRODUTO_RETORNADO_ESTOQUE' | 'SLA_ALERTA' | 'CANCELADO';
  valor?: number;
  motorista?: Motorista;
  rota?: Rota;
  telemetria?: Telemetria;
  incidentes: Incidente[];
  urlWebhook?: string;
  logsWebhook: LogWebhook[];
  criadoEm: string;
  atualizadoEm: string;

  // Campos POD
  recebedorNome?: string;
  recebedorCPF?: string;
  comprovanteFotoUrl?: string;
  assinaturaBase64?: string;
  justificativaDesvioCoordenada?: string;

  // Módulo 6 — Engenharia de Dados
  formaPagamento?: 'maquininha' | 'pix' | 'dinheiro';
  romaneioId?: string;
  bairro?: string;
  cidade?: string;
  referencia?: string;
  despachadoEm?: string;
  dataHoraConclusao?: string;
  sequenciaEsperada?: number;

  // Multi-tenant
  lojaId?: string;
  nomeLoja?: string;
  nomeEmpresa?: string;
  tipoComanda?: 'pedido' | 'entrega';
  destinoLatitude?: number;
  destinoLongitude?: number;
  pedidoOrigemId?: string;
  entregaVinculadaId?: string;
}




const _viteBackend = (import.meta as any).env?.VITE_BACKEND_URL;
const BACKEND_URL = _viteBackend === undefined ? 'http://localhost:5000' : _viteBackend;

interface DadoPerformanceHistorico {
  id: string;
  data: string; // YYYY-MM-DD
  motoristaId: string;
  motoristaName: string;
  veiculo: string;
  status: 'sucesso' | 'cancelado';
  tempoEntregaMin: number;
  valor: number;
  avaliacao: number;
  bairro?: string;
  formaPagamento?: 'maquininha' | 'pix' | 'dinheiro';
  prioridade?: 'baixa' | 'media' | 'alta' | 'critica';
  incidentesCount?: number;
  incidentesTipos?: string[];
  romaneioId?: string;
  despachadoEm?: string;
}

// Histórico de performance baseado apenas em entregas reais — sem dados mockados estáticos
const HISTORICO_PERFORMANCE: DadoPerformanceHistorico[] = [];





interface Sessao {
  operacaoBloqueada?: boolean;
  tipo: 'admin' | 'loja';
  lojaId?: string;
  nomeLoja?: string;
  nomeEmpresa?: string;
  token: string;
  criadoEm?: string;
  recebePedidos?: boolean;
  latitude?: number;
  longitude?: number;
}

export default function App() {
  // --- ESTADOS MULTI-TENANT & AUTENTICAÇÃO ---
  const [activeRole]=useState(pinPanelRole);
  const [sessao,setSessao]=useState<Sessao|null>(()=>getPanelSession(activeRole));
  useEffect(()=>{const sync=(event:StorageEvent)=>{if(event.key===sessionKey(activeRole))setSessao(getPanelSession(activeRole));};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[activeRole]);

  const [loginUsuario, setLoginUsuario] = useState('');
  const [loginSenha, setLoginSenha] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginTab] = useState<'loja' | 'admin'>(activeRole);
  const [selectedDriverForDispatch, setSelectedDriverForDispatch] = useState('');
  const [dispatchViewActive, setDispatchViewActive] = useState(false);

  // Gerenciamento de Empresas no Painel Master
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [lojasDaEmpresa, setLojasDaEmpresa] = useState<Record<string, Loja[]>>({});
  const [expandedEmpresas, setExpandedEmpresas] = useState<string[]>([]);
  
  // Modais de Criação no Painel Master
  const [showNovaEmpresaForm, setShowNovaEmpresaForm] = useState(false);
  const [novaEmpresaNome, setNovaEmpresaNome] = useState('');
  const [novaEmpresaCnpj, setNovaEmpresaCnpj] = useState('');
  const [novaEmpresaTelefone, setNovaEmpresaTelefone] = useState('');
  const [novaEmpresaEmail, setNovaEmpresaEmail] = useState('');

  const [showNovaLojaForm, setShowNovaLojaForm] = useState<string | null>(null); // empresaId
  const [novaLojaNome, setNovaLojaNome] = useState('');
  const [novaLojaCnpj, setNovaLojaCnpj] = useState('');
  const [novaLojaUsuario, setNovaLojaUsuario] = useState('');
  const [novaLojaSenha, setNovaLojaSenha] = useState('');
  const [novaLojaEndereco, setNovaLojaEndereco] = useState('');
  const [novaLojaNumero, setNovaLojaNumero] = useState('');
  const [novaLojaBairro, setNovaLojaBairro] = useState('');
  const [novaLojaCidade, setNovaLojaCidade] = useState('');
  const [novaLojaUf, setNovaLojaUf] = useState('');
  const [novaLojaCep, setNovaLojaCep] = useState('');
  const [novaLojaRecebePedidos, setNovaLojaRecebePedidos] = useState(false);
  const [novaLojaPlanoId, setNovaLojaPlanoId] = useState('');

  const [editingLoja, setEditingLoja] = useState<Loja | null>(null);
  const [editLojaNome, setEditLojaNome] = useState('');
  const [editLojaCnpj, setEditLojaCnpj] = useState('');
  const [editLojaUsuario, setEditLojaUsuario] = useState('');
  const [editLojaSenha, setEditLojaSenha] = useState('');
  const [editLojaEndereco, setEditLojaEndereco] = useState('');
  const [editLojaNumero, setEditLojaNumero] = useState('');
  const [editLojaBairro, setEditLojaBairro] = useState('');
  const [editLojaCidade, setEditLojaCidade] = useState('');
  const [editLojaUf, setEditLojaUf] = useState('');
  const [editLojaCep, setEditLojaCep] = useState('');
  const [editLojaRecebePedidos, setEditLojaRecebePedidos] = useState(false);

  // Loja sendo visualizada pelo Admin Master
  const [lojaVisualizada, setLojaVisualizada] = useState<{ id: string; nome: string; nomeEmpresa: string } | null>(null);
  useEffect(()=>{limparFeedback();},[sessao?.token,lojaVisualizada?.id]);

  // --- ESTADOS DO MÓDULO FINANCEIRO ---
  const [adminDataState, setAdminDataState] = useState<Record<string, 'loading' | 'refreshing' | 'ready' | 'error'>>({});
  const adminRequestVersions = useRef<Record<string, number>>({});
  const [adminSubView, setAdminSubView] = useState<'operacional' | 'financeiro'>('operacional');
  const [finSubTab, setFinSubTab] = useState<'faturas' | 'relatorios' | 'planos_config'>('faturas');
  
  const [finDashboard, setFinDashboard] = useState<{
    mrrAtual: number;
    mrrProjetado: number;
    totalFaturasEmAberto: number;
    valorEmAberto: number;
    taxaInadimplencia: number;
    lojasAtivas: number;
    lojasInadimplentes: number;
    totalLojas: number;
    faturamentoBrutoMes: number;
    faturamentoLiquidoMes: number;
  } | null>(null);

  const [finFaturas, setFinFaturas] = useState<any[]>([]);
  const [finPaginaAtual, setFinPaginaAtual] = useState(1);
  const [finTotalPaginas, setFinTotalPaginas] = useState(1);
  const [finFaturasFiltros, setFinFaturasFiltros] = useState({
    status: '',
    empresaId: '',
    dataInicio: '',
    dataFim: '',
    limit: 10
  });

  const [finRelFaturamento, setFinRelFaturamento] = useState<any[]>([]);
  const [finRelInadimplencia, setFinRelInadimplencia] = useState<any[]>([]);
  const [finRelChurn, setFinRelChurn] = useState<any[]>([]);
  const [finRelPrevisibilidade, setFinRelPrevisibilidade] = useState<any[]>([]);
  const [finConfiguracoes, setFinConfiguracoes] = useState<any>(null);
  const [finAssinaturas, setFinAssinaturas] = useState<any[]>([]);
  const [finPlanos, setFinPlanos] = useState<any[]>([]);

  // Modais e formulários
  const [showCobrarManualForm, setShowCobrarManualForm] = useState(false);
  const [manualCobrarEmpresaId, setManualCobrarEmpresaId] = useState('');
  const [manualCobrarValor, setManualCobrarValor] = useState('');
  const [manualCobrarDescricao, setManualCobrarDescricao] = useState('');
  const [manualCobrarVencimento, setManualCobrarVencimento] = useState('');
  const [manualCobrarError, setManualCobrarError] = useState<string | null>(null);

  const [showBaixaManualForm, setShowBaixaManualForm] = useState<string | null>(null); // faturaId
  const [baixaManualComprovante, setBaixaManualComprovante] = useState('');
  const [baixaManualObservacoes, setBaixaManualObservacoes] = useState('');

  const [showContestarForm, setShowContestarForm] = useState<string | null>(null); // faturaId
  const [contestarMotivo, setContestarMotivo] = useState('');

  const [showPlanoForm, setShowPlanoForm] = useState<any>(null); // null ou plano
  const [planoNome, setPlanoNome] = useState('');
  const [planoDescricao, setPlanoDescricao] = useState('');
  const [planoValorMensal, setPlanoValorMensal] = useState('');
  const [planoLimiteEntregas, setPlanoLimiteEntregas] = useState('');
  const [planoLimiteLojas, setPlanoLimiteLojas] = useState('');
  const [planoLimiteMotoristas, setPlanoLimiteMotoristas] = useState('');
  const [planoError, setPlanoError] = useState<string | null>(null);

  // Helper para requisições com Token
  const apiFetch = async (url: string, options: RequestInit = {}) => {
    const token = sessao?.token;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    } as Record<string, string>;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(url, {
      ...options,
      headers
    });
    if (response.status === 401) {
      console.warn('[API] Token inválido ou expirado. Fazendo logout...');
      handleLogout();
    }
    return response;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    const endpoint = loginTab === 'admin' ? '/api/auth/admin' : '/api/auth/login';
    try {
      const res = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: loginUsuario, senha: loginSenha })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao realizar login');
      }
      
      const novaSessao: Sessao = {
        tipo: data.tipo,
        lojaId: data.lojaId,
        nomeLoja: data.nomeLoja,
        nomeEmpresa: data.nomeEmpresa,
        operacaoBloqueada: data.operacaoBloqueada,
        token: data.token
      };

      setSessao(novaSessao);
      savePanelSession(novaSessao);
      const next = new URLSearchParams(location.search).get('next');
      if (next === 'implantacao' || next === 'area-cliente') location.assign(next === 'implantacao' ? '/area-cliente?secao=implantacao' : '/area-cliente');
      setLoginUsuario('');
      setLoginSenha('');
    } catch (err: any) {
      setLoginError(err.message);
    }
  };

  const handleLogout = async () => {
    limparFeedback();
    try {
      if (sessao?.token) {
        await fetch(`${BACKEND_URL}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${sessao.token}` }
        });
      }
    } catch (err) {
      console.error('Erro ao fazer logout no backend:', err);
    }
    setSessao(null);
    setLojaVisualizada(null);
    setAllDeliveries([]);
    setAllDrivers([]);
    setSelectedForManifest([]);
    setActiveManifest(null);
    clearPanelSession(activeRole,sessao?.token);
    localStorage.removeItem('distre_driver_mobile');
    localStorage.removeItem('distre_driver_location');
  };

  // Each dataset keeps its own status and ignores obsolete responses.
  const loadAdminData = async <T,>(key: string, url: string, apply: (data: T) => void) => {
    const version = (adminRequestVersions.current[key] ?? 0) + 1;
    adminRequestVersions.current[key] = version;
    setAdminDataState(previous => ({ ...previous, [key]: previous[key] === 'ready' || previous[key] === 'refreshing' ? 'refreshing' : 'loading' }));
    try {
      const response = await apiFetch(url);
      if (!response.ok) throw new Error('Não foi possível consultar os dados.');
      const data: T = await response.json();
      if (adminRequestVersions.current[key] !== version) return;
      apply(data);
      setAdminDataState(previous => ({ ...previous, [key]: 'ready' }));
    } catch {
      if (adminRequestVersions.current[key] === version) {
        setAdminDataState(previous => ({ ...previous, [key]: 'error' }));
      }
    }
  };

  const carregarEmpresas = () => loadAdminData('empresas', BACKEND_URL + '/api/empresas', setEmpresas);

  const carregarLojas = (empresaId: string) => loadAdminData<Loja[]>('lojas:' + empresaId,
    BACKEND_URL + '/api/empresas/' + empresaId + '/lojas',
    data => setLojasDaEmpresa(previous => ({ ...previous, [empresaId]: data })));

  const carregarFinanceiroDashboard = () => loadAdminData('dashboard', BACKEND_URL + '/api/admin/financeiro/dashboard', setFinDashboard);

  const carregarFinanceiroFaturas = () => {
    const query = new URLSearchParams({
      status: finFaturasFiltros.status, empresaId: finFaturasFiltros.empresaId,
      dataInicio: finFaturasFiltros.dataInicio, dataFim: finFaturasFiltros.dataFim,
      page: String(finPaginaAtual), limit: String(finFaturasFiltros.limit)
    });
    return loadAdminData<{ faturas?: typeof finFaturas; paginacao?: { paginas: number } }>('faturas', BACKEND_URL + '/api/admin/financeiro/faturas?' + query, data => {
      setFinFaturas(data.faturas || []);
      setFinTotalPaginas(data.paginacao?.paginas || 1);
    });
  };

  const carregarFinanceiroRelatorios = async () => {
    const key = 'relatorios';
    const version = (adminRequestVersions.current[key] ?? 0) + 1;
    adminRequestVersions.current[key] = version;
    setAdminDataState(previous => ({ ...previous, [key]: previous[key] === 'ready' || previous[key] === 'refreshing' ? 'refreshing' : 'loading' }));
    try {
      const responses = await Promise.all(['faturamento', 'inadimplencia', 'churn', 'previsibilidade'].map(report =>
        apiFetch(BACKEND_URL + '/api/admin/financeiro/relatorios/' + report)));
      if (responses.some(response => !response.ok)) throw new Error('Relatórios indisponíveis');
      const [faturamento, inadimplencia, churn, previsibilidade] = await Promise.all(responses.map(response => response.json()));
      if (adminRequestVersions.current[key] !== version) return;
      setFinRelFaturamento(faturamento); setFinRelInadimplencia(inadimplencia);
      setFinRelChurn(churn); setFinRelPrevisibilidade(previsibilidade);
      setAdminDataState(previous => ({ ...previous, [key]: 'ready' }));
    } catch {
      if (adminRequestVersions.current[key] === version) setAdminDataState(previous => ({ ...previous, [key]: 'error' }));
    }
  };

  const carregarFinanceiroConfig = () => loadAdminData('configuracoes', BACKEND_URL + '/api/admin/financeiro/configuracoes', setFinConfiguracoes);
  const carregarFinanceiroAssinaturas = () => loadAdminData('assinaturas', BACKEND_URL + '/api/admin/financeiro/assinaturas', setFinAssinaturas);
  const carregarFinanceiroPlanos = () => loadAdminData('planos', BACKEND_URL + '/api/admin/financeiro/planos', setFinPlanos);

  const carregarTodosDadosFinanceiros = async () => {
    await Promise.all([carregarFinanceiroDashboard(), carregarFinanceiroFaturas(), carregarFinanceiroRelatorios(),
      carregarFinanceiroConfig(), carregarFinanceiroAssinaturas(), carregarFinanceiroPlanos()]);
  };

  const refreshAdminData = async () => {
    await Promise.all([carregarEmpresas(), carregarTodosDadosFinanceiros(), ...expandedEmpresas.map(carregarLojas)]);
  };

  const handleCobrarManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualCobrarError(null);
    try {
      const res = await apiFetch(`${BACKEND_URL}/api/admin/financeiro/cobrar-manual`, {
        method: 'POST',
        body: JSON.stringify({
          empresaId: manualCobrarEmpresaId,
          valor: parseFloat(manualCobrarValor),
          descricao: manualCobrarDescricao,
          vencimento: manualCobrarVencimento
        })
      });
      if (res.ok) {
        setShowCobrarManualForm(false);
        setManualCobrarEmpresaId('');
        setManualCobrarValor('');
        setManualCobrarDescricao('');
        setManualCobrarVencimento('');
        carregarTodosDadosFinanceiros();
      } else {
        const data = await res.json();
        setManualCobrarError(data.error || 'Erro ao gerar cobrança manual');
      }
    } catch (err: any) {
      setManualCobrarError(err.message);
    }
  };

  const handleBaixaManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showBaixaManualForm) return;
    try {
      const res = await apiFetch(`${BACKEND_URL}/api/admin/financeiro/faturas/${showBaixaManualForm}/baixa-manual`, {
        method: 'PUT',
        body: JSON.stringify({
          dataPagamento: new Date().toISOString(),
          comprovanteReferencia: baixaManualComprovante,
          observacoes: baixaManualObservacoes
        })
      });
      if (res.ok) {
        setShowBaixaManualForm(null);
        setBaixaManualComprovante('');
        setBaixaManualObservacoes('');
        carregarTodosDadosFinanceiros();
      } else {
        const data = await res.json();
        avisarErro(data.error || 'Erro ao registrar baixa');
      }
    } catch (err: any) {
      avisarErro(err.message);
    }
  };

  const handleContestarFatura = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showContestarForm) return;
    try {
      const res = await apiFetch(`${BACKEND_URL}/api/admin/financeiro/faturas/${showContestarForm}/contestar`, {
        method: 'PUT',
        body: JSON.stringify({ motivo: contestarMotivo })
      });
      if (res.ok) {
        setShowContestarForm(null);
        setContestarMotivo('');
        carregarTodosDadosFinanceiros();
      } else {
        const data = await res.json();
        avisarErro(data.error || 'Erro ao contestar fatura');
      }
    } catch (err: any) {
      avisarErro(err.message);
    }
  };

  const handleCancelarFatura = async (faturaId: string) => {
    if (!(await confirmarAcao('Deseja realmente cancelar esta fatura?'))) return;
    try {
      const res = await apiFetch(`${BACKEND_URL}/api/admin/financeiro/faturas/${faturaId}/cancelar`, {
        method: 'PUT'
      });
      if (res.ok) {
        carregarTodosDadosFinanceiros();
      } else {
        const data = await res.json();
        avisarErro(data.error || 'Erro ao cancelar fatura');
      }
    } catch (err: any) {
      avisarErro(err.message);
    }
  };

  const handleSalvarConfigCobranca = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!finConfiguracoes) return;
    try {
      const res = await apiFetch(`${BACKEND_URL}/api/admin/financeiro/configuracoes`, {
        method: 'PUT',
        body: JSON.stringify(finConfiguracoes)
      });
      if (res.ok) {

        carregarFinanceiroConfig();
        carregarFinanceiroDashboard();
      } else {
        const data = await res.json();
        avisarErro(data.error || 'Erro ao salvar configurações');
      }
    } catch (err: any) {
      avisarErro(err.message);
    }
  };

  const handleSalvarPlano = async (e: React.FormEvent) => {
    e.preventDefault();
    setPlanoError(null);
    const isEdit = !!showPlanoForm?.id;
    const url = isEdit
      ? `${BACKEND_URL}/api/admin/financeiro/planos/${showPlanoForm.id}`
      : `${BACKEND_URL}/api/admin/financeiro/planos`;
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await apiFetch(url, {
        method,
        body: JSON.stringify({
          nome: planoNome,
          descricao: planoDescricao,
          valorMensal: parseFloat(planoValorMensal),
          limiteEntregasMes: planoLimiteEntregas ? parseInt(planoLimiteEntregas) : null,
          limiteLojas: planoLimiteLojas ? parseInt(planoLimiteLojas) : null,
          limiteMotoristas: planoLimiteMotoristas ? parseInt(planoLimiteMotoristas) : null,
          ativo: showPlanoForm?.ativo !== false
        })
      });
      if (res.ok) {
        setShowPlanoForm(null);
        setPlanoNome('');
        setPlanoDescricao('');
        setPlanoValorMensal('');
        setPlanoLimiteEntregas('');
        setPlanoLimiteLojas('');
        setPlanoLimiteMotoristas('');
        carregarTodosDadosFinanceiros();
      } else {
        const data = await res.json();
        setPlanoError(data.error || 'Erro ao salvar plano');
      }
    } catch (err: any) {
      setPlanoError(err.message);
    }
  };

  const startEditPlano = (plano: any) => {
    setShowPlanoForm(plano);
    setPlanoNome(plano.nome);
    setPlanoDescricao(plano.descricao);
    setPlanoValorMensal(plano.valorMensal.toString());
    setPlanoLimiteEntregas(plano.limiteEntregasMes?.toString() || '');
    setPlanoLimiteLojas(plano.limiteLojas?.toString() || '');
    setPlanoLimiteMotoristas(plano.limiteMotoristas?.toString() || '');
  };

  const startNovoPlano = () => {
    setShowPlanoForm({ id: '' });
    setPlanoNome('');
    setPlanoDescricao('');
    setPlanoValorMensal('');
    setPlanoLimiteEntregas('');
    setPlanoLimiteLojas('');
    setPlanoLimiteMotoristas('');
  };

  useEffect(() => {
    if (sessao?.tipo === 'admin' && !lojaVisualizada) {
      carregarTodosDadosFinanceiros();
    }
  }, [sessao, lojaVisualizada]);

  useEffect(() => {
    if (sessao?.tipo === 'admin' && !lojaVisualizada && adminSubView === 'financeiro') {
      carregarFinanceiroFaturas();
    }
  }, [finPaginaAtual, finFaturasFiltros, adminSubView]);

  const toggleEmpresaExpandida = (empresaId: string) => {
    if (expandedEmpresas.includes(empresaId)) {
      setExpandedEmpresas(prev => prev.filter(id => id !== empresaId));
    } else {
      setExpandedEmpresas(prev => [...prev, empresaId]);
      carregarLojas(empresaId);
    }
  };

  const handleCadastrarEmpresa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaEmpresaNome.trim() || !novaEmpresaCnpj.trim()) {
      avisarErro('Nome e CNPJ são obrigatórios');
      return;
    }
    try {
      const res = await apiFetch(`${BACKEND_URL}/api/empresas`, {
        method: 'POST',
        body: JSON.stringify({
          nome: novaEmpresaNome,
          cnpj: novaEmpresaCnpj,
          telefone: novaEmpresaTelefone,
          email: novaEmpresaEmail
        })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Erro ao cadastrar empresa');
      }
      setNovaEmpresaNome('');
      setNovaEmpresaCnpj('');
      setNovaEmpresaTelefone('');
      setNovaEmpresaEmail('');
      setShowNovaEmpresaForm(false);
      carregarEmpresas();
    } catch (err: any) {
      avisarErro(err.message);
    }
  };

  const handleCadastrarLoja = async (e: React.FormEvent, empresaId: string) => {
    e.preventDefault();
    if (!novaLojaNome.trim() || !novaLojaUsuario.trim() || !novaLojaSenha.trim() || !novaLojaCnpj.trim()) {
      avisarErro('Nome, CNPJ, usuário e senha são obrigatórios');
      return;
    }
    if (!novaLojaPlanoId) {
      avisarErro('Selecione o plano de assinatura da loja');
      return;
    }
    try {
      const res = await apiFetch(`${BACKEND_URL}/api/empresas/${empresaId}/lojas`, {
        method: 'POST',
        body: JSON.stringify({
          nome: novaLojaNome,
          cnpj: novaLojaCnpj,
          usuario: novaLojaUsuario,
          senha: novaLojaSenha,
          endereco: novaLojaEndereco,
          numero: novaLojaNumero,
          bairro: novaLojaBairro,
          cidade: novaLojaCidade,
          uf: novaLojaUf,
          cep: novaLojaCep,
          recebePedidos: novaLojaRecebePedidos,
          planoId: novaLojaPlanoId
        })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Erro ao cadastrar loja');
      }
      setNovaLojaNome('');
      setNovaLojaCnpj('');
      setNovaLojaUsuario('');
      setNovaLojaSenha('');
      setNovaLojaEndereco('');
      setNovaLojaNumero('');
      setNovaLojaBairro('');
      setNovaLojaCidade('');
      setNovaLojaUf('');
      setNovaLojaCep('');
      setNovaLojaRecebePedidos(false);
      setNovaLojaPlanoId('');
      setShowNovaLojaForm(null);
      carregarLojas(empresaId);
      carregarEmpresas();
    } catch (err: any) {
      avisarErro(err.message);
    }
  };

  const handleToggleEmpresa = async (empresaId: string) => {
    try {
      const res = await apiFetch(`${BACKEND_URL}/api/empresas/${empresaId}/toggle`, {
        method: 'PATCH'
      });
      if (res.ok) {
        carregarEmpresas();
      } else {
        const data = await res.json();
        avisarErro(data.error || 'Erro ao alternar status da empresa');
      }
    } catch (err: any) {
      avisarErro(err.message);
    }
  };

  const handleToggleLoja = async (empresaId: string, lojaId: string) => {
    try {
      const res = await apiFetch(`${BACKEND_URL}/api/empresas/${empresaId}/lojas/${lojaId}/toggle`, {
        method: 'PATCH'
      });
      if (res.ok) {
        carregarLojas(empresaId);
      } else {
        const data = await res.json();
        avisarErro(data.error || 'Erro ao alternar status da loja');
      }
    } catch (err: any) {
      avisarErro(err.message);
    }
  };

  const handleToggleRecebePedidos = async (empresaId: string, loja: Loja) => {
    try {
      const res = await apiFetch(`${BACKEND_URL}/api/empresas/${empresaId}/lojas/${loja.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          recebePedidos: !loja.recebePedidos
        })
      });
      if (res.ok) {
        carregarLojas(empresaId);
      } else {
        const data = await res.json();
        avisarErro(data.error || 'Erro ao alternar recebimento de pedidos');
      }
    } catch (err: any) {
      avisarErro(err.message);
    }
  };

  const startEditLoja = (loja: Loja) => {
    setEditingLoja(loja);
    setEditLojaNome(loja.nome);
    setEditLojaCnpj(loja.cnpj || '');
    setEditLojaUsuario(loja.usuario);
    setEditLojaSenha('');
    setEditLojaEndereco(loja.endereco || '');
    setEditLojaNumero(loja.numero || '');
    setEditLojaBairro(loja.bairro || '');
    setEditLojaCidade(loja.cidade || '');
    setEditLojaUf(loja.uf || '');
    setEditLojaCep(loja.cep || '');
    setEditLojaRecebePedidos(loja.recebePedidos || false);
  };

  const handleUpdateLoja = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLoja) return;
    if (!editLojaNome.trim() || !editLojaUsuario.trim() || !editLojaCnpj.trim()) {
      avisarErro('Nome, CNPJ e usuário são obrigatórios');
      return;
    }

    try {
      const body: any = {
        nome: editLojaNome,
        cnpj: editLojaCnpj,
        usuario: editLojaUsuario,
        endereco: editLojaEndereco || undefined,
        numero: editLojaNumero || undefined,
        bairro: editLojaBairro || undefined,
        cidade: editLojaCidade || undefined,
        uf: editLojaUf || undefined,
        cep: editLojaCep || undefined,
        recebePedidos: editLojaRecebePedidos
      };
      if (editLojaSenha.trim()) {
        body.senha = editLojaSenha;
      }

      const res = await apiFetch(`${BACKEND_URL}/api/empresas/${editingLoja.empresaId}/lojas/${editingLoja.id}`, {
        method: 'PUT',
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Erro ao editar loja');
      }

      setEditingLoja(null);
      carregarLojas(editingLoja.empresaId);
      carregarEmpresas();

    } catch (err: any) {
      avisarErro(err.message);
    }
  };

  const handleRegenerarChaveLoja = async (empresaId: string, lojaId: string) => {
    if (!(await confirmarAcao('Tem certeza que deseja regenerar a chave de acesso? A chave antiga deixará de funcionar imediatamente.'))) {
      return;
    }
    try {
      const res = await apiFetch(`${BACKEND_URL}/api/empresas/${empresaId}/lojas/${lojaId}/regenerar-chave`, {
        method: 'POST'
      });
      if (res.ok) {
        await res.json();

        carregarLojas(empresaId);
      } else {
        const data = await res.json();
        avisarErro(data.error || 'Erro ao regenerar chave da loja');
      }
    } catch (err: any) {
      avisarErro(err.message);
    }
  };

  const handleDeleteEmpresa = async (empresaId: string) => {
    if (!(await confirmarAcao('Tem certeza que deseja excluir esta empresa?'))) return;
    try {
      const res = await apiFetch(`${BACKEND_URL}/api/empresas/${empresaId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        carregarEmpresas();
      } else {
        const data = await res.json();
        avisarErro(data.error || 'Erro ao excluir empresa. Verifique se existem lojas cadastradas.');
      }
    } catch (err: any) {
      avisarErro(err.message);
    }
  };

  const handleDeleteLoja = async (empresaId: string, lojaId: string) => {
    if (!(await confirmarAcao('Tem certeza que deseja excluir esta loja?'))) return;
    try {
      const res = await apiFetch(`${BACKEND_URL}/api/empresas/${empresaId}/lojas/${lojaId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        carregarLojas(empresaId);
        carregarEmpresas();
      } else {
        const data = await res.json();
        avisarErro(data.error || 'Erro ao excluir loja');
      }
    } catch (err: any) {
      avisarErro(err.message);
    }
  };

  useEffect(() => {
    if (sessao?.tipo === 'admin') {
      carregarEmpresas();
    }
  }, [sessao]);

  const [isConnected, setIsConnected] = useState(false);
  const [allDeliveries, setAllDeliveries] = useState<Entrega[]>([]);
  const [allDrivers, setAllDrivers] = useState<Motorista[]>([]);
  // Feed de eventos do broker para o Centro de Operações (buffer rolante, filtrado/deduplicado).
  const [liveEvents, setLiveEvents] = useState<BrokerEvento[]>([]);
  // Coordenadas geográficas da loja recebidas em tempo real via system_status (independem da sessão em cache)

  // Filtro de segurança (Multi-tenant) no frontend
  const tenantLojaId = sessao?.tipo === 'loja' 
    ? sessao.lojaId 
    : (sessao?.tipo === 'admin' && lojaVisualizada ? lojaVisualizada.id : undefined);

  const deliveries = comandasOperacionais(tenantLojaId
    ? allDeliveries.filter(d => d.lojaId === tenantLojaId)
    : allDeliveries);

  const drivers = tenantLojaId
    ? allDrivers.filter(d => d.lojaId === tenantLojaId)
    : allDrivers;

  const currentLoja = tenantLojaId
    ? Object.values(lojasDaEmpresa).flat().find(l => l.id === tenantLojaId)
    : null;


  // Estados de logs e webhooks removidos
  // Controle de interface do painel
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  

  // Estados para o FAB e Modal de Relatório
  const [showEstoqueModal, setShowEstoqueModal] = useState(false);
  const [whatsappOpen] = useState(false);
  const [whatsappMessages, setWhatsappMessages] = useState<Array<{ sender: 'customer' | 'bot'; text: string; timestamp: string }>>([]);
  const [whatsappIsTyping, setWhatsappIsTyping] = useState(false);
  const [whatsappPhone] = useState('+55 (81) 99999-8888');
  const whatsappPhoneRef = useRef(whatsappPhone);

  useEffect(() => {
    whatsappPhoneRef.current = whatsappPhone;
  }, [whatsappPhone]);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportPhase, setReportPhase] = useState<'filters' | 'view'>('filters');
  const [isGenerating, setIsGenerating] = useState(false);

  // Estados para Cadastro de Motoboy e Veículos
  const [vehicleTypes, setVehicleTypes] = useState<TipoVeiculo[]>([
    { id: 'drone', name: 'Drone' },
    { id: 'motorcycle', name: 'Motocicleta' },
    { id: 'van', name: 'Van' },
    { id: 'refrigerated_truck', name: 'Caminhão Refrigerado' }
  ]);
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [catalogoAlterado, setCatalogoAlterado] = useState(false);
  const [catalogoRefresh, setCatalogoRefresh] = useState(0);
  const [showProdutosModal, setShowProdutosModal] = useState(false);
  const [showVitrineModal, setShowVitrineModal] = useState(false);
  const [operacaoBloqueada,setOperacaoBloqueada]=useState<boolean|null>(null);
  useEffect(()=>{
    if(sessao?.tipo!=='loja'){setOperacaoBloqueada(false);return;}
    setOperacaoBloqueada(sessao.operacaoBloqueada??null);
    let cancelled=false;
    const refresh=async()=>{try{const r=await fetch(`${BACKEND_URL}/api/auth/me`,{headers:{Authorization:`Bearer ${sessao.token}`}});if(r.status===401){if(!cancelled)void handleLogout();return;}if(!r.ok)return;const d=await r.json();if(!cancelled)setOperacaoBloqueada(d.operacaoBloqueada===true);}catch{/* Permissão anterior preservada; servidor continua protegendo ações. */}};
    void refresh();const timer=setInterval(()=>void refresh(),15000);window.addEventListener('focus',refresh);return()=>{cancelled=true;clearInterval(timer);window.removeEventListener('focus',refresh);};
  },[sessao?.token]);
  const [implementationState,setImplementationState]=useState<ImplementationState|null>(null);
  useEffect(() => {
    document.title = !sessao ? 'Distre - Acesso ao ERP'
      : sessao.tipo === 'admin' && !lojaVisualizada ? 'Distre - Painel Administrador'
        : 'Distre - Operação';
  }, [sessao, lojaVisualizada]);
  useEffect(()=>{
    if(sessao?.tipo!=='loja')return;
    const area=new URLSearchParams(location.search).get('area');
    if(area==='produtos')setShowProdutosModal(true);
    if(area==='estoque'){setShowProdutosModal(true);setShowEstoqueModal(true);}
    if(area==='vitrine')setShowVitrineModal(true);
  },[sessao?.tipo,sessao?.lojaId]);
  useEffect(()=>{
    if(sessao?.tipo==='loja'&&operacaoBloqueada===false&&implementationState?.lojaId===sessao.lojaId&&implementationState?.needsWelcome
      &&!new URLSearchParams(location.search).has('area'))location.replace('/area-cliente');
  },[sessao,implementationState,operacaoBloqueada]);
  const [newDriverName, setNewDriverName] = useState('');
  const [newDriverVehicleType, setNewDriverVehicleType] = useState('motorcycle');
  const [newVehicleName, setNewVehicleName] = useState('');
  
  // Parâmetros de filtro do relatório
  const [startDate, setStartDate] = useState(() => {
    // Padrão: 7 dias atrás
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [selectedDriverId, setSelectedDriverId] = useState('Todos');
  const [activeReportTab, setActiveReportTab] = useState<'fleet' | 'regions' | 'finance' | 'travel_time' | 'incidents'>('fleet');

  // Lógica de cálculo do relatório (mesclando histórico e entregas reais finalizadas)
  const mappedLivePerformance: DadoPerformanceHistorico[] = deliveries
    .filter(d => d.motorista && (d.status === 'ENTREGUE' || d.status === 'RECUSADO_INSUCESSO' || d.status === 'AGUARDANDO_RETORNO_CD' || d.status === 'PRODUTO_RETORNADO_ESTOQUE'))
    .map(d => {
      const isSuccess = d.status === 'ENTREGUE';
      let tempo = 15;
      if (d.criadoEm && d.atualizadoEm) {
        const diffMs = new Date(d.atualizadoEm).getTime() - new Date(d.criadoEm).getTime();
        tempo = Math.max(1, Math.round(diffMs / 60000));
      }
      return {
        id: d.id,
        data: d.criadoEm ? d.criadoEm.slice(0, 10) : new Date().toISOString().slice(0, 10),
        motoristaId: d.motorista!.id,
        motoristaName: d.motorista!.name,
        veiculo: d.motorista!.vehicleType as any,
        status: isSuccess ? 'sucesso' as const : 'cancelado' as const,
        tempoEntregaMin: tempo,
        valor: d.valor || 0,
        avaliacao: isSuccess ? 5 : 0,
        bairro: d.bairro || 'Sem Bairro',
        formaPagamento: d.formaPagamento,
        prioridade: d.prioridade,
        incidentesCount: d.incidentes ? d.incidentes.length : 0,
        incidentesTipos: d.incidentes ? d.incidentes.map(i => i.tipo) : [],
        romaneioId: d.romaneioId,
        despachadoEm: d.despachadoEm
      };
    });

  const allPerformanceData = [...HISTORICO_PERFORMANCE, ...mappedLivePerformance];

  const reportData = allPerformanceData.filter(item => {
    const matchDate = item.data >= startDate && item.data <= endDate;
    const matchDriver = selectedDriverId === 'Todos' || item.motoristaId === selectedDriverId;
    return matchDate && matchDriver;
  });

  const totalConcluidas = reportData.filter(d => d.status === 'sucesso').length;
  const totalCanceladas = reportData.filter(d => d.status === 'cancelado').length;
  const totalGeral = totalConcluidas + totalCanceladas;

  const tempoMedioSla = totalConcluidas > 0
    ? Math.round(reportData.filter(d => d.status === 'sucesso').reduce((acc, curr) => acc + curr.tempoEntregaMin, 0) / totalConcluidas)
    : 0;

  const taxaSucesso = totalGeral > 0
    ? Math.round((totalConcluidas / totalGeral) * 100)
    : 0;

  // Constrói a lista de motoristas do relatório:
  // 1. Motoristas ativos da frota (aparecem mesmo com 0 entregas no período)
  // 2. + Motoristas que aparecem nos dados mas não estão mais na frota (histórico ou excluídos)
  const driverReportMap = new Map<string, { id: string; name: string; veiculo: string }>();
  
  // Adiciona motoristas ativos
  drivers.forEach(drv => {
    driverReportMap.set(drv.id, { id: drv.id, name: drv.name, veiculo: drv.vehicleType });
  });
  
  // Adiciona motoristas que aparecem no reportData mas não estão na frota ativa
  reportData.forEach(d => {
    if (!driverReportMap.has(d.motoristaId)) {
      driverReportMap.set(d.motoristaId, { id: d.motoristaId, name: d.motoristaName, veiculo: d.veiculo });
    }
  });

  const motoristasPerformance = Array.from(driverReportMap.values()).map(drv => {
    const drvData = reportData.filter(d => d.motoristaId === drv.id);
    const concluidas = drvData.filter(d => d.status === 'sucesso').length;
    const canceladas = drvData.filter(d => d.status === 'cancelado').length;
    const faturamento = drvData.filter(d => d.status === 'sucesso').reduce((acc, curr) => acc + curr.valor, 0);
    const somaAvaliacoes = drvData.filter(d => d.status === 'sucesso').reduce((acc, curr) => acc + curr.avaliacao, 0);
    const avaliacaoMedia = concluidas > 0 ? (somaAvaliacoes / concluidas).toFixed(1) : '0.0';

    return {
      id: drv.id,
      name: drv.name,
      veiculo: drv.veiculo,
      concluidas,
      canceladas,
      faturamento,
      avaliacaoMedia
    };
  });

  const maxVolume = Math.max(...motoristasPerformance.map(m => Math.max(m.concluidas, m.canceladas)), 1);
  const chartWidth = Math.max(500, 100 + motoristasPerformance.length * 100);

  // 1. Regiões (Bairros)
  const bairrosMap = new Map<string, { total: number; sucesso: number; cancelado: number; faturamento: number }>();
  reportData.forEach(d => {
    const b = d.bairro || 'Sem Bairro';
    const current = bairrosMap.get(b) || { total: 0, sucesso: 0, cancelado: 0, faturamento: 0 };
    current.total += 1;
    if (d.status === 'sucesso') {
      current.sucesso += 1;
      current.faturamento += d.valor;
    } else {
      current.cancelado += 1;
    }
    bairrosMap.set(b, current);
  });
  const regioesPerformance = Array.from(bairrosMap.entries()).map(([bairro, metrics]) => ({
    bairro,
    ...metrics
  })).sort((a, b) => b.total - a.total);
  const maxRegionVolume = Math.max(...regioesPerformance.map(r => r.total), 1);

  // 2. Financeiro & SLAs
  const pagamentosMap = {
    pix: 0,
    maquininha: 0,
    dinheiro: 0
  };
  reportData.forEach(d => {
    if (d.status === 'sucesso' && d.formaPagamento) {
      const f = d.formaPagamento.toLowerCase();
      if (f === 'pix' || f === 'maquininha' || f === 'dinheiro') {
        pagamentosMap[f as keyof typeof pagamentosMap] += d.valor;
      }
    }
  });

  const prioridadesMap = new Map<string, { totalSucesso: number; totalTempo: number }>();
  ['baixa', 'media', 'alta', 'critica'].forEach(p => prioridadesMap.set(p, { totalSucesso: 0, totalTempo: 0 }));
  reportData.forEach(d => {
    if (d.status === 'sucesso' && d.prioridade) {
      const current = prioridadesMap.get(d.prioridade) || { totalSucesso: 0, totalTempo: 0 };
      current.totalSucesso += 1;
      current.totalTempo += d.tempoEntregaMin;
      prioridadesMap.set(d.prioridade, current);
    }
  });
  const prioridadesSla = Array.from(prioridadesMap.entries()).map(([prioridade, metrics]) => ({
    prioridade,
    slaMedio: metrics.totalSucesso > 0 ? Math.round(metrics.totalTempo / metrics.totalSucesso) : 0,
    totalSucesso: metrics.totalSucesso
  }));

  // 3. Tempo de Trajeto por Motoboy (Romaneios)
  const romaneiosMap = new Map<string, typeof reportData>();
  reportData.forEach(d => {
    if (d.romaneioId) {
      const list = romaneiosMap.get(d.romaneioId) || [];
      list.push(d);
      romaneiosMap.set(d.romaneioId, list);
    }
  });

  const romaneiosAnalise = Array.from(romaneiosMap.entries()).map(([romId, dels]) => {
    const firstDel = dels[0];
    const driverId = firstDel.motoristaId;
    const driverName = firstDel.motoristaName;
    const veiculo = firstDel.veiculo;
    const totalValue = dels.reduce((acc, curr) => acc + (curr.status === 'sucesso' ? curr.valor : 0), 0);
    const totalDels = dels.length;
    const concluidas = dels.filter(d => d.status === 'sucesso').length;
    
    // Encontra início e fim do trajeto
    const liveDeliveriesOfRom = deliveries.filter(ld => ld.romaneioId === romId);
    let startMs = 0;
    let endMs = 0;
    
    if (liveDeliveriesOfRom.length > 0) {
      const startTimes = liveDeliveriesOfRom.map(ld => ld.despachadoEm ? new Date(ld.despachadoEm).getTime() : new Date(ld.criadoEm).getTime());
      const endTimes = liveDeliveriesOfRom.map(ld => ld.dataHoraConclusao ? new Date(ld.dataHoraConclusao).getTime() : new Date(ld.atualizadoEm).getTime());
      startMs = Math.min(...startTimes);
      endMs = Math.max(...endTimes);
    } else {
      const dates = dels.map(d => new Date(d.data).getTime());
      startMs = Math.min(...dates);
      endMs = Math.max(...dates) + (15 * 60000); // 15 mins default
    }
    
    const tempoTrajetoMin = startMs > 0 && endMs >= startMs ? Math.max(1, Math.round((endMs - startMs) / 60000)) : 15;
    const allFinal = dels.every(d => d.status === 'sucesso' || d.status === 'cancelado');
    const romStatus = allFinal ? 'Concluído' : 'Em Trajeto';

    return {
      romId,
      driverId,
      driverName,
      veiculo,
      totalValue,
      totalDels,
      concluidas,
      tempoTrajetoMin,
      romStatus,
      horaInicio: startMs > 0 ? new Date(startMs).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--',
      horaFim: endMs > 0 && allFinal ? new Date(endMs).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--'
    };
  });

  const motoboyTrajetoMap = new Map<string, { totalRomaneios: number; totalTempo: number }>();
  romaneiosAnalise.forEach(r => {
    const current = motoboyTrajetoMap.get(r.driverId) || { totalRomaneios: 0, totalTempo: 0 };
    current.totalRomaneios += 1;
    current.totalTempo += r.tempoTrajetoMin;
    motoboyTrajetoMap.set(r.driverId, current);
  });

  const motoboysTrajeto = Array.from(motoboyTrajetoMap.entries()).map(([driverId, metrics]) => {
    const name = romaneiosAnalise.find(r => r.driverId === driverId)?.driverName || '';
    const veiculo = romaneiosAnalise.find(r => r.driverId === driverId)?.veiculo || '';
    return {
      driverId,
      name,
      veiculo,
      totalRomaneios: metrics.totalRomaneios,
      tempoMedioTrajeto: Math.round(metrics.totalTempo / metrics.totalRomaneios)
    };
  });

  // 4. Incidentes
  const incidentesTiposCount = {
    traffic_jam: 0,
    flat_tire: 0,
    temperature_spike: 0,
    route_deviation: 0,
    webhook_timeout: 0
  };
  reportData.forEach(d => {
    if (d.incidentesTipos) {
      d.incidentesTipos.forEach(t => {
        if (t in incidentesTiposCount) {
          incidentesTiposCount[t as keyof typeof incidentesTiposCount] += 1;
        }
      });
    }
  });
  const totalIncidentes = Object.values(incidentesTiposCount).reduce((a, b) => a + b, 0);

  const handleTriggerGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
      setReportPhase('view');
    }, 1200);
  };

  const handleShortcutFilter = (type: 'hoje' | '7dias' | 'esteMes') => {
    const todayStr = new Date().toISOString().slice(0, 10);
    if (type === 'hoje') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (type === '7dias') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setStartDate(d.toISOString().slice(0, 10));
      setEndDate(todayStr);
    } else if (type === 'esteMes') {
      setStartDate('2026-05-01');
      setEndDate(todayStr);
    }
  };

  const formatarDataBR = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const handleExportCSV = () => {
    let csvContent = `Relatório de Desempenho da Frota\r\n`;
    csvContent += `Período;${formatarDataBR(startDate)} até ${formatarDataBR(endDate)}\r\n`;
    csvContent += `Filtro Entregador;${selectedDriverId === 'Todos' ? 'Todos' : (motoristasPerformance.find(d => d.id === selectedDriverId)?.name || drivers.find(d => d.id === selectedDriverId)?.name || selectedDriverId)}\r\n`;
    csvContent += `Gerado em;${new Date().toLocaleString('pt-BR')}\r\n\r\n`;

    csvContent += `RESUMO DE PERFORMANCE DOS ENTREGADORES\r\n`;
    csvContent += `Entregador;Veículo;Concluídas;Canceladas;Faturamento (R$);Nota Média\r\n`;
    
    const filteredDrivers = motoristasPerformance.filter(m => selectedDriverId === 'Todos' || m.id === selectedDriverId);
    filteredDrivers.forEach(m => {
      const veiculoNome = m.veiculo === 'refrigerated_truck' ? 'Caminhão Refrigerado' : m.veiculo === 'motorcycle' ? 'Motocicleta' : m.veiculo === 'van' ? 'Van' : 'Drone';
      csvContent += `"${m.name}";"${veiculoNome}";${m.concluidas};${m.canceladas};"${m.faturamento.toFixed(2).replace('.', ',')}";"${m.avaliacaoMedia.replace('.', ',')}"\r\n`;
    });

    if (sessao?.tipo === 'loja') {
      csvContent += `\r\n`;
      csvContent += `ENTREGAS POR REGIÃO / BAIRRO\r\n`;
      csvContent += `Bairro;Total Comandas;Entregas Concluídas;Canceladas;Faturamento (R$)\r\n`;
      regioesPerformance.forEach(r => {
        csvContent += `"${r.bairro}";${r.total};${r.sucesso};${r.cancelado};"${r.faturamento.toFixed(2).replace('.', ',')}"\r\n`;
      });

      csvContent += `\r\n`;
      csvContent += `FATURAMENTO POR FORMA DE PAGAMENTO\r\n`;
      csvContent += `Forma de Pagamento;Faturamento (R$)\r\n`;
      csvContent += `Pix;"${pagamentosMap.pix.toFixed(2).replace('.', ',')}"\r\n`;
      csvContent += `Cartão (Maquininha);"${pagamentosMap.maquininha.toFixed(2).replace('.', ',')}"\r\n`;
      csvContent += `Dinheiro;"${pagamentosMap.dinheiro.toFixed(2).replace('.', ',')}"\r\n`;

      csvContent += `\r\n`;
      csvContent += `TEMPO MÉDIO DE SLA POR PRIORIDADE\r\n`;
      csvContent += `Prioridade;Tempo Médio (min);Quantidade Entregas\r\n`;
      prioridadesSla.forEach(p => {
        csvContent += `"${p.prioridade}";${p.slaMedio};${p.totalSucesso}\r\n`;
      });

      csvContent += `\r\n`;
      csvContent += `HISTÓRICO DE ROMANEIOS E TEMPO DE TRAJETO\r\n`;
      csvContent += `Código do Romaneio;Entregador;Qtd Comandas;Concluídas;Horário Início;Horário Fim;Tempo Trajeto (min);Faturamento (R$);Status\r\n`;
      romaneiosAnalise.forEach(r => {
        csvContent += `"${r.romId}";"${r.driverName}";${r.totalDels};${r.concluidas};"${r.horaInicio}";"${r.horaFim}";${r.tempoTrajetoMin};"${r.totalValue.toFixed(2).replace('.', ',')}";"${r.romStatus}"\r\n`;
      });

      csvContent += `\r\n`;
      csvContent += `EXCEÇÕES E INCIDENTES DE ROTA\r\n`;
      csvContent += `Tipo de Incidente;Ocorrências\r\n`;
      csvContent += `Trânsito Intenso;${incidentesTiposCount.traffic_jam}\r\n`;
      csvContent += `Problemas no Veículo;${incidentesTiposCount.flat_tire}\r\n`;
      csvContent += `Alerta de Temperatura;${incidentesTiposCount.temperature_spike}\r\n`;
      csvContent += `Desvios de Rota;${incidentesTiposCount.route_deviation}\r\n`;
    }

    csvContent += `\r\n`;
    csvContent += `DETALHAMENTO DAS ENTREGAS NO PERÍODO\r\n`;
    csvContent += `ID da Comanda;Data;Entregador;Veículo;Status;Tempo de Entrega (min);Valor (R$);Avaliação;Bairro;Forma Pagamento\r\n`;

    reportData.forEach(d => {
      const veiculoNome = d.veiculo === 'refrigerated_truck' ? 'Caminhão Refrigerado' : d.veiculo === 'motorcycle' ? 'Motocicleta' : d.veiculo === 'van' ? 'Van' : 'Drone';
      const statusFormatado = d.status === 'sucesso' ? 'Concluída' : 'Cancelada';
      csvContent += `"${d.id}";"${formatarDataBR(d.data)}";"${d.motoristaName}";"${veiculoNome}";"${statusFormatado}";${d.tempoEntregaMin};"${d.valor.toFixed(2).replace('.', ',')}";${d.avaliacao};"${d.bairro || ''}";"${d.formaPagamento || ''}"\r\n`;
    });

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const fileName = `relatorio_desempenho_${startDate}_a_${endDate}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSubmitDriver = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDriverName.trim()) return;

    apiFetch(`${BACKEND_URL}/api/drivers`, {
      method: 'POST',
      body: JSON.stringify({
        name: newDriverName,
        vehicleType: newDriverVehicleType
      })
    })
      .then(async res => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          // 403 PLAN_LIMIT_REACHED: surface a mensagem de limite+upgrade do backend.
          throw new Error(data.error || 'Erro ao cadastrar motoboy');
        }
        return res.json();
      })
      .then(() => {
        setNewDriverName('');
        setShowDriverModal(false);
      })
      .catch(err => avisarErro(err.message));
  };

  const handleDeleteDriver = (id: string) => {
    apiFetch(`${BACKEND_URL}/api/drivers/${id}`, {
      method: 'DELETE'
    })
      .then(res => {
        if (!res.ok) {
          return res.json().then(data => {
            throw new Error(data.error || 'Erro ao remover motoboy');
          });
        }
        return res.json();
      })
      .catch(err => avisarErro(err.message));
  };

  const handleSubmitVehicle = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVehicleName.trim()) return;

    apiFetch(`${BACKEND_URL}/api/vehicle-types`, {
      method: 'POST',
      body: JSON.stringify({ name: newVehicleName })
    })
      .then(res => {
        if (!res.ok) throw new Error('Tipo de veículo já cadastrado ou inválido');
        return res.json();
      })
      .then(newType => {
        setVehicleTypes(prev => [...prev, newType]);
        setNewDriverVehicleType(newType.id);
        setNewVehicleName('');
        setShowVehicleModal(false);
      })
      .catch(err => avisarErro(err.message));
  };

  const socketRef = useRef<Socket | null>(null);

  // Romaneio e Impressão Térmica
  const [selectedForManifest, setSelectedForManifest] = useState<string[]>([]);
  const [activeManifest, setActiveManifest] = useState<{ id: string; deliveryIds: string[]; driverName: string; driverId: string; totalValue: number; despachado?: boolean } | null>(null);
  const [showThermalReceipt, setShowThermalReceipt] = useState(false);

  const getDeliveryValue = (d: Entrega) => {
    if (d.valor !== undefined && d.valor !== null) return d.valor;
    return ((d.id.charCodeAt(d.id.length - 1) || 0) * 3 % 100) + 25.50;
  };

  // ===== Impressão automática de comanda (80mm térmica) =====
  // Modo configurável por loja (persistido em localStorage):
  //  - 'impressora': abre a comanda 80mm e dispara window.print() (vai p/ impressora
  //    padrão; sai silencioso se o Chrome estiver com --kiosk-printing + 80mm como padrão)
  //  - 'pdf': abre o documento 80mm numa aba para salvar/visualizar como PDF
  //  - 'off': não imprime automaticamente
  type ModoImpressaoComanda = 'impressora' | 'pdf' | 'off';
  const [comandaPrintMode, setComandaPrintMode] = useState<ModoImpressaoComanda>(() => {
    try { return (localStorage.getItem('distre_comanda_print_mode') as ModoImpressaoComanda) || 'impressora'; }
    catch { return 'impressora'; }
  });
  const alterarModoImpressao = (m: ModoImpressaoComanda) => {
    setComandaPrintMode(m);
    try { localStorage.setItem('distre_comanda_print_mode', m); } catch { /* ignore */ }
  };

  const imprimirComandaTicket = (e: Entrega, modo: ModoImpressaoComanda) => {
    if (modo === 'off') return;
    const lojaNome = sessao?.nomeLoja || lojaVisualizada?.nome || 'DISTRE';
    const valor = getDeliveryValue(e);
    const itens = (e.itens && e.itens.length) ? e.itens : [];
    const esc = (s: any) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as Record<string, string>)[c]);
    const linhasItens = itens.length
      ? itens.map(i => `<div class="row"><span class="it">${esc(i)}</span></div>`).join('')
      : '<div class="muted">Sem itens detalhados</div>';
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Comanda ${esc(e.id)}</title>
      <style>
        @page { size: 80mm auto; margin: 0; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { width: 80mm; padding: 4mm 3mm; font-family: 'Courier New', monospace; color: #000; background: #fff; font-size: 12px; line-height: 1.35; }
        .center { text-align: center; } .b { font-weight: 700; } .xl { font-size: 18px; }
        .row { display: flex; justify-content: space-between; gap: 6px; }
        .it { flex: 1; } .muted { color: #444; font-style: italic; }
        .sep { border-top: 1px dashed #000; margin: 6px 0; }
        .sep-solid { border-top: 2px solid #000; margin: 6px 0; }
        .total { font-size: 15px; font-weight: 700; }
        .noprint { margin-top: 14px; text-align: center; }
        .noprint button { font: inherit; padding: 8px 14px; cursor: pointer; }
        @media print { .noprint { display: none; } }
      </style></head><body>
        <div class="center b xl">${esc(lojaNome)}</div>
        <div class="center">COMANDA DE PEDIDO</div>
        <div class="sep-solid"></div>
        <div class="row"><span>COMANDA:</span><span class="b">${esc(e.id)}</span></div>
        <div class="row"><span>DATA/HORA:</span><span>${new Date().toLocaleString('pt-BR')}</span></div>
        ${e.formaPagamento ? `<div class="row"><span>PAGAMENTO:</span><span>${esc(String(e.formaPagamento).toUpperCase())}</span></div>` : ''}
        <div class="sep"></div>
        <div class="b">CLIENTE</div>
        <div>${esc(e.nomeCliente)}</div>
        ${e.clienteDocumento ? `<div>CPF/CNPJ: ${esc(e.clienteDocumento)}</div>` : ''}
        <div class="sep"></div>
        <div class="b">ENTREGA</div>
        <div>${esc(e.endereco)}</div>
        ${e.bairro ? `<div>Bairro: ${esc(e.bairro)}</div>` : ''}
        ${e.cidade ? `<div>Cidade: ${esc(e.cidade)}</div>` : ''}
        ${e.referencia ? `<div>Ref: ${esc(e.referencia)}</div>` : ''}
        <div class="sep"></div>
        <div class="b">ITENS</div>
        ${linhasItens}
        <div class="sep-solid"></div>
        <div class="row total"><span>TOTAL:</span><span>R$ ${valor.toFixed(2)}</span></div>
        <div class="sep"></div>
        <div class="center">Distre - Gestao de Entregas</div>
        <div class="noprint"><button onclick="window.print()">Imprimir / Salvar PDF</button></div>
      </body></html>`;

    // Impressão via IFRAME oculto em vez de window.open: NÃO aciona o bloqueador de
    // pop-up do navegador (window.open sem gesto do usuário — ex.: auto-impressão de
    // pedido novo — é SEMPRE bloqueado), então a comanda vai direto pra impressão sem
    // o aviso "Permita pop-ups" travando a operação.
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(iframe);
    const idoc = iframe.contentWindow?.document;
    if (!idoc) { iframe.remove(); return; }
    idoc.open(); idoc.write(html); idoc.close();

    let jaImprimiu = false;
    const dispararImpressao = () => {
      if (jaImprimiu) return;
      jaImprimiu = true;
      try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); } catch { /* ignore */ }
      // Remove o iframe depois que o diálogo/impressão foi disparado.
      setTimeout(() => { try { iframe.remove(); } catch { /* ignore */ } }, 1500);
    };
    // onload garante render antes do print; o timeout é fallback caso onload não dispare.
    iframe.onload = () => setTimeout(dispararImpressao, 150);
    setTimeout(dispararImpressao, 600);
  };

  // Detecta novos pedidos na fila e imprime a comanda automaticamente.
  const comandasImpressasRef = useRef<Set<string>>(new Set());
  const printInitRef = useRef(false);
  useEffect(() => {
    const pedidosRecebidos = deliveries.filter(d => d.tipoComanda === 'pedido' && d.status === 'RECEBIDO');
    // Na 1ª carga, marca o backlog como "já visto" para não imprimir pedidos antigos de uma vez.
    if (!printInitRef.current) {
      pedidosRecebidos.forEach(d => comandasImpressasRef.current.add(d.id));
      printInitRef.current = true;
      return;
    }
    // Só auto-imprime no contexto operacional da própria loja (não no admin observando).
    if (comandaPrintMode === 'off' || sessao?.tipo !== 'loja') return;
    pedidosRecebidos
      .filter(d => !comandasImpressasRef.current.has(d.id))
      .forEach(d => {
        comandasImpressasRef.current.add(d.id);
        imprimirComandaTicket(d, comandaPrintMode);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveries, comandaPrintMode]);

  useEffect(() => {
    if (!sessao) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setIsConnected(false);
      setAllDeliveries([]);
      setAllDrivers([]);
      setLiveEvents([]);
      return;
    }

    // Carregar tipos de veículos do backend usando apiFetch
    apiFetch(`${BACKEND_URL}/api/vehicle-types`)
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Erro ao buscar tipos de veículos');
      })
      .then(data => {
        if (Array.isArray(data)) setVehicleTypes(data);
      })
      .catch(err => console.error('[API] Falha ao obter tipos de veículos:', err));

    // Conecta ao backend Socket.io passando o token (BACKEND_URL vazio = mesma origem)
    const socket = io(BACKEND_URL || undefined, {
      auth: {
        token: sessao.token
      }
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('session_expired', () => {
      console.warn('[Socket] Sessão expirou ou o servidor reiniciou. Forçando logout...');
      handleLogout();
    });

    socket.on('initial_state', (data: any) => {
      setAllDeliveries(data.deliveries);
      setAllDrivers(data.drivers);
      // Logs de eventos e webhooks não são mais salvos no estado
    });

    socket.on('system_status', (data: any) => {
      setAllDeliveries(data.deliveries);
      setAllDrivers(data.drivers);
    });

    // Eventos do broker → feed do "Centro de Operações" (buffer rolante, filtra ruído).
    socket.on('broker_event', (data: any) => {
      const ev = data?.event as BrokerEvento | undefined;
      if (!ev || !ev.topic) return;
      if (ev.topic === 'GPS_HEARTBEAT') return; // telemetria de alta frequência: descarta
      if (ev.topic === 'entrega.monitorada') {
        const s = ev.payload?.status;
        const relevante = s === 'ENTREGUE' || s === 'NO_LOCAL' || s === 'RECUSADO_INSUCESSO' || s === 'AGUARDANDO_RETORNO_CD' || s === 'PRODUTO_RETORNADO_ESTOQUE';
        if (!relevante) return; // ignora updates contínuos de EM_TRANSITO/telemetria
      }
      setLiveEvents(prev => {
        const last = prev[0];
        const sig = `${ev.topic}|${ev.deliveryId}|${ev.payload?.status ?? ''}`;
        const lastSig = last ? `${last.topic}|${last.deliveryId}|${last.payload?.status ?? ''}` : '';
        if (sig === lastSig) return prev; // dedupe de publicações consecutivas idênticas
        return [ev, ...prev].slice(0, 40);
      });
    });

    // ---- Listeners do Simulador de WhatsApp ----
    socket.on('whatsapp_msg_received', (data: { phone: string; sender: 'customer' | 'bot'; text: string; timestamp: string }) => {
      if (data.sender === 'bot') {
        // A mensagem do bot já foi adicionada otimisticamente (customer side) — só adicionamos a resposta do bot
        setWhatsappMessages(prev => [...prev, { sender: 'bot', text: data.text, timestamp: data.timestamp }]);
      }
    });

    socket.on('whatsapp_typing', (data: { phone: string; isTyping: boolean }) => {
      setWhatsappIsTyping(data.isTyping);
    });

    return () => {
      socket.disconnect();
    };
  }, [sessao]);

  // ---- Função helper para enviar mensagens ao bot WhatsApp via socket ----
  const whatsappMessagesEndRef = useRef<HTMLDivElement>(null);





  // Auto-scroll para o final do chat quando novas mensagens chegam
  useEffect(() => {
    if (whatsappOpen && whatsappMessagesEndRef.current) {
      whatsappMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [whatsappMessages, whatsappIsTyping, whatsappOpen]);



  const handlePrepararPedido = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await apiFetch(`${BACKEND_URL}/api/deliveries/${id}/prepare`, {
        method: 'POST'
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao preparar comanda');
      }

    } catch (err: any) {
      avisarErro(err.message);
    }
  };

  const handleCancelarPedido = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const motivo = await solicitarCancelamento(`Cancelar a comanda ${id}? Esta ação não pode ser desfeita.`);
    if (motivo === null) return;
    try {
      const response = await apiFetch(`${BACKEND_URL}/api/deliveries/${id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ motivo: motivo.trim() || undefined })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao cancelar comanda');
      }
    } catch (err: any) {
      avisarErro(err.message);
    }
  };

  // ===== Módulo Fiscal (NFC-e / NF-e) =====
  // Ao concluir a separação a loja escolhe o documento da venda: NFC-e (cupom 80mm),
  // NF-e (DANFE A4) ou nenhum. "Padrão" fica salvo por terminal (localStorage):
  //  - 'perguntar': sempre abre o seletor;  - 'NFCE': emite NFC-e direto;
  //  - 'NFE': abre o seletor já em NF-e (precisa do destinatário);  - 'NENHUMA': não emite.
  type ModoNotaPadrao = 'perguntar' | 'NFCE' | 'NFE' | 'NENHUMA';
  const [modoNotaPadrao, setModoNotaPadrao] = useState<ModoNotaPadrao>(() => {
    try { return (localStorage.getItem('distre_nota_padrao') as ModoNotaPadrao) || 'perguntar'; }
    catch { return 'perguntar'; }
  });
  const alterarModoNota = (m: ModoNotaPadrao) => {
    setModoNotaPadrao(m);
    try { localStorage.setItem('distre_nota_padrao', m); } catch { /* ignore */ }
  };

  const fiscalApi = useMemo(
    () => (sessao?.token ? new FiscalApi(BACKEND_URL, sessao.token, sessao.tipo === 'admin' ? tenantLojaId : undefined) : null),
    [sessao?.token, sessao?.tipo, tenantLojaId]
  );
  const [fiscalStatus, setFiscalStatus] = useState<StatusFiscal | null>(null);
  const fiscalSimulado = !fiscalStatus || fiscalStatus.simulado;
  const atualizarStatusFiscal = () => { fiscalApi?.status().then(setFiscalStatus).catch(() => { /* ignore */ }); };
  const [notasFiscais, setNotasFiscais] = useState<NotaResumo[]>([]);
  const [showConfigFiscal, setShowConfigFiscal] = useState(false);
  const [showOperationSettings, setShowOperationSettings] = useState(false);
  const [pedidoEmConferencia, setPedidoEmConferencia] = useState<string | null>(null);
  const [emissaoFiscal, setEmissaoFiscal] = useState<{ modo: 'separacao' | 'emitir'; comandaId: string; escolhaInicial: EscolhaFiscal } | null>(null);

  const carregarNotasFiscais = async () => {
    if (!fiscalApi || !tenantLojaId) return;
    try { setNotasFiscais(await fiscalApi.listarNotas(2)); }
    catch (err) { console.warn('[Fiscal] Falha ao listar notas:', err); }
  };

  useEffect(() => {
    if (!fiscalApi || !tenantLojaId) { setNotasFiscais([]); return; }
    atualizarStatusFiscal();
    carregarNotasFiscais();
    // Outros caixas da mesma loja também emitem: ressincroniza os selos a cada minuto.
    const t = setInterval(carregarNotasFiscais, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiscalApi, tenantLojaId]);

  // Nota mais recente por entrega e por pedido de origem (a lista já vem do mais novo).
  const notasPorComanda = useMemo(() => {
    const m: Record<string, NotaResumo> = {};
    for (const n of notasFiscais) {
      for (const id of [n.entregaId, n.pedidoId]) if (id && !m[id]) m[id] = n;
    }
    return m;
  }, [notasFiscais]);

  const registrarNota = (n: NotaResumo) => setNotasFiscais(prev => [n, ...prev.filter(x => x.id !== n.id)]);

  const avisarNotaPendente = (n: NotaResumo) => {
    if (n.status === 'PROCESSANDO') {
      avisarInfo(`${NOME_MODELO[n.modelo]} enviada e ainda em processamento na SEFAZ. Clique no selo da nota no card para atualizar e imprimir.`);
    }
  };

  const imprimirFiscal = async(nota:NotaCompleta)=>{
    if(nota.provedor==='SEFAZ_DIRETA'&&nota.modelo==='NFE') await fiscalApi?.baixarDanfe(nota.id);
    else imprimirNota(nota);
  };
  const executarFinalizacao = async (id: string, escolha: EscolhaFiscal, destinatario?: DestinatarioNota,contingencia?:{justificativa:string}) => {
    const response = await apiFetch(`${BACKEND_URL}/api/deliveries/${id}/finalize-order`, {
      method: 'POST',
      body: JSON.stringify(escolha === 'NENHUMA' ? {} : { fiscal: { modelo: escolha, destinatario,contingencia } })
    });
    const data = await response.json();
    if (!response.ok) {
      const err = new Error(data.error || 'Erro ao finalizar comanda') as Error & { status?: number };
      err.status = response.status;
      throw err;
    }
    // Sem pop-up de sucesso: a comanda já avança no Kanban via socket — operação flui.
    const nota: NotaCompleta | undefined = data.fiscal?.nota;
    if (nota) {
      registrarNota(nota);
      if (nota.status === 'AUTORIZADA'||nota.status==='CONTINGENCIA') await imprimirFiscal(nota);
      else avisarNotaPendente(nota);
    }
    if (data.fiscal?.erro) {
      avisarErro(`Separação concluída, mas a nota fiscal não foi autorizada:\n${data.fiscal.erro}\n\nUse "Emitir nota" no card para tentar de novo.`);
    }
  };

  const handleFinalizarPedido = (id: string, e: React.MouseEvent) => { e.stopPropagation(); setPedidoEmConferencia(id); };

  const finalizarPedidoConferido = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (modoNotaPadrao === 'NENHUMA' || modoNotaPadrao === 'NFCE') {
      try {
        await executarFinalizacao(id, modoNotaPadrao);
      } catch (err: any) {
        avisarErro(err.message);
        if (err.status === 412) setShowConfigFiscal(true); // dados fiscais da loja não configurados
      }
      return;
    }
    setEmissaoFiscal({ modo: 'separacao', comandaId: id, escolhaInicial: modoNotaPadrao === 'NFE' ? 'NFE' : 'NFCE' });
  };

  // Selo da nota no card: reimprime; NF-e em processamento é reconsultada; erro/rejeição/cancelada → reemite.
  const handleNotaFiscalCard = async (comandaId: string, nota?: NotaResumo) => {
    if (!fiscalApi) return;
    if (!nota || nota.status === 'ERRO' || nota.status === 'REJEITADA' || nota.status === 'CANCELADA') {
      setEmissaoFiscal({ modo: 'emitir', comandaId, escolhaInicial: nota?.modelo || (modoNotaPadrao === 'NFE' ? 'NFE' : 'NFCE') });
      return;
    }
    try {
      const completa = nota.status === 'PROCESSANDO' ? await fiscalApi.atualizar(nota.id) : await fiscalApi.obterNota(nota.id);
      registrarNota(completa);
      if (completa.status === 'AUTORIZADA'||completa.status==='CONTINGENCIA') await imprimirFiscal(completa);
      else avisarInfo(`${NOME_MODELO[completa.modelo]}: ${completa.status.toLowerCase()}${completa.mensagem ? ` — ${completa.mensagem}` : ''}`);
    } catch (err: any) {
      avisarErro(err.message);
    }
  };

  const confirmarEmissaoFiscal = async (escolha: EscolhaFiscal, destinatario?: DestinatarioNota,contingencia?:{justificativa:string}) => {
    if (!emissaoFiscal) return;
    if (emissaoFiscal.modo === 'separacao') {
      await executarFinalizacao(emissaoFiscal.comandaId, escolha, destinatario,contingencia);
    } else if (fiscalApi && escolha !== 'NENHUMA') {
      try {
        const nota = await fiscalApi.emitir(emissaoFiscal.comandaId, escolha, destinatario,contingencia);
        registrarNota(nota);
        if (nota.status === 'AUTORIZADA'||nota.status==='CONTINGENCIA') await imprimirFiscal(nota);
        else avisarNotaPendente(nota);
      } catch (err: any) {
        if (err.nota) registrarNota(err.nota); // tentativa com erro fica registrada no card
        throw err;
      }
    }
    setEmissaoFiscal(null);
  };

  const comandaEmEmissao = emissaoFiscal ? deliveries.find(d => d.id === emissaoFiscal.comandaId) : undefined;

  // Gera o romaneio (manifesto) das comandas selecionadas + entregador escolhido.
  // Extraído do antigo botão "Gerar Romaneios" do header; acionado pelo Kanban (Coluna "Prontos").
  const gerarRomaneioParaSelecionados = (driverId?: string) => {
    if (selectedForManifest.length === 0) return;
    const driver =
      drivers.find(drv => drv.id === driverId) ||
      drivers.find(drv => drv.id === selectedDriverForDispatch) ||
      drivers.find(drv => drv.status === 'ocioso') ||
      drivers[0];
    const driverName = driver ? driver.name : 'Motoboy Terceirizado';
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const romId = `ROM-${dateStr}-${Math.floor(100 + Math.random() * 900)}`;
    const totalValue = selectedForManifest.reduce((acc, deliveryId) => {
      const found = deliveries.find(del => del.id === deliveryId);
      return acc + (found ? getDeliveryValue(found) : 0);
    }, 0);
    setActiveManifest({
      id: romId,
      deliveryIds: [...selectedForManifest],
      driverName,
      driverId: driver ? driver.id : '',
      totalValue,
    });
    setSelectedForManifest([]);
  };




  const despacharPedidosProntos = async (ids: string[], driverId: string) => {
    const driver = drivers.find(d => d.id === driverId);
    if (!driver) throw new Error('O entregador não está mais cadastrado.');
    const pedidos = ids.map(id => deliveries.find(d => d.id === id));
    if (!ids.length || pedidos.some(d => !d || d.status !== 'RECEBIDO' || d.tipoComanda === 'pedido')) {
      throw new Error('A seleção mudou. Selecione apenas pedidos prontos para despacho.');
    }
    const romId = `ROM-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomUUID().slice(0, 8)}`;
    const response = await apiFetch(`${BACKEND_URL}/api/deliveries/dispatch-batch`, {
      method: 'POST', body: JSON.stringify({ deliveryIds: ids, driverId, romaneioId: romId })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erro ao despachar pedidos.');
    setActiveManifest({ id: romId, deliveryIds: [...ids], driverId, driverName: driver.name,
      totalValue: pedidos.reduce((sum, d) => sum + (d ? getDeliveryValue(d) : 0), 0), despachado: true });
    setSelectedForManifest(prev => prev.filter(id => !ids.includes(id)));
  };

  const handleResolveIncidents = async (deliveryId: string) => {
    try {
      await apiFetch(`${BACKEND_URL}/api/deliveries/${deliveryId}/resolve`, {
        method: 'POST'
      });
    } catch (err) {
      console.error('Erro ao resolver incidentes:', err);
    }
  };

  const handleClearSimulation = async () => {
    try {
      await apiFetch(`${BACKEND_URL}/api/simulator/clear`, { method: 'POST' });
      setAllDeliveries([]);
      setSelectedDeliveryId(null);
      localStorage.removeItem('actionQueue');
      // Limpa os caches de gps offline
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('offline_gps_')) {
          localStorage.removeItem(key);
        }
      });
    } catch (err) {
      console.error('Erro ao limpar simulação:', err);
    }
  };

  const triggerQuickDelivery = async () => {
    const clients = ['Lojas Americanas', 'Supermercado Extra', 'Farmácia Pague Menos', 'Hospital Albert Einstein', 'Lojas Renner'];
    const products = [['Teclado Mecânico', 'Mouse Sem Fio'], ['Sorvete Kibon', 'Polpas Congeladas'], ['Medicamentos Controlados', 'Vacinas'], ['Materiais Cirúrgicos'], ['Jaqueta de Couro', 'Calça Jeans']];
    const types: Array<'normal' | 'expressa' | 'agendado'> = ['normal', 'expressa', 'agendado', 'normal', 'expressa'];
    const priorities: Array<'baixa' | 'media' | 'alta' | 'critica'> = ['media', 'alta', 'critica', 'baixa', 'media'];
    
    const randomIdx = Math.floor(Math.random() * clients.length);

    try {
      const response = await apiFetch(`${BACKEND_URL}/api/deliveries`, {
        method: 'POST',
        body: JSON.stringify({
          clientName: clients[randomIdx],
          address: `Av. Paulista, nº ${100 + Math.floor(Math.random() * 2000)}, São Paulo`,
          items: products[randomIdx],
          priority: priorities[randomIdx],
          cargoType: types[randomIdx],
          tipoComanda: 'entrega'
        })
      });
      
      if (response.ok) {
        const newD = await response.json();
        setSelectedDeliveryId(newD.id);
      }
    } catch (err) {
      console.error('Erro ao criar entrega rápida:', err);
    }
  };

  const triggerQuickOrder = async () => {
    const clients = ['Lojas Americanas', 'Supermercado Extra', 'Farmácia Pague Menos', 'Hospital Albert Einstein', 'Lojas Renner'];
    const products = [['Teclado Mecânico', 'Mouse Sem Fio'], ['Sorvete Kibon', 'Polpas Congeladas'], ['Medicamentos Controlados', 'Vacinas'], ['Materiais Cirúrgicos'], ['Jaqueta de Couro', 'Calça Jeans']];
    const types: Array<'normal' | 'expressa' | 'agendado'> = ['normal', 'expressa', 'agendado', 'normal', 'expressa'];
    const priorities: Array<'baixa' | 'media' | 'alta' | 'critica'> = ['media', 'alta', 'critica', 'baixa', 'media'];
    
    const randomIdx = Math.floor(Math.random() * clients.length);

    try {
      const response = await apiFetch(`${BACKEND_URL}/api/deliveries`, {
        method: 'POST',
        body: JSON.stringify({
          clientName: clients[randomIdx],
          address: `Av. Paulista, nº ${100 + Math.floor(Math.random() * 2000)}, São Paulo`,
          items: products[randomIdx],
          priority: priorities[randomIdx],
          cargoType: types[randomIdx],
          tipoComanda: 'pedido'
        })
      });
      
      if (response.ok) {
        const newD = await response.json();
        setSelectedDeliveryId(newD.id);
      }
    } catch (err) {
      console.error('Erro ao criar comanda de pedido rápido:', err);
    }
  };

  const getVehicleIcon = (type?: string) => {
    switch (type) {
      case 'drone':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }}>
            <path d="M12 2v20M20 12H4" />
            <circle cx="12" cy="12" r="3" />
            <circle cx="12" cy="2" r="1.5" />
            <circle cx="12" cy="22" r="1.5" />
            <circle cx="20" cy="12" r="1.5" />
            <circle cx="4" cy="12" r="1.5" />
          </svg>
        );
      case 'motorcycle':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }}>
            <circle cx="5" cy="18" r="3" />
            <circle cx="19" cy="18" r="3" />
            <path d="M12 18V8H9m6 10l-3-6h-3m4-4h4l2 3" />
          </svg>
        );
      case 'van':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }}>
            <path d="M14 18H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6" />
            <circle cx="7.5" cy="18" r="2.5" />
            <circle cx="16.5" cy="18" r="2.5" />
            <path d="M13 6v8m5-8l2 3v3" />
          </svg>
        );
      case 'refrigerated_truck':
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }}>
            <path d="M14 18H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h11v13z" />
            <path d="M14 8h5l3 3v6h-8V8z" />
            <circle cx="5.5" cy="18" r="2.5" />
            <circle cx="16.5" cy="18" r="2.5" />
            <path d="M20 18h2" />
          </svg>
        );
      default:
        return (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }}>
            <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
            <circle cx="7" cy="17" r="2" />
            <circle cx="17" cy="17" r="2" />
          </svg>
        );
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'RECEBIDO': return 'A Despachar';
      case 'DESPACHADO': return 'Despachado';
      case 'EM_TRANSITO': return 'Em Trânsito';
      case 'NO_LOCAL': return 'No Local';
      case 'ENTREGUE': return 'Entregue (Sucesso)';
      case 'RECUSADO_INSUCESSO': return 'Recusado / Insucesso';
      case 'ALERTA_INCIDENTE': return 'Alerta de Incidente';
      case 'AGUARDANDO_RETORNO_CD': return 'Aguardando Retorno a Loja';
      case 'PRODUTO_RETORNADO_ESTOQUE': return 'Cancelado / Devolvido';
      case 'SLA_ALERTA': return 'Alerta de SLA';
      case 'CANCELADO': return 'Cancelado';
      default: return status;
    }
  };





  const selectedDelivery = deliveries.find(d => d.id === selectedDeliveryId);
  const activeDeliveries = deliveries.filter(d => d.status !== 'ENTREGUE' && d.status !== 'RECUSADO_INSUCESSO' && d.status !== 'PRODUTO_RETORNADO_ESTOQUE');
  const alertDeliveries = deliveries.filter(d => d.status === 'ALERTA_INCIDENTE' || d.status === 'SLA_ALERTA');
  const selectedRecebidas = deliveries.filter(d => selectedForManifest.includes(d.id) && d.status === 'RECEBIDO');

  if (!sessao) {
    return <LoginScreen mode={loginTab} username={loginUsuario} password={loginSenha} error={loginError}
      onModeChange={mode => { const url=new URL(location.href);url.searchParams.set('perfil',mode);url.searchParams.delete('next');location.assign(url.href); }}
      onUsernameChange={setLoginUsuario} onPasswordChange={setLoginSenha} onSubmit={handleLogin} />;
  }

  if (sessao.tipo === 'admin' && !lojaVisualizada) {
    return <AdminMaster {...{
      reportAccess: {backendUrl:BACKEND_URL,token:sessao.token},
      adminDataState,
      refreshAdminData,
      empresas,
      isConnected,
      handleLogout,
      adminSubView,
      setAdminSubView,
      finDashboard,
      finSubTab,
      setFinSubTab,
      finFaturasFiltros,
      setFinFaturasFiltros,
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
      finAssinaturas,
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
      handleDeleteLoja,
      showCobrarManualForm,
      handleCobrarManual,
      manualCobrarEmpresaId,
      setManualCobrarEmpresaId,
      manualCobrarValor,
      setManualCobrarValor,
      manualCobrarDescricao,
      setManualCobrarDescricao,
      manualCobrarVencimento,
      setManualCobrarVencimento,
      manualCobrarError,
      showBaixaManualForm,
      handleBaixaManual,
      baixaManualComprovante,
      setBaixaManualComprovante,
      baixaManualObservacoes,
      setBaixaManualObservacoes,
      showContestarForm,
      handleContestarFatura,
      contestarMotivo,
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
    }} />;
  }

  // Dashboard da Loja
  return (
    <div className="app-container distre-operations">
      {lojaVisualizada && (
        <div className="viewing-tenant-banner">
          <span className="viewing-tenant-text">
            <strong>Modo Visualização:</strong> Você está visualizando o dashboard de <strong>{lojaVisualizada.nome}</strong> ({lojaVisualizada.nomeEmpresa}).
          </span>
          <button 
            className="btn btn-small" 
            style={{ background: 'var(--color-purple)', color: '#fff' }}
            onClick={() => setLojaVisualizada(null)}
          >
            Voltar ao Painel Master
          </button>
        </div>
      )}

      {/* 1. App Header */}
      <header className="app-header">
        <div className="logo-section">
          <div className="logo-icon" style={{ background: 'transparent', boxShadow: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* Logo oficial Distre — mesmo mark da landing (site/index.html) e da tela de login */}
            <svg width="40" height="40" viewBox="0 0 48 48" fill="none" aria-hidden="true" style={{ display: 'block' }}>
              <rect width="48" height="48" rx="10" fill="#070f1d" />
              <path d="m5 11 12 13L5 37h9l12-13L14 11Zm16 0 12 13-12 13h9l12-13L30 11Z" fill="#2878ff" />
            </svg>
          </div>
          <div>
            <h1>Distre - Gestão de Entregas</h1>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
              {lojaVisualizada ? (
                <span>Visualizando: <strong>{lojaVisualizada.nome}</strong> / {lojaVisualizada.nomeEmpresa}</span>
              ) : sessao?.tipo === 'loja' ? (
                <span>Loja: <strong>{sessao.nomeLoja}</strong> / {sessao.nomeEmpresa}</span>
              ) : (
                <span>Modo Administrativo</span>
              )}
            </p>
          </div>
          <span className="version-badge">v2.1-br</span>
        </div>
        <div className="status-badges">
          <div className="status-badge">
            <span className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}></span>
            <span>{isConnected ? 'Servidor Conectado' : 'Desconectado'}</span>
          </div>
          {/* "Entregas Ativas" ocultado a pedido (jun/2026) */}
          {false && (
            <div className="status-badge" style={{ color: 'var(--color-cyan)' }}>
              <strong>{activeDeliveries.length}</strong> Entregas Ativas
            </div>
          )}
          {alertDeliveries.length > 0 && (
            <div className="status-badge" style={{ color: 'var(--color-rose)' }}>
              <strong>{alertDeliveries.length}</strong> Alertas Ativos
            </div>
          )}
        </div>
        <div className="header-actions">
          <button
            className="btn btn-primary"
            onClick={() => window.location.assign(sessao?.tipo==='admin'&&tenantLojaId?`/area-cliente?lojaId=${encodeURIComponent(tenantLojaId)}`:'/area-cliente')}
          >
            Área do Cliente
          </button>
          {/* Hierarquia: 1 primária (Gerar Pedido), 1 secundária (Entrega Rápida),
              destrutivo e logout rebaixados a ghost p/ não competir nem causar clique acidental. */}
          {/* "Gerar Pedido" e "Entrega Rápida" ocultados a pedido (jun/2026) */}
          {false && (
            <>
              <button className="btn btn-primary" onClick={triggerQuickOrder}>+ Gerar Pedido</button>
              <button className="btn btn-secondary" onClick={triggerQuickDelivery}>Entrega Rápida</button>
            </>
          )}
          <button
            className="btn"
            style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-thin)' }}
            disabled={operacaoBloqueada!==false}
            onClick={handleClearSimulation}
            title="Apagar todos os dados da simulação"
          >
            Limpar Dados
          </button>
          {!lojaVisualizada && (
            <button
              className="btn"
              style={{ background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-thin)' }}
              onClick={handleLogout}
            >
              Sair
            </button>
          )}
        </div>
      </header>

      {sessao.tipo==='loja'&&operacaoBloqueada!==false&&<section className="operation-payment-banner" role="status"><div><strong>{operacaoBloqueada?'Operação suspensa por inadimplência':'Verificando acesso à operação…'}</strong><p>{operacaoBloqueada?'Regularize o pagamento para continuar operando. Sua conta e suas cobranças continuam disponíveis.':'Aguarde a conferência da sua assinatura.'}</p></div><a className="btn btn-primary" href="/area-cliente?secao=cobrancas">Acessar cobranças e pagamentos</a></section>}
      <div className={sessao.tipo==='loja'&&operacaoBloqueada!==false?'operation-payment-muted':undefined} inert={sessao.tipo==='loja'&&operacaoBloqueada!==false} aria-label="Área de operação">
      {/* 2. Incidents Alerts Banner */}
      {alertDeliveries.length > 0 && (
        <div className="incidents-container">
          {alertDeliveries.map(d => (
            <div key={d.id} className="incident-alert-banner">
              <div className="incident-alert-text">
                <span className="incident-alert-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '4px' }}>
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </span>
                <span>
                  <strong>Entrega {d.id} ({d.nomeCliente})</strong>: {d.incidentes.find(i => !i.resolvido)?.descricao || 'Problema na rota'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-primary btn-small" onClick={() => setSelectedDeliveryId(d.id)}>Visualizar</button>
                <button className="btn btn-success btn-small" onClick={() => handleResolveIncidents(d.id)}>Resolver Todos</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Centro de Operações — painel operacional ao vivo (KPIs + SLA + eventos) */}
      <details className="ops-analytics">
      <summary>Indicadores de entrega e eventos da operação</summary>
      <CentroOperacoes
        deliveries={deliveries}
        drivers={drivers}
        liveEvents={liveEvents}
        zona={sessao?.nomeLoja || currentLoja?.nome || undefined}
      />
      </details>

      {/* 3. Seção de Entregas Cadastradas (Comandas) */}
      <section className="glass-panel deliveries-top-panel glow-cyan">
        {!dispatchViewActive && !showProdutosModal && !showVitrineModal && <div className="panel-header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            Controle de Comandas
          </h2>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {selectedRecebidas.length > 0 && tenantLojaId && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', borderRight: '1px solid rgba(255,255,255,0.08)', paddingRight: '0.5rem', marginRight: '0.1rem' }}>
                <select
                  className="form-select"
                  style={{ fontSize: '0.68rem', padding: '0.2rem 0.4rem', background: '#141b27', border: '1px solid #1f293d', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}
                  value={selectedDriverForDispatch}
                  onChange={e => setSelectedDriverForDispatch(e.target.value)}
                >
                  <option value="">Selecione o Entregador</option>
                  {drivers.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.status === 'ocioso' ? 'Disponível' : 'Em Rota'})
                    </option>
                  ))}
                </select>
              </div>
            )}
            {/* Despacho em lote movido para o Kanban (Coluna "Prontos p/ Despacho") */}
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Total: {deliveries.length} comandas
            </span>
          </div>
        </div>}
        {/* Romaneio Ativo */}
        {activeManifest && (
          <div className="ops-manifest" style={{
            background: '#0d131f', 
            border: '1px solid #1f293d', 
            borderRadius: '8px', 
            padding: '0.75rem', 
            marginBottom: '0.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="font-mono" style={{ color: 'var(--color-cyan)', fontWeight: 'bold', fontSize: '0.85rem' }}>{activeManifest.id}</span>
              <button 
                style={{ background: 'transparent', border: 'none', color: 'var(--color-rose)', cursor: 'pointer', fontSize: '0.75rem' }}
                onClick={() => {
                  if (activeManifest.despachado) { setActiveManifest(null); return; }
                  setSelectedForManifest(activeManifest.deliveryIds);
                  setSelectedDriverForDispatch(activeManifest.driverId);
                  setActiveManifest(null);
                }}
              >
                {activeManifest.despachado ? 'Fechar romaneio' : 'Desfazer'}
              </button>
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              <div><strong>Motoboy:</strong> {activeManifest.driverName}</div>
              <div style={{ marginTop: '0.2rem' }}>
                <strong>Comandas:</strong>{' '}
                {activeManifest.deliveryIds.map(id => (
                  <span key={id} className="font-mono" style={{ marginRight: '0.4rem', background: '#141b27', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>
                    {id}
                  </span>
                ))}
              </div>
              <div style={{ 
                marginTop: '0.4rem', 
                padding: '0.4rem', 
                background: 'rgba(6, 182, 212, 0.04)', 
                border: '1px solid rgba(6, 182, 212, 0.1)', 
                borderRadius: '4px',
                color: 'var(--color-cyan)',
                fontWeight: 600
              }}>
                Total dos pedidos: R$ {activeManifest.totalValue.toFixed(2)}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.3rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-small"
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: '0.4rem',
                  background: '#141b27',
                  border: '1px solid #1f293d',
                  color: 'var(--text-primary)',
                  fontSize: '0.72rem',
                  padding: '0.35rem',
                  width: 'fit-content'
                }}
                onClick={() => setShowThermalReceipt(true)}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <path d="M6 9V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5" />
                  <rect width="12" height="8" x="6" y="14" rx="1" />
                </svg>
                Imprimir Guia do Motoboy (80mm)
              </button>

              {!activeManifest.despachado && <button
                type="button"
                className="btn btn-primary btn-small"
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: '0.4rem',
                  fontSize: '0.72rem',
                  padding: '0.35rem',
                  width: 'fit-content'
                }}
                onClick={async () => {
                  try {
                    const response = await apiFetch(`${BACKEND_URL}/api/deliveries/dispatch-batch`, {
                      method: 'POST',
                      body: JSON.stringify({
                        deliveryIds: activeManifest.deliveryIds,
                        driverId: activeManifest.driverId,
                        romaneioId: activeManifest.id
                      })
                    });
                    const data = await response.json();
                    if (!response.ok) {
                      throw new Error(data.error || 'Erro ao despachar entregas');
                    }

                    setActiveManifest(null);
                  } catch (err: any) {
                    avisarErro(err.message);
                  }
                }}
              >
                Liberar Entrega
              </button>}
            </div>
          </div>
        )}

        {/* Kanban de Controle de Comandas — substitui as 2 filas verticais antigas */}
        {sessao?.tipo==='loja'&&<ImplementationCard key={sessao.token} token={sessao.token} onLoaded={setImplementationState}/>}
        {new URLSearchParams(location.search).get('retorno')==='implantacao'&&<a className="btn btn-secondary" href="/area-cliente?secao=implantacao">Voltar à implantação e verificar a tarefa</a>}
        <OperationsWorkspace
          activeMenuKey={showVitrineModal ? 'vitrine' : showProdutosModal ? 'produtos' : undefined}
          onWorkspaceExit={async () => { if (catalogoAlterado && !(await confirmarAcao('Descartar as alterações não publicadas?'))) return false; setShowProdutosModal(false); setShowVitrineModal(false); setCatalogoAlterado(false); return true; }}
          workspace={showVitrineModal && sessao?.tipo === 'loja' && sessao.lojaId ? <GestaoVitrine backendUrl={BACKEND_URL} token={sessao.token} lojaId={sessao.lojaId} nomeLoja={sessao.nomeLoja || 'Minha Loja'} onDirtyChange={setCatalogoAlterado} onClose={() => { setShowVitrineModal(false); setCatalogoRefresh(v => v + 1); }} onProdutos={() => { setShowVitrineModal(false); setShowProdutosModal(true); }} /> : showProdutosModal && sessao?.tipo === 'loja' && sessao.lojaId ? <GestaoProdutos backendUrl={BACKEND_URL} token={sessao.token} lojaId={sessao.lojaId} nomeLoja={sessao.nomeLoja || 'Minha Loja'} onClose={() => setShowProdutosModal(false)} onEstoque={() => setShowEstoqueModal(true)} onVitrine={async () => { if (catalogoAlterado && !(await confirmarAcao('Descartar as alterações não publicadas?'))) return; setShowProdutosModal(false); setShowVitrineModal(true); }} onDirtyChange={setCatalogoAlterado} refreshKey={catalogoRefresh} /> : undefined}
          onDispatchViewChange={setDispatchViewActive}
          onDespacharProntos={despacharPedidosProntos}
          menuActions={[
            ...(tenantLojaId ? [{ key: 'configuracoes', label: 'Configurações', icon: 'settings' as const, onClick: () => setShowOperationSettings(true) }] : []),
            ...(sessao?.tipo === 'loja' && sessao.lojaId ? [
              { key: 'produtos', label: 'Produtos', icon: 'products' as const, onClick: async () => { if (catalogoAlterado && !(await confirmarAcao('Descartar as alterações não publicadas?'))) return; setShowVitrineModal(false); setShowProdutosModal(true); } },
              { key: 'vitrine', label: 'Configuração da vitrine', icon: 'products' as const, onClick: async () => { if (catalogoAlterado && !(await confirmarAcao('Descartar as alterações não publicadas?'))) return; setShowProdutosModal(false); setShowVitrineModal(true); } },
              { key: 'estoque', label: 'Estoque', icon: 'stock' as const, onClick: () => setShowEstoqueModal(true) },
            ] : []),
            { key: 'relatorios', label: 'Relatórios', icon: 'reports', onClick: () => { setReportPhase('filters'); setReportModalOpen(true); } },
            { key: 'motoristas', label: 'Cadastrar Motoboy', icon: 'drivers', onClick: () => setShowDriverModal(true) },
            { key: 'veiculos', label: 'Tipos de veículo', icon: 'vehicles', onClick: () => setShowVehicleModal(true) },
          ]}
          deliveries={deliveries}
          drivers={drivers}
          selectedForManifest={selectedForManifest}
          onToggleManifest={(id, checked) => setSelectedForManifest(prev => (checked ? [...new Set([...prev, id])] : prev.filter(x => x !== id)))}
          onPreparar={handlePrepararPedido}
          onFinalizar={handleFinalizarPedido}
          onCancelar={handleCancelarPedido}
          onAbrirComanda={setSelectedDeliveryId}
          onDespachar={gerarRomaneioParaSelecionados}
          onImprimir={(c) => imprimirComandaTicket(c as any, 'impressora')}
          getValor={getDeliveryValue as any}
          getStatusText={getStatusText}
          notasPorComanda={notasPorComanda}
          onNotaFiscal={tenantLojaId && fiscalApi ? handleNotaFiscalCard : undefined}
        />
        {/* (as 2 filas verticais antigas foram substituídas pelo Kanban acima) */}
      </section>

      {/* 4. Dashboard Main Body Grid */}
      <div className="dashboard-grid">
        
        {selectedDelivery && <section className="glass-panel" style={{ minWidth: 0 }}>
          <div className="panel-header"><h2>Gestão da entrega — {selectedDelivery.id}</h2></div>
          <p><strong>Cliente:</strong> {selectedDelivery.nomeCliente}</p>
          <p><strong>Endereço:</strong> {selectedDelivery.endereco}</p>
          <p><strong>Status:</strong> {getStatusText(selectedDelivery.status)}</p>
          {selectedDelivery.motorista && <p><strong>Entregador:</strong> {selectedDelivery.motorista.name}</p>}
          {selectedDelivery.recebedorNome && <p><strong>Recebido por:</strong> {selectedDelivery.recebedorNome}</p>}
          <ManualDeliveryActions key={selectedDelivery.id} status={selectedDelivery.status} onAction={async (action, payload) => {
            const response = await apiFetch(`${BACKEND_URL}/api/deliveries/${selectedDelivery.id}/${action}`, {
              method: 'POST', body: JSON.stringify(payload)
            });
            const updated = await response.json();
            if (!response.ok) throw new Error(updated.error || 'Não foi possível atualizar a entrega.');
            setAllDeliveries(previous => previous.map(d => d.id === updated.id ? updated : d));
          }} />
          {selectedDelivery.status === 'AGUARDANDO_RETORNO_CD' && <ReturnStockAction key={selectedDelivery.id} onReturn={async () => {
            const response = await apiFetch(`${BACKEND_URL}/api/deliveries/${selectedDelivery.id}/return-stock`, {
              method: 'POST', body: JSON.stringify({ confirmacaoIntegral: true })
            });
            const updated = await response.json();
            if (!response.ok) throw new Error(updated.error || 'Não foi possível registrar o retorno.');
            setAllDeliveries(previous => previous.map(d => d.id === updated.id ? updated : d));
          }} />}
          {selectedDelivery.status === 'PRODUTO_RETORNADO_ESTOQUE' && <p>Retorno integral confirmado e estoque estornado.</p>}
        </section>}

        {/* Right Side: Frota de Motoristas */}
        {!dispatchViewActive && !showProdutosModal && !showVitrineModal && <section className="glass-panel">
          <div className="panel-header">
            <h2>Frota de Motoristas</h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '550px', overflowY: 'auto' }}>
            {drivers.map(d => {
              return (
                <div key={d.id} className="driver-card">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <span style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span 
                        style={{ 
                          width: '8px', 
                          height: '8px', 
                          borderRadius: '50%', 
                          background: 'var(--color-emerald)',
                          boxShadow: '0 0 8px var(--color-emerald)',
                          display: 'inline-block' 
                        }}
                        title={d.status === 'ocioso' ? 'Disponível para despacho' : 'Em entrega'}
                      />
                      {getVehicleIcon(d.vehicleType)} 
                      {d.name}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className={`card-badge ${d.status === 'ocioso' ? 'completed' : 'failed'}`} style={{ textTransform: 'capitalize', fontSize: '0.7rem' }}>
                      {d.status === 'ocioso' ? 'Disponível' : 'Em Rota'}
                    </span>
                    <button 
                      className="icon-btn danger" 
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-rose)', display: 'flex', padding: '0.2rem' }}
                      title="Excluir Motoboy"
                      onClick={() => handleDeleteDriver(d.id)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>}

      </div>
      {(sessao.tipo==='admin'||operacaoBloqueada===false) && showThermalReceipt && activeManifest && createPortal(
        <div className="thermal-overlay">
          <div className="thermal-modal-content">

            {/* Barra de Ações — oculta na impressão via @media print */}
            <div className="thermal-actions-bar no-print">
              <span style={{ fontSize: '0.75rem', color: '#6b7280', fontFamily: 'sans-serif' }}>
                Visualização dos Cupons — {activeManifest.id}
              </span>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="thermal-btn-print"
                  onClick={() => window.print()}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <path d="M6 9V3h12v6" />
                    <rect width="12" height="8" x="6" y="14" rx="1" />
                  </svg>
                  Imprimir Guias
                </button>
                <button
                  className="thermal-btn-close"
                  onClick={() => setShowThermalReceipt(false)}
                >
                  Fechar
                </button>
              </div>
            </div>

            {/* Área impressa — única visível no @media print */}
            <div className="thermal-print-area">

            {/* ======================================================== */}
            {/* CUPOM 1: RESUMO DO ROMANEIO (Cupom de Saida)              */}
            {/* ======================================================== */}
            <div className="thermal-cupom">
              <div className="thermal-center thermal-title">ROMANEIO DE ENTREGA</div>
              <div className="thermal-divider-solid" />
              <div className="thermal-row"><span>ROMANEIO:</span> <span className="thermal-mono">{activeManifest.id}</span></div>
              <div className="thermal-row"><span>DATA/HORA:</span> <span>{new Date().toLocaleString('pt-BR')}</span></div>
              <div className="thermal-row"><span>MOTORISTA:</span> <span>{activeManifest.driverName}</span></div>
              <div className="thermal-divider-dashed" />
              <div className="thermal-row"><span>QTD COMANDAS:</span> <span className="thermal-mono">{activeManifest.deliveryIds.length}</span></div>
              <div className="thermal-divider-solid" />
              <div style={{ fontWeight: 'bold', marginBottom: '0.3rem' }}>RESUMO DE VALORES A COBRAR NA RUA:</div>
              <div className="thermal-divider-dashed" />
              {activeManifest.deliveryIds.map(id => {
                const d = deliveries.find(del => del.id === id);
                if (!d) return null;
                const fp = d.formaPagamento || 'maquininha';
                const fpLabel = fp === 'maquininha' ? 'CARTAO (MAQUININHA)' : fp === 'pix' ? 'PIX' : 'DINHEIRO';
                return (
                  <div key={id} className="thermal-row" style={{ fontSize: '0.76rem' }}>
                    <span className="thermal-mono">{d.id}:</span>
                    <span>R$ {getDeliveryValue(d).toFixed(2)} — {fpLabel}</span>
                  </div>
                );
              })}
              <div className="thermal-divider-dashed" />
              <div className="thermal-row thermal-total">
                <span>TOTAL A RECEBER NA RUA:</span>
                <span>R$ {activeManifest.totalValue.toFixed(2)}</span>
              </div>
              <div className="thermal-divider-solid" />
              <div className="thermal-center thermal-footer">* AGUARDANDO SAIDA DO MOTORISTA *</div>
            </div>

            {/* ======================================================== */}
            {/* CUPOM 2: FICHAS INDIVIDUAIS (uma por comanda)             */}
            {/* ======================================================== */}
            {activeManifest.deliveryIds.map((id, idx) => {
              const d = deliveries.find(del => del.id === id);
              if (!d) return null;
              const fp = d.formaPagamento || 'maquininha';
              const fpLabel = fp === 'maquininha' ? 'MAQUININHA (A COBRAR)' : fp === 'pix' ? 'PIX (A RECEBER)' : 'DINHEIRO (A RECEBER)';
              return (
                <div key={id} className="thermal-cupom">
                  <div className="thermal-center" style={{ fontSize: '0.7rem', marginBottom: '0.1rem' }}>FICHA {idx + 1} DE {activeManifest.deliveryIds.length}</div>
                  <div className="thermal-center thermal-title" style={{ fontSize: '0.95rem' }}>
                    {(d.nomeEmpresa || sessao?.nomeEmpresa || d.nomeLoja || sessao?.nomeLoja || 'FARMACIA & RESTAURANTE').toUpperCase()}
                  </div>
                  <div className="thermal-divider-solid" />
                  <div className="thermal-row"><span>COMANDA:</span> <span className="thermal-mono">{d.id}</span></div>
                  <div className="thermal-row"><span>ROMANEIO:</span> <span className="thermal-mono">{activeManifest.id}</span></div>
                  <div className="thermal-divider-dashed" />
                  <div className="thermal-row"><span>CLIENTE:</span> <span>{d.nomeCliente.toUpperCase()}</span></div>
                  {d.clienteDocumento && <div className="thermal-row"><span>CPF/CNPJ:</span> <span>{d.clienteDocumento}</span></div>}
                  <div className="thermal-row"><span>ENDERECO:</span> <span>{d.endereco}</span></div>
                  {d.bairro && <div className="thermal-row"><span>BAIRRO:</span> <span>{d.bairro.toUpperCase()}</span></div>}
                  {d.referencia && <div className="thermal-row"><span>REF:</span> <span>{d.referencia}</span></div>}
                  <div className="thermal-divider-dashed" />
                  <div style={{ fontWeight: 'bold', marginBottom: '0.3rem' }}>ITENS DO PEDIDO:</div>
                  {d.itens.map((item, i) => (
                    <div key={i} style={{ fontSize: '0.76rem', paddingLeft: '0.5rem' }}>
                      {i + 1}x {item}
                    </div>
                  ))}
                  <div className="thermal-divider-dashed" />
                  <div className="thermal-row" style={{ fontWeight: 'bold' }}>
                    <span>FORMA DE PAGAMENTO:</span>
                  </div>
                  <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '0.85rem', margin: '0.2rem 0' }}>{fpLabel}</div>
                  <div className="thermal-row thermal-total">
                    <span>VALOR TOTAL DO PEDIDO:</span>
                    <span>R$ {getDeliveryValue(d).toFixed(2)}</span>
                  </div>
                  <div className="thermal-divider-solid" />
                  <div className="thermal-center thermal-footer">* CONFIRMAR COM CLIENTE NA ENTREGA *</div>
                </div>
              );
            })}

          </div>
          </div>
        </div>
      , document.body)}

      {pedidoEmConferencia && sessao && (
        <ConferenciaSeparacao pedidoId={pedidoEmConferencia} backendUrl={BACKEND_URL} token={sessao.token}
          onClose={() => setPedidoEmConferencia(null)}
          onComplete={e => { const id = pedidoEmConferencia; setPedidoEmConferencia(null); void finalizarPedidoConferido(id, e); }} />
      )}
      {showOperationSettings && (
        <OperationSettingsModal onClose={() => setShowOperationSettings(false)}>
            {tenantLojaId && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 'normal' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" />
                </svg>
                Impressão de comanda:
                <select
                  className="form-select"
                  aria-label="Impressão de comanda" value={comandaPrintMode}
                  onChange={ev => alterarModoImpressao(ev.target.value as ModoImpressaoComanda)}
                  style={{ width: 'auto', minHeight: '30px', padding: '0 var(--space-2)', fontSize: '0.75rem' }}
                  title="Como a comanda é gerada quando um pedido novo entra na fila"
                >
                  <option value="impressora">Impressora 80mm (auto)</option>
                  <option value="pdf">Abrir PDF</option>
                  <option value="off">Desligada</option>
                </select>
              </label>
            )}
            {tenantLojaId && fiscalApi && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 'normal' }}>
                <span aria-hidden="true">🧾</span>
                Nota fiscal:
                <select
                  className="form-select"
                  aria-label="Nota fiscal padrão" value={modoNotaPadrao}
                  onChange={ev => alterarModoNota(ev.target.value as ModoNotaPadrao)}
                  style={{ width: 'auto', minHeight: '30px', padding: '0 var(--space-2)', fontSize: '0.75rem' }}
                  title="Documento fiscal emitido ao concluir a separação"
                >
                  <option value="perguntar">Perguntar (NFC-e ou NF-e)</option>
                  <option value="NFCE">NFC-e automática</option>
                  <option value="NFE">NF-e</option>
                  <option value="NENHUMA">Não emitir</option>
                </select>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setShowOperationSettings(false); setShowConfigFiscal(true); }}
                  style={{ minHeight: '30px', padding: '0 0.6rem', fontSize: '0.72rem' }}
                  title="CNPJ, IE, endereço, séries e tributação padrão do emitente"
                >
                  Dados fiscais
                </button>
                {fiscalStatus && (
                  <span
                    title={fiscalStatus.podeEmitir ? 'Ambiente fiscal da loja' : 'Configuração fiscal incompleta — abra Dados fiscais'}
                    style={{
                      fontSize: '0.66rem', fontWeight: 700,
                      color: !fiscalStatus.podeEmitir ? 'var(--color-rose)' : fiscalStatus.simulado ? 'var(--color-amber)'
                        : fiscalStatus.ambiente === 'PRODUCAO' ? 'var(--color-emerald)' : 'var(--color-cyan)',
                    }}
                  >
                    {!fiscalStatus.podeEmitir ? 'CONFIGURAR' : fiscalStatus.simulado ? 'SIMULADO' : fiscalStatus.ambiente === 'PRODUCAO' ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO'}
                  </span>
                )}
              </label>
            )}
        </OperationSettingsModal>
      )}

      {showEstoqueModal && sessao?.tipo === 'loja' && sessao.lojaId && (
        <GestaoEstoque backendUrl={BACKEND_URL} token={sessao.token}
          onClose={() => { setShowEstoqueModal(false); setCatalogoRefresh(v => v + 1); }}
          onProdutos={() => { setShowEstoqueModal(false); setShowProdutosModal(true); }} />
      )}
      {/* Módulo Fiscal: escolha NFC-e / NF-e ao concluir a separação (ou reemissão pelo card) */}
      {emissaoFiscal && comandaEmEmissao && (
        <EmissaoNotaModal
          titulo={emissaoFiscal.modo === 'separacao' ? 'Concluir separação' : 'Emitir nota fiscal'}
          comanda={{
            id: comandaEmEmissao.id,
            nomeCliente: comandaEmEmissao.nomeCliente,
            clienteDocumento: comandaEmEmissao.clienteDocumento,
            endereco: comandaEmEmissao.endereco,
            bairro: comandaEmEmissao.bairro,
            cidade: comandaEmEmissao.cidade,
            valor: getDeliveryValue(comandaEmEmissao),
          }}
          escolhaInicial={emissaoFiscal.escolhaInicial}
          permitirSemNota={emissaoFiscal.modo === 'separacao'}
          simulado={fiscalSimulado || fiscalStatus?.ambiente !== 'PRODUCAO'}
          sefazDireta={fiscalStatus?.provedor==='SEFAZ_DIRETA'}
          onConfirmar={confirmarEmissaoFiscal}
          onAbrirConfig={() => setShowConfigFiscal(true)}
          onFechar={() => setEmissaoFiscal(null)}
        />
      )}
      {showConfigFiscal && fiscalApi && tenantLojaId && (
        <ConfigFiscalModal
          api={fiscalApi}
          nomeLoja={sessao?.nomeLoja || lojaVisualizada?.nome || 'Minha Loja'}
          onSalvo={atualizarStatusFiscal}
          onFechar={() => setShowConfigFiscal(false)}
        />
      )}

      {/* Modal do Relatório Analítico */}
      {(sessao.tipo==='admin'||operacaoBloqueada===false) && reportModalOpen && createPortal(
        <div className="report-modal-overlay" onClick={() => setReportModalOpen(false)}>
          <div className="report-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="report-modal-header">
              <h2>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-cyan)' }}>
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
                Análise de Desempenho da Frota
              </h2>
              <button className="report-modal-close-btn" onClick={() => setReportModalOpen(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="report-modal-body">
              {reportPhase === 'filters' ? (
                /* FASE 1: Filtros do Relatório */
                <form onSubmit={handleTriggerGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group">
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Data Inicial</label>
                      <input 
                        type="date" 
                        className="date-input-dark" 
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Data Final</label>
                      <input 
                        type="date" 
                        className="date-input-dark" 
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Filtros Rápidos de Período</label>
                    <div className="shortcut-buttons">
                      <button type="button" className="shortcut-btn" onClick={() => handleShortcutFilter('hoje')}>Hoje</button>
                      <button type="button" className="shortcut-btn" onClick={() => handleShortcutFilter('7dias')}>Últimos 7 dias</button>
                      <button type="button" className="shortcut-btn" onClick={() => handleShortcutFilter('esteMes')}>Este Mês</button>
                    </div>
                  </div>

                  <div className="form-group">
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Seleção de Entregador</label>
                    <select 
                      className="form-select" 
                      value={selectedDriverId} 
                      onChange={(e) => setSelectedDriverId(e.target.value)}
                    >
                      <option value="Todos">Todos os Entregadores</option>
                      {drivers.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>

                  <button 
                    type="submit" 
                    className="btn btn-primary" 
                    style={{ 
                      marginTop: '0.5rem', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      gap: '0.5rem',
                      opacity: isGenerating ? 0.75 : 1,
                      cursor: isGenerating ? 'not-allowed' : 'pointer'
                    }}
                    disabled={isGenerating}
                  >
                    {isGenerating ? (
                      <>
                        <svg className="spinner-rotate" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                          <line x1="12" y1="2" x2="12" y2="6" />
                          <line x1="12" y1="18" x2="12" y2="22" />
                          <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
                          <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
                          <line x1="2" y1="12" x2="6" y2="12" />
                          <line x1="18" y1="12" x2="22" y2="12" />
                          <line x1="4.93" y1="19.07" x2="7.76" y2="16.24" />
                          <line x1="16.24" y1="7.76" x2="19.07" y2="4.93" />
                        </svg>
                        Buscando no Banco de Dados...
                      </>
                    ) : (
                      'Gerar Relatório'
                    )}
                  </button>
                </form>
              ) : (
                /* FASE 2: Exibição do Relatório / Dashboard */
                <div>
                  <div className="report-sub-header">
                    <div>
                      <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {sessao?.tipo === 'loja' ? 'Painel de Indicadores & Analytics' : 'Análise de Desempenho da Frota'}
                      </h3>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Período: {formatarDataBR(startDate)} até {formatarDataBR(endDate)}
                        {selectedDriverId !== 'Todos' && ` | Filtro: ${drivers.find(d => d.id === selectedDriverId)?.name}`}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button 
                        type="button"
                        className="btn btn-secondary btn-small"
                        style={{ fontSize: '0.72rem', padding: '0.35rem 0.6rem' }}
                        onClick={() => setReportPhase('filters')}
                      >
                        Voltar aos Filtros
                      </button>
                      <button 
                        type="button"
                        className="btn btn-success btn-small"
                        style={{ fontSize: '0.72rem', padding: '0.35rem 0.6rem' }}
                        onClick={handleExportCSV}
                      >
                        Exportar Excel
                      </button>
                    </div>
                  </div>

                  {/* KPIs */}
                  <div className="report-kpi-grid">
                    <div className="report-kpi-card">
                      <span className="kpi-label">Entregas Realizadas</span>
                      <span className="kpi-value">{totalConcluidas}</span>
                    </div>
                    <div className="report-kpi-card">
                      <span className="kpi-label">Tempo Médio (SLA)</span>
                      <span className="kpi-value">{tempoMedioSla} min</span>
                    </div>
                    <div className="report-kpi-card">
                      <span className="kpi-label">Taxa de Sucesso</span>
                      <span className="kpi-value" style={{ color: taxaSucesso > 80 ? 'var(--color-emerald)' : 'var(--color-amber)' }}>{taxaSucesso}%</span>
                    </div>
                  </div>

                  {/* Abas analíticas (Exclusivo da visão de loja) */}
                  {sessao?.tipo === 'loja' && (
                    <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-thin)', paddingBottom: '0.6rem', flexWrap: 'wrap' }}>
                      <button 
                        type="button"
                        className="btn btn-small" 
                        style={{ 
                          fontSize: '0.75rem', 
                          padding: '0.3rem 0.6rem', 
                          background: activeReportTab === 'fleet' ? '#0891b2' : 'var(--bg-card)', 
                          color: activeReportTab === 'fleet' ? '#fff' : 'var(--text-secondary)',
                          border: '1px solid ' + (activeReportTab === 'fleet' ? '#0891b2' : 'var(--border-thin)'),
                          borderRadius: '4px'
                        }}
                        onClick={() => setActiveReportTab('fleet')}
                      >
                        Frota e Desempenho
                      </button>
                      <button 
                        type="button"
                        className="btn btn-small" 
                        style={{ 
                          fontSize: '0.75rem', 
                          padding: '0.3rem 0.6rem', 
                          background: activeReportTab === 'regions' ? '#0891b2' : 'var(--bg-card)', 
                          color: activeReportTab === 'regions' ? '#fff' : 'var(--text-secondary)',
                          border: '1px solid ' + (activeReportTab === 'regions' ? '#0891b2' : 'var(--border-thin)'),
                          borderRadius: '4px'
                        }}
                        onClick={() => setActiveReportTab('regions')}
                      >
                        Vendas por Região
                      </button>
                      <button 
                        type="button"
                        className="btn btn-small" 
                        style={{ 
                          fontSize: '0.75rem', 
                          padding: '0.3rem 0.6rem', 
                          background: activeReportTab === 'finance' ? '#0891b2' : 'var(--bg-card)', 
                          color: activeReportTab === 'finance' ? '#fff' : 'var(--text-secondary)',
                          border: '1px solid ' + (activeReportTab === 'finance' ? '#0891b2' : 'var(--border-thin)'),
                          borderRadius: '4px'
                        }}
                        onClick={() => setActiveReportTab('finance')}
                      >
                        Financeiro e SLA
                      </button>
                      <button 
                        type="button"
                        className="btn btn-small" 
                        style={{ 
                          fontSize: '0.75rem', 
                          padding: '0.3rem 0.6rem', 
                          background: activeReportTab === 'travel_time' ? '#0891b2' : 'var(--bg-card)', 
                          color: activeReportTab === 'travel_time' ? '#fff' : 'var(--text-secondary)',
                          border: '1px solid ' + (activeReportTab === 'travel_time' ? '#0891b2' : 'var(--border-thin)'),
                          borderRadius: '4px'
                        }}
                        onClick={() => setActiveReportTab('travel_time')}
                      >
                        Tempo de Trajeto
                      </button>
                      <button 
                        type="button"
                        className="btn btn-small" 
                        style={{ 
                          fontSize: '0.75rem', 
                          padding: '0.3rem 0.6rem', 
                          background: activeReportTab === 'incidents' ? '#0891b2' : 'var(--bg-card)', 
                          color: activeReportTab === 'incidents' ? '#fff' : 'var(--text-secondary)',
                          border: '1px solid ' + (activeReportTab === 'incidents' ? '#0891b2' : 'var(--border-thin)'),
                          borderRadius: '4px'
                        }}
                        onClick={() => setActiveReportTab('incidents')}
                      >
                        Incidentes e Alertas
                      </button>
                    </div>
                  )}

                  {/* Renderização condicional de Abas */}
                  {(!sessao || sessao.tipo !== 'loja' || activeReportTab === 'fleet') && (
                    <>
                      {/* Gráfico Principal */}
                      <div className="chart-svg-container" style={{ marginBottom: '1.25rem' }}>
                        <h4 style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', fontWeight: 600 }}>Entregas por Entregador no Período</h4>
                        <svg width="100%" height="200" viewBox={`0 0 ${chartWidth} 200`} style={{ overflow: 'visible' }}>
                          <defs>
                            <linearGradient id="gradSuccess" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="var(--color-emerald)" stopOpacity="1" />
                              <stop offset="100%" stopColor="rgba(16, 185, 129, 0.2)" stopOpacity="0.2" />
                            </linearGradient>
                            <linearGradient id="gradFail" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="var(--color-rose)" stopOpacity="1" />
                              <stop offset="100%" stopColor="rgba(244, 63, 94, 0.2)" stopOpacity="0.2" />
                            </linearGradient>
                          </defs>

                          {/* Grade de fundo */}
                          <line x1="50" y1="30" x2={chartWidth - 20} y2="30" stroke="rgba(255,255,255,0.03)" strokeDasharray="3,3" />
                          <line x1="50" y1="75" x2={chartWidth - 20} y2="75" stroke="rgba(255,255,255,0.03)" strokeDasharray="3,3" />
                          <line x1="50" y1="120" x2={chartWidth - 20} y2="120" stroke="rgba(255,255,255,0.03)" strokeDasharray="3,3" />
                          <line x1="50" y1="160" x2={chartWidth - 20} y2="160" stroke="var(--border-thin)" strokeWidth="1" />

                          {/* Eixo Y */}
                          <text x="38" y="34" fill="var(--text-secondary)" fontSize="9" textAnchor="end">{maxVolume}</text>
                          <text x="38" y="98" fill="var(--text-secondary)" fontSize="9" textAnchor="end">{Math.round(maxVolume / 2)}</text>
                          <text x="38" y="163" fill="var(--text-secondary)" fontSize="9" textAnchor="end">0</text>

                          {/* Barras por motorista */}
                          {motoristasPerformance.map((drv, idx) => {
                            const xOffset = 80 + idx * 100;
                            const scale = 120 / maxVolume;
                            const heightSuccess = drv.concluidas * scale;
                            const heightCancel = drv.canceladas * scale;

                            return (
                              <g key={drv.id}>
                                {/* Barra Sucesso */}
                                <rect 
                                  x={xOffset} 
                                  y={160 - heightSuccess} 
                                  width="24" 
                                  height={heightSuccess} 
                                  fill="url(#gradSuccess)" 
                                  rx="3"
                                  stroke="var(--color-emerald)"
                                  strokeWidth="0.5"
                                />
                                {drv.concluidas > 0 && (
                                  <text x={xOffset + 12} y={155 - heightSuccess} fill="var(--color-emerald)" fontSize="9" textAnchor="middle" fontWeight="bold">
                                    {drv.concluidas}
                                  </text>
                                )}

                                {/* Barra Cancelamento */}
                                <rect 
                                  x={xOffset + 28} 
                                  y={160 - heightCancel} 
                                  width="24" 
                                  height={heightCancel} 
                                  fill="url(#gradFail)" 
                                  rx="3"
                                  stroke="var(--color-rose)"
                                  strokeWidth="0.5"
                                />
                                {drv.canceladas > 0 && (
                                  <text x={xOffset + 40} y={155 - heightCancel} fill="var(--color-rose)" fontSize="9" textAnchor="middle" fontWeight="bold">
                                    {drv.canceladas}
                                  </text>
                                )}

                                {/* Rótulo Eixo X */}
                                <text x={xOffset + 26} y="178" fill="var(--text-primary)" fontSize="9" textAnchor="middle">
                                  {drv.name.split(' ')[0]}
                                </text>
                              </g>
                            );
                          })}
                        </svg>
                        
                        <div className="chart-legends">
                          <div className="legend-item">
                            <span className="legend-color" style={{ backgroundColor: 'var(--color-emerald)', border: '1px solid var(--color-emerald)' }}></span>
                            <span style={{ color: 'var(--text-secondary)' }}>Concluídas com Sucesso</span>
                          </div>
                          <div className="legend-item">
                            <span className="legend-color" style={{ backgroundColor: 'var(--color-rose)', border: '1px solid var(--color-rose)' }}></span>
                            <span style={{ color: 'var(--text-secondary)' }}>Canceladas / Devolvidas</span>
                          </div>
                        </div>
                      </div>

                      {/* Tabela de Desempenho */}
                      <div style={{ overflowX: 'auto', border: '1px solid var(--border-thin)', borderRadius: '8px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                          <thead>
                            <tr style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-thin)', color: 'var(--text-secondary)' }}>
                              <th style={{ padding: '0.6rem 0.8rem' }}>Entregador</th>
                              <th style={{ padding: '0.6rem 0.8rem' }}>Veículo</th>
                              <th style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>Concluídas</th>
                              <th style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>Canceladas</th>
                              <th style={{ padding: '0.6rem 0.8rem', textAlign: 'right' }}>Faturamento</th>
                              <th style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>Nota Média</th>
                            </tr>
                          </thead>
                          <tbody>
                            {motoristasPerformance
                              .filter(m => selectedDriverId === 'Todos' || m.id === selectedDriverId)
                              .map(m => (
                                <tr key={m.id} style={{ borderBottom: '1px solid var(--border-thin)' }}>
                                  <td style={{ padding: '0.6rem 0.8rem', fontWeight: 500, color: 'var(--text-primary)' }}>{m.name}</td>
                                  <td style={{ padding: '0.6rem 0.8rem', textTransform: 'capitalize', color: 'var(--text-secondary)' }}>{m.veiculo === 'refrigerated_truck' ? 'Caminhão Refrigerado' : m.veiculo === 'motorcycle' ? 'Motocicleta' : m.veiculo}</td>
                                  <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center', fontWeight: 'bold', color: 'var(--color-emerald)' }}>{m.concluidas}</td>
                                  <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center', fontWeight: 'bold', color: 'var(--color-rose)' }}>{m.canceladas}</td>
                                  <td style={{ padding: '0.6rem 0.8rem', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--color-cyan)' }}>R$ {m.faturamento.toFixed(2)}</td>
                                  <td style={{ padding: '0.6rem 0.8rem', textAlign: 'center' }}>
                                    <span className="card-badge completed" style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.08)', color: 'var(--color-emerald)', border: '1px solid rgba(16, 185, 129, 0.15)' }}>
                                      ★ {m.avaliacaoMedia}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}

                  {sessao?.tipo === 'loja' && activeReportTab === 'regions' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <h4 style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>Entregas por Região / Bairro</h4>
                      {regioesPerformance.length === 0 ? (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem', border: '1px dashed var(--border-thin)', borderRadius: '8px' }}>
                          Nenhuma entrega com informação de bairro no período.
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'var(--bg-card)', border: '1px solid var(--border-thin)', borderRadius: '8px', padding: '1rem' }}>
                          {regioesPerformance.map(r => {
                            const scale = (r.total / maxRegionVolume) * 100;
                            return (
                              <div key={r.bairro} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem' }}>
                                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.bairro}</span>
                                  <span style={{ color: 'var(--text-secondary)' }}>
                                    <strong>{r.total}</strong> comandas ({r.sucesso} OK / {r.cancelado} Falhas) | <strong style={{ color: 'var(--color-cyan)' }}>R$ {r.faturamento.toFixed(2)}</strong>
                                  </span>
                                </div>
                                <div style={{ width: '100%', height: '8px', background: 'rgba(255, 255, 255, 0.04)', borderRadius: '4px', overflow: 'hidden' }}>
                                  <div style={{ width: `${scale}%`, height: '100%', background: 'linear-gradient(90deg, var(--color-cyan), var(--color-blue))', borderRadius: '4px' }}></div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {sessao?.tipo === 'loja' && activeReportTab === 'finance' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      <div>
                        <h4 style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.5rem' }}>Faturamento por Forma de Pagamento</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-thin)', borderRadius: '8px', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Faturamento via Pix</span>
                            <strong style={{ fontSize: '1.1rem', color: 'var(--color-emerald)', fontFamily: 'var(--font-mono)' }}>R$ {pagamentosMap.pix.toFixed(2)}</strong>
                          </div>
                          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-thin)', borderRadius: '8px', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Faturamento via Cartão (Maquininha)</span>
                            <strong style={{ fontSize: '1.1rem', color: 'var(--color-cyan)', fontFamily: 'var(--font-mono)' }}>R$ {pagamentosMap.maquininha.toFixed(2)}</strong>
                          </div>
                          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-thin)', borderRadius: '8px', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Faturamento via Dinheiro</span>
                            <strong style={{ fontSize: '1.1rem', color: 'var(--color-amber)', fontFamily: 'var(--font-mono)' }}>R$ {pagamentosMap.dinheiro.toFixed(2)}</strong>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.5rem' }}>Tempo Médio de SLA por Prioridade de Pedido</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
                          {prioridadesSla.map(p => {
                            const badgeColor = p.prioridade === 'critica' ? 'var(--color-rose)' : p.prioridade === 'alta' ? 'var(--color-amber)' : p.prioridade === 'media' ? 'var(--color-blue)' : 'var(--text-secondary)';
                            return (
                              <div key={p.prioridade} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-thin)', borderRadius: '8px', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                <span style={{ fontSize: '0.72rem', color: badgeColor, textTransform: 'capitalize', fontWeight: 'bold' }}>• {p.prioridade}</span>
                                <strong style={{ fontSize: '1.1rem', color: '#fff', fontFamily: 'var(--font-mono)' }}>{p.slaMedio} min</strong>
                                <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>Com base em {p.totalSucesso} entregas</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {sessao?.tipo === 'loja' && activeReportTab === 'travel_time' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      <div>
                        <h4 style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.5rem' }}>Tempo Médio de Trajeto por Motoboy</h4>
                        {motoboysTrajeto.length === 0 ? (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '1.5rem', border: '1px dashed var(--border-thin)', borderRadius: '8px' }}>
                            Sem dados de romaneios concluídos no período.
                          </div>
                        ) : (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                            {motoboysTrajeto.map(m => (
                              <div key={m.driverId} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-thin)', borderRadius: '8px', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{m.name}</span>
                                <strong style={{ fontSize: '1.15rem', color: 'var(--color-cyan)', fontFamily: 'var(--font-mono)' }}>{m.tempoMedioTrajeto} min</strong>
                                <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>Média sobre {m.totalRomaneios} romaneios</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <h4 style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600, marginBottom: '0.5rem' }}>Histórico de Romaneios & Trajetos</h4>
                        {romaneiosAnalise.length === 0 ? (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '1.5rem', border: '1px dashed var(--border-thin)', borderRadius: '8px' }}>
                            Nenhum romaneio gerado no período.
                          </div>
                        ) : (
                          <div style={{ overflowX: 'auto', border: '1px solid var(--border-thin)', borderRadius: '8px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', textAlign: 'left' }}>
                              <thead>
                                <tr style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border-thin)', color: 'var(--text-secondary)' }}>
                                  <th style={{ padding: '0.5rem 0.6rem' }}>Cód. Romaneio</th>
                                  <th style={{ padding: '0.5rem 0.6rem' }}>Entregador</th>
                                  <th style={{ padding: '0.5rem 0.6rem', textAlign: 'center' }}>Qtd Comandas</th>
                                  <th style={{ padding: '0.5rem 0.6rem', textAlign: 'center' }}>Horário</th>
                                  <th style={{ padding: '0.5rem 0.6rem', textAlign: 'center' }}>Tempo Trajeto</th>
                                  <th style={{ padding: '0.5rem 0.6rem', textAlign: 'right' }}>Faturamento</th>
                                  <th style={{ padding: '0.5rem 0.6rem', textAlign: 'center' }}>Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {romaneiosAnalise.map(r => (
                                  <tr key={r.romId} style={{ borderBottom: '1px solid var(--border-thin)' }}>
                                    <td style={{ padding: '0.5rem 0.6rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{r.romId}</td>
                                    <td style={{ padding: '0.5rem 0.6rem', color: 'var(--text-secondary)' }}>{r.driverName}</td>
                                    <td style={{ padding: '0.5rem 0.6rem', textAlign: 'center' }}>{r.totalDels} ({r.concluidas} OK)</td>
                                    <td style={{ padding: '0.5rem 0.6rem', textAlign: 'center', color: 'var(--text-muted)' }}>{r.horaInicio} até {r.horaFim}</td>
                                    <td style={{ padding: '0.5rem 0.6rem', textAlign: 'center', fontWeight: '500', color: 'var(--color-cyan)' }}>{r.tempoTrajetoMin} min</td>
                                    <td style={{ padding: '0.5rem 0.6rem', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>R$ {r.totalValue.toFixed(2)}</td>
                                    <td style={{ padding: '0.5rem 0.6rem', textAlign: 'center' }}>
                                      <span className={`card-badge ${r.romStatus === 'Concluído' ? 'completed' : 'in_transit'}`} style={{ fontSize: '0.62rem', padding: '0.1rem 0.3rem' }}>
                                        {r.romStatus}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {sessao?.tipo === 'loja' && activeReportTab === 'incidents' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <h4 style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>Detalhamento de Exceções & Incidentes de Rota</h4>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-thin)', borderRadius: '8px', padding: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Trânsito Intenso</span>
                            <strong style={{ fontSize: '1.2rem', color: 'var(--color-rose)' }}>{incidentesTiposCount.traffic_jam} ocorrências</strong>
                          </div>
                        </div>
                        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-thin)', borderRadius: '8px', padding: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Problemas no Veículo</span>
                            <strong style={{ fontSize: '1.2rem', color: 'var(--color-rose)' }}>{incidentesTiposCount.flat_tire} ocorrências</strong>
                          </div>
                        </div>
                        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-thin)', borderRadius: '8px', padding: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Alerta de Temperatura</span>
                            <strong style={{ fontSize: '1.2rem', color: 'var(--color-rose)' }}>{incidentesTiposCount.temperature_spike} ocorrências</strong>
                          </div>
                        </div>
                        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-thin)', borderRadius: '8px', padding: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Desvios de Rota</span>
                            <strong style={{ fontSize: '1.2rem', color: 'var(--color-rose)' }}>{incidentesTiposCount.route_deviation} ocorrências</strong>
                          </div>
                        </div>
                      </div>

                      <div style={{ background: 'rgba(16, 185, 129, 0.04)', border: '1px solid rgba(16, 185, 129, 0.15)', borderRadius: '8px', padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                          {totalIncidentes === 0 ? 'Excelente! Zero incidentes de rota registrados no período selecionado.' : `Registrados ${totalIncidentes} incidentes/exceções no período.`}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      , document.body)}

      {/* Modal de Cadastro de Motoboy */}
      {(sessao.tipo==='admin'||operacaoBloqueada===false) && showDriverModal && createPortal(
        <div className="report-modal-overlay" onClick={() => setShowDriverModal(false)}>
          <div className="report-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="report-modal-header">
              <h2>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-cyan)', marginRight: '0.5rem' }}>
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                </svg>
                Motoboys da Frota
              </h2>
              <button className="report-modal-close-btn" onClick={() => setShowDriverModal(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="report-modal-body">
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>
                Motoboys Cadastrados
              </label>
              
              {/* Lista vertical de motoboys */}
              <div style={{ 
                maxHeight: '180px', 
                overflowY: 'auto', 
                marginBottom: '1.25rem', 
                border: '1px solid var(--border-thin)', 
                borderRadius: '8px', 
                display: 'flex', 
                flexDirection: 'column', 
                background: 'rgba(0,0,0,0.1)'
              }}>
                {drivers.map((d, index) => (
                  <div 
                    key={d.id} 
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      padding: '0.6rem 0.8rem',
                      borderBottom: index === drivers.length - 1 ? 'none' : '1px solid var(--border-thin)'
                    }}
                  >
                    <span style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-primary)' }}>
                      {getVehicleIcon(d.vehicleType)}
                      <span style={{ fontWeight: 500 }}>{d.name}</span>
                      <span style={{ 
                        fontSize: '0.65rem', 
                        padding: '0.1rem 0.3rem', 
                        borderRadius: '4px',
                        marginLeft: '0.25rem',
                        background: d.status === 'ocioso' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(244, 63, 94, 0.08)',
                        color: d.status === 'ocioso' ? 'var(--color-emerald)' : 'var(--color-rose)',
                        textTransform: 'capitalize'
                      }}>
                        {d.status === 'ocioso' ? 'disponível' : 'em rota'}
                      </span>
                    </span>
                    <button 
                      type="button" 
                      style={{ 
                        background: 'transparent', 
                        border: 'none', 
                        color: 'var(--color-rose)', 
                        cursor: d.status === 'ocupado' ? 'not-allowed' : 'pointer', 
                        padding: '0.2rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: d.status === 'ocupado' ? 0.35 : 0.8
                      }}
                      disabled={d.status === 'ocupado'}
                      onClick={() => handleDeleteDriver(d.id)}
                      title={d.status === 'ocupado' ? 'Motoboy em rota não pode ser removido' : 'Remover Motoboy'}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>

              <form onSubmit={handleSubmitDriver} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Cadastrar Novo Motoboy</label>
                <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={newDriverName} 
                    onChange={(e) => setNewDriverName(e.target.value)} 
                    placeholder="Nome (ex: Pedro Henrique Moto-05)"
                    required 
                  />
                </div>
                <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <select 
                      className="form-select" 
                      value={newDriverVehicleType} 
                      onChange={(e) => setNewDriverVehicleType(e.target.value)}
                      style={{ flex: 1 }}
                    >
                      {vehicleTypes.map(vt => (
                        <option key={vt.id} value={vt.id}>{vt.name}</option>
                      ))}
                    </select>
                    <button 
                      type="button" 
                      className="btn btn-secondary btn-small"
                      style={{ padding: '0.6rem 0.8rem', whiteSpace: 'nowrap' }}
                      onClick={() => {
                        setShowDriverModal(false);
                        setShowVehicleModal(true);
                      }}
                    >
                      + Novo Tipo
                    </button>
                  </div>
                </div>
                <button type="submit" className="btn btn-primary" style={{ marginTop: '0.25rem' }}>
                  Salvar Motoboy
                </button>
              </form>
            </div>
          </div>
        </div>
      , document.body)}

      {(sessao.tipo==='admin'||operacaoBloqueada===false) && showVehicleModal && createPortal(
        <div className="report-modal-overlay" onClick={() => setShowVehicleModal(false)}>
          <div className="report-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="report-modal-header">
              <h2>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-emerald)', marginRight: '0.5rem' }}>
                  <rect x="1" y="3" width="15" height="13" />
                  <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
                </svg>
                Tipos de Veículo
              </h2>
              <button className="report-modal-close-btn" onClick={() => setShowVehicleModal(false)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="report-modal-body">
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.5rem' }}>
                Tipos de Veículos Cadastrados
              </label>
              
              <div style={{ 
                maxHeight: '150px', 
                overflowY: 'auto', 
                marginBottom: '1.25rem', 
                border: '1px solid var(--border-thin)', 
                borderRadius: '8px', 
                padding: '0.6rem', 
                display: 'flex', 
                flexWrap: 'wrap', 
                gap: '0.5rem',
                background: 'rgba(0,0,0,0.1)'
              }}>
                {vehicleTypes.map(vt => (
                  <span 
                    key={vt.id} 
                    style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: '0.35rem', 
                      fontSize: '0.72rem', 
                      padding: '0.3rem 0.5rem', 
                      borderRadius: '6px',
                      background: 'rgba(16, 185, 129, 0.08)', 
                      color: 'var(--color-emerald)', 
                      border: '1px solid rgba(16, 185, 129, 0.15)',
                      fontWeight: 500
                    }}
                  >
                    {getVehicleIcon(vt.id)}
                    {vt.name}
                  </span>
                ))}
              </div>

              <form onSubmit={handleSubmitVehicle} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Incluir Novo Veículo</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={newVehicleName} 
                    onChange={(e) => setNewVehicleName(e.target.value)} 
                    placeholder="Ex: Carro, Patinete Elétrico"
                    required 
                    style={{ flex: 1 }}
                  />
                  <button type="submit" className="btn btn-success" style={{ padding: '0 1rem', whiteSpace: 'nowrap' }}>
                    + Incluir
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      , document.body)}

      {(sessao.tipo==='admin'||operacaoBloqueada===false) && editingLoja && createPortal(
        <div className="report-modal-overlay" onClick={() => setEditingLoja(null)}>
          <div className="report-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="report-modal-header">
              <h2>Editar Informações da Loja</h2>
              <button className="report-modal-close-btn" onClick={() => setEditingLoja(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="report-modal-body">
              <form onSubmit={handleUpdateLoja} style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                <div className="form-group">
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Nome Fantasia</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={editLojaNome} 
                    onChange={e => setEditLojaNome(e.target.value)} 
                    required 
                  />
                </div>
                <div className="form-group">
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>CNPJ da Loja</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={editLojaCnpj} 
                    onChange={e => setEditLojaCnpj(e.target.value)} 
                    required 
                  />
                </div>
                <div className="form-group">
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Usuário de Acesso</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={editLojaUsuario} 
                    onChange={e => setEditLojaUsuario(e.target.value)} 
                    required 
                  />
                </div>
                <div className="form-group">
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Alterar Senha (deixe em branco para manter a atual)</label>
                  <input 
                    type="password" 
                    className="form-input" 
                    value={editLojaSenha} 
                    onChange={e => setEditLojaSenha(e.target.value)} 
                    placeholder="Nova senha da loja"
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                  <div className="form-group">
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>CEP</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editLojaCep}
                      onChange={e => setEditLojaCep(e.target.value)}
                      placeholder="00000-000"
                      maxLength={9}
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>UF</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editLojaUf}
                      onChange={e => setEditLojaUf(e.target.value.toUpperCase())}
                      placeholder="SP"
                      maxLength={2}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.6rem' }}>
                  <div className="form-group">
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Endereço (Logradouro)</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editLojaEndereco}
                      onChange={e => setEditLojaEndereco(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Número</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editLojaNumero}
                      onChange={e => setEditLojaNumero(e.target.value)}
                      placeholder="123"
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem' }}>
                  <div className="form-group">
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Bairro</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editLojaBairro}
                      onChange={e => setEditLojaBairro(e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Cidade</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editLojaCidade}
                      onChange={e => setEditLojaCidade(e.target.value)}
                    />
                  </div>
                </div>
                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <input
                    type="checkbox"
                    id="editLojaRecebePedidos"
                    checked={editLojaRecebePedidos} 
                    onChange={e => setEditLojaRecebePedidos(e.target.checked)} 
                    style={{ accentColor: 'var(--color-cyan)', cursor: 'pointer', width: '15px', height: '15px' }}
                  />
                  <label htmlFor="editLojaRecebePedidos" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 0 }}>
                    Ativar Fila de Pedidos (WhatsApp)
                  </label>
                </div>
                <button type="submit" className="btn btn-success" style={{ width: '100%', marginTop: '0.5rem' }}>Salvar Alterações</button>
              </form>
            </div>
          </div>
        </div>
      , document.body)}
      </div>
    </div>
  );
}
