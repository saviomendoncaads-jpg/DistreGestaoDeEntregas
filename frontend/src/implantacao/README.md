# Painel de implantação — estrutura demonstrativa

Rota `/implantacao`, também acessível pela ação **Implantação** do painel da loja.

Componentes: `Sidebar`, `Timeline`, `TimelineItem`, `VideoStep`, `UploadStep` e `ImplementationPanel`. Os sete passos são definidos em `types.ts`; `useState` controla o avanço sequencial. O passo ativo expande, os próximos ficam bloqueados e o trecho da linha de um passo concluído fica verde. Layout responsivo em Tailwind e CSS isolado.

## Limites definidos para esta entrega

- Vídeos, planilhas modelo e manual PDF serão produzidos em etapa posterior; não há arquivos de conteúdo nesta entrega. Os botões de download estão desabilitados com explicação.
- Os arquivos selecionados ficam apenas no navegador. Upload/importação e associação de imagens a produtos são simulados; não processam Excel nem alteram catálogo, estoque ou e-commerce.
- Go-Live conclui a demonstração, sem ativar serviços ou mudar dados da loja.
- Progresso temporário, reiniciado ao recarregar a página; não está vinculado à sessão da loja nem persistido no servidor.

## Próxima integração

Adicionar aulas próprias, modelos versionados e guia de operação. Implementar progresso por loja/usuário, importações com prévia/validação/erros e autorização no servidor, associação de imagens por código e aceite de Go-Live. Não transformar a conclusão simulada em autorização operacional sem essas validações.

## Validação

Build completo. Jornada em navegador: ordem e bloqueio dos sete passos; linha verde; formatos inválidos; planilha de produtos/estoque; várias imagens; bloqueio dos downloads sem conteúdo; Go-Live e reinício. Desktop e celular sem rolagem horizontal ou erros de JavaScript.
