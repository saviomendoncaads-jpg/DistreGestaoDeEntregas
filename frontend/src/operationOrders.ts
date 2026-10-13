type Comanda = { id: string; lojaId?: string; tipoComanda?: string; pedidoOrigemId?: string; referencia?: string };

/** A entrega representa a operação após a separação; a venda original mantém o histórico. */
export function comandasOperacionais<T extends Comanda>(comandas: T[]): T[] {
  const pais = new Set(comandas.filter(c => c.tipoComanda === 'pedido').map(c => JSON.stringify([c.lojaId, c.id])));
  const vinculados = new Set(comandas.filter(c => c.tipoComanda !== 'pedido').map(c => {
    const origem = c.pedidoOrigemId || c.referencia?.match(/^Origem: Pedido (\S+)$/)?.[1];
    return origem ? JSON.stringify([c.lojaId, origem]) : '';
  }).filter(chave => pais.has(chave)));
  return comandas.filter(c => c.tipoComanda !== 'pedido' || !vinculados.has(JSON.stringify([c.lojaId, c.id])));
}
