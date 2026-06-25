import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { disabledRealtimeOptions } from "@/integrations/supabase/disabled-realtime";

interface AuditPayload {
  source?: string;
  event?: string;
  status?: string;
  message?: string;
  data?: unknown;
}

const MAX_BODY_BYTES = 64 * 1024; // 64 KB

export const Route = createFileRoute("/api/audit/structured")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token) return new Response("Unauthorized", { status: 401 });

        const rawBody = await request.text();
        if (rawBody.length > MAX_BODY_BYTES) {
          return new Response("Payload too large", { status: 413 });
        }

        const url = process.env.SUPABASE_URL;
        const key = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!url || !key) {
          return new Response("Server misconfigured", { status: 500 });
        }

        // Use the caller's token so RLS is enforced (only super_admin may insert).
        const supabase = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
          realtime: disabledRealtimeOptions,
        });

        const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
        if (userErr || !userRes.user) return new Response("Unauthorized", { status: 401 });

        let body: AuditPayload;
        try {
          body = JSON.parse(rawBody) as AuditPayload;
        } catch {
          return new Response("Bad Request", { status: 400 });
        }

        const source = String(body.source ?? "unknown").slice(0, 255);
        const event = String(body.event ?? "structured_data").slice(0, 255);
        const status = String(body.status ?? "ok").slice(0, 32);
        const message = body.message ? String(body.message).slice(0, 1000) : null;
        const dataField =
          body.data && typeof body.data === "object"
            ? (body.data as Record<string, unknown>)
            : { data: body.data };

        const { error } = await supabase.from("integration_logs").insert({
          source,
          event,
          status,
          message,
          payload: { user_id: userRes.user.id, ...dataField },
        });

        if (error) {
          // RLS will reject non-super_admin callers here.
          const code = error.message.toLowerCase().includes("row-level security") ? 403 : 500;
          return new Response(JSON.stringify({ error: error.message }), {
            status: code,
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
