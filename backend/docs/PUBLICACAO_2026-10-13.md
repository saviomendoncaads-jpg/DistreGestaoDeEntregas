# Publicação de 13/10/2026 — America/Fortaleza

## Atualização: implantação integrada por loja

A continuação foi publicada com código `dca20f8760ddfcd4aa73aa7ee594a3f01f3ed721`, na release `C:/Projetos/Distre-releases/dca20f8760dd`. A descrição demonstrativa abaixo registra a primeira publicação; a versão atual passou a exigir sessão e salvar o progresso por loja.

- Menu da loja e cartão de próxima etapa; primeiro acesso de lojas sem catálogo/operação abre a jornada. Lojas existentes mantêm o painel operacional. Após Go-Live, o menu passa a Ajuda e Treinamentos.
- Admin Master acompanha etapa, registros pendentes e data de conclusão; ficha da loja mostra progresso e acesso à jornada em modo de acompanhamento.
- Avanço e histórico persistidos em SQL, em transação, com isolamento por loja e retry idempotente. Tarefas conferem produtos ativos, saldos e imagens do e-commerce. Go-Live revalida esses dados e bloqueia lojas suspensas.
- Vídeos, modelos e PDF continuam para depois. Sem aula disponível, a loja confirma conhecimento prévio; não há registro de aula assistida. Go-Live registra aceite de preparação, sem criar pedidos, notas, cobranças ou alterar planos.
- 230 testes aprovados, incluindo 36 SQL; jornada real de navegador validou primeiro acesso, recarga, tarefas pendentes, retorno ao cadastro/estoque, conclusão, Ajuda e Treinamentos e acompanhamento administrativo.
- Backup restaurado em base temporária; recuperação da versão anterior em `C:/Projetos/Distre-backups/release-1791890458452`. Inicialização em porta separada validou quatro comandas existentes, login e relatórios antes da promoção. CI backend/frontend aprovado no commit promovido.
- Após publicação, endereço público confirmou login obrigatório, acompanhamento das duas lojas existentes e jornada administrativa em modo de consulta, inclusive layout de celular. Não foram concluídas etapas da operação durante essa verificação.

## Histórico da primeira publicação

Publicação autorizada pela operação e concluída. Código promovido: `6a2b05711b7b62471baf1cfe4631bc5694c45d89`, do PR #2. Inclui as correções anteriores de acesso, relatórios, pedido/entrega/retorno, entrega manual e a estrutura demonstrativa do painel de implantação.

## Implantação demonstrativa

Rota pública `/implantacao`, com acesso pela ação Implantação no painel da loja. Sete passos, bloqueio sequencial, linha/check verde e conclusão simulada. Vídeos, modelos e PDF ainda não possuem arquivos, conforme orientação do cliente; downloads desabilitados. Arquivos selecionados ficam no navegador, sem processamento/importação/envio ao servidor. Progresso temporário, sem vínculo ou persistência por loja. Go-Live conclui somente a prévia.

## Evidências

- Backend e frontend compilados; 225 testes passaram, incluindo 31 testes SQL em bases próprias.
- CI GitHub aprovado para backend/frontend no commit de código promovido.
- Jornada de sete passos exercitada em navegador: uploads locais, rejeição de formato inválido, várias imagens, bloqueio dos conteúdos futuros, conclusão e reinício. Desktop e celular sem erro JavaScript ou rolagem horizontal.
- Backup SQL COPY_ONLY/CHECKSUM de DISTRE_PROD, verificação e restauração completa em banco temporário. Quatro comandas conferidas na base restaurada. Banco temporário removido após validação; produção preservada.
- Inicialização da release em porta separada: SQL, login administrativo, quatro comandas, relatórios e rotas de aplicação conferidos. Migração aditiva de vínculo pedido/entrega aplicada; relatório não sinalizou vínculo ambíguo nesta base.
- Após promoção: health público com SQL, `/app`, `/implantacao`, bloqueio de API anônima e sessão administrativa/relatórios verificados. Interface pública da implantação validada em desktop/celular.

## Execução e recuperação

