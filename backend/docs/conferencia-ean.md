# Conferência de produtos na separação

O **EAN / GTIN** (8, 12, 13 ou 14 dígitos) é informado no cadastro do produto e é a referência lida na conferência. O sistema preserva zeros à esquerda. Produtos sem EAN não podem ser conferidos até o código ser cadastrado.

Ao clicar em **Concluir separação**, o operador entra na conferência do pedido. O leitor USB/Bluetooth deve funcionar como teclado e enviar Enter ao fim da leitura. Também é possível digitar o EAN. Cada leitura conta uma unidade, até atingir a quantidade pedida. Código de outro produto, produto já completo e leitura excessiva são recusados.

Os itens da vitrine são gravados por produto e quantidade junto à venda, com o EAN como referência. Para pedidos anteriores, o servidor tenta recuperar a associação pelo nome do catálogo, somente quando houver um único produto correspondente. Nomes ausentes ou ambíguos exigem revisão do cadastro; não há aprovação manual que ignore a conferência.

Produtos sem EAN mostram uma pendência. Cadastre o código em Vitrine & Produtos e use Atualizar produtos na conferência. As quantidades conferidas ficam persistidas no SQL Server e são recuperadas ao reabrir o pedido. Cada leitura usa uma chave de idempotência para não contar duas vezes a mesma requisição repetida.

O backend bloqueia a finalização enquanto todas as unidades não estiverem conferidas, inclusive chamadas diretas à API. Após conferir, continua o fluxo fiscal já existente. Conferir não realiza outra baixa de estoque: a vitrine já descontou o saldo ao criar o pedido.

As tabelas PEDIDO_CONFERENCIA_ITENS, PEDIDO_CONFERENCIA_LEITURAS e PEDIDO_CONFERENCIA_FALTAS são criadas na inicialização do backend, sob o mesmo bloqueio de migração do estoque. Rotas autenticadas: POST /api/deliveries/:id/conferencia/iniciar, /ler e /falta. Apenas a própria loja (ou administrador) acessa seus pedidos.

## Produto em falta na separação

Quando o operador não encontra um produto, usa o botão **Em falta** na linha dele. A tela pede a **quantidade** que faltou (no máximo as unidades ainda não conferidas; as já lidas pelo EAN existem fisicamente), o **motivo** (sem estoque físico, vencido/avariado, recolhido pelo fabricante ou outro, com observação opcional) e o destino do pedido:

- **Retirar só este item:** o pedido segue com o restante. As linhas da comanda e o valor são recalculados (preço da venda × unidades que faltaram); a nota fiscal emitida depois já sai sem o item. Se o cliente pagou online, a diferença precisa ser devolvida por fora do sistema, que ainda não confirma nem estorna pagamentos.
- **Cancelar o pedido inteiro:** a comanda vai para CANCELADO e o que ainda estava baixado volta ao estoque.

Se as unidades que faltam são **todas** as do pedido, a opção de retirar o item é desabilitada e o pedido é cancelado. Se o preço do item não foi gravado e a soma do cadastro não fecha com o total (pedidos antigos), só o cancelamento do pedido inteiro fica disponível.

**Estoque:** as unidades que faltaram são estornadas ao saldo (movimento `ESTORNO`, referência = pedido), pois o cliente não as levará. Com a opção **Zerar o saldo deste produto no sistema** (marcada por padrão para produtos com estoque controlado), o saldo restante é zerado por um movimento `AJUSTE` auditável e a vitrine para de vender o produto até um novo recebimento em Estoque. Cancelar o pedido depois nunca devolve duas vezes uma unidade já estornada.

**Garantias:** toda a operação (itens, valor, estoque, histórico) roda em uma única transação SQL e é idempotente pela chave enviada pela tela: repetir a mesma requisição não aplica duas vezes. Duas faltas simultâneas do mesmo produto não retiram mais unidades do que o pedido tem. Cada ocorrência fica em PEDIDO_CONFERENCIA_FALTAS (produto, quantidade, motivo, desfecho). A tela mostra o contato do cliente para avisá-lo.

Código: `backend/src/faltas.ts` (regra), `backend/src/itensPedido.ts` (ajuste das linhas e do valor), `frontend/src/components/ConferenciaSeparacao.tsx` (tela). Testes: `backend/test/faltas.test.ts` e, com SQL Server real em banco temporário, `RUN_SQL_ESTOQUE_TESTS=1 npm test --prefix backend -- test/faltas-sql.test.ts`.
