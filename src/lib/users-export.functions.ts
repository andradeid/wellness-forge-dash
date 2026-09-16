import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Exportação de usuários (dados pessoais) — restrita a super_admin no SERVIDOR.
 * Esconder o botão não basta: quem chamar direto a função recebe 403.
 * Toda exportação bem-sucedida deixa rastro em `integration_logs`.
 */

const MAX_ROWS = 6000;

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

const FiltersSchema = z.object({
  search: z.string().trim().max(120).default(""),
  status: z.string().trim().max(32).default("all"),
  plan: z.string().trim().max(32).default("all"),
  tagId: z.string().trim().max(64).default("all"),
  tagLabel: z.string().trim().max(120).default(""),
});

export type UserExportRow = {
  nome: string;
  email: string;
  telefone: string;
  registro_profissional: string;
  plano: string;
  situacao: string;
  validade: string | null;
  origem: string;
  migrada: string;
  criado_em: string;
  ultimo_acesso: string | null;
  saldo_creditos: number;
  cota_mensal: number;
  creditos_ilimitados: string;
  proxima_reposicao: string | null;
  analises_realizadas: number;
  exames_enviados: number;
  pacientes: number;
  bloqueada: string;
  etiquetas: string;
};

/** Busca paginada completa (PostgREST limita a 1000 por requisição). */
async function fetchAll(makeQuery: (from: number, to: number) => any): Promise<any[]> {
  const PAGE = 1000;
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await makeQuery(from, from + PAGE - 1);
    if (error) throw new Response(error.message, { status: 500 });
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE || out.length >= MAX_ROWS * 6) break;
  }
  return out;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const PLAN_LABEL: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro Individual",
  clinica: "Clínica",
  legado_500: "Legado 500",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Ativa",
  trial: "Trial",
  past_due: "Inadimplente",
  canceled: "Cancelada",
};

const ORIGIN_LABEL: Record<string, string> = {
  migracao: "Migração",
  migracao_lumma1: "Migração (Lumma 1)",
  ajuste_manual_hubla: "Migração (Hubla)",
  kiwify: "Kiwify",
  stripe: "Stripe",
  manual: "Manual",
  interno: "Interno",
};

const MIGRATED_ORIGINS = new Set(["migracao", "migracao_lumma1", "ajuste_manual_hubla"]);

