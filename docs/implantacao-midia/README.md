# Aulas e manuais da implantação

Textos (roteiro da narração e manual em PDF) de cada aula. Os vídeos e PDFs publicados ficam em `frontend/public/treinamentos/`.

| Etapa | Pasta | Situação |
|---|---|---|
| 1 · Cadastro de produtos | `cadastro-produtos` | vídeo + manual |
| 2 · Importação de produtos | `importacao-produtos` | vídeo + manual + modelo |
| 3 · Gestão de estoque inicial | `estoque-inicial` | vídeo + manual |
| 4 · Importação de estoque | `saldo-inicial` | vídeo + manual + planilha de contagem |
| 5 · Imagens | `imagens-produtos` | vídeo + manual |
| 6 · Operação e PDV | `operacao-pdv` | vídeo + manual (guia do dia a dia) |
| 7 · Go-Live | `go-live` | vídeo + manual |

## Publicação

No ar desde 13/10/2026, release `C:/Projetos/Distre-releases/7d55264abd57` (commit `7d55264`: ponta da consolidacao `baa447e` + esta branch). Sem alteração de banco: só arquivos estáticos em `/treinamentos` e a flag `conteudosDisponiveis`. Para voltar, repontar o `pm2 distre` à release anterior `baa447edf2bb` (instruções em `C:/Projetos/Distre-backups/release-1791907940070`). Para as próximas releases não perderem os vídeos, esta branch precisa ser mesclada na branch de trabalho do ERP.

## Como foram feitos

Remotion + voz neural pt-BR + capturas reais do Distre de demonstração, em projeto à parte (fora deste repositório).
