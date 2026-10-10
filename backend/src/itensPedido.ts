// Ajuste das linhas de itens da comanda ("2x Nome (obs)") — sem dependência de banco.

const norm = (s: string) => s.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Retira `quantidade` unidades de um produto das linhas da comanda.
 * Percorre de trás para frente (o mesmo produto pode aparecer em mais de uma linha, com
 * observações diferentes), reduz a quantidade da linha e a remove quando zera. A observação
 * entre parênteses é preservada. `removidas` diz quantas unidades foram de fato encontradas.
 */
export function ajustarLinhasItens(linhas: string[], nomeProduto: string, quantidade: number) {
  const alvo = norm(nomeProduto);
  const novas = [...linhas];
  let restante = quantidade;
  for (let i = novas.length - 1; i >= 0 && restante > 0; i--) {
    const m = novas[i].match(/^\s*(\d+)\s*x\s+(.+)$/i);
    const qtdLinha = m ? Number(m[1]) : 1;
    const resto = m ? m[2] : novas[i];
    const nome = resto.replace(/\s*\([^()]*\)\s*$/, '');
    if (norm(nome) !== alvo) continue;
    const tira = Math.min(qtdLinha, restante);
    restante -= tira;
    if (tira === qtdLinha) novas.splice(i, 1);
    else novas[i] = `${qtdLinha - tira}x ${resto}`;
  }
  return { linhas: novas, removidas: quantidade - restante };
}

/** Subtrai um valor em reais sem erro de ponto flutuante (trabalha em centavos). */
export function subtrairValor(total: number, precoUnitario: number, quantidade: number): number {
  const centavos = Math.round(total * 100) - Math.round(precoUnitario * 100) * quantidade;
  return Math.max(0, centavos) / 100;
}
