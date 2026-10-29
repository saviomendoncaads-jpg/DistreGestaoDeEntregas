# Estado atual — Distre

Referência: **28/10/2026, America/Fortaleza**.

Esta atualização reúne a linha operacional local e os ajustes de modalidades de entrega, cotação, localização e preenchimento de CEP que já estavam no ambiente em execução. A aplicação em execução não foi reiniciada nem reimplantada para atualizar o GitHub.

## Escopo demonstrável

O [README](../README.md) descreve o fluxo atual: catálogo, produtos, estoque, conferência por EAN, central de pedidos, despacho, entregas manuais, retorno integral vendável, modalidades/taxas, comandas, relatórios, administração, cobranças da plataforma e implantação com conteúdo de treinamento.

A finalização rápida no painel não obriga informar nome do recebedor. Isso não constitui assinatura, foto ou prova geográfica de entrega. Despacho mantém a seleção do operador; não calcula rota otimizada. O cálculo de quilômetros para tarifação é um recurso separado.

## O que foi atualizado nesta revisão

- Versionamento dos ajustes mais recentes de modalidade/prazo/taxa e sua preservação ao converter pedido em entrega.
- Cotação feita no servidor, vinculada à loja, endereço, modalidade, agendamento e configuração, com validade de dez minutos.
- Conferência de totais e troco considerando a taxa de entrega.
- Preenchimento do endereço por CEP e tratamento de CEP inválido, ausente ou serviço indisponível.
- Localização por logradouro com aviso quando não há precisão de número; cálculo por vias para cobrança.
- Apresentação do projeto revisada para remover GPS, mapa operacional e aplicativo do entregador das capacidades ativas.
- Separação entre cobrança da plataforma e financeiro das vendas da loja.
- Documentação de portfólio com capturas reais de um ambiente demonstrativo.

## Verificações desta atualização

Verificações executadas em 28/10/2026 com Node.js 24.19.0:

| Verificação | Resultado |
| --- | --- |
| Instalação limpa pelos lockfiles | Backend e frontend concluídos. |
| Build do backend | Aprovado, com TypeScript estrito. |
| Build do frontend | Aprovado, com verificação de tipos e bundle Vite. |
| Suíte padrão | **308 testes aprovados**, zero falhas; 63 testes SQL opt-in não executados nessa rodada. |
| Suítes SQL opt-in | **63 testes aprovados**, zero falhas e zero ignorados, em bases temporárias no SQL Server local. |
| Total de casos distintos | **371 aprovados** (308 + 63). |

A rodada SQL cobre estoque, faltas, ciclo pedido/entrega/retorno, preservação do schema, contratos de cobrança, cadastro/acesso, repositório fiscal e configuração/snapshot das modalidades. Os testes fiscais não transmitem documentos reais à SEFAZ. A revisão não executou cobrança real nem impressão em equipamento físico.

Os números descrevem esta execução, não uma certificação de disponibilidade, segurança integral ou ausência de defeitos. Não foi realizada nova validação ponta a ponta no navegador nesta revisão; as capturas da demonstração são anteriores.

Os comandos abaixo podem ser repetidos em ambiente de desenvolvimento.

```powershell
npm ci --prefix backend
npm ci --prefix frontend
npm run build --prefix backend
npm run build --prefix frontend
npm test --prefix backend -- --maxWorkers=2
```

### SQL Server isolado

As suítes de SQL criam bancos com prefixo `DISTRE_TEST_` e nome único, apontam suas operações a essas bases e removem somente essas bases no encerramento. Requerem instância de teste com autenticação compatível. O banco da operação não deve ser usado como destino.

```powershell
$env:DB_SERVER = 'localhost\SQLEXPRESS'
$env:RUN_SQL_ESTOQUE_TESTS = '1'
$env:RUN_SQL_SEFAZ_TESTS = '1'
npm test --prefix backend -- --maxWorkers=1
Remove-Item Env:RUN_SQL_ESTOQUE_TESTS, Env:RUN_SQL_SEFAZ_TESTS
```

As rotinas de teardown removem bancos temporários e são parte do teste de integração. Credenciais privadas e arquivos de configuração da aplicação em execução não foram copiados para este repositório.

## Recursos com validação externa pendente

- **Fiscal:** adaptadores, regras e armazenamento implementados; nenhuma autorização fiscal real é certificada por esta atualização.
- **Cobrança real automática:** adaptador de gateway não equivale a cobrança Asaas homologada. Pix da Área do Cliente depende da confirmação manual.
- **Impressão física:** depende do conector, Windows, driver, impressora e teste no equipamento. A evidência anterior de impressão automática usou impressora virtual.
- **Serviços de localização/distância:** dependem de disponibilidade e cobertura dos provedores.
- **ERP/WhatsApp externo:** rotas e componentes internos não comprovam integração instalada em sistemas de terceiros.
- **Escala/disponibilidade:** sem certificação de múltiplas instâncias, carga sustentada ou recuperação contínua.

## Limites de interpretação dos dados

Relatórios descrevem registros disponíveis. Valores de pedidos não representam necessariamente recebimentos; cadastros e estoque atuais não são prova de histórico completo ou custo contábil. Os avisos de cobertura de dados fazem parte da leitura correta das métricas.

Documentos de auditoria anteriores continuam como histórico datado. O uso de fluxos simulados nesses documentos não transforma esses fluxos em capacidades ativas.
