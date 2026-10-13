import catalogo from './servicos.json';
import { AmbienteFiscal, ModeloNota } from '../tipos';
import { CODIGO_UF } from '../chaveAcesso';

export type ServicoSefaz = 'autorizacao' | 'retorno' | 'consulta' | 'status' | 'evento' | 'inutilizacao';
const nomes: Record<ServicoSefaz, string[]> = {
  autorizacao:['NFeAutorizacao'], retorno:['NFeRetAutorizacao'],
  consulta:['NfeConsultaProtocolo','NFeConsultaProtocolo'], status:['NfeStatusServico','NFeStatusServico'],
  evento:['RecepcaoEvento'], inutilizacao:['NfeInutilizacao','NFeInutilizacao'],
};
// SEFAZ estaduais + virtuais. Fontes oficiais registradas em docs/fiscal-sefaz-direta.md.
export function autorizador(uf: string, modelo: ModeloNota): string {
  if (!CODIGO_UF[uf]) throw new Error('UF inválida.');
  if (modelo === 'NFE') return uf === 'MA' ? 'SVAN' : ['AM','BA','GO','MG','MS','MT','PE','PR','RS','SP'].includes(uf) ? uf : 'SVRS';
  return ['AM','GO','MG','MS','MT','PR','RS','SP'].includes(uf) ? uf : 'SVRS';
}

export function endpointSefaz(uf: string, modelo: ModeloNota, ambiente: AmbienteFiscal, servico: ServicoSefaz): string {
  const emissor = autorizador(uf, modelo);
  if (modelo === 'NFCE' && emissor === 'MG') {
    const nomesMg: Record<ServicoSefaz,string> = {autorizacao:'NFeAutorizacao4',retorno:'NFeRetAutorizacao4',consulta:'NFeConsultaProtocolo4',status:'NFeStatusServico4',evento:'NFeRecepcaoEvento4',inutilizacao:'NFeInutilizacao4'};
    return `https://${ambiente === 'PRODUCAO' ? '' : 'h'}nfce.fazenda.mg.gov.br/nfce/services/${nomesMg[servico]}`;
  }
  const endpoints = (catalogo as Record<string,Record<string,Record<string,Record<string,string>>>>)[modelo]?.[emissor]?.[ambiente];
  const url = nomes[servico].map(n => endpoints?.[n]).find(Boolean);
  if (!url || !url.startsWith('https://')) throw new Error(`Serviço ${servico} indisponível no catálogo para ${uf}/${modelo}.`);
  return url;
}

export function coberturaSefaz() {
  return Object.keys(CODIGO_UF).map(uf => ({uf, nfe:autorizador(uf,'NFE'), nfce:autorizador(uf,'NFCE')}));
}
