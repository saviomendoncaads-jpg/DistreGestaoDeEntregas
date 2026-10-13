# Emissão fiscal direta do Distre

Implementação de NF-e (55) e NFC-e (65) por empresa/loja, comunicando diretamente com os serviços oficiais da SEFAZ. Focus e simulação continuam disponíveis para configurações existentes.

## Preparar a primeira homologação

No painel da operação, abra **Dados fiscais**:

1. Preencha razão social, CNPJ numérico válido, inscrição estadual, regime e endereço do estabelecimento.
2. Em **Emissão**, selecione **Distre · SEFAZ direta**, **Homologação**, série e próximo número. Informe o código IBGE do município com sete dígitos. O preenchimento por CEP pode sugeri-lo; confira o dado.
3. Configure NCM, CFOP, CSOSN/CST, PIS, COFINS e, quando aplicável, IBS/CBS com o responsável fiscal. Produtos podem substituir os padrões da loja em **Produtos → Dados fiscais**, inclusive alíquotas e classificação tributária.
4. Para NFC-e, informe as URLs públicas oficiais de QR Code e consulta da UF, separadas por ambiente. A versão 3 online dispensa CSC; a versão 2 exige CSC e identificador do ambiente escolhido. NF-e não exige CSC.
5. Em **Credenciais**, envie o certificado A1 `.pfx`/`.p12` com chave privada e a senha. O certificado precisa estar vigente e identificar a mesma raiz CNPJ do emitente. Arquivo e segredos são cifrados e nunca retornam pela API.
6. Confirme que o estabelecimento está credenciado na UF para cada modelo/ambiente. Use **Testar homologação** para consultar os serviços com autenticação pelo certificado. Serviço operacional não comprova credenciamento.
7. Emita uma venda de teste; para NF-e, complete CPF/CNPJ e endereço do destinatário, incluindo IBGE. Confirme **AUTORIZADA**, chave e protocolo em **Notas e eventos**, e baixe o XML processado. Confira a nota no portal oficial da UF. Homologação não tem valor fiscal.

A transmissão oficial ainda depende do certificado e do credenciamento reais. Certificados autoassinados usados nos testes automatizados não autorizam notas na SEFAZ.

## Fluxos entregues

- Assinatura XMLDSig com A1, HTTPS com autenticação mútua, SOAP 1.2 e validação XSD antes da transmissão.
- Catálogo de autorizadores para as 27 UFs, ambos modelos, homologação e produção. A cobertura do catálogo não representa homologação realizada em cada UF.
- Numeração compartilhada por CNPJ/ambiente/modelo/série, reserva transacional e bloqueio de emissão simultânea da mesma venda, inclusive entre NF-e e NFC-e.
- XML assinado armazenado antes do envio. Tempo esgotado/resposta incerta preservam PROCESSANDO. **Recuperar envio** consulta a chave e só retransmite o mesmo documento se a SEFAZ informar inexistência; conserva número, série, chave e XML.
- Consulta de recibo/situação, verificação de chave, ambiente e resumo criptográfico do protocolo. Uma consulta atrasada não regride uma nota autorizada/cancelada.
- Cancelamento, carta de correção de NF-e (sequências 1–20) e inutilização. Eventos e respostas são arquivados. Uma faixa com nota autorizada/cancelada/pendente não pode ser inutilizada pelo painel.
- Contingência offline da NFC-e solicitada expressamente pelo operador: tpEmis=9, justificativa, data e QR v2/v3. O documento fica **CONTINGENCIA**, nunca AUTORIZADA. Em **Notas e eventos**, use **Transmitir contingência** assim que a conexão voltar, respeitando o prazo estadual. Não há envio automático em segundo plano.
- NFC-e impressa em 80 mm com QR Code e indicação de contingência/homologação. NF-e gera DANFE A4 em PDF a partir do XML autorizado, com código de barras Code 128 e paginação.
- Downloads de XML, PDF e eventos exigem sessão e autorização da loja. Os documentos não são publicados na pasta de uploads.