A aplicação está sob PM2 `distre`, executando a release em `C:/Projetos/Distre-releases/6a2b05711b7b/backend`. O túnel continua apontando à porta 5000. Configuração PM2 salva para recuperação do processo. Não houve merge ou alteração da branch/arquivos locais em `C:/Projetos/Distre`.

Artefatos, configuração privada, uploads e configuração PM2 anteriores estão em `C:/Projetos/Distre-backups/release-1791862602948`. O manifest privado registra a localização do backup SQL no diretório de backups do serviço SQL Server. O serviço SQL possui acesso ao backup; a restauração foi exercitada por SQL, sem afrouxar permissões do arquivo.

Uploads permanecem compartilhados com o diretório original, sem mover imagens. Assets antigos foram preservados para páginas já abertas. Em rollback de código, restaurar a configuração PM2 anterior registrada no backup e verificar health, login e rotas. O banco não deve ser restaurado automaticamente para voltar código, pois isso descartaria operações posteriores; as alterações de schema desta release são aditivas.

## Limites restantes

A publicação não fecha as pendências do diagnóstico de consolidação. Gateway da operação estava configurado como MOCK, sem credenciais Asaas: a versão publicada rejeita cobrança simulada em produção e não habilita cobrança real. Credenciais históricas, dependência node-forge, fiscal real, compras/financeiro das vendas e demais itens abertos continuam exigindo tratamento próprio. O endereço atual ainda utiliza túnel temporário.

## Área do Cliente publicada — 13/10/2026

Código `d42d0f82c0c8420da842b073cc884c9dcec8f95c`, release separada `C:/Projetos/Distre-releases/d42d0f82c0c8`.

- `/area-cliente`: Início, Minha implantação, Treinamentos e manuais, Suporte e Minha conta. Menu operacional com acesso à Área do Cliente e retorno explícito à operação. `/implantacao` preservado.
- Progresso e histórico da jornada mantidos. A página inicial consulta os dados; abrir a jornada inicia a implantação. Acessar Operação funciona mesmo antes de iniciar a preparação.
- Conteúdos e atendimento por chamados continuam pendentes; não foram fabricados arquivos, canais de suporte, planos ou dados de assinatura.
- Build completo e 230 testes aprovados (36 SQL); fluxo de navegador em base temporária: primeiro acesso, todas as páginas, acesso direto à operação, persistência e conclusão das sete etapas, tarefas verificadas, Master e celular de 390 px. CI aprovado nos quatro checks do código publicado.
- Backup SQL com restauração e quatro comandas conferidas em base temporária. Estágio aprovado: login, relatórios e quatro comandas existentes. Publicação com configuração do serviço salva e versão anterior disponível para recuperação.
- Checagem pública autenticada de consulta, incluindo Área do Cliente e jornada administrativa; nenhum progresso de loja real foi concluído pela validação.


## Acesso no cabeçalho — 13/10/2026

Código `03c7bd2c6025ca782dfb8036e91c4d474254f357` publicado: botão Área do Cliente no cabeçalho junto às ações da sessão, retirado do menu lateral de operações, conforme local indicado pela operação. Build completo aprovado; navegador autenticado verificou um botão no cabeçalho, nenhum no menu operacional e acesso ao espaço do cliente. Fluxo da jornada e retorno à operação preservados. Backup SQL restaurado em base temporária; estágio com quatro comandas e relatório íntegro; publicação saudável e consulta pública autenticada conferida.


## Pedidos concluídos — 13/10/2026

Código `14efd742d0f5e68d8e92cb3dfc8c6d375b91f368` publicado. A central ganhou a quinta opção Concluídos e acesso lateral correspondente. A lista inicial mantém somente comandas em andamento; concluídos agrupam ENTREGUE, CANCELADO, RECUSADO_INSUCESSO e PRODUTO_RETORNADO_ESTOQUE, preservando resultado original, consulta e histórico. AGUARDANDO_RETORNO_CD e pedidos antigos em andamento permanecem na fila. Nenhum cancelamento automático ou alteração de registros foi adicionado.

Build completo e quatro checks CI aprovados. Navegador com conjunto de oito comandas verificou cinco cartões, quatro pendências anteriores (incluindo retorno), quatro encerradas, busca, retorno à fila e celular. Backup SQL restaurado; estágio confirmou quatro comandas e relatório sem vínculos ambíguos; publicação e endereço público conferidos.


