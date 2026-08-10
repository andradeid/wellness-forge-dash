import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireCurationAccess, toolError } from "../auth";

export default defineTool({
  name: "list_changelog",
  title: "Listar Changelog (Rodadas de Ajustes)",
  description:
    "Lista as rodadas semanais de ajustes (changelog_rounds) e seus itens (changelog_items). Útil para entender o que já foi entregue, corrigido ou melhorado no sistema. Retorna a data da rodada, o título, as notas do curador e do admin, e a lista detalhada de itens com seus respectivos reports vinculados.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).default(10).describe("Máximo de rodadas (1-50)."),
    offset: z.number().int().min(0).default(0).describe("Deslocamento para paginação."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    try {
      const caller = await requireCurationAccess(ctx);
      
      const { data, error } = await caller.supabase
        .from("changelog_rounds")
        .select(`
          id,
          titulo,
          rodada_data,
          rodada_data_fim,
          notas_curador,
          notas_admin,
          created_at,
          items:changelog_items(
            id,
            descricao_legivel,
            descricao_tecnica,
            classificacao,
            camada,
            item_data,
            sort_order,
            reports:changelog_item_reports(
              report:curation_requests(id, numero_sequencial, title)
            )
          )
        `)
        .order("rodada_data", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (error) throw new Error(error.message);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { 
                total_rodadas: data?.length ?? 0, 
                acesso: caller.isSuperAdmin ? "super_admin" : "curator", 
                rodadas: data 
              },
              null,
              2
            ),
          },
        ],
        structuredContent: { rodadas: data },
      };
    } catch (error) {
      return toolError(error);
    }
  },
});
