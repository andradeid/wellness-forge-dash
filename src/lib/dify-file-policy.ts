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
  "composition",
  "genetics",
]);

export function taskConsumesFiles(selectedTask: string | null | undefined): boolean {
  if (!selectedTask) return true;
  return FILE_CONSUMING_TASKS.has(selectedTask.trim());
}