## Títulos por área — 13/10/2026

Código `78dc122ea094951a91d52abaabb8d0f8cabd802d` publicado. Títulos de abas: Distre - Operação na sessão da loja e visualização administrativa de loja; Distre - Painel Administrador no Master; Distre - Área do Cliente na jornada e portal; Distre - Acesso ao ERP no login. Distre - Loja, Pedidos e Logística fica na página inicial institucional. Vitrine pública preserva título configurado pela loja.

Build e quatro checks CI aprovados; navegador autenticado conferiu transição entre operação, portal e Master. Backup SQL restaurado, estágio saudável e quatro comandas preservadas; checagem pública verificou títulos do login, Master, portal e HTML institucional.


## Dashboard de implantação, financeiro e utilização — 13/10/2026

Código `a067722d30f715cd54ac57ce55edb69d5b5c877f` publicado. Master apresenta indicadores clicáveis, busca/filtros, progresso e etapa, início/conclusão, primeiro/último pagamento registrado e vencimento da fatura correspondente, fatura em aberto mais próxima (ou última paga), situação financeira e sinais de utilização. Detalhe inclui contato cadastrado, histórico e próxima ação sugerida. Exportação CSV aplica os filtros.

Pagamentos/faturas respeitam vínculo da loja, inclusive vínculo via assinatura. Registros antigos por empresa são identificados explicitamente, compartilhados pelas filiais pertinentes e não representam valores somáveis por loja. Primeiro pagamento registrado não prova a data de liberação do acesso. Utilização considera atividade em comandas, histórico de produtos e etapas, sem afirmar último login ou tempo conectado. Contagem de 30 dias evita duplicar pedido e entrega vinculados. Alertas de ausência de avanço/atividade usam 7 dias. Não há envio de mensagens, cobranças automáticas ou alterações de progresso nesta tela.

232 testes passaram, incluindo 38 SQL. Testes adicionais verificam isolamento de faturas de filiais, escopo legado por empresa, prioridade da fatura em aberto e contagem operacional sem duplicação. Navegador em base temporária verificou permissão administrativa, baixa manual refletida no dashboard, filtro de pagamento sem início, detalhes, busca, exportação, atraso visual e responsividade. Build e quatro checks CI aprovados. Backup restaurado, estágio com quatro comandas e relatórios conferidos; dashboard público autenticado verificado em desktop e celular, sem gravar pagamentos ou etapas reais.


## Cobrança recorrente, redes e acesso restrito

Recorrência mensal idempotente recupera competências vencidas sem duplicação; preço histórico/personalizado é preservado. Vencimento e carência configurável usam datas civis de Fortaleza. Reavaliação de pagamentos, cancelamentos e carência libera a operação somente quando não restam impedimentos. Contratos podem ser individuais ou consolidados da rede; filiais novas herdam contrato de rede sem cobrança adicional. Alteração preserva dívida anterior e exige conciliação para pagamentos futuros ou cobranças externas antes de substituí-las.

A inadimplência restringe operações, nunca o login da conta: sessão continua válida, Área do Cliente e cobranças permanecem disponíveis. Operação fica cinza, inerte, com aviso e acesso direto às cobranças. Escritas HTTP, integrações e pacotes operacionais Socket continuam protegidos no servidor. Cobranças são filtradas pela empresa/loja da sessão, incluindo rede e excluindo faturas individuais de outras filiais. Pix/boleto simulados, links sem HTTPS e meios de fatura paga/cancelada não são oferecidos. Produção ainda exige configuração do provedor real para disponibilizar pagamento online; sem meios reais a fatura orienta regularização com a administração. Cliente não confirma a própria baixa.

247 testes passaram, incluindo 45 SQL. Navegador com banco exclusivo verificou contrato único para três filiais, login suspenso, cobrança acessível, escrita 402, operação inerte, ausência de Pix fictício, baixa administrativa em fixture e liberação na mesma sessão. Smoke SQL/HTTP completo: 11 cenários aprovados.
