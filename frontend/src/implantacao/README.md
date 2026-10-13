# Implantação integrada por loja

Rota `/implantacao` autenticada, no menu lateral da loja. Sem sessão, segue para login. Admin sem loja selecionada abre o acompanhamento no Admin Master; com `?lojaId=...`, vê a jornada em modo de acompanhamento.

- Loja nova, sem catálogo ou operação anterior, recebe a jornada no primeiro acesso. Lojas já operando mantêm o painel operacional.
- Cartão no painel mostra progresso e próxima etapa; o acesso ao painel operacional permanece disponível durante a implantação.
- Ao concluir, o cartão sai do painel e o menu passa a **Ajuda e Treinamentos**.
- Admin Master possui área de implantação e link de progresso na ficha de cada loja, com etapa, registros pendentes e data de conclusão.

## Persistência e critérios

`IMPLANTACAO_LOJAS` mantém progresso e datas. `IMPLANTACAO_ETAPAS` mantém modalidade, identificação da sessão por papel/loja, evidência e horário. Não armazena tokens. Uma transação serializável valida sequência e grava avanço + histórico. Retry é idempotente, sem duplicar eventos. A sessão de loja ignora IDs externos; admin pode consultar uma loja explicitamente.

1. Conhecimento prévio de organização do catálogo confirmado pela loja.
2. Pelo menos um produto ativo cadastrado/importado. Rascunhos não contam.
3. Conhecimento prévio de estoque inicial confirmado pela loja.
4. Todos os produtos ativos possuem registro de saldo na loja.
5. Para loja que recebe pedidos por e-commerce, todos os produtos ativos têm imagem principal cadastrada. Para loja sem esse canal, imagens são opcionais.
6. Conhecimento prévio de operação e PDV confirmado pela loja.
7. Aceite de Go-Live, revalidando catálogo, saldos, imagens quando necessárias e situação de acesso da loja.

Go-Live registra preparação/aceite; não cria pedidos, documentos fiscais, cobranças ou alterações de plano. Não certifica homologação fiscal/financeira. A identificação individual de operadores depende da evolução de usuários e permissões documentada na auditoria.

## Conteúdo futuro

Vídeos, modelos e PDF ainda serão produzidos. Sem aula disponível, a confirmação é expressamente **conhecimento prévio**, sem registro de aula assistida. Downloads permanecem desabilitados. As tarefas abrem cadastro/importação de produtos e gestão de estoque existentes, com retorno à implantação; não usam uploads fictícios para avançar. Os componentes VideoStep/UploadStep do protótipo ficam reservados para a futura integração dos conteúdos.

## Validação

Testes SQL: isolamento, persistência, concorrência, idempotência, sequência, saldo e imagens reais, suspensão e revalidação do Go-Live. HTTP: sessão, escopo por loja e acesso administrativo. Navegador: primeiro acesso, refresh, tarefa pendente, retorno do cadastro, estoque, finalização, mudança para Ajuda e Treinamentos, acompanhamento administrativo e responsividade.

## Área do Cliente

A rota `/area-cliente` reúne Início, Minha implantação, Treinamentos e manuais, Suporte e Minha conta. `/implantacao` continua abrindo a jornada para preservar links existentes. A página inicial apenas consulta o progresso; a implantação é iniciada ao abrir a jornada. Uma loja nova sem catálogo ou operações chega primeiro à Área do Cliente. Depois de iniciar sua preparação, o acesso normal à operação continua disponível, inclusive após o Go-Live.

O menu operacional apresenta um único acesso à Área do Cliente. As tarefas retornam para a jornada dentro desse espaço. Materiais seguem indisponíveis até serem produzidos; suporte oferece orientação sem simular chamados. Minha conta consulta somente dados reais da loja e não presume plano, assinatura ou permissões para alterações. O Admin Master mantém o acompanhamento sem concluir etapas pela loja. A navegação fica acessível também no celular.

Validação: build de produção, 230 testes (incluindo SQL), fluxo autenticado em banco temporário até Go-Live, páginas da Área do Cliente, persistência, retorno ao cadastro e navegação em 390 px.
