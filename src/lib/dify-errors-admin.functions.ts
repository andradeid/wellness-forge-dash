import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Leitura dos registros de falha da IA. Restrito ao super admin.
 * Somente leitura — nenhuma escrita acontece aqui.
 */

async function assertSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (!data) throw new Response("Forbidden", { status: 403 });
}

export interface DifyErrorRow {
  id: string;
  created_at: string;
  user_id: string | null;
  chat_id: string | null;
  conversation_id: string | null;
  patient_profile: string | null;
  selected_task: string | null;
  agent_type: string | null;
  error_kind: string;
  http_status: number | null;
  raw_error: string | null;
  duration_ms: number | null;
  had_attachment: boolean;
  attachment_count: number;
  attachment_name: string | null;
  attachment_mime: string | null;
  was_retry: boolean;
  billed: boolean;
  source: string;
  metadata: any;
  user: { full_name: string | null; email: string } | null;
}

const filtersSchema = z.object({
  hours: z.number().int().min(1).max(24 * 400).optional().default(24 * 7),
  q: z.string().trim().max(200).optional().default(""),
  profile: z.string().trim().max(60).optional().default(""),
  task: z.string().trim().max(60).optional().default(""),
  kind: z.string().trim().max(40).optional().default(""),
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(5).max(100).optional().default(25),
});

function applyFilters(query: any, f: { hours: number; profile: string; task: string; kind: string }) {
  const since = new Date(Date.now() - f.hours * 3600_000).toISOString();
  let q = query.gte("created_at", since);
  if (f.profile) q = q.eq("patient_profile", f.profile);
  if (f.task) q = q.eq("selected_task", f.task);
  if (f.kind) q = q.eq("error_kind", f.kind);
  return q;
}

export const listDifyErrors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => filtersSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const from = (data.page - 1) * data.pageSize;
    let query = applyFilters(
      (supabaseAdmin as any).from("dify_error_logs").select("*", { count: "exact" }),
      data,
    );

    if (data.q) {
      const term = data.q.replace(/[%,]/g, " ").trim();
      query = query.or(
        [
          `raw_error.ilike.%${term}%`,
          `conversation_id.ilike.%${term}%`,
          `attachment_name.ilike.%${term}%`,
          `selected_task.ilike.%${term}%`,
        ].join(","),
      );
    }

    const { data: rows, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, from + data.pageSize - 1);
    if (error) throw new Response(error.message, { status: 500 });

    const list = (rows ?? []) as DifyErrorRow[];

    // Busca por nome/e-mail da usuária: complementa o filtro textual acima.
    const ids = Array.from(new Set(list.map((r) => r.user_id).filter(Boolean))) as string[];
    let profiles: Record<string, { full_name: string | null; email: string }> = {};
    if (ids.length) {
      const { data: profs } = await (supabaseAdmin as any)
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      for (const p of profs ?? []) profiles[p.id] = { full_name: p.full_name, email: p.email };
    }

    return {
      rows: list.map((r) => ({ ...r, user: r.user_id ? profiles[r.user_id] ?? null : null })),
      total: count ?? 0,
    };
  });

export interface DifyErrorStats {
  total: number;
  byKind: Array<{ key: string; count: number }>;
  byHour: Array<{ hour: number; count: number }>;
  byProfile: Array<{ key: string; count: number }>;
  byTask: Array<{ key: string; count: number }>;
  byMime: Array<{ key: string; count: number }>;
  byDuration: Array<{ key: string; count: number }>;
  profiles: string[];
  tasks: string[];
  kinds: string[];
}

/** Faixas de duração — separam "falhou ao buscar arquivo" de "falhou ao processar". */
const DURATION_BUCKETS: Array<{ key: string; max: number }> = [
  { key: "até 5s", max: 5_000 },
  { key: "5–15s", max: 15_000 },
  { key: "15–30s", max: 30_000 },
  { key: "30–60s", max: 60_000 },
  { key: "60–120s", max: 120_000 },
  { key: "acima de 120s", max: Number.POSITIVE_INFINITY },
];

function bucketDuration(ms: number | null): string {
  if (ms == null) return "sem medição";
  for (const b of DURATION_BUCKETS) if (ms < b.max) return b.key;
  return "acima de 120s";
}

