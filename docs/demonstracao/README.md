# Demonstração da página inicial

O vídeo fica em uma seção da página inicial, logo abaixo de **Conheça o DISTRE na prática**, antes dos planos, sem login. O botão **Assistir demonstração** rola até essa seção, sem abrir janela ou iniciar reprodução automática. O player usa `preload="none"`, controles nativos e legendas opcionais em português. O layout é responsivo, e o destino da navegação fica abaixo do cabeçalho fixo.

Vídeo narrado com a identidade Distre e o mesmo kit dos treinamentos. Mostra vitrine, sacola, recebimento de pedidos, conferência por código de barras, opção fiscal, despacho e acompanhamento de entregas. Loja, clientes, produtos e valores são fictícios; a nota é simulada, identificada na voz e em tela.

Fonte do roteiro em `roteiro.json`. Projeto de produção em `C:/Projetos/Distre-videos/videos/apresentacao-distre/`; usa as capturas de operação dos treinamentos e novas capturas da vitrine no banco isolado `DISTRE_VIDEO_DEMO`, sem criar pedidos de clientes reais.

Arquivos publicados em `site/demonstracao/`: MP4, capa PNG e legendas VTT. O backend já serve essa pasta pela rota estática do site. Vídeos e manuais de treinamento existentes são preservados.
