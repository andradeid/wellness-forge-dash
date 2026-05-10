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
  const { data: roleRow } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", callerId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (!roleRow) return json({ ok: false, error: "Acesso restrito" }, 403);

  try {
    if (req.method === "POST") {
      const body = await req.json();
      const full_name = String(body.full_name ?? "").trim();
      const email = String(body.email ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      const professional_id = body.professional_id ? String(body.professional_id).trim() : null;

      if (!full_name || full_name.length > 120) return json({ ok: false, error: "Nome inválido" }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255)
        return json({ ok: false, error: "E-mail inválido" }, 400);
      if (password.length < 8 || password.length > 72)
        return json({ ok: false, error: "Senha deve ter entre 8 e 72 caracteres" }, 400);

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name },
      });
      if (createErr || !created?.user) {
        return json({ ok: false, error: createErr?.message ?? "Falha ao criar usuário" }, 400);
      }

      if (professional_id) {
        await admin.from("profiles").update({ professional_id }).eq("id", created.user.id);
      }

      return json({ ok: true, user_id: created.user.id });
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
