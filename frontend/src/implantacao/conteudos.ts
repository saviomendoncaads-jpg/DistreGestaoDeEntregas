// Aulas em vídeo, manuais em PDF e modelos de cada etapa da implantação.
// Os arquivos ficam em frontend/public/treinamentos/{videos,manuais,modelos}; a lista (títulos, duração, páginas)
// vem de conteudos.dados.ts, gerado junto com os arquivos. Não edite o .dados.ts à mão.
import { AULAS, MANUAIS, MODELOS } from './conteudos.dados';

export type Aula = { id: string; passo: number; titulo: string; resumo: string; duracao: string; segundos: number; tamanhoMb: number };
export type Manual = { id: string; passo: number; titulo: string; paginas: number; tamanhoKb: number; rotulo?: string };
export type Modelo = { id: string; passo: number; titulo: string; arquivo: string; descricao: string };

export const BASE_CONTEUDOS = '/treinamentos';
export const urlAula = (a: Aula) => `${BASE_CONTEUDOS}/videos/${a.id}.mp4`;
export const urlCapa = (a: Aula) => `${BASE_CONTEUDOS}/videos/${a.id}.jpg`;
export const urlManual = (m: Manual) => `${BASE_CONTEUDOS}/manuais/${m.id}.pdf`;
export const urlModelo = (m: Modelo) => `${BASE_CONTEUDOS}/modelos/${m.arquivo}`;

export const aulas: Aula[] = AULAS;
export const manuais: Manual[] = MANUAIS;
export const modelos: Modelo[] = MODELOS;

export const aulasDoPasso = (passo: number) => aulas.filter(a => a.passo === passo);
export const manualDoPasso = (passo: number) => manuais.find(m => m.passo === passo);
export const modeloDoPasso = (passo: number) => modelos.find(m => m.passo === passo);
