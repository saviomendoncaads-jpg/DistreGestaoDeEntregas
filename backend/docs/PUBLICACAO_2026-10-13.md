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
