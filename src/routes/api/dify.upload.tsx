import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import {
  getDifyAgentConfig,
  invalidateDifyConfigCache,
} from "@/lib/dify-config.server";

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

export const Route = createFileRoute("/api/dify/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });
        const { userId, token } = auth;

        const inForm = await request.formData();
        const file = inForm.get("file");
        if (!(file instanceof File)) return new Response("file required", { status: 400 });

        const agentTypeRaw = inForm.get("agent_type");
        const agentType =
          typeof agentTypeRaw === "string" && agentTypeRaw.trim()
            ? agentTypeRaw.trim()
            : "exam";

        let baseUrl: string;
        let apiKey: string;
        try {
          ({ baseUrl, apiKey } = await getDifyAgentConfig(agentType, token));
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          return new Response(message, { status: 500 });
        }

        const sanitize = (s: unknown) =>
          String(s ?? "").replace(/[\r\n\t]+/g, " ").trim();
        const nutriName = sanitize(inForm.get("nutritionist_name"));
        const patientName = sanitize(inForm.get("patient_name"));
        const buildDisplayUser = () => {
          if (!nutriName && !patientName) return userId;
          const label = [nutriName, patientName].filter(Boolean).join(" · ");
          const composed = `${label} [${userId.slice(0, 8)}]`;
          return composed.length > 64 ? composed.slice(0, 64) : composed;
        };
        const displayUser = buildDisplayUser();

        const outForm = new FormData();
        outForm.append("file", file, file.name);
        outForm.append("user", displayUser);

        const uploadToDify = () =>
          fetch(`${baseUrl}/files/upload`, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body: outForm,
          });

        let upstream = await uploadToDify();

        const text = await upstream.text();
        const isArchived =
          upstream.status === 403 && /workspace.*archived|status is archived/i.test(text);
        const isInvalid = upstream.status === 401 && /invalid|unauthorized/i.test(text);

        if (isArchived || isInvalid) {
          invalidateDifyConfigCache();
          try {
            ({ baseUrl, apiKey } = await getDifyAgentConfig(agentType, token, true));
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            return new Response(message, { status: 500 });
          }
          const retryForm = new FormData();
          retryForm.append("file", file, file.name);
          retryForm.append("user", displayUser);
          upstream = await fetch(`${baseUrl}/files/upload`, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body: retryForm,
          });
          const retryText = await upstream.text();
          return new Response(retryText, {
            status: upstream.status,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(text, {
          status: upstream.status,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
