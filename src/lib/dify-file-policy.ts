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
/**
 * Tarefas cujo nó no Dify é de VISÃO: só aceitam imagem raster.
 * PDF, DOCX e HEIC nunca são decodificados pelo nó — a execução morre antes
 * de começar, sem conversa, sem mensagem e sem registro no Dify.
 */
const IMAGE_ONLY_TASKS = new Set([
  "estimativa_refeicao_foto",
  "composicao_corporal_foto",
]);

/** MIMEs que o nó de visão do Dify decodifica com segurança. */
export const VISION_SAFE_MIME = /^image\/(jpeg|jpg|png|webp)$/i;

export function taskRequiresImage(taskOrAgent: string | null | undefined): boolean {
  if (!taskOrAgent) return false;
  return IMAGE_ONLY_TASKS.has(taskOrAgent.trim());
}

/** true quando o arquivo pode ir para um nó de visão. */
export function isVisionSafeFile(mime: string | null | undefined, name?: string | null): boolean {
  if (VISION_SAFE_MIME.test((mime ?? "").trim())) return true;
  // Alguns navegadores entregam MIME vazio: cai para a extensão.
  return !mime && /\.(jpe?g|png|webp)$/i.test(name ?? "");
}
