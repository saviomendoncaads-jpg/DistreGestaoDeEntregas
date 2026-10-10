import { describe, expect, it } from 'vitest';
import { normalizarCpfCheckout } from '../src/cpfCheckout';
import { cpfValido, mascararCpf } from '../../frontend/src/cliente/services/cpf';
import { montarPayload } from '../../frontend/src/cliente/services/pedidoService';

describe('CPF no checkout', () => {
  it('aceita CPF com zero inicial e envia somente dígitos', () => {
    const cpf = '012.345.678-90';
    expect(cpfValido(cpf)).toBe(true);
    expect(mascararCpf('01234567890')).toBe(cpf);
    const payload = montarPayload([], { nome: 'Teste', telefone: '', cpf,
      endereco: { cep: '', logradouro: 'Rua', numero: '1', bairro: '', cidade: '', uf: '', complemento: '', referencia: '' }, formaPagamento: 'pix' });
    expect(payload.cliente.cpf).toBe('01234567890');
    expect(normalizarCpfCheckout(payload.cliente.cpf)).toBe('01234567890');
  });
  it.each([undefined, null, '', '   '])('bloqueia checkout sem CPF: %s', valor => {
    expect(() => normalizarCpfCheckout(valor)).toThrow('Informe seu CPF para finalizar a compra.');
  });
  it.each(['11111111111', '01234567891', '123', '012345678901', 'abc01234567890', 1234567890, {}, []])('rejeita documento inválido na API: %s', valor => {
    expect(() => normalizarCpfCheckout(valor)).toThrow('CPF válido');
    if (typeof valor === 'string' && !valor.startsWith('abc')) expect(cpfValido(valor)).toBe(false);
  });
});
