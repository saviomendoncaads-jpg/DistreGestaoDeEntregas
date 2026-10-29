import { createHash, randomUUID } from 'crypto';
import mssql from './db';
import { pool } from './database';
import { localizarEnderecoEntrega } from './geocodingEntrega';
import { calcularServico, configEntregaPadrao, ErroEntrega, validarConfigEntrega } from './configEntrega';
import type { ConfigEntrega, ServicoEntrega, TipoEntrega } from './configEntrega';

export async function obterConfigEntrega(lojaId: string, cep = ''): Promise<ConfigEntrega> {
  const r = await pool.request().input('loja', mssql.VarChar(100), lojaId)
    .query('SELECT CONFIG FROM ENTREGA_CONFIG WHERE LOJA_ID=@loja');
  return r.recordset.length ? validarConfigEntrega(JSON.parse(r.recordset[0].CONFIG)) : configEntregaPadrao(cep);
}
export async function salvarConfigEntrega(lojaId: string, config: ConfigEntrega) {
  const c = validarConfigEntrega(config);
  await pool.request().input('loja', mssql.VarChar(100), lojaId).input('config', mssql.NVarChar(mssql.MAX), JSON.stringify(c)).query(`
    MERGE ENTREGA_CONFIG WITH (HOLDLOCK) AS t USING (SELECT @loja LOJA_ID) s ON t.LOJA_ID=s.LOJA_ID
    WHEN MATCHED THEN UPDATE SET CONFIG=@config
    WHEN NOT MATCHED THEN INSERT (LOJA_ID,CONFIG) VALUES (@loja,@config);`);
  return c;
}
export interface EnderecoCotacao { cep?: string; logradouro?: string; numero?: string; bairro?: string; cidade?: string; uf?: string }
export interface SelecaoEntrega { tipo: TipoEntrega; agendadoPara?: string; cotacaoId?: string }
const fingerprint = (c: ConfigEntrega, e: EnderecoCotacao, s: SelecaoEntrega) => createHash('sha256').update(JSON.stringify([
  c, ...['cep','logradouro','numero','bairro','cidade','uf'].map(k => String(e[k as keyof EnderecoCotacao] || '').trim().toLowerCase()), s.tipo, s.agendadoPara || '',
])).digest('hex');
const cotacoes = new Map<string, { lojaId: string; chave: string; expira: number; servico: ServicoEntrega }>();

async function calcularTrajetoEntrega(cepOrigem: string, endereco: EnderecoCotacao) {
  if (!endereco.logradouro?.trim() || !endereco.numero?.trim() || !endereco.cidade?.trim() || !endereco.uf?.trim()) throw new ErroEntrega('Complete rua, número, cidade e UF para calcular a entrega.');
  // Para cobrança nunca usamos o fallback de bairro/cidade do mapa.
  const origem = await localizarEnderecoEntrega({ cep: cepOrigem });
  if (!origem) throw new ErroEntrega('Não foi possível localizar o CEP de origem da loja. Confira o CEP nas configurações de entrega.', 422);
  const destino = await localizarEnderecoEntrega({ ...endereco, endereco: endereco.logradouro });
  if (!destino) throw new ErroEntrega('Não foi possível localizar o endereço de entrega. Confira o nome completo da rua, número, cidade e UF.', 422);
  try {
    const coords = `${origem.longitude},${origem.latitude};${destino.longitude},${destino.latitude}`;
    const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=false`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('routing');
    const data = await response.json() as { code?: string; routes?: { distance: number }[] };
    const metros = data.routes?.[0]?.distance;
    if (data.code !== 'Ok' || typeof metros !== 'number' || !Number.isFinite(metros) || metros < 0) throw new Error('routing');
    return { distanciaKm: metros / 1000, avisoLocalizacao: destino.precisao === 'logradouro'
      ? 'Número não localizado no mapa. Distância estimada até o ponto de referência do logradouro informado.' : undefined };
  } catch { throw new ErroEntrega('Serviço de distância indisponível. Tente calcular a entrega novamente.', 503); }
}
export async function distanciaRodoviaria(cepOrigem: string, endereco: EnderecoCotacao): Promise<number> {
  return (await calcularTrajetoEntrega(cepOrigem, endereco)).distanciaKm;
}
export async function cotarEntrega(lojaId: string, c: ConfigEntrega, endereco: EnderecoCotacao, selecao: SelecaoEntrega) {
  if (!selecao || !c.tipos.some(t => t.ativo && t.tipo === selecao.tipo)) throw new ErroEntrega('Selecione um tipo de entrega disponível.');
  if (!endereco || typeof endereco !== 'object' || Array.isArray(endereco)) throw new ErroEntrega('Endereço inválido.');
  for (const k of ['cep','logradouro','numero','bairro','cidade','uf'] as const) {
    if (endereco[k] !== undefined && (typeof endereco[k] !== 'string' || endereco[k]!.length > 120)) throw new ErroEntrega('Revise o endereço de entrega.');
  }
  calcularServico(c, selecao.tipo, selecao.agendadoPara, c.cobranca === 'km' ? 0 : undefined);
  const trajeto = c.cobranca === 'km' ? await calcularTrajetoEntrega(c.cepOrigem, endereco) : undefined;
  const servico = calcularServico(c, selecao.tipo, selecao.agendadoPara, trajeto?.distanciaKm);
  if (trajeto?.avisoLocalizacao) servico.avisoLocalizacao = trajeto.avisoLocalizacao;
  const agora = Date.now();
  for (const [id, q] of cotacoes) if (q.expira <= agora) cotacoes.delete(id);
  if (cotacoes.size >= 10000) cotacoes.delete(cotacoes.keys().next().value!);
  const cotacaoId = randomUUID(); const expira = agora + 10 * 60000;
  cotacoes.set(cotacaoId, { lojaId, chave: fingerprint(c, endereco, selecao), expira, servico });
  return { cotacaoId, expiraEm: new Date(expira).toISOString(), servico };
}
export function confirmarCotacao(lojaId: string, c: ConfigEntrega, endereco: EnderecoCotacao, selecao?: SelecaoEntrega): ServicoEntrega {
  const q = selecao?.cotacaoId ? cotacoes.get(selecao.cotacaoId) : undefined;
  if (!q || q.lojaId !== lojaId || q.expira <= Date.now() || q.chave !== fingerprint(c, endereco, selecao!)) throw new ErroEntrega('Calcule a entrega novamente antes de finalizar. A cotação expirou ou os dados mudaram.', 409);
  // Revalida o horário e fixa o prazo a partir da confirmação da pré-venda.
  return { ...calcularServico(c, selecao!.tipo, selecao!.agendadoPara, q.servico.distanciaKm),
    ...(q.servico.avisoLocalizacao ? { avisoLocalizacao: q.servico.avisoLocalizacao } : {}) };
}
