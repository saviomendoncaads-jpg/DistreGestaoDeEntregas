// Chave de acesso da NF-e/NFC-e (44 dígitos), conforme o Manual de Orientação
// do Contribuinte: cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nNF(9) tpEmis(1) cNF(8) cDV(1).

import crypto from 'crypto';
import { ModeloNota } from './tipos';

// Código IBGE da UF (cUF).
export const CODIGO_UF: Record<string, string> = {
  RO: '11', AC: '12', AM: '13', RR: '14', PA: '15', AP: '16', TO: '17',
  MA: '21', PI: '22', CE: '23', RN: '24', PB: '25', PE: '26', AL: '27', SE: '28', BA: '29',
  MG: '31', ES: '32', RJ: '33', SP: '35',
  PR: '41', SC: '42', RS: '43',
  MS: '50', MT: '51', GO: '52', DF: '53',
};

/** Dígito verificador módulo 11 (pesos 2..9 da direita para a esquerda). */
export function digitoVerificador(base43: string): string {
  let soma = 0;
  let peso = 2;
  for (let i = base43.length - 1; i >= 0; i--) {
    soma += Number(base43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return String(resto < 2 ? 0 : 11 - resto);
}

export function gerarChaveAcesso(p: {
  uf: string;
  emissao: Date;
  cnpj: string;
  modelo: ModeloNota;
  serie: number;
  numero: number;
  codigoNumerico?: string;
}): string {
  const cUF = CODIGO_UF[p.uf.toUpperCase()];
  if (!cUF) throw new Error(`UF inválida para a chave de acesso: ${p.uf}`);
  const aamm = String(p.emissao.getFullYear()).slice(2) + String(p.emissao.getMonth() + 1).padStart(2, '0');
  const cnpj = p.cnpj.replace(/\D/g, '').padStart(14, '0');
  const mod = p.modelo === 'NFCE' ? '65' : '55';
  const serie = String(p.serie).padStart(3, '0');
  const nNF = String(p.numero).padStart(9, '0');
  const tpEmis = '1'; // emissão normal
  const cNF = p.codigoNumerico ?? String(crypto.randomInt(0, 99999999)).padStart(8, '0');
  const base = `${cUF}${aamm}${cnpj}${mod}${serie}${nNF}${tpEmis}${cNF}`;
  return base + digitoVerificador(base);
}

/** Valida tamanho + DV de uma chave de 44 dígitos. */
export function chaveValida(chave: string): boolean {
  if (!/^\d{44}$/.test(chave)) return false;
  return digitoVerificador(chave.slice(0, 43)) === chave[43];
}
