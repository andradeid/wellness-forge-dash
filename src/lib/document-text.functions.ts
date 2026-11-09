import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Limite do arquivo aceito para extração (bytes). */
const MAX_BYTES = 15 * 1024 * 1024;
/** Texto máximo devolvido (caracteres) — um artigo completo cabe com folga. */
const MAX_CHARS = 80_000;

/**
 * Extrai o texto de um PDF ou DOCX enviado pela nutricionista (curadoria #43/#65).
 * O agente de Pesquisa Científica no Dify não lê o conteúdo de documentos
 * anexados; o texto extraído aqui vai na própria pergunta.
 */
export const extractDocumentText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { base64: string; mimeType: string; name?: string }) => {
    if (typeof data?.base64 !== "string" || typeof data?.mimeType !== "string") {
      throw new Error("arquivo inválido");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const buffer = Buffer.from(data.base64, "base64");
    if (buffer.byteLength > MAX_BYTES) return { text: null as string | null, error: "too_big" };
    const isPdf = data.mimeType === "application/pdf" || /\.pdf$/i.test(data.name ?? "");
    const isDocx =
      data.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      /\.docx$/i.test(data.name ?? "");
    try {
      let text: string | null = null;
      if (isPdf) {
        // @ts-ignore — tipos do pdf-parse variam entre versões
        const pdf = (await import("pdf-parse")).default;
        const result = await pdf(buffer);
        text = result.text ?? null;
      } else if (isDocx) {
        const mammoth = await import("mammoth");
        const result = await mammoth.extractRawText({ buffer });
        text = result.value ?? null;
      }
      if (!text) return { text: null, error: "empty" };
      const clean = text.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
      return { text: clean.slice(0, MAX_CHARS), error: clean.length > MAX_CHARS ? "truncated" : null };
    } catch (err) {
      console.error("[document-text] falha na extração:", err);
      return { text: null, error: "failed" };
    }
  });
