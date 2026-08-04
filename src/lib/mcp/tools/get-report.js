import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireCurationAccess, toolError } from "../auth";
const UUID = z.string().uuid("Informe o UUID do report.");
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const BASE_FIELDS = "id, numero_sequencial, title, description, curator_classification, curator_dimension, ai_classification, ai_confidence, ai_confidence_label, ai_justification, ai_status, ai_functionality, ai_baseline_item, ai_analyzed_at, ai_error, status, admin_notes, admin_final_classification, curator_agreement, duplicate_of, agent_key, chat_id, message_id, patient_id, image_url, created_at, updated_at";
function mimeFromPath(path) {
    const ext = path.split(".").pop()?.toLowerCase();
    if (ext === "png")
        return "image/png";
    if (ext === "webp")
        return "image/webp";
    if (ext === "gif")
        return "image/gif";
    return "image/jpeg";
}
export default defineTool({
    name: "get_report",
    title: "Detalhar uma solicitação de curadoria",
    description: "Retorna um report completo de curadoria a partir do seu id (UUID), incluindo a imagem anexada embutida em base64 (nunca como link), lida do bucket privado curation-attachments no servidor. O campo ai_technical_direction só é incluído para super admins.",
    inputSchema: {
        id: UUID.describe("UUID do report (curation_requests.id), obtido em list_reports."),
    },
    annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
    handler: async ({ id }, ctx) => {
        try {
            const caller = await requireCurationAccess(ctx);
            const fields = caller.isSuperAdmin ? `${BASE_FIELDS}, ai_technical_direction` : BASE_FIELDS;
            const { data, error } = await caller.supabase
                .from("curation_requests")
                .select(fields)
                .eq("id", id)
                .maybeSingle();
            if (error)
                throw new Error(error.message);
            if (!data) {
                return {
                    content: [{ type: "text", text: "Report não encontrado ou fora do seu escopo de acesso." }],
                    isError: true,
                };
            }
            const { image_url, ...report } = data;
            const imagePath = typeof image_url === "string" && image_url ? image_url : null;
            const content = [
                {
                    type: "text",
                    text: JSON.stringify({ ...report, has_image: !!imagePath }, null, 2),
                },
            ];
            if (imagePath) {
                try {
                    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
                    const { data: file, error: fileError } = await supabaseAdmin.storage
                        .from("curation-attachments")
                        .download(imagePath);
                    if (fileError || !file)
                        throw new Error(fileError?.message ?? "arquivo indisponível");
                    const bytes = new Uint8Array(await file.arrayBuffer());
                    if (bytes.byteLength > MAX_IMAGE_BYTES) {
                        content.push({
                            type: "text",
                            text: `Imagem anexada tem ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB e excede o limite de 5 MB para embutir em base64.`,
                        });
                    }
                    else {
                        content.push({
                            type: "image",
                            data: Buffer.from(bytes).toString("base64"),
                            mimeType: mimeFromPath(imagePath),
                        });
                    }
                }
                catch (imageError) {
                    content.push({
                        type: "text",
                        text: `Não foi possível carregar a imagem anexada: ${imageError instanceof Error ? imageError.message : "erro desconhecido"}`,
                    });
                }
            }
            return { content, structuredContent: { report: { ...report, has_image: !!imagePath } } };
        }
        catch (error) {
            return toolError(error);
        }
    },
});
