import { cpfValido } from './fiscal/fiscalService';

/** Exige CPF válido, sem truncar ou aceitar outros tipos. */
export function normalizarCpfCheckout(valor: unknown): string {
  if (valor === undefined || valor === null || (typeof valor === 'string' && !valor.trim())) {
    throw new Error('Informe seu CPF para finalizar a compra.');
  }
  if (typeof valor !== 'string' || !/^[\d.\-\s]+$/.test(valor) || !cpfValido(valor)) {
    throw new Error('Informe um CPF válido para a nota fiscal.');
  }
  return valor.replace(/\D/g, '');
}
