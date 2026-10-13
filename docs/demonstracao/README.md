# Demonstração da página inicial

O botão **Assistir demonstração** abre um player na página inicial, sem login. O vídeo é carregado somente ao abrir; fechar o diálogo ou pressionar Esc pausa a reprodução e devolve o foco. O diálogo é responsivo, com controles nativos e legendas opcionais em português.

Vídeo narrado com a identidade Distre e o mesmo kit dos treinamentos. Mostra vitrine, sacola, recebimento de pedidos, conferência por código de barras, opção fiscal, despacho e acompanhamento de entregas. Loja, clientes, produtos e valores são fictícios; a nota é simulada, identificada na voz e em tela.

Fonte do roteiro em `roteiro.json`. Projeto de produção em `C:/Projetos/Distre-videos/videos/apresentacao-distre/`; usa as capturas de operação dos treinamentos e novas capturas da vitrine no banco isolado `DISTRE_VIDEO_DEMO`, sem criar pedidos de clientes reais.

Arquivos publicados em `site/demonstracao/`: MP4, capa PNG e legendas VTT. O backend já serve essa pasta pela rota estática do site. Vídeos e manuais de treinamento existentes são preservados.
