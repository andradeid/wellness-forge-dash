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

export const Route = createFileRoute("/api/dify/upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });
        const { userId, token } = auth;

        const { baseUrl, apiKey } = await getDifyConfig(token);
        if (!apiKey) return new Response("Dify API key não configurada", { status: 500 });

        const inForm = await request.formData();
        const file = inForm.get("file");
        if (!(file instanceof File)) return new Response("file required", { status: 400 });

        const outForm = new FormData();
        outForm.append("file", file, file.name);
        outForm.append("user", userId);

        const upstream = await fetch(`${baseUrl}/files/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: outForm,
        });

        const text = await upstream.text();
        return new Response(text, {
          status: upstream.status,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
