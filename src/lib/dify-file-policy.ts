/** Tarefas do Dify que realmente materializam e consomem anexos. */
const FILE_CONSUMING_TASKS = new Set([
  "exam_masc",
  "exam_fem",
  "exam_gest_mono",
  "exam_gest_gem",
  "bioimpedancia",
  "calorimetria",
  "genetica",
  "microbioma",
  "estimativa_refeicao_foto",
  "composicao_corporal_foto",
  // Identificadores legados ainda presentes em conversas antigas.
  "exam",
  "exam_masculino",
  "exam_feminino",
  "exam_adulto",
  "exam_gestante",
  "exam_gestante_mono",
  "exam_gestante_gem",
  "composition",
  "metabolism",
  "genetics",
]);

export function taskConsumesFiles(taskOrAgent: string | null | undefined): boolean {
  if (!taskOrAgent) return false;
  return FILE_CONSUMING_TASKS.has(taskOrAgent.trim());
}