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

        const sanitize = (s: unknown) =>
          String(s ?? "").replace(/[\r\n\t]+/g, " ").trim();
        const nutriName = sanitize(meta?.nutritionist_name);
        const patientName = sanitize(meta?.patient_name);

        // Compõe o identificador exibido em "Usuário Final ou Conta" no Dify.
        // Mantém o UUID anexado no final para garantir unicidade e evitar colisão
        // entre conversas (Dify valida conversation_id ↔ user).
        const buildDisplayUser = () => {
          if (!nutriName && !patientName) return userId;
          const label = [nutriName, patientName].filter(Boolean).join(" · ");
          const shortId = userId.slice(0, 8);
          // Limite prático ~64 chars no Dify
          const composed = `${label} [${shortId}]`;
          return composed.length > 64 ? composed.slice(0, 64) : composed;
        };
        const displayUser = buildDisplayUser();

        const mergedInputs = {
          ...(inputs ?? {}),
          ...(meta
            ? {
                nutritionist_name: nutriName,
                nutritionist_email: sanitize(meta.nutritionist_email),
                patient_name: patientName,
                patient_id: sanitize(meta.patient_id),
                patient_sex: sanitize(meta.patient_sex),
                patient_profile: sanitize(meta.patient_profile),
                gestante_tipo: sanitize(meta.gestante_tipo),
                gestante_periodo: sanitize(meta.gestante_periodo),
                fase_ciclo: sanitize(meta.fase_ciclo),
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
            user: displayUser,
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
