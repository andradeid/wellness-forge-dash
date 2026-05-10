import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

interface AuditPayload {
  source?: string;
  event?: string;
  status?: string;
  message?: string;
  data?: unknown;
}

export const Route = createFileRoute("/api/audit/structured")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token) return new Response("Unauthorized", { status: 401 });

        const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
        if (userErr || !userRes.user) return new Response("Unauthorized", { status: 401 });

        let body: AuditPayload;
        try {
          body = await request.json();
        } catch {
          return new Response("Bad Request", { status: 400 });
        }

        const source = String(body.source ?? "unknown").slice(0, 255);
        const event = String(body.event ?? "structured_data").slice(0, 255);
        const status = String(body.status ?? "ok").slice(0, 32);
        const message = body.message ? String(body.message).slice(0, 1000) : null;

        const { error } = await supabaseAdmin.from("integration_logs").insert({
          source,
          event,
          status,
          message,
          payload: { user_id: userRes.user.id, ...(body.data && typeof body.data === "object" ? body.data : { data: body.data }) },
        });

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
