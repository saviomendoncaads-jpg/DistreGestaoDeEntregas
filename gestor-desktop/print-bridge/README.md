# Impressão local do Distre

O conector Windows escuta somente em `127.0.0.1:17891`, lista as impressoras instaladas e recebe comandas do navegador. Usa os drivers do Windows sem janela de impressão. Não depende de bibliotecas adicionais de Node.

Configure `DISTRE_PRINT_ORIGINS` com as origens exatas autorizadas, separadas por vírgulas. Inicie `node server.cjs` com esse ambiente definido. Mantenha o processo ativo enquanto usar a impressão automática; nesta instalação ele é gerenciado pelo PM2.

Em Configurações, escolha Impressão automática, busque as impressoras, selecione uma e faça o teste. Se o navegador solicitar acesso à rede local, o usuário deve permitir para conectar.

Impressoras Microsoft Print To PDF salvam arquivos individuais em `%LOCALAPPDATA%\Distre\Impressao`. Fax, OneNote e XPS ficam indisponíveis no modo automático porque dependem de interação adicional. Impressoras físicas precisam de driver instalado e conexão funcional.

As origens autorizadas são verificadas antes de listar ou imprimir; cada processo gera uma credencial aleatória para as requisições de impressão. Trabalhos são limitados em tamanho e entram em fila. O conector recebe texto de comandas; não executa comandos enviados pelo navegador.

Opcional: `DISTRE_PDF_PYTHON` aponta para um Python com `pypdf` e `pdfplumber`. Nessa instalação, esses pacotes ajustam a página gerada pelo driver virtual para uma comanda de 80 mm, sem alterar o conteúdo. O conector permite baixar o resultado do teste por uma rota local protegida.

Um inicializador na pasta Inicializar do usuário mantém o conector disponível ao entrar no Windows, sem abrir janela e sem iniciar outro processo quando a porta local já está ativa.
