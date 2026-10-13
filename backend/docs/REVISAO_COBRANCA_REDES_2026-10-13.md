# Revisão de cobrança, acesso e redes de lojas

Verificação em 13/10/2026, America/Fortaleza. Consulta de produção somente de leitura; nenhum pagamento, fatura, assinatura, acesso ou sessão foi alterado por esta revisão.

## Evidências atuais

- BRASIL FARMA - LOJA 10: assinatura ATIVA e acesso REGULAR. Há somente a fatura de competência 06/2026, vencimento 10/06/2026, pagamento registrado em 23/07/2026. PROXIMO_FATURAMENTO continua em 10/07/2026. Não existem faturas de julho a outubro dessa assinatura na base consultada.
- Macaco: fatura de junho ATRASADA, assinatura SUSPENSA e loja SUSPENSO. O bloqueio por atraso dessa cobrança foi aplicado.
- Jobs habilitados. Produção configurada com gateway MOCK, sem Asaas configurado; o código atual rejeita MOCK em produção. Não existe cobrança real válida configurada.
- CONFIGURACOES_COBRANCA define carência de 5 dias, enquanto dunningScheduler.ts aplica suspensão fixa em D+7. As regras estão divergentes.

## Falhas identificadas e requisitos de correção

1. Recorrência ausente: subscriptionService.ts grava a primeira fatura e PROXIMO_FATURAMENTO, mas nenhum job cria as competências seguintes ou avança esse campo. Dunning percorre apenas faturas existentes. Uma fatura antiga paga não prova adimplência atual; ausência de cobrança também não é prova de dívida emitida.
2. Carência divergente: usar uma política única de calendário America/Fortaleza, configuração de carência, tratamento de datas inválidas e limite de bloqueio claramente definido. Atualmente a rotina financeira usa UTC/horário e a régua usa datas locais do processo.
3. Reativação incompleta: baixa manual e webhook reativam a assinatura pelo pagamento de uma fatura, sem avaliar todas as demais obrigações vencidas do contrato. Reavaliar o conjunto antes de liberar operação e garantir atualização transacional/consistente de banco e memória.
4. Escopo legado por empresa: suspensão da empresa revoga sessões, mas login, integração e proteção de escrita verificam principalmente STATUS_FINANCEIRO da loja. O efeito de um contrato bloqueado da rede precisa entrar no cálculo de acesso efetivo; revogar uma sessão não basta se o login seguinte ignora a restrição da empresa.
5. Rede versus filial: EMPRESAS já agrupa LOJAS, mas assinatura/fatura atuais nascem por loja. A configuração financeira e de acesso não representa explicitamente contrato consolidado de rede versus contratos individuais. Não bloquear filiais adimplentes por uma dívida pertencente a outro contrato.

## Modelo proposto para suportar redes

- Cliente/rede (empresa): contratante, responsável financeiro e dados de contato.
- Contrato: modalidade REDE ou LOJA, plano, preço, periodicidade, início, vencimento e carência. Trial, isenção e negociação devem ser explícitos e auditados, nunca deduzidos da ausência de fatura.
- Lojas/licenças do contrato: vínculo e vigência, status individual, implantação, atividade e permissões operacionais.
- Cobrança consolidada: uma fatura por contrato/competência com composição por lojas/licenças. No modo individual, cada contrato de filial possui sua própria obrigação. Valores consolidados não são somados novamente por filial.
- Acesso efetivo: autorização da loja + situação do contrato responsável + faturas exigíveis após carência. Dívida da rede afeta somente lojas cobertas pelo contrato; dívida individual afeta somente aquela filial.
- Master: visão Rede -> Lojas; indicadores financeiros consolidados separados dos indicadores de implantação/utilização por filial. Identificar quem deve ser contatado e quais lojas são afetadas.
- Recorrência: chave única contrato/competência, criação idempotente sob concorrência, emissão/cancelamento/descontos auditados e sincronização de confirmação do gateway. Falha do gateway não marca pagamento nem libera operação.
- Liberação: pagar uma fatura antiga não regulariza outras vencidas; liberada somente após resolver todas as obrigações impeditivas do contrato ou registrar exceção autorizada.

## Recuperação do legado

Antes de criar competências retroativas, determinar vigência e modalidade do contrato, possíveis pagamentos fora do sistema, isenções/negociações e abrangência das filiais. Preparar simulação por contrato com competências, valores, vencimentos e efeito de acesso. Não gerar dívida retroativa ou bloquear clientes apenas pela idade da última fatura paga.

## Critérios de validação

Mensalidade não duplicada em execução simultânea/restart; avanço correto de competência; bloqueio antes/depois da carência e fuso; pagamento antigo com outra dívida vencida; cancelamento e contestação; contrato de rede com várias lojas; filial individual inadimplente sem afetar outra; bloqueio efetivo no login, sessão já aberta, escrita, integração e WebSocket; reativação após regularização; cobrança consolidada sem duplicar valores; gateway indisponível e eventos repetidos.

Estado: diagnóstico confirmado. Recorrência, unificação da carência, reativação por conjunto de obrigações e contrato de rede ainda precisam ser implementados e validados. Esta revisão não altera as regras em produção.
