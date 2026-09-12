/**
 * Verificação de existência de objeto no bucket `exams`.
 *
 * Motivo: o app reaproveita arquivos de interações anteriores gerando uma
 * signed URL nova. Se o objeto não existe mais (exame ou paciente apagado pela
 * nutricionista, upload interrompido), a URL é criptograficamente válida mas
 * devolve HTTP 400 na hora do download — e a execução do Dify morre em menos
 * de 1 segundo, sem mensagem útil.
 *
 * Conferimos ANTES de assinar pela API de metadados do próprio objeto. Falhas
 * de rede/permissão são tratadas como indisponibilidade: é mais seguro pedir
 * um novo envio do que entregar ao Dify uma referência que pode abortar tudo.
 */

import { supabase } from "@/integrations/supabase/client";

export async function examFileExists(filePath: string): Promise<boolean> {
  if (!filePath) return false;
  try {
    const { data, error } = await supabase.storage.from("exams").info(filePath);
    if (error) {
      console.warn("[exams.exists] info falhou; anexo bloqueado:", error.message);
      return false;
    }
    return Boolean(data);
  } catch (e) {
    console.warn("[exams.exists] info lançou erro; anexo bloqueado:", e);
    return false;
  }
}

/** Confirma que a URL assinada responde antes de entregá-la ao Dify. */
export async function signedExamUrlResponds(signedUrl: string): Promise<boolean> {
  if (!signedUrl) return false;
  try {
    const response = await fetch(signedUrl, {
      method: "HEAD",
      cache: "no-store",
    });
    return response.ok;
  } catch (error) {
    console.warn("[exams.exists] HEAD da URL assinada falhou; anexo bloqueado:", error);
    return false;
  }
}
