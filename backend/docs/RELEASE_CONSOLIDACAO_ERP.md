# Release das correções de consolidação

Esta proposta não foi publicada durante a auditoria. A operação atual permaneceu preservada. Leia o [diagnóstico e as pendências](AUDITORIA_ERP_2026-10-12.md) antes de considerar o ERP concluído.

## Mudanças de contrato

- `/api/deliveries/*`, motoristas, configurações e WhatsApp exigem bearer de sessão válida. Integração de outro ERP usa `/api/integracao/*` com `X-Loja-Id` e `X-Api-Key`; não use o gateway operacional como API pública.
- Pareamento/GPS por socket exigem sessão válida e motorista da mesma loja. O papel individual de motorista ainda é uma pendência do produto.
- Simulador e dados demo ficam desligados por padrão. `ENABLE_SIMULATOR=true` e `SEED_DEMO=true` só têm efeito fora de `NODE_ENV=production`.
- Novos bancos não recebem administrador com senha fixa. Configure `ADMIN_USUARIO` e `ADMIN_SENHA` explicitamente para provisionar; contas existentes no banco continuam funcionando. **Rotacione contas com senhas históricas do código e revogue suas sessões antes de promover a versão.** Remover a senha do código não altera automaticamente um hash antigo no banco.
- Produção não aceita `PAYMENT_GATEWAY=MOCK`; ASAAS sem chave gera erro. Validar também `ASAAS_ENV=production`, token de webhook, allowlist e conciliação antes de realizar cobrança real.
- Callback de entregas exige `DELIVERY_WEBHOOK_ALLOWED_HOSTS` e `DELIVERY_WEBHOOK_SECRET` de pelo menos 32 bytes. O receptor valida `X-Delivery-Engine-Signature` como HMAC-SHA256 do corpo bruto. Retentativas preservam ID/corpo. Não há fila durável de entrega nesta proposta.
- Conclusão exige nome de recebedor. Foto, CPF e assinatura não enviados permanecem ausentes; nenhum comprovante fictício é criado.
- Schema ENTREGAS incompatível interrompe startup. A migração legada deve ser planejada e validada separadamente. Nunca resolver o bloqueio apagando a tabela de produção.
- Finalização de pedido grava SEPARADO e uma única entrega vinculada atomicamente. Repetir a operação retorna a entrega existente. Consumidores de status precisam reconhecer SEPARADO como fim da separação, sem comprovar entrega ao cliente.
- A coluna aditiva PEDIDO_ORIGEM_ID e seu índice único vinculam a entrega à venda. O boot só associa automaticamente referências legadas exatas, na mesma loja e com uma única entrega; ambiguidades exigem revisão e são sinalizadas nos relatórios.
- `/api/deliveries/:id/return-stock` exige JSON `{ "confirmacaoIntegral": true }`, após recebimento físico de todos os produtos em condições de revenda. Estorna a saída original e conclui o retorno na mesma transação. Não usar para recebimento parcial, avaria ou quarentena; esses fluxos seguem pendentes. Repetir a chamada não duplica estoque.

## Antes da promoção

1. Validar este PR sobre a versão atual e sua relação com o PR #1. Conferir build CI e instalação com os lockfiles, usando Node 22.12+ da linha 22, Node 24 ou versão posterior suportada.
2. Homologar os contratos acima em staging, especialmente as integrações que utilizavam rotas abertas e o fluxo do motorista.
3. Fazer backup SQL consistente e verificado, além de uploads, configuração privada e chave fiscal. Confirmar restauração em ambiente isolado. Manter backups fora do checkout e com acesso restrito.
4. Revisar configurações sem publicar segredos: ambiente, demo/simulador, driver/banco, gateway, fiscal por loja, domínios, proxy confiável e jobs. Uma instância controla os jobs; Redis não resolve sozinho o estado em memória.
5. Resolver ou tratar formalmente a pendência node-forge da auditoria. Emissão real e documentos históricos precisam das homologações descritas em A12/A13; o relatório não certifica caixa/margem.
6. Executar os testes SQL em banco temporário e o aceite operacional de criação, separação, cancelamento e retorno. A01/A02 passaram nos testes desta proposta; A03 cobre retorno integral vendável, com retorno parcial/avariado ainda pendente. Conferir os avisos de vínculos legados antes de usar relatórios de entrega como fechamento.

## Execução e recuperação

`deploy.ps1` bloqueia checkout com alterações, executa `git pull --ff-only`, instala por lockfile, roda a suite padrão e compila em estágio. Só depois copia artefatos, preserva assets antigos, reinicia o PM2 e verifica health com SQL.

O script não cria/verifica backup SQL nem configura gateway/fiscal. A suite padrão pula os testes SQL opt-in. As verificações acima são parte da promoção de release; não são substituídas pelo health. A landing e dependências ainda são atualizadas no checkout; não há atomicidade completa nem rollback automático.

Em falha, não confirmar publicação saudável. Usar `.release-backups/<release>` para restaurar os artefatos anteriores; preservar o `index.html` antigo com seus chunks. Registrar previamente o commit anterior e os lockfiles para restaurar também landing/código/dependências. Reiniciar e verificar aplicação, API, sessão, SQL e integrações. Só restaurar banco quando houver procedimento de recuperação aprovado e necessidade demonstrada; esta proposta usa alterações aditivas compatíveis ou interrompe o boot.

O script teve a sintaxe verificada e os builds/testes foram exercitados em ambiente independente. Não foi executado contra produção nesta tarefa.
