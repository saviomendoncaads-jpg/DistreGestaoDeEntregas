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

## Aulas, manuais e modelos

Cada etapa tem uma aula em vídeo e um manual em PDF, produzidos com as telas reais do Distre (loja fictícia de demonstração) e a identidade visual do produto. Arquivos em `frontend/public/treinamentos/{videos,manuais,modelos}`, servidos pelo backend em `/treinamentos`; a lista (títulos, duração, páginas) fica em `conteudos.dados.ts`, gerado junto com os arquivos. `Materiais.tsx` mostra o player, o PDF e o modelo dentro de cada etapa; a página **Treinamentos e manuais** da Área do Cliente reúne tudo.

- Etapas sem arquivo ainda mostram um aviso de produção; nada é simulado.
- Assistir ao vídeo **não** é registrado: a confirmação das etapas de treinamento continua sendo declaração da loja (`conhecimento_previo_confirmado`).
- Modelos: planilha de importação de produtos (a mesma do botão "Baixar modelo") e planilha de contagem de estoque (apoio; o saldo é registrado na tela Estoque).
- Os textos dos vídeos e dos manuais estão em `docs/implantacao-midia/`.

## Validação

Testes SQL: isolamento, persistência, concorrência, idempotência, sequência, saldo e imagens reais, suspensão e revalidação do Go-Live. HTTP: sessão, escopo por loja e acesso administrativo. Navegador: primeiro acesso, refresh, tarefa pendente, retorno do cadastro, estoque, finalização, mudança para Ajuda e Treinamentos, acompanhamento administrativo e responsividade.

## Área do Cliente

A rota `/area-cliente` reúne Início, Minha implantação, Treinamentos e manuais, Suporte e Minha conta. `/implantacao` continua abrindo a jornada para preservar links existentes. A página inicial apenas consulta o progresso; a implantação é iniciada ao abrir a jornada. Uma loja nova sem catálogo ou operações chega primeiro à Área do Cliente. Depois de iniciar sua preparação, o acesso normal à operação continua disponível, inclusive após o Go-Live.

O cabeçalho da operação apresenta o acesso à Área do Cliente, junto às ações da sessão. O menu lateral permanece dedicado à operação. As tarefas retornam para a jornada dentro desse espaço. Materiais seguem indisponíveis até serem produzidos; suporte oferece orientação sem simular chamados. Minha conta consulta somente dados reais da loja e não presume plano, assinatura ou permissões para alterações. O Admin Master mantém o acompanhamento sem concluir etapas pela loja. A navegação fica acessível também no celular.

Validação: build de produção, 230 testes (incluindo SQL), fluxo autenticado em banco temporário até Go-Live, páginas da Área do Cliente, persistência, retorno ao cadastro e navegação em 390 px.
