import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

async function authSuperAdmin(request: Request): Promise<{ userId: string } | null> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: claimsData, error } = await sb.auth.getClaims(token);
  if (error || !claimsData?.claims?.sub) return null;
  const userId = claimsData.claims.sub;
  const { data: roles } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  return roles ? { userId } : null;
}

function getAdminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_URL ausente no servidor");
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const Route = createFileRoute("/api/admin/users")({
  server: {
    handlers: {
      // Criar nutricionista
      POST: async ({ request }) => {
        try {
          const ok = await authSuperAdmin(request);
          if (!ok) return new Response("Forbidden", { status: 403 });

          const body = await request.json();
          const full_name = String(body.full_name ?? "").trim();
          const email = String(body.email ?? "").trim().toLowerCase();
          const password = String(body.password ?? "");
          const professional_id = body.professional_id ? String(body.professional_id).trim() : null;

          if (!full_name || full_name.length > 120) return Response.json({ ok: false, error: "Nome inválido" }, { status: 400 });
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) return Response.json({ ok: false, error: "E-mail inválido" }, { status: 400 });
          if (password.length < 8 || password.length > 72) return Response.json({ ok: false, error: "Senha deve ter entre 8 e 72 caracteres" }, { status: 400 });

          const admin = getAdminClient();
          const { data: created, error: createErr } = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name },
          });
          if (createErr || !created?.user) {
            return Response.json({ ok: false, error: createErr?.message ?? "Falha ao criar usuário" }, { status: 400 });
          }

          // O trigger handle_new_user já cria profile + role nutri + subscription.
          // Atualiza professional_id se informado.
          if (professional_id) {
            await admin.from("profiles").update({ professional_id }).eq("id", created.user.id);
          }

          return Response.json({ ok: true, user_id: created.user.id });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[admin/users POST]", msg);
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },

      // Bloquear / desbloquear (banir login no auth.users)
      PATCH: async ({ request }) => {
        try {
          const ok = await authSuperAdmin(request);
          if (!ok) return new Response("Forbidden", { status: 403 });

          const body = await request.json();
          const userId = String(body.user_id ?? "");
          const blocked = !!body.blocked;
          if (!userId) return Response.json({ ok: false, error: "user_id ausente" }, { status: 400 });

          const admin = getAdminClient();
          // ban_duration: '876000h' (~100 anos) bloqueia, 'none' libera
          const { error: banErr } = await admin.auth.admin.updateUserById(userId, {
            ban_duration: blocked ? "876000h" : "none",
          });
          if (banErr) return Response.json({ ok: false, error: banErr.message }, { status: 400 });

          await admin.from("profiles").update({ is_blocked: blocked }).eq("id", userId);

          return Response.json({ ok: true });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[admin/users PATCH]", msg);
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
    },
  },
});
