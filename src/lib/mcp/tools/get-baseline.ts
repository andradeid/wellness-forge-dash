import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireCurationAccess, toolError } from "../auth";

export default defineTool({
  name: "get_baseline",
  title: "Baseline do sistema (fonte da verdade)",
  description:
    "Retorna todos os itens da baseline (baseline_items): o retrato congelado do sistema na entrega do contrato. Use o campo 'existia' (sim | nao | parcial) de cada funcionalidade para decidir se um report é suporte (existia e quebrou), melhoria (não existia) ou requer_analise_humana (zona cinza). Campos: area, funcionalidade, existia, camada, comportamento_tecnico, legivel, situacao_legivel.",
  inputSchema: {
    area: z.string().optional().describe("Filtra por área (ex: 'Exame de Sangue')."),
    existia: z
      .enum(["sim", "nao", "parcial"])
      .optional()
      .describe("Filtra pelo estado da funcionalidade na entrega."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    try {
      const caller = await requireCurationAccess(ctx);

      let query = caller.supabase
        .from("baseline_items")
        .select(
          "id, area, funcionalidade, existia, camada, comportamento_tecnico, legivel, situacao_legivel, baseline_version, sort_order",
        )
        .order("sort_order", { ascending: true });

      if (input.area) query = query.eq("area", input.area);
      if (input.existia) query = query.eq("existia", input.existia);

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      const items = data ?? [];
      return {
        content: [
          { type: "text", text: JSON.stringify({ total: items.length, baseline: items }, null, 2) },
        ],
        structuredContent: { baseline: items },
      };
    } catch (error) {
      return toolError(error);
    }
  },
});
