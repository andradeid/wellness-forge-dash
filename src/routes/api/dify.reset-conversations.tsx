import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { authSuperAdmin } from "@/lib/admin-auth.server";
import { invalidateDifyConfigCache } from "@/lib/dify-config.server";
import { disabledRealtimeOptions } from "@/integrations/supabase/disabled-realtime";

export const Route = createFileRoute("/api/dify/reset-conversations")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const auth = await authSuperAdmin(request);
          if (!auth) return Response.json({ ok: false, error: "Acesso negado." }, { status: 403 });

          const url = process.env.SUPABASE_URL;
          const key = process.env.SUPABASE_PUBLISHABLE_KEY;
          if (!url || !key) {
            return Response.json(
              { ok: false, error: "Configuração do Supabase ausente no servidor." },
              { status: 500 },
            );
          }

          const supabase = createClient(url, key, {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: `Bearer ${auth.token}` } },
            realtime: disabledRealtimeOptions,
          });

          invalidateDifyConfigCache();

          const { data, error } = await supabase
            .from("patient_chats")
            .update({ dify_conversation_id: null, updated_at: new Date().toISOString() })
            .not("dify_conversation_id", "is", null)
            .select("id");

          const resetCount = data?.length ?? 0;

          if (error) {
            await supabase.from("integration_logs").insert({
              source: "dify",
              event: "conversation_reset",
              status: "error",
              message: error.message.slice(0, 240),
            });
            return Response.json({ ok: false, error: error.message }, { status: 500 });
          }

          await supabase.from("integration_logs").insert({
            source: "dify",
            event: "conversation_reset",
            status: "success",
            message: `${resetCount} vínculos Dify zerados localmente no Supabase.`,
            payload: { reset_by: auth.userId, reset_count: resetCount },
          });

          return Response.json({ ok: true, resetCount });
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          console.error("[dify/reset-conversations] handler error:", message);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});