export const exportUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => FiltersSchema.parse(d))
  .handler(async ({ data, context }) => {
    const supabase: any = context.supabase;
    await assertSuperAdmin(supabase, context.userId);

    // 1) Escopo: exclui contas internas (mesma regra da tela).
    const { data: adminRoles, error: rolesErr } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["super_admin", "admin", "support"]);
    if (rolesErr) throw new Response(rolesErr.message, { status: 500 });
    const excludeIds = Array.from(new Set((adminRoles ?? []).map((r: any) => r.user_id as string)));

    // 2) Sub-filtros (assinatura / plano / etiqueta) → interseção de ids.
    let candidateIds: string[] | null = null;
    const intersect = (next: string[]) => {
      const setNext = new Set(next);
      candidateIds =
        candidateIds === null ? Array.from(setNext) : candidateIds.filter((id) => setNext.has(id));
    };

    let bannedIds = new Set<string>();
    const needsBanned = data.status === "auth_blocked" || data.status === "expired";
    if (needsBanned) {
      const { data: banned, error } = await supabase.rpc("admin_auth_banned_ids");
      if (error) throw new Response(error.message, { status: 500 });
      bannedIds = new Set((banned ?? []).map((r: any) => r.user_id as string));
    }
    if (data.status === "auth_blocked") intersect(Array.from(bannedIds));

    const subStatusActive =
      data.status !== "all" && data.status !== "blocked" && data.status !== "auth_blocked";
    const expiredFilter = data.status === "expired";

    if (subStatusActive || data.plan !== "all") {
      const rows = await fetchAll((from, to) => {
        let q = supabase.from("subscriptions").select("user_id");
        if (expiredFilter) q = q.lt("current_period_end", new Date().toISOString());
        else if (subStatusActive) q = q.eq("status", data.status);
        if (data.plan !== "all") q = q.eq("plan_type", data.plan);
        return q.range(from, to);
      });
      intersect(
        rows
          .map((r: any) => r.user_id as string)
          .filter((id: string) => !(expiredFilter && bannedIds.has(id))),
      );
    }

    if (data.tagId !== "all") {
      const rows = await fetchAll((from, to) =>
        supabase.from("profile_tags").select("profile_id").eq("tag_id", data.tagId).range(from, to),
      );
      intersect(rows.map((r: any) => r.profile_id as string));
    }

    // 3) Perfis.
    const buildProfiles = (from: number, to: number, ids?: string[]) => {
      let q = supabase
        .from("profiles")
        .select("id, full_name, email, phone, professional_id, is_blocked, created_at")
        .is("deleted_at", null);
      if (excludeIds.length > 0) q = q.not("id", "in", `(${excludeIds.join(",")})`);
      if (data.status === "blocked") q = q.eq("is_blocked", true);
      if (data.search) {
        const term = data.search.replace(/[%,]/g, "");
        q = q.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`);
      }
      if (ids) q = q.in("id", ids);
      return q.order("created_at", { ascending: false }).range(from, to);
    };

    let profiles: any[] = [];
    if (candidateIds === null) {
      profiles = await fetchAll((from, to) => buildProfiles(from, to));
    } else {
      for (const ids of chunk(candidateIds as string[], 200)) {
        const part = await fetchAll((from, to) => buildProfiles(from, to, ids));
        profiles.push(...part);
      }
      profiles.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    }

    const truncated = profiles.length > MAX_ROWS;
    if (truncated) profiles = profiles.slice(0, MAX_ROWS);
    const ids = profiles.map((p: any) => p.id as string);
    const idChunks = chunk(ids, 200);

    // 4) Dados complementares.
    const subMap = new Map<string, any>();
    const creditMap = new Map<string, any>();
    const authMap = new Map<string, { banned: boolean; lastSignIn: string | null }>();
    const tagMap = new Map<string, string[]>();
    const examCount = new Map<string, number>();
    const patientCount = new Map<string, number>();
    const analysisCount = new Map<string, number>();

    for (const part of idChunks) {
      const [subs, credits, auth, tags] = await Promise.all([
        supabase
          .from("subscriptions")
          .select("user_id, status, plan_type, current_period_end, origin, unlimited_credits")
          .in("user_id", part),
        supabase
          .from("user_credits")
          .select("user_id, balance, monthly_quota, quota_reset_at")
          .in("user_id", part),
        supabase.rpc("admin_auth_block_status", { p_ids: part }),
        supabase.from("profile_tags").select("profile_id, user_tags(label)").in("profile_id", part),
      ]);
      (subs.data ?? []).forEach((s: any) => subMap.set(s.user_id, s));
      (credits.data ?? []).forEach((c: any) => creditMap.set(c.user_id, c));
      (auth.data ?? []).forEach((a: any) =>
        authMap.set(a.user_id, { banned: !!a.auth_banned, lastSignIn: a.last_sign_in_at ?? null }),
      );
      (tags.data ?? []).forEach((t: any) => {
        const label = t.user_tags?.label;
        if (!label) return;
        tagMap.set(t.profile_id, [...(tagMap.get(t.profile_id) ?? []), label]);
      });

      const exams = await fetchAll((from, to) =>
        supabase.from("patient_exams").select("uploaded_by").in("uploaded_by", part).range(from, to),
      );
      exams.forEach((e: any) =>
        examCount.set(e.uploaded_by, (examCount.get(e.uploaded_by) ?? 0) + 1),
      );

      const pats = await fetchAll((from, to) =>
        supabase.from("patients").select("created_by").in("created_by", part).range(from, to),
      );
      pats.forEach((p: any) =>
        patientCount.set(p.created_by, (patientCount.get(p.created_by) ?? 0) + 1),
      );

      const tx = await fetchAll((from, to) =>
        supabase
          .from("credit_transactions")
          .select("user_id")
          .eq("type", "debit")
          .in("user_id", part)
          .range(from, to),
      );
      tx.forEach((t: any) => analysisCount.set(t.user_id, (analysisCount.get(t.user_id) ?? 0) + 1));
    }

    const rows: UserExportRow[] = profiles.map((p: any) => {
      const sub = subMap.get(p.id);
      const cred = creditMap.get(p.id);
      const auth = authMap.get(p.id);
      const origin: string = sub?.origin ?? "";
      return {
        nome: p.full_name ?? "",
        email: p.email ?? "",
        telefone: p.phone ?? "",
        registro_profissional: p.professional_id ?? "",
        plano: PLAN_LABEL[sub?.plan_type ?? ""] ?? "—",
        situacao: STATUS_LABEL[sub?.status ?? ""] ?? "Sem plano",
        validade: sub?.current_period_end ?? null,
        origem: ORIGIN_LABEL[origin] ?? (origin || "—"),
        migrada: MIGRATED_ORIGINS.has(origin) ? "Sim" : "Não",
        criado_em: p.created_at,
        ultimo_acesso: auth?.lastSignIn ?? null,
        saldo_creditos: cred?.balance ?? 0,
        cota_mensal: cred?.monthly_quota ?? 0,
        creditos_ilimitados: sub?.unlimited_credits ? "Sim" : "Não",
        proxima_reposicao: cred?.quota_reset_at ?? null,
        analises_realizadas: analysisCount.get(p.id) ?? 0,
        exames_enviados: examCount.get(p.id) ?? 0,
        pacientes: patientCount.get(p.id) ?? 0,
        bloqueada: auth?.banned || p.is_blocked ? "Sim" : "Não",
        etiquetas: (tagMap.get(p.id) ?? []).join(", "),
      };
    });

    // 5) Auditoria — dado pessoal saindo do sistema deixa rastro.
    await supabase.from("integration_logs").insert({
      source: "admin",
      event: "users_export",
      status: "success",
      message: `Exportação de ${rows.length} usuário(s)`,
      payload: {
        actor_id: context.userId,
        total: rows.length,
        truncated,
        filters: {
          busca: data.search || null,
          situacao: data.status,
          plano: data.plan,
          etiqueta: data.tagLabel || (data.tagId !== "all" ? data.tagId : null),
        },
        exported_at: new Date().toISOString(),
      },
    });

    return { rows, truncated };
  });
