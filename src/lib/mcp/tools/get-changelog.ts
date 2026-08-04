import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireCurationAccess, toolError } from "../auth";

export default defineTool({
  name: "get_changelog",
  title: "Obter detalhe de uma Rodada de Ajustes",
  description:
    "Retorna os detalhes completos de uma rodada específica do changelog pelo seu ID. Inclui todas as notas, itens e reports vinculados.",
  inputSchema: {
    round_id: z.string().uuid().describe("ID da rodada (changelog_rounds.id)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    try {
      const caller = await requireCurationAccess(ctx);
      
      const { data, error } = await caller.supabase
        .from("changelog_rounds")
        .select(`
          id,
          title,
          round_date,
          notas_curador,
          notas_admin,
          created_at,
          items:changelog_items(
            id,
            title,
            description,
            type,
            camada,
            descricao_tecnica,
            reports:changelog_item_reports(
              report:curation_requests(id, numero_sequencial, title, status)
            )
          )
        `)
        .eq("id", input.round_id)
        .single();

      if (error) throw new Error(error.message);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { 
                acesso: caller.isSuperAdmin ? "super_admin" : "curator", 
                rodada: data 
              },
              null,
              2
            ),
          },
        ],
        structuredContent: { rodada: data },
      };
    } catch (error) {
      return toolError(error);
    }
  },
});
