export function limiteQuantidade(estoque?: number): number {
  return estoque === undefined ? 99 : Math.max(0, Math.min(99, Math.floor(estoque)));
}
export function somarQuantidade(atual: number, solicitada: number, estoque?: number): number {
  if (!Number.isInteger(solicitada) || solicitada <= 0) return atual;
  return Math.min(atual + solicitada, limiteQuantidade(estoque));
}
