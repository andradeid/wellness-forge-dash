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
        const userId = await authUserId(request);
        if (!userId) return new Response("Unauthorized", { status: 401 });

        const { baseUrl, apiKey } = await getDifyConfig();
        if (!apiKey) return new Response("Dify API key não configurada", { status: 500 });

        const body = await request.json();
        const { query, conversation_id, inputs, files } = body ?? {};

        const upstream = await fetch(`${baseUrl}/chat-messages`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: query ?? "",
            inputs: inputs ?? {},
            response_mode: "streaming",
            conversation_id: conversation_id ?? "",
            user: userId,
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
