// Edge function: importa lote de nutricionistas (admin only)
// Body: { items: [{email, full_name, phone, plan_type, tag_label}] }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const TAGS: Record<string, string> = {
  "migrado-lumma-1": "828a8849-3db5-4cca-b586-3a082cb84753",
  "ex-black": "88fc91b5-b66c-4c3d-9f54-6fb25062320b",
  "ex-premium": "32afedb7-30f5-4c8e-a8d1-ed9aeb9a3d0f",
  "ex-free": "88c92c31-2635-4952-91ca-65528a9297b2",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const adminToken = req.headers.get("x-admin-token") ?? "";
    if (adminToken !== Deno.env.get("IMPORT_ADMIN_TOKEN")) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 401, headers: corsHeaders });
    }
    const { items } = await req.json();
    if (!Array.isArray(items)) {
      return new Response(JSON.stringify({ error: "items required" }), { status: 400, headers: corsHeaders });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    let created = 0, skipped = 0, errors: Array<{ email: string; reason: string }> = [];

    for (const item of items) {
      const email = String(item.email ?? "").toLowerCase().trim();
      if (!email) continue;
      const fullNameRaw = (item.full_name ?? "").toString().trim();
      const local = email.split("@")[0];
      const fullName = fullNameRaw || local.replace(/[._]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
      const phone = (item.phone ?? "").toString().trim() || null;
      const planType = (item.plan_type ?? "free").toString();
      const tagLabel = (item.tag_label ?? "ex-free").toString();

      // skip if exists
      const { data: existing } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
      // listUsers não filtra por email; usar getUserByEmail via admin? não existe. Usar query direta.
      const { data: profExists } = await supabase
        .from("profiles")
        .select("id")
        .ilike("email", email)
        .maybeSingle();
      if (profExists) { skipped++; continue; }

      const randomPassword = crypto.randomUUID() + crypto.randomUUID();
      const { data: created_, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password: randomPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (createErr || !created_?.user) {
        errors.push({ email, reason: createErr?.message ?? "create failed" });
        continue;
      }
      const userId = created_.user.id;

      // ban login
      await supabase.auth.admin.updateUserById(userId, { ban_duration: "876000h" }); // ~100 anos

      // update profile (trigger handle_new_user já criou)
      await supabase.from("profiles").update({ full_name: fullName, phone }).eq("id", userId);

      // update subscription
      await supabase.from("subscriptions").update({ plan_type: planType, status: "canceled" }).eq("user_id", userId);

      // tags
      const tagInserts = [
        { profile_id: userId, tag_id: TAGS["migrado-lumma-1"] },
      ];
      if (TAGS[tagLabel]) tagInserts.push({ profile_id: userId, tag_id: TAGS[tagLabel] });
      await supabase.from("profile_tags").upsert(tagInserts, { onConflict: "profile_id,tag_id" });

      created++;
    }

    return new Response(JSON.stringify({ created, skipped, errors }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});
