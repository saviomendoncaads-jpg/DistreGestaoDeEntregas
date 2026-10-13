import type { NotaCompleta } from './fiscalApi';

// Impressão do DANFE no navegador, pelo mesmo caminho da comanda 80mm do painel
// (iframe oculto → window.print(), sem pop-up bloqueado).
//  - NFC-e: DANFE NFC-e no rolo térmico de 80mm, com QR Code de consulta.
//  - NF-e: DANFE simplificado em A4. Quando o provedor real devolve o PDF
//    oficial (danfeUrl), ele é o documento a imprimir — abrimos em nova aba.

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]);

const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtd = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 4 });

function mascaraDoc(doc?: string): string {
  const d = (doc || '').replace(/\D/g, '');
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return doc || '';
}

const chaveFormatada = (chave?: string) => (chave || '').replace(/(\d{4})(?=\d)/g, '$1 ');
const dataHora = (iso?: string) => (iso ? new Date(iso).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR'));

function faixaSemValor(n: NotaCompleta): string {
  if (n.ambiente === 'PRODUCAO' && n.provedor !== 'MOCK') return '';
  return `<div class="homolog">EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO — SEM VALOR FISCAL${n.provedor === 'MOCK' ? ' (SIMULADA)' : ''}</div>`;
}

function faixaStatus(n: NotaCompleta): string {
  if (n.status === 'CANCELADA') return '<div class="homolog">NOTA CANCELADA</div>';
  if (n.status !== 'AUTORIZADA') return `<div class="homolog">${esc(n.status)} — ${esc(n.mensagem || 'nota não autorizada')}</div>`;
  return '';
}

function htmlNfce(n: NotaCompleta): string {
  const { emitente: e, destinatario: d, itens } = n.dados;
  const linhas = itens.map(i => `
    <tr><td colspan="4" class="desc">${esc(i.codigo)} ${esc(i.descricao)}</td></tr>
    <tr class="num"><td>${qtd(i.quantidade)} ${esc(i.unidade)}</td><td>x ${brl(i.valorUnitario)}</td><td></td><td>${brl(i.valorBruto)}</td></tr>`).join('');
  const consumidor = d?.documento
    ? `CONSUMIDOR - CPF/CNPJ ${esc(mascaraDoc(d.documento))}${d.nome ? `<br>${esc(d.nome)}` : ''}`
    : 'CONSUMIDOR NÃO IDENTIFICADO';

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>NFC-e ${esc(n.numero)}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { width: 80mm; padding: 3mm; font-family: 'Courier New', monospace; color: #000; background: #fff; font-size: 11px; line-height: 1.3; }
    .c { text-align: center; } .b { font-weight: 700; } .sm { font-size: 9.5px; }
    .sep { border-top: 1px dashed #000; margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; }
    .num td { text-align: right; } .num td:first-child { text-align: left; }
    .desc { padding-top: 2px; }
    .row { display: flex; justify-content: space-between; gap: 6px; }
    .tot { font-size: 13px; font-weight: 700; }
    .homolog { border: 1px solid #000; padding: 3px; margin: 4px 0; text-align: center; font-weight: 700; font-size: 10px; }
    .qr { display: block; margin: 6px auto; width: 38mm; height: 38mm; }
    .chave { word-break: break-all; text-align: center; font-size: 10px; }
  </style></head><body>
    <div class="c b">${esc(e.nomeFantasia || e.razaoSocial)}</div>
    <div class="c sm">${esc(e.razaoSocial)}</div>
    <div class="c sm">CNPJ ${esc(mascaraDoc(e.cnpj))} &nbsp; IE ${esc(e.inscricaoEstadual)}</div>
    <div class="c sm">${esc(e.logradouro)}, ${esc(e.numero)} - ${esc(e.bairro)} - ${esc(e.municipio)}/${esc(e.uf)}</div>
    <div class="sep"></div>
    <div class="c b sm">Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica</div>
    ${faixaSemValor(n)}${faixaStatus(n)}
    <div class="sep"></div>
    <table>${linhas}</table>
    <div class="sep"></div>
    <div class="row"><span>QTD. TOTAL DE ITENS</span><span>${itens.length}</span></div>
    <div class="row"><span>VALOR TOTAL R$</span><span>${brl(n.dados.valorProdutos)}</span></div>
    ${n.dados.valorDesconto ? `<div class="row"><span>DESCONTO R$</span><span>-${brl(n.dados.valorDesconto)}</span></div>` : ''}
    ${n.dados.valorOutros ? `<div class="row"><span>ACRÉSCIMOS (ENTREGA) R$</span><span>${brl(n.dados.valorOutros)}</span></div>` : ''}
    <div class="row tot"><span>VALOR A PAGAR R$</span><span>${brl(n.dados.valorTotal)}</span></div>
    <div class="row"><span>FORMA DE PAGAMENTO</span><span>VALOR PAGO R$</span></div>
    <div class="row"><span>${esc(n.dados.pagamento.descricao)}</span><span>${brl(n.dados.pagamento.valor)}</span></div>
    ${n.dados.valorTributos ? `<div class="c sm">Tributos totais incidentes (Lei Federal 12.741/2012): R$ ${brl(n.dados.valorTributos)}</div>` : ''}
    <div class="sep"></div>
    <div class="c sm">Consulte pela Chave de Acesso em</div>
    <div class="c sm">${esc(n.urlConsulta || 'portal da SEFAZ do seu estado')}</div>
    <div class="chave b">${esc(chaveFormatada(n.chave))}</div>
    <div class="sep"></div>
    <div class="c sm">${consumidor}</div>
    <div class="sep"></div>
    <div class="c b">NFC-e nº ${esc(n.numero ?? '-')} &nbsp; Série ${esc(n.serie ?? '-')} &nbsp; ${esc(dataHora(n.emitidaEm || n.criadoEm))}</div>
    ${n.protocolo ? `<div class="c sm">Protocolo de autorização: ${esc(n.protocolo)}</div><div class="c sm">Data de autorização: ${esc(dataHora(n.emitidaEm))}</div>` : ''}
    ${n.qrcodeDataUrl ? `<img class="qr" src="${n.qrcodeDataUrl}" alt="QR Code NFC-e">` : ''}
    ${n.dados.informacoesAdicionais ? `<div class="c sm">${esc(n.dados.informacoesAdicionais)}</div>` : ''}
  </body></html>`;
}

function htmlNfe(n: NotaCompleta): string {
  const { emitente: e, destinatario: d, itens } = n.dados;
  const linhas = itens.map(i => `
    <tr><td>${esc(i.codigo)}</td><td class="l">${esc(i.descricao)}</td><td>${esc(i.ncm)}</td><td>${esc(i.cfop)}</td>
    <td>${esc(i.unidade)}</td><td>${qtd(i.quantidade)}</td><td>${brl(i.valorUnitario)}</td><td>${brl(i.valorBruto)}</td></tr>`).join('');
  const caixa = (rotulo: string, valor: string, extra = '') => `<div class="cx ${extra}"><span>${rotulo}</span><b>${valor || '&nbsp;'}</b></div>`;

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>DANFE NF-e ${esc(n.numero)}</title>
  <style>
    @page { size: A4; margin: 8mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #000; background: #fff; font-size: 9px; }
    .grid { display: grid; gap: 0; border: 1px solid #000; border-bottom: 0; }
    .cx { border-bottom: 1px solid #000; border-right: 1px solid #000; padding: 2px 4px; min-height: 26px; }
    .cx:last-child { border-right: 0; }
    .cx span { display: block; font-size: 7px; text-transform: uppercase; }
    .cx b { font-size: 10px; }
    h2 { font-size: 8px; text-transform: uppercase; margin: 6px 0 1px; }
    .topo { display: grid; grid-template-columns: 2fr 1fr 2.2fr; border: 1px solid #000; }
    .topo > div { padding: 6px; border-right: 1px solid #000; }
    .topo > div:last-child { border-right: 0; }
    .emit b { font-size: 12px; display: block; margin-bottom: 3px; }
    .danfe { text-align: center; } .danfe b { font-size: 16px; display: block; }
    .chave { font-family: 'Courier New', monospace; font-size: 11px; font-weight: 700; word-break: break-all; }
    table { width: 100%; border-collapse: collapse; border: 1px solid #000; }
    th, td { border: 1px solid #000; padding: 2px 3px; text-align: right; }
    th { font-size: 7px; text-transform: uppercase; } td.l, th.l { text-align: left; }
    .homolog { border: 2px solid #000; padding: 4px; margin: 6px 0; text-align: center; font-weight: 700; font-size: 11px; }
    .obs { border: 1px solid #000; padding: 4px; min-height: 40px; }
  </style></head><body>
    ${faixaSemValor(n)}${faixaStatus(n)}
    <div class="topo">
      <div class="emit"><b>${esc(e.razaoSocial)}</b>${esc(e.logradouro)}, ${esc(e.numero)}<br>${esc(e.bairro)} - ${esc(e.municipio)}/${esc(e.uf)}<br>CEP ${esc(e.cep)}${e.telefone ? ` - Fone ${esc(e.telefone)}` : ''}</div>
      <div class="danfe"><b>DANFE</b>Documento Auxiliar da Nota Fiscal Eletrônica<br><br>1 - SAÍDA<br><br><b style="font-size:11px">Nº ${esc(n.numero ?? '-')}</b>Série ${esc(n.serie ?? '-')}</div>
      <div><span style="font-size:7px">CHAVE DE ACESSO</span><div class="chave">${esc(chaveFormatada(n.chave))}</div><br>
        Consulta de autenticidade no portal nacional da NF-e (www.nfe.fazenda.gov.br/portal) ou no site da SEFAZ autorizadora.</div>
    </div>
    <div class="grid" style="grid-template-columns: 2fr 1.4fr">
      ${caixa('Natureza da operação', esc(n.dados.naturezaOperacao))}
      ${caixa('Protocolo de autorização de uso', n.protocolo ? `${esc(n.protocolo)} - ${esc(dataHora(n.emitidaEm))}` : '')}
    </div>
    <div class="grid" style="grid-template-columns: 1fr 1fr">
      ${caixa('Inscrição estadual', esc(e.inscricaoEstadual))}
      ${caixa('CNPJ', esc(mascaraDoc(e.cnpj)))}
    </div>
    <h2>Destinatário / Remetente</h2>
    <div class="grid" style="grid-template-columns: 3fr 1.4fr 1fr">
      ${caixa('Nome / Razão social', esc(d?.nome))}${caixa('CNPJ / CPF', esc(mascaraDoc(d?.documento)))}${caixa('Data da emissão', esc(dataHora(n.emitidaEm || n.criadoEm)))}
    </div>
    <div class="grid" style="grid-template-columns: 3fr 1.4fr 1fr 0.5fr">
      ${caixa('Endereço', `${esc(d?.logradouro)}${d?.numero ? `, ${esc(d.numero)}` : ''}`)}${caixa('Bairro', esc(d?.bairro))}${caixa('Município', esc(d?.municipio))}${caixa('UF', esc(d?.uf))}
    </div>
    <h2>Cálculo do imposto</h2>
    <div class="grid" style="grid-template-columns: repeat(4, 1fr)">
      ${caixa('Valor total dos produtos', brl(n.dados.valorProdutos))}${caixa('Desconto', brl(n.dados.valorDesconto))}
      ${caixa('Outras despesas acessórias', brl(n.dados.valorOutros))}${caixa('Valor total da nota', brl(n.dados.valorTotal))}
    </div>
    <h2>Dados dos produtos / serviços</h2>
    <table><thead><tr><th class="l">Código</th><th class="l">Descrição</th><th>NCM</th><th>CFOP</th><th>Un</th><th>Qtd</th><th>V. unit.</th><th>V. total</th></tr></thead>
    <tbody>${linhas}</tbody></table>
    <h2>Dados adicionais</h2>
    <div class="obs">${esc(n.dados.informacoesAdicionais)}${n.dados.valorTributos ? `<br>Valor aproximado dos tributos (Lei 12.741/2012): R$ ${brl(n.dados.valorTributos)}` : ''}<br>Pagamento: ${esc(n.dados.pagamento.descricao)} - R$ ${brl(n.dados.pagamento.valor)}</div>
  </body></html>`;
}

function imprimirHtml(html: string) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(iframe);
  const idoc = iframe.contentWindow?.document;
  if (!idoc) { iframe.remove(); return; }
  idoc.open(); idoc.write(html); idoc.close();
  let jaImprimiu = false;
  const disparar = () => {
    if (jaImprimiu) return;
    jaImprimiu = true;
    try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); } catch { /* ignore */ }
    setTimeout(() => { try { iframe.remove(); } catch { /* ignore */ } }, 1500);
  };
  // O QR Code é imagem: espera o load antes de imprimir.
  iframe.onload = () => setTimeout(disparar, 200);
  setTimeout(disparar, 900);
}

/** true = usa o PDF oficial do provedor (NF-e real) em vez do layout local. */
export function usaDanfeOficial(n: { modelo: string; danfeUrl?: string; provedor: string }) {
  return n.modelo === 'NFE' && !!n.danfeUrl && n.provedor !== 'MOCK';
}

export function imprimirNota(n: NotaCompleta) {
  if (usaDanfeOficial(n)) {
    window.open(n.danfeUrl, '_blank', 'noopener');
    return;
  }
  imprimirHtml(n.modelo === 'NFCE' ? htmlNfce(n) : htmlNfe(n));
}
