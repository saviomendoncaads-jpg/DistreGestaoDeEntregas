/** Valores recebidos de outro ERP não podem criar comandas negativas ou incoerentes. */
export function validarValoresIntegracao(produtos: { quantidade: number; precoUnitario?: number }[], valores?: { subtotal?: number; taxaEntrega?: number; desconto?: number; total?: number }): string | null {
  const valido = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 99999999.99;
  if (produtos.some(p => p.precoUnitario !== undefined && !valido(p.precoUnitario))) return 'Preço unitário inválido.';
  if (valores !== undefined && (!valores || Array.isArray(valores) || typeof valores !== 'object' || Object.values(valores).some(v => v !== undefined && !valido(v)))) return 'Valores do pedido inválidos.';
  const centavos = (n: number) => Math.round(n * 100);
  // Sem preços detalhados ou subtotal, só o total declarado é conhecido.
  if (valores?.subtotal === undefined && valores?.total !== undefined && produtos.some(p => p.precoUnitario === undefined)) return null;
  const subtotalCalculado = produtos.reduce((s, p) => s + centavos(p.precoUnitario ?? 0) * p.quantidade, 0);
  const subtotal = valores?.subtotal === undefined ? subtotalCalculado : centavos(valores.subtotal);
  const totalCalculado = subtotal + centavos(valores?.taxaEntrega ?? 0) - centavos(valores?.desconto ?? 0);
  if (totalCalculado < 0 || totalCalculado > 9999999999) return 'Total fora do limite permitido.';
  if (valores?.total !== undefined && centavos(valores.total) !== Math.round(totalCalculado)) return 'Total não corresponde ao subtotal, frete e desconto.';
  return null;
}
