import { createFileRoute } from "@tanstack/react-router";
import { tokenMatches } from "@/lib/webhook-tokens.server";

/**
 * Consulta de conta para o agente de suporte (SIVA). Só leitura — ver src/lib/support-lookup.ts.
 * POST /api/public/support-lookup
 *   cabeçalho x-support-token = SUPPORT_LOOKUP_TOKEN (aceita mais de um, separados por vírgula)
 *   corpo { "email": "...", "whatsapp": "+55...", "conversa": "<id da conversa no SIVA>", "origem": "siva" }
 * Resposta: { encontrada, primeiro_acesso_feito, telefone_confere, [plano, situacao, valida_ate, creditos...], orientacao }
 */
export const Route = createFileRoute("/api/public/support-lookup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["SUPPORT_LOOKUP_TOKEN"];
        if (!expected) return new Response("Consulta não configurada", { status: 503 });
        if (!tokenMatches(request.headers.get("x-support-token"), expected)) {
          return new Response("Unauthorized", { status: 401 });
        }
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
