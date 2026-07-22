import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DASHBOARD_URL = "https://lumma.ia.br/app";
const RESET_REDIRECT = "https://lumma.ia.br/reset-password";
const BATCH_SIZE = 40;
const THROTTLE_MS = 130; // ~7/s — folga no Pro (10/s)

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin");
  if (!data || data.length === 0) {
    throw new Response("Forbidden: super_admin only", { status: 403 });
  }
}

const SegmentSchema = z.union([
  z.object({ type: z.literal("all_active") }),
  z.object({ type: z.literal("unlimited") }),
  z.object({ type: z.literal("tags"), tag_ids: z.array(z.string().uuid()).min(1) }),
  z.object({ type: z.literal("emails"), emails: z.array(z.string().email()).min(1).max(5000) }),
]);
type Segment = z.infer<typeof SegmentSchema>;

function renderTemplate(source: string, vars: Record<string, string>) {
  let out = source;
  for (const [k, v] of Object.entries(vars)) {
    const re = new RegExp(
      `\\{\\{\\s*${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\}\\}`,
      "g",
    );
    out = out.replace(re, v);
  }
  return out;
}

async function resolveRecipients(
  segment: Segment,
): Promise<Array<{ user_id: string | null; email: string; name: string | null }>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  if (segment.type === "emails") {
    return segment.emails.map((e) => ({ user_id: null, email: e.toLowerCase(), name: null }));
  }

  // Base: profiles não bloqueados / não deletados
  let q = supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, is_blocked, deleted_at")
    .is("deleted_at", null)
    .eq("is_blocked", false)
    .not("email", "is", null);

  const { data: profiles, error } = await q;
  if (error) throw new Response(error.message, { status: 500 });
  let list = (profiles ?? []).filter((p: any) => p.email);

  if (segment.type === "unlimited") {
    const ids = list.map((p: any) => p.id);
    const { data: subs } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id, unlimited_credits")
      .in("user_id", ids);
    const unlimitedSet = new Set(
      (subs ?? []).filter((s: any) => s.unlimited_credits).map((s: any) => s.user_id),
    );
    list = list.filter((p: any) => unlimitedSet.has(p.id));
  } else if (segment.type === "tags") {
    const { data: links } = await supabaseAdmin
      .from("profile_tags")
      .select("profile_id, tag_id")
      .in("tag_id", segment.tag_ids);
    const tagged = new Set((links ?? []).map((l: any) => l.profile_id));
    list = list.filter((p: any) => tagged.has(p.id));
  }

  // dedupe por email
  const seen = new Set<string>();
  const out: Array<{ user_id: string | null; email: string; name: string | null }> = [];
  for (const p of list as any[]) {
    const em = String(p.email).toLowerCase().trim();
    if (!em || seen.has(em)) continue;
    seen.add(em);
    out.push({ user_id: p.id, email: em, name: p.full_name ?? null });
  }
  return out;
}

// ---------- LIST TAGS (para o form de segmentação) ----------
export const listUserTags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("user_tags")
      .select("id, label, color")
      .order("label");
    if (error) throw new Response(error.message, { status: 500 });
    return data ?? [];
  });

// ---------- PREVIEW SEGMENTO ----------
export const previewCampaignSegment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ segment: SegmentSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const rec = await resolveRecipients(data.segment);
    return { total: rec.length, sample: rec.slice(0, 10) };
  });

// ---------- LIST CAMPAIGNS ----------
export const listCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("email_campaigns" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Response(error.message, { status: 500 });
    return data ?? [];
  });

// ---------- GET CAMPAIGN ----------
export const getCampaign = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { data: campaign, error } = await context.supabase
      .from("email_campaigns" as any)
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !campaign) throw new Response("Campanha não encontrada", { status: 404 });
    const { data: samples } = await context.supabase
      .from("email_campaign_recipients" as any)
      .select("email, status, error, sent_at")
      .eq("campaign_id", data.id)
      .order("sent_at", { ascending: false, nullsFirst: false })
      .limit(50);
    return { campaign, samples: samples ?? [] };
  });

