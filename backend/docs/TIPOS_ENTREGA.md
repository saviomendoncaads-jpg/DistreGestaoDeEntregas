# Tipos de entrega e faixas por km

Implementação em `C:/Projetos/Distre-implantacao-midia`, publicada em produção. Ativação e tabelas de preços são mantidas por loja.

## Operação

Em **Configurações → Tipos e taxas de entrega**, habilite a regra, escolha o cálculo e clique em **Salvar regras de entrega**. As regras são persistidas por loja no servidor. As preferências de impressão continuam sendo do navegador.

Sugestões editáveis: EXPRESS R$ 7,90 / 45 minutos; ROTEIRIZADA R$ 6,00 / 120 minutos; AGENDADA R$ 6,00 / horário escolhido. Cada serviço pode ser desativado. O agendamento é informado no horário de Fortaleza e deve estar no futuro, em até 90 dias. Prazos das demais modalidades começam na confirmação do pedido.

Há dois modos de cobrança, sem somar duas taxas:

- **Por tipo:** aplica o preço da modalidade selecionada.
- **Por km:** usa a tabela de distância para a taxa final de todas as modalidades, preservando os prazos de cada tipo. Os valores fixos por tipo ficam guardados para uso no outro modo.

As faixas são contínuas: de zero até o primeiro limite; depois, acima do limite anterior até o próximo limite, inclusive. Exemplos: 7 km cobra R$ 10; 7,001 km até 8 km cobra R$ 15. A distância não é arredondada antes da escolha da faixa. Acima do último limite, a finalização é bloqueada.

A origem é o CEP configurado da loja. ViaCEP preenche o endereço; ArcGIS resolve o logradouro e o número, validando cidade, UF, nome da rua e confiança do resultado. Nominatim permanece como alternativa estrita. OSRM fornece a distância pelas vias. Falha de localização/roteamento bloqueia a cotação com mensagens separadas para origem e destino. Não se substitui o trajeto por distância em linha reta nem por centro de bairro/cidade. Quando o número não é localizado, a mesma rua pode fornecer um ponto de referência, informado como estimativa de logradouro na cotação e na comanda. A disponibilidade e a precisão dependem desses serviços externos.

Na finalização, completar os oito dígitos consulta o ViaCEP automaticamente, sem sair do campo. A mudança de CEP cancela a consulta anterior e limpa os campos de endereço, preservando número e complemento. CEP não encontrado e serviço indisponível têm avisos próprios e permitem preenchimento manual. A origem e o destino usados na demonstração foram conferidos após a correção de localização.

## Pré-venda e comanda

A finalização do catálogo permite selecionar a modalidade, informar o horário da agendada e calcular a entrega antes de confirmar. A taxa integra o total e a validação do troco. Alterar endereço, tipo ou agendamento invalida a cotação visível.

O servidor vincula a cotação à loja, ao endereço, ao serviço, ao agendamento e à configuração. Ela vale dez minutos e fica na memória do processo; reinício ou troca de instância exige nova cotação. Instalações com múltiplos processos precisam de armazenamento compartilhado de cotações ou afinidade de sessão antes de ativar este fluxo.

Tipo, taxa, prazo, previsão, horário agendado, origem e distância ficam gravados com o pedido. O preço e o prazo contratados não mudam quando a loja edita sua configuração. O serviço é preservado na conversão do pedido para entrega. A Express recebe destaque nas listas, no quadro, nos detalhes, no despacho e nas comandas impressas/PDF. O filtro de atrasados usa a previsão contratada para novos pedidos; comandas antigas mantêm a regra anterior.

## Integração com a pré-venda do ERP

Não foram feitas alterações no aplicativo Linx. As APIs do Distre estão preparadas para um integrador apresentar os tipos no ERP:

- `GET /api/integracao/entrega/opcoes`: configuração da própria loja.
- `POST /api/integracao/entrega/cotacao`: `{ endereco, entrega: { tipo, agendadoPara? } }`.
- `POST /api/integracao/pedidos` e `/entregas`: recebem `entrega: { tipo, agendadoPara?, cotacaoId? }` junto ao contrato atual.

Essas rotas usam a autenticação existente com `X-Api-Key` e `X-Loja-Id`. Se houver cotacaoId, a cotação deve ser válida para os mesmos dados. Sem cotacaoId, a integração autenticada calcula o serviço no servidor durante a ingestão. Valores de taxa/total informados pelo ERP devem coincidir com a regra; divergência retorna 409. Com regras ativas, omitir o tipo retorna 400.

As rotas públicas equivalentes para o catálogo são `GET /api/vitrine/:lojaId/entrega` e `POST /api/vitrine/:lojaId/entrega/cotacao`. O pedido público sempre exige uma cotação válida quando a regra está ativa. Preços enviados pelo navegador são ignorados.

## Persistência e implantação

O boot adiciona `ENTREGA_CONFIG` e `ENTREGAS.SERVICO_ENTREGA` de forma aditiva. Não altera comandas anteriores e não ativa cobranças automaticamente. Publicar exige atualizar servidor e interface juntos; publicar só a interface produzirá falha ao consultar as novas opções.

As lojas sem regra ativa preservam o comportamento anterior, inclusive nas integrações. Antes de ativar uma loja com ERP ou WhatsApp, conclua a seleção/cotação no respectivo canal: o bot WhatsApp anterior não recebeu novas opções nesta alteração. A interface dentro do Linx depende de trabalho no integrador/Linx.

## Validação

Testes de valores e prazos, limites inclusivos, bloqueio fora da área, agendamento, cotação expirada/alterada, isolamento por loja, total e troco, APIs públicas e integração. SQL real em bancos temporários para migração repetível, persistência após reconexão e preservação na conversão pedido→entrega. Navegador com componentes reais e APIs simuladas, em desktop e 390 px; evidências em `output/entregas-*.png` no workspace da conversa.
