import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const TAG_ILIMITADO = "b11d5d6e-284a-415a-85fe-99f384313140";
const TAG_MIGRADO = "828a8849-3db5-4cca-b586-3a082cb84753";

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin");
  if (!data || data.length === 0) throw new Response("Forbidden: super_admin only", { status: 403 });
}

type StagingRow = {
  email: string;
  full_name: string | null;
  phone: string | null;
  plan_type: string | null;
  tag_label: string | null;
  expires_at: string | null;
};

export const runNutriImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Fetch all staging rows
    const { data: staging, error: stagingErr } = await supabaseAdmin
      .from("import_nutri_staging")
      .select("email, full_name, phone, plan_type, tag_label, expires_at");
    if (stagingErr) throw new Response(stagingErr.message, { status: 500 });
    const rows = (staging ?? []) as StagingRow[];

    const emails = rows.map((r) => r.email.toLowerCase().trim()).filter(Boolean);

    // 2) Find existing profiles by email (case-insensitive) in batches to avoid URL/row limits
    const existingByEmail = new Map<string, string>(); // email -> profile.id
    const chunkSize = 200;
    for (let i = 0; i < emails.length; i += chunkSize) {
      const slice = emails.slice(i, i + chunkSize);
      const { data: profs, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("id, email")
        .in("email", slice);
      if (pErr) throw new Response(pErr.message, { status: 500 });
      for (const p of profs ?? []) {
        if (p.email) existingByEmail.set(String(p.email).toLowerCase().trim(), p.id);
      }
    }

    // 3) Create missing users silently
    const created: string[] = [];
    const createErrors: Array<{ email: string; error: string }> = [];
    for (const row of rows) {
      const email = row.email.toLowerCase().trim();
      if (!email || existingByEmail.has(email)) continue;
      try {
        const randomPassword = crypto.randomUUID() + crypto.randomUUID();
        const { data: createdUser, error: cErr } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: randomPassword,
          email_confirm: true,
          user_metadata: { full_name: row.full_name ?? "" },
        });
        if (cErr || !createdUser?.user) {
          createErrors.push({ email, error: cErr?.message ?? "createUser failed" });
          continue;
        }
        existingByEmail.set(email, createdUser.user.id);
        created.push(email);
      } catch (e) {
        createErrors.push({ email, error: e instanceof Error ? e.message : String(e) });
      }
    }

    // 4) Update profiles + subscriptions + tags for every row
    let profileUpdates = 0;
    let subsUpserts = 0;
    let tagsInserts = 0;
    const updateErrors: Array<{ email: string; error: string }> = [];

    for (const row of rows) {
      const email = row.email.toLowerCase().trim();
      const userId = existingByEmail.get(email);
      if (!userId) continue;

      // profile
      const profilePatch: { full_name?: string; phone?: string } = {};
      if (row.full_name) profilePatch.full_name = row.full_name;
      if (row.phone) profilePatch.phone = row.phone;
      if (Object.keys(profilePatch).length > 0) {
        const { error: upErr } = await supabaseAdmin
          .from("profiles")
          .update(profilePatch)
          .eq("id", userId);
        if (upErr) updateErrors.push({ email, error: `profile: ${upErr.message}` });
        else profileUpdates++;
      }

      // subscription
      const planType = (row.plan_type ?? "starter") as "clinica" | "free" | "pro" | "starter";
      const { error: subErr } = await supabaseAdmin
        .from("subscriptions")
        .upsert(
          {
            user_id: userId,
            status: "active",
            plan_type: planType,
            unlimited_credits: true,
            current_period_end: row.expires_at ?? undefined,
          },
          { onConflict: "user_id" },
        );
      if (subErr) updateErrors.push({ email, error: `subscription: ${subErr.message}` });
      else subsUpserts++;

      // tags (idempotent)
      const { error: tagErr } = await supabaseAdmin
        .from("profile_tags")
        .upsert(
          [
            { profile_id: userId, tag_id: TAG_ILIMITADO },
            { profile_id: userId, tag_id: TAG_MIGRADO },
          ],
          { onConflict: "profile_id,tag_id" },
        );
      if (tagErr) updateErrors.push({ email, error: `tags: ${tagErr.message}` });
      else tagsInserts += 2;
    }

    return {
      total: rows.length,
      createdCount: created.length,
      createErrors,
      profileUpdates,
      subsUpserts,
      tagsInserts,
      updateErrors: updateErrors.slice(0, 50),
      updateErrorsTotal: updateErrors.length,
    };
  });
