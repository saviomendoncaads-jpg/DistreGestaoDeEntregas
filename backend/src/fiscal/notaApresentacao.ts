import QRCode from 'qrcode';
import { NotaFiscal } from './tipos';

// Formatos de saída da nota para o painel (sem dependência das rotas, para o
// gateway poder reutilizar no fluxo de "Concluir Separação").

/** Resumo enxuto da nota para listas/kanban (sem o snapshot completo). */
export function resumoNota(n: NotaFiscal) {
  return {
    id: n.id,
    entregaId: n.entregaId,
    pedidoId: n.pedidoId,
    modelo: n.modelo,
    numero: n.numero,
    serie: n.serie,
    chave: n.chave,
    status: n.status,
    ambiente: n.ambiente,
    provedor: n.provedor,
    valorTotal: n.valorTotal,
    danfeUrl: n.danfeUrl,
    mensagem: n.mensagem,
    emitidaEm: n.emitidaEm,
    criadoEm: n.criadoEm,
  };
}

/** Nota completa para imprimir o DANFE (inclui o QR Code da NFC-e já renderizado). */
export async function notaParaImpressao(n: NotaFiscal) {
  let qrcodeDataUrl: string | undefined;
  if (n.qrcodeUrl) {
    try {
      qrcodeDataUrl = await QRCode.toDataURL(n.qrcodeUrl, { errorCorrectionLevel: 'M', margin: 1, width: 220 });
    } catch (err) {
      console.warn('[Fiscal] Falha ao gerar QR Code da NFC-e:', err);
    }
  }
  return { ...n, qrcodeDataUrl };
}
