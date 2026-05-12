import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { getDifyConfig, invalidateDifyConfigCache } from "@/lib/dify-config.server";

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

        let { baseUrl, apiKey } = await getDifyConfig(token);
        if (!apiKey) return new Response("Dify API key não configurada", { status: 500 });

        const body = await request.json();
        const { query, conversation_id, inputs, files, meta } = body ?? {};

        // Dify exige que upload_file_id, conversation_id e mensagem usem o mesmo `user`.
        // Por isso usamos sempre o UUID autenticado e enviamos nomes apenas em `inputs`.
        const sanitize = (s: unknown) =>
          String(s ?? "").replace(/[\r\n\t]+/g, " ").trim();
        const nutriName = sanitize(meta?.nutritionist_name);
        const patientName = sanitize(meta?.patient_name);

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

        const sendToDify = () => fetch(`${baseUrl}/chat-messages`, {
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
            user: userId,
            files: files ?? [],
            auto_generate_name: true,
          }),
        });

        let upstream = await sendToDify();

        if (!upstream.ok) {
          const text = await upstream.text().catch(() => "");
          if (upstream.status === 403 && /workspace.*archived|status is archived/i.test(text)) {
            invalidateDifyConfigCache();
            ({ baseUrl, apiKey } = await getDifyConfig(token, true));
            upstream = await sendToDify();
            if (upstream.ok && upstream.body) {
              return new Response(upstream.body, {
                status: 200,
                headers: {
                  "Content-Type": "text/event-stream; charset=utf-8",
                  "Cache-Control": "no-cache, no-transform",
                  Connection: "keep-alive",
                },
              });
            }
            const retryText = await upstream.text().catch(() => "");
            return new Response(
              retryText || "Workspace do Dify arquivado. Atualize a API Key da conta ativa em Integrações & APIs.",
              { status: upstream.status },
            );
          }
          return new Response(text || "Dify error", { status: upstream.status });
        }

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
