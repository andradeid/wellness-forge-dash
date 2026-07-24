import type { SupabaseClient } from "@supabase/supabase-js";

async function fetchPaged<T extends Record<string, unknown>>(
  admin: SupabaseClient,
  table: string,
  select: string,
  apply: (q: any) => any,
  pageSize = 1000,
  maxRows = 20_000,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  while (from < maxRows) {
    const to = from + pageSize - 1;
    let q = admin.from(table).select(select).range(from, to);
    q = apply(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    const batch = ((data ?? []) as unknown) as T[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function peakConcurrency(
  events: Array<{ at: number; userId: string }>,
  windowMs: number,
): { peak: number; atIso: string | null } {
  if (events.length === 0) return { peak: 0, atIso: null };
  const sorted = [...events].sort((a, b) => a.at - b.at);
  let peak = 0;
  let peakAt = sorted[0]!.at;
  let j = 0;
  const active = new Map<string, number>(); // userId -> count in window

  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i]!;
    active.set(cur.userId, (active.get(cur.userId) ?? 0) + 1);
    while (j <= i && cur.at - sorted[j]!.at > windowMs) {
      const old = sorted[j]!;
      const n = (active.get(old.userId) ?? 1) - 1;
      if (n <= 0) active.delete(old.userId);
      else active.set(old.userId, n);
      j++;
    }
    if (active.size > peak) {
      peak = active.size;
      peakAt = cur.at;
    }
  }
  return { peak, atIso: new Date(peakAt).toISOString() };
}

export type OperationalSummary = {
  since: string;
  until: string;
  hours: number;
  loginsUnique: number;
  loginEvents: number;
  chatUsers: number;
  userMessages: number;
  totalMessages: number;
  examUploaders: number;
  examsTotal: number;
  examsWithDifyFileId: number;
  debitUsers: number;
  debitsCount: number;
  debitsAmountSum: number;
  grantUsers: number;
  grantsCount: number;
  grantsAmountSum: number;
  patientsCreated: number;
  chatsCreated: number;
  realActiveUsers: number;
  assistantErrorMessages: number;
  mustChangePasswordStill: number;
  passwordClearedProxy: number;
  concurrencyPeakUsers: number;
  concurrencyPeakAt: string | null;
  concurrencyWindowMinutes: number;
  topDebitUsers: Array<{ userId: string; debits: number; fullName: string | null; email: string | null }>;
};

export async function buildOperationalSummary(
  admin: SupabaseClient,
  hours: number,
): Promise<OperationalSummary> {
  const until = new Date();
  const sinceDate = new Date(until.getTime() - hours * 3600_000);
  const since = sinceDate.toISOString();
  const untilIso = until.toISOString();

  const sessions = await fetchPaged<{ user_id: string; created_at: string }>(
    admin,
    "user_sessions",
    "user_id,created_at",
    (q) => q.gte("created_at", since).lt("created_at", untilIso).order("created_at", { ascending: true }),
  );

  const debits = await fetchPaged<{ user_id: string; amount: number; created_at: string; type: string }>(
    admin,
    "credit_transactions",
    "user_id,amount,created_at,type",
    (q) =>
      q
        .eq("type", "debit")
        .gte("created_at", since)
        .lt("created_at", untilIso)
        .order("created_at", { ascending: true }),
  );

  const grants = await fetchPaged<{ user_id: string; amount: number; created_at: string }>(
    admin,
    "credit_transactions",
    "user_id,amount,created_at",
    (q) =>
      q
        .eq("type", "grant")
        .gte("created_at", since)
        .lt("created_at", untilIso)
        .order("created_at", { ascending: true }),
  );

  const exams = await fetchPaged<{
    uploaded_by: string;
    created_at: string;
    dify_file_id: string | null;
  }>(
    admin,
    "patient_exams",
    "uploaded_by,created_at,dify_file_id",
    (q) => q.gte("created_at", since).lt("created_at", untilIso).order("created_at", { ascending: true }),
  );

  const messages = await fetchPaged<{
    created_by: string | null;
    role: string;
    created_at: string;
    structured_data: Record<string, unknown> | null;
  }>(
    admin,
    "chat_messages",
    "created_by,role,created_at,structured_data",
    (q) => q.gte("created_at", since).lt("created_at", untilIso).order("created_at", { ascending: true }),
  );

  const patients = await fetchPaged<{ id: string }>(
    admin,
    "patients",
    "id",
    (q) => q.gte("created_at", since).lt("created_at", untilIso),
  );

  const chats = await fetchPaged<{ id: string }>(
    admin,
    "patient_chats",
    "id",
    (q) => q.gte("created_at", since).lt("created_at", untilIso),
  );

  const loginUsers = new Set(sessions.map((s) => s.user_id).filter(Boolean));
  const debitUsers = new Set(debits.map((d) => d.user_id).filter(Boolean));
  const grantUsers = new Set(grants.map((g) => g.user_id).filter(Boolean));
  const examUsers = new Set(exams.map((e) => e.uploaded_by).filter(Boolean));
  const chatUsers = new Set(
    messages.filter((m) => m.role === "user" && m.created_by).map((m) => m.created_by as string),
  );
  const realActive = new Set<string>([...loginUsers, ...debitUsers, ...examUsers, ...chatUsers]);

  const userMessages = messages.filter((m) => m.role === "user").length;
  const assistantErrorMessages = messages.filter((m) => {
    if (m.role !== "assistant") return false;
    const sd = m.structured_data;
    return !!(sd && typeof sd === "object" && (sd as any).error === true);
  }).length;

  const WINDOW_MIN = 5;
  const concEvents = [
    ...debits.map((d) => ({ at: Date.parse(d.created_at), userId: d.user_id })),
    ...exams.map((e) => ({ at: Date.parse(e.created_at), userId: e.uploaded_by })),
  ].filter((e) => e.userId && Number.isFinite(e.at));
  const conc = peakConcurrency(concEvents, WINDOW_MIN * 60_000);

  // Snapshot: ainda precisam trocar senha
  const { count: mustChangeCount, error: mcErr } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("must_change_password", true);
  if (mcErr) throw new Error(`profiles must_change: ${mcErr.message}`);

  // Proxy: liberou senha (false) e atualizou perfil no período
  const { count: clearedCount, error: clErr } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("must_change_password", false)
    .gte("updated_at", since)
    .lt("updated_at", untilIso);
  if (clErr) throw new Error(`profiles cleared: ${clErr.message}`);

  const debitCountByUser = new Map<string, number>();
  for (const d of debits) {
    debitCountByUser.set(d.user_id, (debitCountByUser.get(d.user_id) ?? 0) + 1);
  }
  const topIds = [...debitCountByUser.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id]) => id);

  let topDebitUsers: OperationalSummary["topDebitUsers"] = [];
  if (topIds.length > 0) {
    const { data: profs } = await admin.from("profiles").select("id,full_name,email").in("id", topIds);
    const byId = new Map((profs ?? []).map((p: any) => [p.id as string, p]));
    topDebitUsers = topIds.map((userId) => {
      const p = byId.get(userId);
      return {
        userId,
        debits: debitCountByUser.get(userId) ?? 0,
        fullName: (p?.full_name as string) ?? null,
        email: (p?.email as string) ?? null,
      };
    });
  }

  return {
    since,
    until: untilIso,
    hours,
    loginsUnique: loginUsers.size,
    loginEvents: sessions.length,
    chatUsers: chatUsers.size,
    userMessages,
    totalMessages: messages.length,
    examUploaders: examUsers.size,
    examsTotal: exams.length,
    examsWithDifyFileId: exams.filter((e) => !!e.dify_file_id).length,
    debitUsers: debitUsers.size,
    debitsCount: debits.length,
    debitsAmountSum: debits.reduce((s, d) => s + (Number(d.amount) || 0), 0),
    grantUsers: grantUsers.size,
    grantsCount: grants.length,
    grantsAmountSum: grants.reduce((s, g) => s + (Number(g.amount) || 0), 0),
    patientsCreated: patients.length,
    chatsCreated: chats.length,
    realActiveUsers: realActive.size,
    assistantErrorMessages,
    mustChangePasswordStill: mustChangeCount ?? 0,
    passwordClearedProxy: clearedCount ?? 0,
    concurrencyPeakUsers: conc.peak,
    concurrencyPeakAt: conc.atIso,
    concurrencyWindowMinutes: WINDOW_MIN,
    topDebitUsers,
  };
}
