import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Retorna todos os agentes Dify (incluindo api_key) para super_admin.
 * O front admin usa esta function; o SELECT direto de api_key foi bloqueado
 * a role authenticated para não expor a chave a nutricionistas.
 */
export const listDifyAgentsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Confirma que o chamador é super_admin sob RLS antes de escalar.
    const { data: isAdmin } = await context.supabase.rpc("has_role" as any, {
      _user_id: context.userId,
      _role: "super_admin",
    });
    if (!isAdmin) throw new Response("Forbidden", { status: 403 });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("dify_agents")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Response(error.message, { status: 500 });
    return data ?? [];
  });
