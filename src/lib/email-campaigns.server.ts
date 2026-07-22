import { z } from "zod";

export const RESEND_ENDPOINT = "https://api.resend.com/emails";
export const DASHBOARD_URL = "https://lumma.ia.br/app";
export const RESET_REDIRECT = "https://lumma.ia.br/reset-password";
export const BATCH_SIZE = 40;
export const THROTTLE_MS = 130;

type Recipient = { user_id: string | null; email: string; name: string | null };

function fail(message: string): never {
  throw new Error(message);
}

function mapProfileToRecipient(profile: any): Recipient | null {
  const email = String(profile?.email ?? "").toLowerCase().trim();
  if (!email) return null;
  return { user_id: profile.id ?? null, email, name: profile.full_name ?? null };
}

export async function assertSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin");
  if (!data || data.length === 0) {
    fail("Acesso restrito a super administradores.");
  }
}

export const SegmentSchema = z.union([
  z.object({ type: z.literal("all_active") }),
  z.object({ type: z.literal("unlimited") }),
  z.object({ type: z.literal("tags"), tag_ids: z.array(z.string().uuid()).min(1) }),
  z.object({ type: z.literal("emails"), emails: z.array(z.string().email()).min(1).max(5000) }),
]);
export type Segment = z.infer<typeof SegmentSchema>;

export function renderTemplate(source: string, vars: Record<string, string>) {
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

export async function fetchProfilesByIds(ids: string[]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const out: any[] = [];
  const CHUNK = 500;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, is_blocked, deleted_at")
      .in("id", slice)
      .is("deleted_at", null)
      .eq("is_blocked", false)
      .not("email", "is", null);
    if (error) fail(error.message);
    out.push(...(data ?? []));
  }
  return out;
}

export async function fetchAllProfiles() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const out: any[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, is_blocked, deleted_at")
      .is("deleted_at", null)
      .eq("is_blocked", false)
      .not("email", "is", null)
      .range(from, from + PAGE - 1);
    if (error) fail(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

export async function resolveRecipients(
  segment: Segment,
): Promise<Recipient[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  if (segment.type === "emails") {
    return segment.emails.map((e) => ({ user_id: null, email: e.toLowerCase(), name: null }));
  }

  let list: any[] = [];

  if (segment.type === "tags") {
    const ids: string[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabaseAdmin
        .from("profile_tags")
        .select("profile_id")
        .in("tag_id", segment.tag_ids)
        .range(from, from + PAGE - 1);
      if (error) fail(error.message);
      const rows = data ?? [];
      ids.push(...rows.map((r: any) => r.profile_id));
      if (rows.length < PAGE) break;
      from += PAGE;
    }
    list = await fetchProfilesByIds(Array.from(new Set(ids)));
  } else if (segment.type === "unlimited") {
    const subIds: string[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabaseAdmin
        .from("subscriptions")
        .select("user_id, unlimited_credits")
        .eq("unlimited_credits", true)
        .range(from, from + PAGE - 1);
      if (error) fail(error.message);
      const rows = data ?? [];
      subIds.push(...rows.map((s: any) => s.user_id));
      if (rows.length < PAGE) break;
      from += PAGE;
    }
    list = await fetchProfilesByIds(Array.from(new Set(subIds)));
  } else {
    list = await fetchAllProfiles();
  }

  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const p of list as any[]) {
    const em = String(p.email ?? "").toLowerCase().trim();
    if (!em || seen.has(em)) continue;
    seen.add(em);
    out.push({ user_id: p.id, email: em, name: p.full_name ?? null });
  }
  return out;
}

export async function previewRecipients(segment: Segment): Promise<{ total: number; sample: Recipient[] }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  if (segment.type === "emails") {
    const seen = new Set<string>();
    const recipients: Recipient[] = [];
    for (const rawEmail of segment.emails) {
      const email = rawEmail.toLowerCase().trim();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      recipients.push({ user_id: null, email, name: null });
    }
    return { total: recipients.length, sample: recipients.slice(0, 20) };
  }

  if (segment.type === "all_active") {
    const base = supabaseAdmin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("is_blocked", false)
      .not("email", "is", null);
    const { count, error: countError } = await base;
    if (countError) fail(countError.message);

    const { data: sampleRows, error: sampleError } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .is("deleted_at", null)
      .eq("is_blocked", false)
      .not("email", "is", null)
      .order("full_name", { ascending: true, nullsFirst: false })
      .limit(20);
    if (sampleError) fail(sampleError.message);

    return {
      total: count ?? 0,
      sample: (sampleRows ?? []).map(mapProfileToRecipient).filter((r): r is Recipient => Boolean(r)),
    };
  }

  if (segment.type === "unlimited") {
    const subIds: string[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data, error } = await supabaseAdmin
        .from("subscriptions")
        .select("user_id")
        .eq("unlimited_credits", true)
        .range(from, from + PAGE - 1);
      if (error) fail(error.message);
      const rows = data ?? [];
      subIds.push(...rows.map((s: any) => s.user_id).filter(Boolean));
      if (rows.length < PAGE) break;
      from += PAGE;
    }
    const uniqueIds = Array.from(new Set(subIds));
    if (uniqueIds.length === 0) return { total: 0, sample: [] };
    const recipients = await fetchProfilesByIds(uniqueIds);
    return { total: recipients.length, sample: recipients.slice(0, 20).map(mapProfileToRecipient).filter((r): r is Recipient => Boolean(r)) };
  }

  const recipients = await resolveRecipients(segment);
  return { total: recipients.length, sample: recipients.slice(0, 20) };
}

export async function generateRecoveryLink(email: string): Promise<string> {
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
