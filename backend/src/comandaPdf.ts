import PDFDocument from 'pdfkit';
import type { Entrega } from './types';

export function gerarComandaPdf(entrega: Entrega): Promise<Buffer> {
  const largura = 80 * 72 / 25.4;
  const margem = 10;
  const linhas = [
    entrega.nomeLoja || 'DISTRE', 'COMANDA DE PEDIDO',
    `Comanda: ${entrega.id}`,
    `Data: ${new Date(entrega.criadoEm).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' })}`,
    '', 'CLIENTE', entrega.nomeCliente,
    ...(entrega.clienteDocumento ? [`CPF/CNPJ: ${entrega.clienteDocumento}`] : []),
    '', 'ENTREGA',
    ...(entrega.servicoEntrega ? [
      ...(entrega.servicoEntrega.avisoLocalizacao ? [entrega.servicoEntrega.avisoLocalizacao] : []),
      entrega.servicoEntrega.tipo === 'EXPRESS' ? '*** EXPRESS - ENTREGA RAPIDA ***' : entrega.servicoEntrega.tipo,
      (entrega.servicoEntrega.agendadoPara ? 'Agendada: ' : 'Previsão: ') + new Date(entrega.servicoEntrega.previstoPara).toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' }),
      ...(entrega.servicoEntrega.prazoMinutos ? [`Prazo: até ${entrega.servicoEntrega.prazoMinutos} minutos`] : []),
      'Taxa: ' + entrega.servicoEntrega.taxa.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
      ...(entrega.servicoEntrega.distanciaKm !== undefined ? [`Distância: ${entrega.servicoEntrega.distanciaKm.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} km · Origem: ${entrega.servicoEntrega.cepOrigem}`] : []),
    ] : []), entrega.endereco,
    ...(entrega.bairro ? [`Bairro: ${entrega.bairro}`] : []),
    ...(entrega.referencia ? [`Referência: ${entrega.referencia}`] : []),
    '', 'ITENS', ...(entrega.itens.length ? entrega.itens : ['Sem itens detalhados']),
    '', ...(entrega.formaPagamento ? [`Pagamento: ${entrega.formaPagamento.toUpperCase()}`] : []),
    `TOTAL: ${(entrega.valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
    '', 'Comanda de pedido — não é documento fiscal',
  ];
  const doc = new PDFDocument({ autoFirstPage: false });
  doc.font('Helvetica').fontSize(9);
  const heights = linhas.map(linha => doc.heightOfString(linha || ' ', { width: largura - margem * 2 }) + 5);
  doc.addPage({ size: [largura, Math.max(100, heights.reduce((a, b) => a + b, margem * 2))], margin: margem });
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    for (let i = 0; i < linhas.length; i++) {
      const y = doc.y;
      doc.font(linhas[i].startsWith('*** EXPRESS') ? 'Helvetica-Bold' : 'Helvetica');
      doc.text(linhas[i] || ' ', margem, y, { width: largura - margem * 2 });
      doc.y = y + heights[i];
    }
    doc.end();
  });
}
