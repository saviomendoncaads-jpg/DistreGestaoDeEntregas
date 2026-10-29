// Autopreenchimento de endereço via ViaCEP (API pública, sem chave).
// Falha silenciosamente: se o serviço estiver fora, o cliente digita à mão.

export interface EnderecoViaCep {
  logradouro: string;
  bairro: string;
  cidade: string;
  uf: string;
  ibge?: string;
}

export type ResultadoCep = { estado: 'encontrado'; endereco: EnderecoViaCep } | { estado: 'invalido' | 'nao_encontrado' | 'indisponivel' };

export async function consultarCep(cep: string, signal?: AbortSignal): Promise<ResultadoCep> {
  const digitos = cep.replace(/\D/g, '');
  if (digitos.length !== 8) return { estado: 'invalido' };
  try {
    const timeout = AbortSignal.timeout(8000);
    const res = await fetch(`https://viacep.com.br/ws/${digitos}/json/`, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    if (!res.ok) return { estado: 'indisponivel' };
    const dados = await res.json();
    if (dados?.erro) return { estado: 'nao_encontrado' };
    if (!dados || typeof dados.localidade !== 'string' || typeof dados.uf !== 'string') return { estado: 'indisponivel' };
    return { estado: 'encontrado', endereco: {
      logradouro: dados.logradouro || '',
      bairro: dados.bairro || '',
      cidade: dados.localidade || '',
      uf: dados.uf || '',
      ibge: dados.ibge || undefined,
    } };
  } catch {
    return { estado: 'indisponivel' };
  }
}

export async function buscarEnderecoPorCep(cep: string): Promise<EnderecoViaCep | null> {
  const resultado = await consultarCep(cep);
  return resultado.estado === 'encontrado' ? resultado.endereco : null;
}

export function mascararCep(valor: string): string {
  const digitos = valor.replace(/\D/g, '').slice(0, 8);
  if (digitos.length <= 5) return digitos;
  return `${digitos.slice(0, 5)}-${digitos.slice(5)}`;
}
