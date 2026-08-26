import { createFileRoute } from "@tanstack/react-router";

/**
 * Disparo dos e-mails de assinatura vencida.
 * Chamado pelo pg_cron logo após o job diário de expiração.
 * Autenticação: header `apikey` com a chave anon/publishable do projeto.
 */
export const Route = createFileRoute("/api/public/subscription-expiry-emails")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("apikey") ?? "";
        const expected =
          process.env["SUPABASE_ANON_KEY"] ?? process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "";
        if (!expected || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { sendSubscriptionExpiredEmail } = await import("@/lib/emails.server");

          // Assinaturas vencidas que ainda não receberam o aviso deste ciclo.
          const { data, error } = await supabaseAdmin
            .from("subscriptions" as any)
            .select("user_id, plan_type, current_period_end, expiry_email_sent_at, status")
            .in("status", ["active", "trial"])
            .lt("current_period_end", new Date().toISOString())
            .limit(200);

          if (error) {
            console.error("[expiry-emails] falha ao listar assinaturas", error.message);
            return Response.json({ ok: false, error: error.message }, { status: 500 });
          }

          const pending = ((data as any[]) ?? []).filter((s) => {
            if (!s.expiry_email_sent_at) return true;
            // Reenvia apenas se o aviso for anterior ao vencimento atual (novo ciclo).
            return new Date(s.expiry_email_sent_at) < new Date(s.current_period_end);
          });

          let sent = 0;
          let failed = 0;

          for (const sub of pending) {
            const { data: profile } = await supabaseAdmin
              .from("profiles" as any)
              .select("email, full_name")
              .eq("id", sub.user_id)
              .maybeSingle();

            const result = await sendSubscriptionExpiredEmail({
              userId: sub.user_id,
              email: (profile as any)?.email ?? null,
              fullName: (profile as any)?.full_name ?? null,
              planName: String(sub.plan_type ?? "Lumma"),
              expiredAtIso: sub.current_period_end ?? null,
            });

            if (result.ok) {
              sent += 1;
              await supabaseAdmin
                .from("subscriptions" as any)
                .update({ expiry_email_sent_at: new Date().toISOString() })
                .eq("user_id", sub.user_id);
            } else {
              failed += 1;
              console.warn("[expiry-emails] falha para", sub.user_id, result.error);
            }
          }

          await supabaseAdmin.from("integration_logs" as any).insert({
            source: "cron",
            event: "subscription_expiry_emails",
            status: failed > 0 ? "warning" : "success",
            message: `Avisos de vencimento: ${sent} enviados, ${failed} falharam`,
            payload: { candidatos: pending.length, sent, failed },
          });

          return Response.json({ ok: true, candidatos: pending.length, sent, failed });
        } catch (err: any) {
          console.error("[expiry-emails] erro inesperado", err?.message);
          return Response.json({ ok: false, error: err?.message }, { status: 500 });
        }
      },
    },
  },
});