export const getDifyErrorStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => filtersSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<DifyErrorStats> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await applyFilters(
      (supabaseAdmin as any)
        .from("dify_error_logs")
        .select("created_at, error_kind, patient_profile, selected_task, attachment_mime, duration_ms"),
      data,
    )
      .order("created_at", { ascending: false })
      .limit(20_000);
    if (error) throw new Response(error.message, { status: 500 });

    const list = (rows ?? []) as Array<{
      created_at: string;
      error_kind: string;
      patient_profile: string | null;
      selected_task: string | null;
      attachment_mime: string | null;
      duration_ms: number | null;
    }>;

    const tally = (values: Array<string | null>) => {
      const map = new Map<string, number>();
      for (const v of values) {
        const key = v && v.trim() ? v : "—";
        map.set(key, (map.get(key) ?? 0) + 1);
      }
      return Array.from(map, ([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
    };

    const hourMap = new Array(24).fill(0) as number[];
    for (const r of list) hourMap[new Date(r.created_at).getUTCHours()]++;

    const durationOrder = new Map(
      ["até 5s", "5–15s", "15–30s", "30–60s", "60–120s", "acima de 120s", "sem medição"].map((k, i) => [k, i]),
    );

    // Listas para os seletores: sempre do período inteiro filtrado por tempo.
    const { data: allRows } = await (supabaseAdmin as any)
      .from("dify_error_logs")
      .select("patient_profile, selected_task, error_kind")
      .gte("created_at", new Date(Date.now() - data.hours * 3600_000).toISOString())
      .limit(20_000);
    const uniq = (vals: Array<string | null>) =>
      Array.from(new Set(vals.filter((v): v is string => Boolean(v && v.trim())))).sort();

    return {
      total: list.length,
      byKind: tally(list.map((r) => r.error_kind)),
      byHour: hourMap.map((count, hour) => ({ hour, count })),
      byProfile: tally(list.map((r) => r.patient_profile)),
      byTask: tally(list.map((r) => r.selected_task)),
      byMime: tally(list.map((r) => r.attachment_mime)),
      byDuration: tally(list.map((r) => bucketDuration(r.duration_ms))).sort(
        (a, b) => (durationOrder.get(a.key) ?? 99) - (durationOrder.get(b.key) ?? 99),
      ),
      profiles: uniq((allRows ?? []).map((r: any) => r.patient_profile)),
      tasks: uniq((allRows ?? []).map((r: any) => r.selected_task)),
      kinds: uniq((allRows ?? []).map((r: any) => r.error_kind)),
    };
  });

/** Escapa um campo para CSV (aspas duplas + separador seguro). */
function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}

/**
 * Exporta o registro filtrado em CSV, com `message_id` e `conversation_id`
 * para cruzamento com a análise no Dify. Somente leitura, super admin.
 */
export const exportDifyErrors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => filtersSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<{ csv: string; rows: number }> => {
    await assertSuperAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await applyFilters(
      (supabaseAdmin as any).from("dify_error_logs").select("*"),
      data,
    )
      .order("created_at", { ascending: false })
      .limit(20_000);
    if (error) throw new Response(error.message, { status: 500 });

    const list = (rows ?? []) as DifyErrorRow[];
    const header = [
      "created_at",
      "message_id",
      "conversation_id",
      "chat_id",
      "user_id",
      "patient_profile",
      "selected_task",
      "agent_type",
      "error_kind",
      "http_status",
      "duration_ms",
      "provider_latency_ms",
      "wall_ms",
      "had_attachment",
      "attachment_name",
      "attachment_mime",
      "was_retry",
      "billed",
      "source",
      "raw_error",
    ];
    const lines = [header.join(",")];
    for (const r of list) {
      const m = r.metadata ?? {};
      lines.push(
        [
          r.created_at,
          m.message_id ?? "",
          r.conversation_id ?? m.conversation_id ?? "",
          r.chat_id ?? "",
          r.user_id ?? "",
          r.patient_profile ?? "",
          r.selected_task ?? "",
          r.agent_type ?? "",
          r.error_kind,
          r.http_status ?? "",
          r.duration_ms ?? "",
          m.provider_latency_ms ?? "",
          m.wall_ms ?? "",
          r.had_attachment ? "sim" : "não",
          r.attachment_name ?? "",
          r.attachment_mime ?? "",
          r.was_retry ? "sim" : "não",
          r.billed ? "sim" : "não",
          r.source,
          r.raw_error ?? "",
        ]
          .map(csvCell)
          .join(","),
      );
    }
    return { csv: lines.join("\n"), rows: list.length };
  });

