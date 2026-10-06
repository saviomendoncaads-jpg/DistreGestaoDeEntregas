import { FiscalProviderAdapter } from './FiscalProviderAdapter';
import { MockFiscalAdapter } from './adapters/MockFiscalAdapter';
import { FocusNfeAdapter } from './adapters/FocusNfeAdapter';
import { ProvedorFiscal } from './tipos';

// O provedor é escolhido POR LOJA, no painel (Dados fiscais → Provedor):
//  - SIMULADO: emite localmente, sempre em homologação e sem valor fiscal.
//  - FOCUSNFE: transmite à SEFAZ via Focus NFe com os tokens da própria loja.
// Os adapters não guardam estado de loja (o token vem no contexto de cada chamada),
// então uma instância de cada atende todas as lojas.

const instancias: Partial<Record<ProvedorFiscal, FiscalProviderAdapter>> = {};

export function getProvedorFiscal(nome: ProvedorFiscal): FiscalProviderAdapter {
  const existente = instancias[nome];
  if (existente) return existente;
  const nova = nome === 'FOCUSNFE' ? new FocusNfeAdapter() : new MockFiscalAdapter();
  instancias[nome] = nova;
  return nova;
}

/** Reseta os singletons (útil em testes). */
export function _resetProvedorFiscal() {
  delete instancias.SIMULADO;
  delete instancias.FOCUSNFE;
}
