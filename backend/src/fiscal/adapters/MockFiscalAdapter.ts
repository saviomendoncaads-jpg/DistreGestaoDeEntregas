import crypto from 'crypto';
import {
  ContextoEmissao, EmissaoInput, EmissaoResult, FiscalProviderAdapter,
} from '../FiscalProviderAdapter';
import { gerarChaveAcesso } from '../chaveAcesso';
import { ModeloNota } from '../tipos';

// Provedor SIMULADO (padrão em dev e enquanto a loja não contrata um provedor real).
// Autoriza na hora com chave de acesso válida (DV correto) e protocolo fictício,
// sempre em "homologação" — o DANFE sai marcado SEM VALOR FISCAL.
// Mantém as notas em memória para consultar/cancelar no mesmo ciclo de vida.

const URL_CONSULTA_NFCE_HOMOLOG = 'https://www.homologacao.nfce.fazenda.sp.gov.br/consulta';

export class MockFiscalAdapter implements FiscalProviderAdapter {
  readonly nome = 'MOCK' as const;
  readonly numeracaoLocal = true;

  private emitidas = new Map<string, EmissaoResult>();

  async emitir(input: EmissaoInput): Promise<EmissaoResult> {
    const existente = this.emitidas.get(input.ref);
    if (existente) return existente; // idempotente por ref

    if (!input.numero) throw new Error('MockFiscalAdapter exige numeração local (numero).');
    const agora = new Date();
    const chave = gerarChaveAcesso({
      uf: input.ctx.uf,
      emissao: agora,
      cnpj: input.ctx.cnpjEmitente,
      modelo: input.dados.modelo,
      serie: input.serie,
      numero: input.numero,
    });
    const protocolo = `1${crypto.randomInt(10, 99)}${String(Date.now()).slice(-12)}`;

    const resultado: EmissaoResult = {
      status: 'AUTORIZADA',
      numero: input.numero,
      serie: input.serie,
      chave,
      protocolo,
      emitidaEm: agora.toISOString(),
      mensagem: 'Autorizado o uso da NF-e (SIMULADO — ambiente de homologação, sem valor fiscal).',
    };
    if (input.dados.modelo === 'NFCE') {
      // Formato do QR Code v2 da NFC-e: chave|versão|ambiente(2=homolog)|cIdToken|hash
      const hash = crypto.createHash('sha1').update(chave).digest('hex').toUpperCase();
      resultado.qrcodeUrl = `https://www.homologacao.nfce.fazenda.sp.gov.br/qrcode?p=${chave}|2|2|1|${hash}`;
      resultado.urlConsulta = URL_CONSULTA_NFCE_HOMOLOG;
    }
    this.emitidas.set(input.ref, resultado);
    return resultado;
  }

  async consultar(ref: string, _modelo: ModeloNota, _ctx: ContextoEmissao): Promise<EmissaoResult> {
    const nota = this.emitidas.get(ref);
    // Reinício do servidor apaga a memória do mock: devolve "sem alteração" para
    // o serviço manter o que já está persistido no banco.
    return nota ?? { status: 'AUTORIZADA', mensagem: 'Consulta simulada: sem alterações.' };
  }

  async testarConexao(_ctx: ContextoEmissao): Promise<{ ok: boolean; mensagem: string }> {
    return { ok: true, mensagem: 'Modo simulado: nenhuma conexão com a SEFAZ é necessária.' };
  }

  async cancelar(ref: string, _modelo: ModeloNota, _justificativa: string, _ctx: ContextoEmissao): Promise<EmissaoResult> {
    const nota = this.emitidas.get(ref) ?? {};
    const cancelada: EmissaoResult = {
      ...nota,
      status: 'CANCELADA',
      mensagem: 'Cancelamento homologado (SIMULADO).',
    };
    this.emitidas.set(ref, cancelada);
    return cancelada;
  }
}
