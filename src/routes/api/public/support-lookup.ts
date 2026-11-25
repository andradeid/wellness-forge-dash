import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "node:crypto";
import { tokenMatches } from "@/lib/webhook-tokens.server";

/**
 * Consulta de conta para o agente de suporte (SIVA). Só leitura — ver src/lib/support-lookup.ts.
 * POST /api/public/support-lookup
 *   cabeçalho x-support-token = uma senha aceita:
 *     - cadastrada no banco (tabela support_lookup_keys, guardada só como SHA-256; vale no beta e na produção), ou
 *     - SUPPORT_LOOKUP_TOKEN do .env (opcional; aceita mais de uma, separadas por vírgula).
 *   corpo { "email": "...", "whatsapp": "+55...", "conversa": "<id da conversa no SIVA>", "origem": "siva" }
 * Resposta: { encontrada, primeiro_acesso_feito, telefone_confere, [plano, situacao, valida_ate, creditos...], orientacao }
 */
async function authorized(token: string | null): Promise<"ok" | "denied" | "off"> {
  const envTokens = process.env["SUPPORT_LOOKUP_TOKEN"];
  if (token && envTokens && tokenMatches(token, envTokens)) return "ok";
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("support_lookup_keys" as any).select("sha256").is("revoked_at", null);
  if (error) throw error;
  const hashes = ((data as any[]) ?? []).map((r) => String(r.sha256));
  if (!hashes.length && !envTokens) return "off";
  if (!token) return "denied";
  const h = createHash("sha256").update(token).digest("hex");
  return hashes.includes(h) ? "ok" : "denied";
}

export const Route = createFileRoute("/api/public/support-lookup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let auth: "ok" | "denied" | "off";
        try {
          auth = await authorized(request.headers.get("x-support-token"));
        } catch (err: any) {
          console.error("[support-lookup] erro ao conferir a senha:", err?.message ?? err);
          return Response.json({ error: "Falha na consulta" }, { status: 500 });
        }
        if (auth === "off") return new Response("Consulta não configurada", { status: 503 });
        if (auth === "denied") return new Response("Unauthorized", { status: 401 });

        let body: any;
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "JSON inválido" }, { status: 400 });
        }
        const { EMAIL_RX, lookupAccount } = await import("@/lib/support-lookup.server");
        const email = String(body?.email ?? "").trim();
        if (!EMAIL_RX.test(email) || email.length > 200) {
          return Response.json({ error: "Informe um e-mail válido" }, { status: 400 });
        }
        try {
          const res = await lookupAccount({ email, whatsapp: body?.whatsapp ?? null, conversa: body?.conversa ?? null, origem: body?.origem ?? null });
          return Response.json(res, { headers: { "cache-control": "no-store" } });
        } catch (err: any) {
          console.error("[support-lookup] erro:", err?.message ?? err);
          return Response.json({ error: "Falha na consulta" }, { status: 500 });
        }
      },
    },
  },
});
