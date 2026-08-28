import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Auditoria operacional: leitura dos eventos administrativos gravados em
 * `integration_logs` (edições manuais, criação de acessos, bloqueios, resets).
 * Somente leitura — nenhuma escrita acontece aqui.
 */

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "super_admin"]);
  if (!data || data.length === 0) throw new Response("Forbidden", { status: 403 });
}

/** Eventos considerados "operacionais" (ações humanas sobre contas). */
const OPERATIONAL_EVENTS = [
  "manual_user_edit",
  "manual_user_creation",
  "manual_user_block_toggle",
  "manual_password_reset",
  "email_change",
  "manual_user_delete",
  "manual_role_change",
  "manual_seats_change",
  "admin_view_conversation",
  "user_unblock",
  "user_block",
  "conversation_reset",
  "ajuste_manual_validade_hubla",
] as const;

export type OperationalLog = {
  id: string;
  created_at: string;
  source: string;
  event: string;
  status: string;
  message: string | null;
  reason: string | null;
  actor_id: string | null;
  actor_role: string | null;
  actor: { full_name: string | null; email: string } | null;
  target_id: string | null;
  target: { full_name: string | null; email: string } | null;
  /** Mapa campo -> { from, to } vindo do payload; JSON livre, por isso `any`. */
  changes: Record<string, { from: string | null; to: string | null }> | null;
  payload: any;
};

function pick(payload: any, keys: string[]): string | null {
  if (!payload || typeof payload !== "object") return null;
  for (const k of keys) {
    const v = payload[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

export const listOperationalLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        q: z.string().trim().max(160).optional().default(""),
        event: z.string().trim().max(60).optional().default(""),
        page: z.number().int().min(1).optional().default(1),
        pageSize: z.number().int().min(5).max(100).optional().default(25),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    const term = data.q.toLowerCase();
    const events = data.event ? [data.event] : (OPERATIONAL_EVENTS as unknown as string[]);

    const ACTOR_KEYS = ["edited_by", "created_by", "actor_id", "admin_id", "performed_by"];
    const TARGET_KEYS = ["edited_user_id", "user_id", "target_user_id", "created_user_id"];

    // Perfis que batem com o termo — os logs guardam apenas IDs, então
    // primeiro descobrimos quais usuários correspondem à busca.
    let matchedIds = new Set<string>();
    if (term) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id")
        .or(`email.ilike.%${term}%,full_name.ilike.%${term}%`)
        .limit(500);
      for (const p of profs ?? []) matchedIds.add(p.id);
    }

    let list: any[] = [];
    let total = 0;

    if (term) {
      // Busca global: varre uma janela ampla de logs operacionais e filtra
      // em memória (payload é JSON livre, não dá para filtrar direto).
      const { data: rows, error } = await context.supabase
        .from("integration_logs")
        .select("id, created_at, source, event, status, message, payload")
        .in("event", events)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw new Response(error.message, { status: 500 });

      const filtered = (rows ?? []).filter((r: any) => {
        const actorId = pick(r.payload, ACTOR_KEYS);
        const targetId = pick(r.payload, TARGET_KEYS);
        if ((actorId && matchedIds.has(actorId)) || (targetId && matchedIds.has(targetId))) return true;
        const texto = [
          r.message,
          pick(r.payload, ["reason", "motivo"]),
          pick(r.payload, ["email", "user_email", "target_email"]),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return texto.includes(term);
      });

      total = filtered.length;
      const start = (data.page - 1) * data.pageSize;
      list = filtered.slice(start, start + data.pageSize);
    } else {
      const from = (data.page - 1) * data.pageSize;
      const { data: rows, error, count } = await context.supabase
        .from("integration_logs")
        .select("id, created_at, source, event, status, message, payload", { count: "exact" })
        .in("event", events)
        .order("created_at", { ascending: false })
        .range(from, from + data.pageSize - 1);
      if (error) throw new Response(error.message, { status: 500 });
      list = rows ?? [];
      total = count ?? 0;
    }

    // Resolve nomes/e-mails de quem executou e de quem foi afetado.
    const ids = new Set<string>();
    for (const r of list) {
      const actor = pick(r.payload, ACTOR_KEYS);
      const target = pick(r.payload, TARGET_KEYS);
      if (actor) ids.add(actor);
      if (target) ids.add(target);
    }

    const profiles: Record<string, { full_name: string | null; email: string }> = {};
    if (ids.size > 0) {
      const { data: profs } = await context.supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", Array.from(ids));
      for (const p of profs ?? []) {
        profiles[p.id] = { full_name: p.full_name, email: p.email };
      }
    }

    const mapped: OperationalLog[] = list.map((r) => {
      const actorId = pick(r.payload, ACTOR_KEYS);
      const targetId = pick(r.payload, TARGET_KEYS);
      return {
        id: r.id,
        created_at: r.created_at,
        source: r.source,
        event: r.event,
        status: r.status,
        message: r.message,
        reason: pick(r.payload, ["reason", "motivo"]),
        actor_id: actorId,
        actor_role: pick(r.payload, ["editor_role", "actor_role", "role"]),
        actor: actorId ? (profiles[actorId] ?? null) : null,
        target_id: targetId,
        target: targetId ? (profiles[targetId] ?? null) : null,
        changes:
          r.payload && typeof r.payload.changes === "object" && r.payload.changes !== null
            ? r.payload.changes
            : null,
        payload: r.payload,
      };
    });

    return { rows: mapped, total, filtered: !!term };
  });


export const getOperationalStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ days: z.number().int().min(1).max(365).optional().default(30) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const { data: rows, error } = await context.supabase
      .from("integration_logs")
      .select("event")
      .in("event", OPERATIONAL_EVENTS as unknown as string[])
      .gte("created_at", since)
      .limit(5000);
    if (error) throw new Response(error.message, { status: 500 });
    const counts: Record<string, number> = {};
    for (const r of rows ?? []) counts[r.event] = (counts[r.event] ?? 0) + 1;
    return { counts, total: (rows ?? []).length, days: data.days };
  });
