import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { requireCurationAccess, toolError } from "../auth";

const STATUS = [
  "registrado",
  "em_analise",
  "aprovado_ajuste",
  "classificado_melhoria",
  "em_desenvolvimento",
  "concluido",
  "duplicada",
] as const;

const BASE_FIELDS =
  "id, title, description, curator_classification, curator_dimension, ai_classification, ai_confidence, ai_confidence_label, ai_justification, ai_status, ai_functionality, ai_baseline_item, status, curator_agreement, duplicate_of, agent_key, chat_id, message_id, patient_id, image_url, created_at, updated_at";

export default defineTool({
  name: "list_reports",
  title: "Listar solicitações de curadoria",
  description:
    "Lista os reports (curation_requests) da curadoria, do mais recente para o mais antigo. Filtros opcionais por status, classificação do curador, status da análise de IA e intervalo de datas de criação. Retorna o relato, as classificações do curador e da IA, o status, a concordância, duplicidade e o contexto de origem (agente, chat, mensagem, paciente). O campo ai_technical_direction só é incluído para super admins. has_image indica se existe print anexado — use get_report para vê-lo.",
  inputSchema: {
    status: z.enum(STATUS).optional().describe("Filtra por status do report."),
    curator_classification: z
      .enum(["suporte", "melhoria"])
      .optional()
      .describe("Filtra pela classificação feita pelo curador."),
    ai_status: z
      .enum(["pending", "success", "failed", "skipped"])
      .optional()
      .describe("Filtra pelo status da classificação automática por IA."),
    created_from: z.string().optional().describe("Data/hora inicial ISO 8601 (inclusive)."),
    created_to: z.string().optional().describe("Data/hora final ISO 8601 (inclusive)."),
    limit: z.number().int().min(1).max(200).default(50).describe("Máximo de reports (1-200)."),
    offset: z.number().int().min(0).default(0).describe("Deslocamento para paginação."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    try {
      const caller = await requireCurationAccess(ctx);
      const fields = caller.isSuperAdmin ? `${BASE_FIELDS}, ai_technical_direction` : BASE_FIELDS;

      let query = caller.supabase
        .from("curation_requests")
        .select(fields)
        .order("created_at", { ascending: false })
        .range(input.offset, input.offset + input.limit - 1);

      if (input.status) query = query.eq("status", input.status);
      if (input.curator_classification)
        query = query.eq("curator_classification", input.curator_classification);
      if (input.ai_status) query = query.eq("ai_status", input.ai_status);
      if (input.created_from) query = query.gte("created_at", input.created_from);
      if (input.created_to) query = query.lte("created_at", input.created_to);

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      const reports = ((data ?? []) as unknown[]).map((row) => {
        const { image_url, ...rest } = row as Record<string, unknown>;
        return { ...rest, has_image: !!image_url };
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { total_retornado: reports.length, acesso: caller.isSuperAdmin ? "super_admin" : "curator", reports },
              null,
              2,
            ),
          },
        ],
        structuredContent: { reports },
      };
    } catch (error) {
      return toolError(error);
    }
  },
});
