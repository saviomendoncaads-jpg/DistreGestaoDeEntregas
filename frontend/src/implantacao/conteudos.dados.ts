// GERADO por scripts/publicar-midia.mjs (projeto de vídeos do Distre) — não edite à mão.
// Aulas, manuais e modelos publicados em frontend/public/treinamentos/.
import type { Aula, Manual, Modelo } from './conteudos';

export const AULAS: Aula[] = [
  {
    "id": "cadastro-produtos",
    "passo": 1,
    "titulo": "Como cadastrar e estruturar produtos",
    "resumo": "Cadastre seu primeiro produto, com nome, EAN, categoria, preço e publicação.",
    "duracao": "1 min 19 s",
    "segundos": 79,
    "tamanhoMb": 8.5
  },
  {
    "id": "importacao-produtos",
    "passo": 2,
    "titulo": "Importação de produtos",
    "resumo": "Traga o catálogo inteiro de uma vez com uma planilha CSV, conferindo a prévia antes de salvar.",
    "duracao": "1 min 40 s",
    "segundos": 100,
    "tamanhoMb": 6.7
  },
  {
    "id": "estoque-inicial",
    "passo": 3,
    "titulo": "Gestão de estoque inicial",
    "resumo": "Entenda como o saldo funciona e registre o primeiro recebimento de um produto.",
    "duracao": "1 min 15 s",
    "segundos": 75,
    "tamanhoMb": 5.1
  },
  {
    "id": "saldo-inicial",
    "passo": 4,
    "titulo": "Importação de estoque",
    "resumo": "Registre o saldo inicial de todos os produtos e deixe o estoque pronto para vender.",
    "duracao": "1 min 07 s",
    "segundos": 67,
    "tamanhoMb": 4.7
  },
  {
    "id": "imagens-produtos",
    "passo": 5,
    "titulo": "Imagens para o e-commerce",
    "resumo": "Envie a foto principal de cada produto para a vitrine da loja online.",
    "duracao": "1 min 08 s",
    "segundos": 68,
    "tamanhoMb": 4.1
  }
];

export const MANUAIS: Manual[] = [
  {
    "id": "cadastro-produtos",
    "passo": 1,
    "titulo": "Como cadastrar e estruturar produtos",
    "paginas": 6,
    "tamanhoKb": 871
  },
  {
    "id": "importacao-produtos",
    "passo": 2,
    "titulo": "Importação de produtos",
    "paginas": 6,
    "tamanhoKb": 977
  },
  {
    "id": "estoque-inicial",
    "passo": 3,
    "titulo": "Gestão de estoque inicial",
    "paginas": 6,
    "tamanhoKb": 950
  },
  {
    "id": "saldo-inicial",
    "passo": 4,
    "titulo": "Importação de estoque",
    "paginas": 6,
    "tamanhoKb": 984
  },
  {
    "id": "imagens-produtos",
    "passo": 5,
    "titulo": "Imagens para o e-commerce",
    "paginas": 6,
    "tamanhoKb": 860
  }
];

export const MODELOS: Modelo[] = [
  {
    "id": "modelo-importacao-produtos",
    "passo": 2,
    "titulo": "Baixar planilha modelo (CSV)",
    "arquivo": "modelo-importacao-produtos.csv",
    "descricao": "É o mesmo modelo do botão \"Baixar modelo\" da janela Importar produtos. Preencha uma linha por produto, salve como CSV UTF-8 e importe em Produtos."
  },
  {
    "id": "planilha-contagem-estoque",
    "passo": 4,
    "titulo": "Baixar planilha de contagem (CSV)",
    "arquivo": "planilha-contagem-estoque.csv",
    "descricao": "Uma planilha para anotar a contagem física de cada produto antes de registrar o saldo no Distre. Ela serve de apoio: o saldo é registrado na tela Estoque, produto a produto."
  }
];