// ---------- CREATE CAMPAIGN (draft + snapshot destinatários) ----------
export const createCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        name: z.string().min(2).max(120),
        subject: z.string().min(2).max(300),
        html: z.string().min(20).max(500_000),
        from_name: z.string().min(1).max(80).default("Lumma"),
        segment: SegmentSchema,
        include_recovery_link: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const recipients = await resolveRecipients(data.segment);
    if (recipients.length === 0) {
      throw new Response("Segmento vazio", { status: 400 });
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: camp, error } = await supabaseAdmin
      .from("email_campaigns" as any)
      .insert({
        name: data.name,
        subject: data.subject,
        html: data.html,
        from_name: data.from_name,
        segment: data.segment,
        include_recovery_link: data.include_recovery_link,
        status: "ready",
        total: recipients.length,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error || !camp) throw new Response(error?.message ?? "Falha ao criar", { status: 500 });

    // inserir destinatários em lotes
    const rows = recipients.map((r) => ({
      campaign_id: (camp as any).id,
      user_id: r.user_id,
      email: r.email,
      name: r.name,
    }));
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error: e2 } = await supabaseAdmin
        .from("email_campaign_recipients" as any)
        .insert(chunk);
      if (e2) throw new Response(e2.message, { status: 500 });
    }

    return { id: (camp as any).id, total: recipients.length };
  });

// ---------- START / PAUSE ----------
export const setCampaignStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["sending", "paused", "ready"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const patch: any = { status: data.status };
    if (data.status === "sending") patch.started_at = new Date().toISOString();
    const { error } = await context.supabase
      .from("email_campaigns" as any)
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Response(error.message, { status: 500 });
    return { ok: true };
  });

// ---------- DELETE CAMPAIGN ----------
export const deleteCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("email_campaigns" as any)
      .delete()
      .eq("id", data.id);
    if (error) throw new Response(error.message, { status: 500 });
    return { ok: true };
  });

// ---------- PROCESSA UM LOTE ----------
async function generateRecoveryLink(email: string): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any).auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: RESET_REDIRECT },
  });
  if (error || !data?.properties?.action_link) {
    throw new Error(error?.message ?? "generateLink falhou");
  }
  return data.properties.action_link;
}

export const processCampaignBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Response("RESEND_API_KEY ausente", { status: 500 });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: camp } = await supabaseAdmin
      .from("email_campaigns" as any)
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!camp) throw new Response("Campanha não encontrada", { status: 404 });
    if ((camp as any).status !== "sending") {
      return { processed: 0, remaining: 0, status: (camp as any).status };
    }

    const { data: pending } = await supabaseAdmin
      .from("email_campaign_recipients" as any)
      .select("id, email, name")
      .eq("campaign_id", data.id)
      .eq("status", "pending")
      .limit(BATCH_SIZE);

    const list = ((pending ?? []) as unknown) as Array<{ id: string; email: string; name: string | null }>;
    let sent = 0;
    let failed = 0;

    for (const r of list) {
      const firstName = (r.name ?? "").split(" ")[0] ?? "";
      const vars: Record<string, string> = {
        first_name_comma: firstName ? `, ${firstName}` : "",
        dashboard_url: DASHBOARD_URL,
        reset_password_url: "",
      };
      try {
        if ((camp as any).include_recovery_link) {
          vars.reset_password_url = await generateRecoveryLink(r.email);
        }
        const subject = renderTemplate((camp as any).subject, vars);
        const html = renderTemplate((camp as any).html, vars);

        const res = await fetch(RESEND_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            from: `${(camp as any).from_name} <${(camp as any).from_email}>`,
            to: r.email,
            subject,
            html,
          }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`resend ${res.status}: ${text.slice(0, 300)}`);
        }
        const body = await res.json().catch(() => ({}));
        await supabaseAdmin
          .from("email_campaign_recipients" as any)
          .update({
            status: "sent",
            resend_id: body?.id ?? null,
            sent_at: new Date().toISOString(),
            error: null,
          })
          .eq("id", r.id);
        sent++;
      } catch (err: any) {
        await supabaseAdmin
          .from("email_campaign_recipients" as any)
          .update({
            status: "failed",
            error: String(err?.message ?? err).slice(0, 500),
            sent_at: new Date().toISOString(),
          })
          .eq("id", r.id);
        failed++;
      }
      await new Promise((r) => setTimeout(r, THROTTLE_MS));
    }

    // recomputar contadores
    const { count: sentCount } = await supabaseAdmin
      .from("email_campaign_recipients" as any)
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", data.id)
      .eq("status", "sent");
    const { count: failedCount } = await supabaseAdmin
      .from("email_campaign_recipients" as any)
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", data.id)
      .eq("status", "failed");
    const { count: pendingCount } = await supabaseAdmin
      .from("email_campaign_recipients" as any)
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", data.id)
      .eq("status", "pending");

    const remaining = pendingCount ?? 0;
    const patch: any = {
      sent: sentCount ?? 0,
      failed: failedCount ?? 0,
    };
    if (remaining === 0) {
      patch.status = "done";
      patch.finished_at = new Date().toISOString();
    }
    await supabaseAdmin.from("email_campaigns" as any).update(patch).eq("id", data.id);

    return {
      processed: list.length,
      sent,
      failed,
      remaining,
      status: remaining === 0 ? "done" : "sending",
    };
  });
