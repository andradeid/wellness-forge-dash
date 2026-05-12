import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { authSuperAdmin } from "@/lib/admin-auth.server";
import { invalidateDifyConfigCache } from "@/lib/dify-config.server";

export const Route = createFileRoute("/api/dify/reset-conversations")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authSuperAdmin(request);
        if (!auth) return new Response("Forbidden", { status: 403 });

        invalidateDifyConfigCache();

        const { count, error } = await supabaseAdmin
          .from("patient_chats")
          .update({ dify_conversation_id: null })
          .not("dify_conversation_id", "is", null)
          .select("id", { count: "exact", head: true });

        if (error) {
          await supabaseAdmin.from("integration_logs").insert({
            source: "dify",
            event: "conversation_reset",
            status: "error",
            message: error.message.slice(0, 240),
          });
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        await supabaseAdmin.from("integration_logs").insert({
          source: "dify",
          event: "conversation_reset",
          status: "success",
          message: `${count ?? 0} conversas Dify resetadas por troca de workspace.`,
          payload: { reset_by: auth.userId, reset_count: count ?? 0 },
        });

        return Response.json({ ok: true, resetCount: count ?? 0 });
      },
    },
  },
});