## Limites de enquadramento

O emissor atende vendas internas de mercadorias a consumidor final. Implementa CSOSN 101/102/103/300/400/500, CST ICMS 00/20/40/41/50/60, PIS/COFINS percentuais ou não tributados e IBS/CBS 000/410. A validação de regras específicas de produto/UF continua a cargo da SEFAZ; o contador deve definir o enquadramento.

Operações interestaduais que demandam DIFAL/FCP, retenção de ST na operação, combustíveis, importação/exportação, devoluções, complementares, monofasia IBS/CBS e outros CST com grupos adicionais são bloqueados antes do envio e precisam de extensão fiscal específica. A contingência de NF-e via SVC/EPEC e o DANFE Simplificado Tipo 2 não fazem parte deste fluxo. CNPJ alfanumérico ainda exige adaptação do cadastro e do cálculo da chave. O módulo não transmite escrituração nem envia e-mails automaticamente.

Produção deve ser configurada separadamente após validar os dados e a emissão oficial em homologação. Não confundir aprovação do XML pelo XSD com aprovação das regras tributárias ou homologação oficial.

## Operação e backup

Preserve `FISCAL_CHAVE_CRIPTOGRAFIA` ou `backend/.chave-fiscal` junto ao backup do SQL Server. A mesma chave protege credenciais e arquivos fiscais; perdê-la impede ler os arquivos cifrados. Não commite PFX, senha, CSC ou a chave do cofre.

Tabelas aditivas: `CONFIG_FISCAL_LOJA.SEFAZ_CONFIG`, `FISCAL_SEFAZ_DOCUMENTOS`, `FISCAL_SEFAZ_SEQUENCIAS`, `FISCAL_SEFAZ_EVENTOS`. O módulo suporta o SQL Server usado pelo Distre sem exigir funções JSON nativas.

Testes: `npm run build`, `npm test`; integração com SQL temporário: `RUN_SQL_SEFAZ_TESTS=1 npm test -- test/sefaz-sql.test.ts`. O teste SQL cria e remove somente um banco `DISTRE_TEST_FISCAL_<timestamp>`.

## Esquemas e fontes oficiais

- [Relação oficial NF-e/SVRS](https://dfe-portal.svrs.rs.gov.br/NFE/Servicos) e [NFC-e/SVRS](https://dfe-portal.svrs.rs.gov.br/NFCE/Servicos). O complemento de MG vem da [SEF/MG](https://portalsped.fazenda.mg.gov.br/spedmg/nfce/web-services/). O vínculo UF/autorizador NF-e vem da [relação nacional](https://www.nfe.fazenda.gov.br/portal/webServices.aspx?AspxAutoDetectCookieSupport=1&tipoConteudo=OUC%2FYVNWZfo%3D).
- [Esquemas oficiais](https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?AspxAutoDetectCookieSupport=1&tipoConteudo=BMPFMBoln3w%3D): PL 010f v1.04, NT 2025.002 v1.50 e NT 2026.007 v1.00. SHA-256 do ZIP: `b8589490a58a09a993a80e6ac4d7ed10f20892061ecfc56719337098d4b95998`. Inclui complementos oficiais de eventos/consulta do PL 010d e esquemas de serviços 4.00, mantendo os tipos e leiaute de nota mais recentes.
- [Manual de DANFE NFC-e / QR Code 6.0](https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=k%2FIuuaW4YiY%3D) e [NT 2025.001 v1.03](https://www.nfe.fazenda.gov.br/Portal/exibirArquivo.aspx?conteudo=NvuzQGYd6E8%3D).

Os XSDs foram obtidos dos ZIPs oficiais e armazenados em `backend/src/fiscal/sefaz/schemas.json`, para validação sem rede no momento da emissão. Os scripts de importação são ferramentas de manutenção; uma atualização de esquema/catálogo precisa de revisão e testes antes do deploy. A aplicação utiliza bibliotecas de XML, PDF e criptografia; não depende de API privada de emissão fiscal.
