import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireCurationAccess, toolError } from "../auth";

export default defineTool({
  name: "get_conversation",
  title: "Ver a conversa original de um report",
  description:
    "Retorna, somente leitura, a conversa original que gerou um report de curadoria. Recebe APENAS o id do report (curation_request_id) — nunca um chat_id arbitrário. A mensagem reportada vem marcada com is_reported. Contém dados clínicos: cada visualização é registrada em trilha de auditoria. Curadores só acessam a conversa dos próprios reports; super admins acessam todas.",
  inputSchema: {
    curation_request_id: z
      .string()
      .uuid()
      .describe("UUID do report (curation_requests.id) cuja conversa original deve ser lida."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  handler: async ({ curation_request_id }, ctx) => {
    try {
      const caller = await requireCurationAccess(ctx);

      // A RLS decide o que o chamador enxerga: curador vê só os próprios
      // reports, super admin vê todos. Sem linha visível, sem conversa.
      const { data: visible, error } = await caller.supabase
        .from("curation_requests")
        .select("id, chat_id")
        .eq("id", curation_request_id)
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!visible) {
        return {
          content: [{ type: "text", text: "Report não encontrado ou fora do seu escopo de acesso." }],
          isError: true,
        };
      }
      if (!visible.chat_id) {
        return {
          content: [{ type: "text", text: "Este report não tem conversa original associada." }],
          isError: true,
        };
      }

      const { loadCurationConversation } = await import("@/lib/curation-admin.server");
      const conversation = await loadCurationConversation(curation_request_id, caller.userId);

      return {
        content: [{ type: "text", text: JSON.stringify(conversation, null, 2) }],
        structuredContent: { conversation },
      };
    } catch (error) {
      return toolError(error);
    }
  },
});
