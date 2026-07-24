// Edge function: gestão administrativa de nutricionistas
// POST   -> cria usuário (auth + perfil)
// PATCH  -> bloqueia / desbloqueia (ban_duration no auth.users + is_blocked no profile)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, PATCH, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  // 1) Identificar caller via JWT
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "Não autenticado" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) return json({ ok: false, error: "Sessão inválida" }, 401);

  const callerId = userData.user.id;

  // 2) Validar super_admin
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: roleRows } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId)
    .in("role", ["super_admin", "support"]);
  const callerRoles = (roleRows ?? []).map((r: any) => r.role as string);
  if (callerRoles.length === 0) return json({ ok: false, error: "Acesso restrito" }, 403);
  const isSuperAdmin = callerRoles.includes("super_admin");

  // Suporte (CS) só pode criar nutricionista — não pode bloquear/desbloquear
  if (req.method === "PATCH" && !isSuperAdmin) {
    return json({ ok: false, error: "Ação restrita ao super admin" }, 403);
  }

  try {
    if (req.method === "POST") {
      const body = await req.json();
      const full_name = String(body.full_name ?? "").trim();
      const email = String(body.email ?? "").trim().toLowerCase();
      const professional_id = body.professional_id ? String(body.professional_id).trim() : null;
      const phone = body.phone ? String(body.phone).trim() : null;
      const plan_slug = body.plan_slug ? String(body.plan_slug).trim().toLowerCase() : null;
      const cycle = body.cycle ? String(body.cycle).trim().toLowerCase() : null;
      const payment_method = body.payment_method ? String(body.payment_method).trim() : null;
      const payment_note = body.payment_note ? String(body.payment_note).trim() : null;

      if (!full_name || full_name.length > 120) return json({ ok: false, error: "Nome inválido" }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255)
        return json({ ok: false, error: "E-mail inválido" }, 400);
      if (plan_slug && !["starter", "pro"].includes(plan_slug))
        return json({ ok: false, error: "Plano inválido" }, 400);
      if (cycle && !["monthly", "yearly"].includes(cycle))
        return json({ ok: false, error: "Ciclo inválido" }, 400);
      if (plan_slug && !cycle)
        return json({ ok: false, error: "Informe o ciclo (mensal/anual) do plano" }, 400);

      // Mesmo fluxo do webhook Stripe: convite via email → user define a própria senha
      const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
        email,
        {
          redirectTo: "https://lumma.ia.br/reset-password",
          data: { full_name, name: full_name },
        },
      );
      if (inviteErr || !invited?.user) {
        return json({ ok: false, error: inviteErr?.message ?? "Falha ao convidar usuário" }, 400);
      }

      const newUserId = invited.user.id;

      const profilePatch: Record<string, unknown> = {};
      if (professional_id) profilePatch.professional_id = professional_id;
      if (phone) profilePatch.phone = phone;
      if (Object.keys(profilePatch).length > 0) {
        await admin.from("profiles").update(profilePatch).eq("id", newUserId);
      }

      if (plan_slug && cycle) {
        const { data: plan } = await admin
          .from("subscription_plans")
          .select("price_monthly_cents, price_yearly_cents")
          .eq("slug", plan_slug)
          .eq("is_active", true)
          .maybeSingle();

        const now = new Date();
        const periodEnd = new Date(now);
        if (cycle === "monthly") periodEnd.setMonth(periodEnd.getMonth() + 1);
        else periodEnd.setFullYear(periodEnd.getFullYear() + 1);

        await admin.from("subscriptions").upsert(
          {
            user_id: newUserId,
            status: "active",
            plan_type: plan_slug,
            current_period_end: periodEnd.toISOString(),
          },
          { onConflict: "user_id" },
        );

        const amountCents =
          cycle === "monthly"
            ? (plan?.price_monthly_cents ?? 0)
            : (plan?.price_yearly_cents ?? 0);

        await admin.from("payment_history").insert({
          user_id: newUserId,
          kind: "subscription",
          description: `Assinatura ${plan_slug} (${cycle === "monthly" ? "mensal" : "anual"}) — pagamento externo${payment_method ? ` via ${payment_method}` : ""}`,
          amount_cents: amountCents,
          currency: "brl",
          status: "succeeded",
          metadata: {
            manual_creation: true,
            created_by: callerId,
            plan_slug,
            cycle,
            payment_method,
            payment_note,
          },
        });
      }

      return json({ ok: true, user_id: newUserId });
    }

    if (req.method === "PATCH") {
      const body = await req.json();
      const userId = String(body.user_id ?? "");
      const blocked = !!body.blocked;
      if (!userId) return json({ ok: false, error: "user_id ausente" }, 400);

      const { error: banErr } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: blocked ? "876000h" : "none",
      });
      if (banErr) return json({ ok: false, error: banErr.message }, 400);

      await admin.from("profiles").update({ is_blocked: blocked }).eq("id", userId);
      return json({ ok: true });
    }

    return json({ ok: false, error: "Método não suportado" }, 405);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[admin-users]", msg);
    return json({ ok: false, error: msg }, 500);
  }
});
