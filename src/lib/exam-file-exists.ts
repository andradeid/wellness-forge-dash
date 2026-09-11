/**
 * Verificação de existência de objeto no bucket `exams`.
 *
 * Motivo: o app reaproveita arquivos de interações anteriores gerando uma
 * signed URL nova. Se o objeto não existe mais (exame ou paciente apagado pela
 * nutricionista, upload interrompido), a URL é criptograficamente válida mas
 * devolve HTTP 400 na hora do download — e a execução do Dify morre em menos
 * de 1 segundo, sem mensagem útil.
 *
 * Conferimos ANTES de assinar. `list` com `search` é suficiente e respeita RLS.
 */

import { supabase } from "@/integrations/supabase/client";

export async function examFileExists(filePath: string): Promise<boolean> {
  if (!filePath) return false;
  const idx = filePath.lastIndexOf("/");
  const dir = idx >= 0 ? filePath.slice(0, idx) : "";
  const name = idx >= 0 ? filePath.slice(idx + 1) : filePath;
  try {
    const { data, error } = await supabase.storage
      .from("exams")
      .list(dir, { limit: 100, search: name });
    if (error) {
      // Falha de rede/permissão não deve bloquear o envio: assumimos que existe.
      console.warn("[exams.exists] list falhou, seguindo:", error.message);
      return true;
    }
    return Array.isArray(data) && data.some((o) => o.name === name);
  } catch (e) {
    console.warn("[exams.exists] threw, seguindo:", e);
    return true;
  }
}
