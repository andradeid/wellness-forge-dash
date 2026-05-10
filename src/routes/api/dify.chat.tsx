import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { getDifyConfig } from "@/lib/dify-config.server";

async function authUser(request: Request): Promise<{ userId: string; token: string } | null> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await supabase.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  return { userId: data.claims.sub, token };
}

export const Route = createFileRoute("/api/dify/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });
        const { userId, token } = auth;

        const { baseUrl, apiKey } = await getDifyConfig(token);
        if (!apiKey) return new Response("Dify API key não configurada", { status: 500 });

        const body = await request.json();
        const { query, conversation_id, inputs, files, meta } = body ?? {};

        // Compose a friendly "user" identifier for Dify logs.
        // IMPORTANT: Dify validates that conversation_id belongs to the same `user`.
        // For existing conversations we keep the original UUID to avoid breaking them.
        // Only NEW conversations adopt the friendly label.
        const sanitize = (s: unknown) =>
          String(s ?? "").replace(/[\r\n\t]+/g, " ").trim();
        const nutriName = sanitize(meta?.nutritionist_name);
        const patientName = sanitize(meta?.patient_name);
        let displayUser = userId;
        if (!conversation_id && (nutriName || patientName)) {
          const label = [nutriName, patientName].filter(Boolean).join(" · ");
          displayUser = label.length > 64 ? label.slice(0, 63) + "…" : label;
        }

        const mergedInputs = {
          ...(inputs ?? {}),
          ...(meta
            ? {
                nutritionist_name: nutriName,
                nutritionist_email: sanitize(meta.nutritionist_email),
                patient_name: patientName,
                patient_id: sanitize(meta.patient_id),
              }
            : {}),
        };

        const upstream = await fetch(`${baseUrl}/chat-messages`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: query ?? "",
            inputs: mergedInputs,
            response_mode: "streaming",
            conversation_id: conversation_id ?? "",
            user: displayUser,
            files: files ?? [],
            auto_generate_name: true,
          }),
        });

        if (!upstream.ok || !upstream.body) {
          const text = await upstream.text().catch(() => "");
          return new Response(text || "Dify error", { status: upstream.status });
        }

        return new Response(upstream.body, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
