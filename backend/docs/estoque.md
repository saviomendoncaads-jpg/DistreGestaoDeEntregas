# Estoque da vitrine

A tela de estoque do painel (`GestaoEstoque.tsx`) é ligada ao menu da operação em um commit à parte; até lá os recebimentos entram pela API descrita abaixo.

Em **Estoque**, selecione um produto cadastrado na própria loja, informe a quantidade física recebida (unidades inteiras) e, opcionalmente, o documento de entrada/fornecedor. Cada recebimento soma o saldo e registra uma movimentação. O documento é uma referência textual; não há importação de XML de NF-e de entrada nesta versão.

O primeiro recebimento ativa o controle daquele produto. Produtos anteriores sem recebimento continuam como **Sem controle**, preservando o catálogo existente. Para controlá-los, registre o saldo físico inicial como uma entrada. Produtos globais de demonstração não pertencem ao estoque de uma loja.

A baixa ocorre quando o checkout da vitrine cria o pedido, antes de separar ou emitir a nota. É uma reserva física imediata; o sistema ainda não confirma pagamento online. Produtos controlados sem saldo ficam indisponíveis. O servidor revalida o saldo no checkout, mesmo se o carrinho estiver desatualizado. A comanda e todas as baixas são persistidas na mesma transação SQL, impedindo vendas parciais e saldo negativo em compras simultâneas.

Cancelar uma comanda em RECEBIDO/EM_PREPARO devolve apenas as quantidades efetivamente baixadas, com estorno único: o estorno desconta o que já voltou ao saldo (por exemplo, unidades que faltaram na separação), então nada é devolvido duas vezes. Tipos de movimento: ENTRADA, VENDA, ESTORNO e AJUSTE (saldo zerado quando um produto falta na prateleira; ver `conferencia-ean.md`). Pedidos manuais/API e retornos logísticos após despacho não alteram automaticamente este estoque nesta versão. O histórico mantém até 100 movimentos na tela; o banco conserva todos.

As tabelas ESTOQUE_SALDOS e ESTOQUE_MOVIMENTOS são criadas de forma aditiva e idempotente na inicialização do backend. O backend deve ser reiniciado após compilar (`npm run build --prefix backend`). Não há alterações em provedores ou emissão NF-e/NFC-e.

Rotas autenticadas: GET /api/gestao/estoque e POST /api/gestao/estoque/entradas. A sessão de loja determina o escopo; o backend ignora lojaId enviado por uma loja. Recebimentos exigem chave de idempotência e não podem duplicar saldo ao repetir uma requisição.

Validação: `npm test --prefix backend`. Os testes SQL opcionais usam exclusivamente um banco temporário DISTRE_TEST_ESTOQUE_<timestamp>, criado e removido pelo teste. Em PowerShell: `$env:RUN_SQL_ESTOQUE_TESTS='1'; npm test --prefix backend -- test/estoque-sql.test.ts`. Exigem permissão para criar banco no SQL Server local.
