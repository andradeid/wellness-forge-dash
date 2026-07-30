import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Retorna a conversa original que gerou um report de curadoria.
 *
 * Segurança:
 * - Entrada é APENAS o id do report — nunca um chat_id arbitrário.
 * - Confere `super_admin` sob RLS antes de escalar para o service_role.
 * - Somente leitura + auditoria em `integration_logs`.
 */
export const getCurationConversation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { requestId: string }) => {
    const id = typeof data?.requestId === "string" ? data.requestId.trim() : "";
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) throw new Response("Identificador inválido.", { status: 400 });
    return { requestId: id };
  })
  .handler(async ({ context, data }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role" as never, {
      _user_id: context.userId,
      _role: "super_admin",
    } as never);
    if (!isAdmin) throw new Response("Forbidden", { status: 403 });

    const { loadCurationConversation } = await import("./curation-admin.server");
    return loadCurationConversation(data.requestId, context.userId);
  });
