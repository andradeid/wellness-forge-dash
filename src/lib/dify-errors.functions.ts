import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Registro de falhas detectadas no cliente (erro dentro da resposta do
 * agente, resposta vazia, fallback de roteamento). Os erros de HTTP e de
 * conexão são gravados direto pela rota `/api/dify/chat`.
 */

const schema = z.object({
  chatId: z.string().max(80).optional().nullable(),
  conversationId: z.string().max(120).optional().nullable(),
  patientId: z.string().max(80).optional().nullable(),
  patientProfile: z.string().max(60).optional().nullable(),
  selectedTask: z.string().max(60).optional().nullable(),
  agentType: z.string().max(60).optional().nullable(),
  errorKind: z
    .enum([
      "timeout",
      "connection",
      "upstream_error",
      "rate_limit",
      "high_demand",
      "file_read",
      "task_routing",
      "content_error",
      "empty_answer",
      "suspicious_fast",
      "no_execution",
      "missing_markers",
      "unknown",
    ])
    .optional()
    .default("unknown"),

  messageId: z.string().max(120).optional().nullable(),
  httpStatus: z.number().int().optional().nullable(),
  rawError: z.string().max(40_000).optional().nullable(),
  durationMs: z.number().optional().nullable(),
  attachmentCount: z.number().int().min(0).optional().default(0),
  attachmentName: z.string().max(300).optional().nullable(),
  attachmentMime: z.string().max(120).optional().nullable(),
  wasRetry: z.boolean().optional().default(false),
  billed: z.boolean().optional().default(false),
});

export const logDifyFailure = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => schema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { recordDifyErrorLog } = await import("@/lib/dify-error-log.server");
    await recordDifyErrorLog({
      ...data,
      userId: context.userId,
      source: "client",
    });
    return { ok: true };
  });
