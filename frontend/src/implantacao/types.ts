export type StepStatus = 'completed' | 'active' | 'locked';
export type StepType = 'video' | 'upload' | 'action';
export type Step = { id: number; title: string; label: string; description: string; type: StepType };
export const steps: Step[] = [
  { id: 1, title: 'Como Cadastrar e Estruturar Produtos', label: 'Treinamento', description: 'Organize o catálogo que será a base da sua operação.', type: 'video' },
  { id: 2, title: 'Importação de Produtos', label: 'Ação prática', description: 'Prepare sua planilha e traga seus produtos para o ERP.', type: 'upload' },
  { id: 3, title: 'Gestão de Estoque Inicial', label: 'Treinamento', description: 'Entenda como conferir e informar os saldos de abertura.', type: 'video' },
  { id: 4, title: 'Importação de Estoque', label: 'Ação prática', description: 'Informe o saldo inicial dos produtos cadastrados.', type: 'upload' },
  { id: 5, title: 'Imagens para o E-commerce', label: 'Ação prática', description: 'Prepare as fotos que apresentarão seus produtos na loja online.', type: 'upload' },
  { id: 6, title: 'Operação e PDV', label: 'Treinamento final', description: 'Conheça o dia a dia da operação e os próximos passos.', type: 'video' },
  { id: 7, title: 'Go-Live', label: 'Finalização', description: 'Sua jornada de preparação está completa. Vamos começar?', type: 'action' },
];
export const statusAt = (index: number, completed: number): StepStatus => index < completed ? 'completed' : index === completed ? 'active' : 'locked';
