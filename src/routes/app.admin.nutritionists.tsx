import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRight, Search, Stethoscope, Check, ChevronLeft, ChevronRight as ChevronRightIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";


export const Route = createFileRoute("/app/admin/nutritionists")({
  component: NutritionistsPage,
});

interface Row {
  id: string;
  full_name: string | null;
  email: string;
  created_at: string;
  status: string | null;
  plan_type: string | null;
  current_period_end: string | null;
  seats_override: number | null;
}

function NutritionistsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(25);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ total: 0, active: 0, trial: 0 });

  // debounce
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(0); }, [debouncedSearch, statusFilter, planFilter, pageSize]);

  // Carrega apenas ids dos admins (lista pequena) e EXCLUI da listagem.
  // Evita .in() com ~2.7k UUIDs (URL gigante → 400 Bad Request).
  const excludeIdsRef = useRef<string[] | null>(null);
  const ensureExcludeIds = useCallback(async (): Promise<string[]> => {
    if (excludeIdsRef.current) return excludeIdsRef.current;
    const { data, error } = await (supabase as any)
      .from("user_roles")
      .select("user_id")
      .in("role", ["super_admin", "admin"]);
    if (error) { toast.error(error.message); return []; }
    const ids = Array.from(new Set((data ?? []).map((r: any) => r.user_id as string))) as string[];
    excludeIdsRef.current = ids;
    return ids;
  }, []);

  const applyNutriScope = (q: any, excludeIds: string[]) =>
    excludeIds.length === 0 ? q : q.not("id", "in", `(${excludeIds.join(",")})`);

  const loadStats = useCallback(async () => {
    const excludeIds = await ensureExcludeIds();
    const baseProfiles = () => applyNutriScope(
      (supabase as any).from("profiles").select("id", { count: "exact", head: true }).is("deleted_at", null),
      excludeIds,
    );
    const baseSubs = (status: string) => {
      let q = (supabase as any).from("subscriptions").select("user_id", { count: "exact", head: true }).eq("status", status);
      if (excludeIds.length > 0) q = q.not("user_id", "in", `(${excludeIds.join(",")})`);
      return q;
    };
    const [totalRes, activeRes, trialRes] = await Promise.all([
      baseProfiles(), baseSubs("active"), baseSubs("trial"),
    ]);
    setStats({
      total: totalRes.count ?? 0,
      active: activeRes.count ?? 0,
      trial: trialRes.count ?? 0,
    });
  }, [ensureExcludeIds]);

  const load = useCallback(async () => {
    setLoading(true);
    const excludeIds = await ensureExcludeIds();

    // sub-filtro: status / plan
    let candidateIds: string[] | null = null;
    if (statusFilter !== "all" || planFilter !== "all") {
      const PAGE = 1000;
      const collected: string[] = [];
      for (let from = 0; ; from += PAGE) {
        let sq = (supabase as any).from("subscriptions").select("user_id");
        if (statusFilter !== "all") sq = sq.eq("status", statusFilter);
        if (planFilter !== "all") sq = sq.eq("plan_type", planFilter);
        const { data, error } = await sq.range(from, from + PAGE - 1);
        if (error) { toast.error(error.message); setLoading(false); return; }
        const rows = data ?? [];
        collected.push(...rows.map((r: any) => r.user_id));
        if (rows.length < PAGE) break;
      }
      candidateIds = collected;
    }

    const buildProfilesQuery = (withCount: boolean) => {
      let q = (supabase as any)
        .from("profiles")
        .select(
          "id, full_name, email, created_at",
          withCount ? { count: "exact" } : undefined,
        )
        .is("deleted_at", null);
      q = applyNutriScope(q, excludeIds);
      if (debouncedSearch) {
        const term = debouncedSearch.replace(/[%,]/g, "");
        q = q.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`);
      }
      return q;
    };

    let profiles: any[] = [];
    let totalCount = 0;

    if (candidateIds === null) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data, count, error } = await buildProfilesQuery(true)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) { toast.error(error.message); setLoading(false); return; }
      profiles = data ?? [];
      totalCount = count ?? 0;
    } else {
      const ids = candidateIds;
      if (ids.length === 0) { setRows([]); setTotal(0); setLoading(false); return; }
      const CHUNK = 200;
      const matched: any[] = [];
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const { data, error } = await buildProfilesQuery(false).in("id", slice);
        if (error) { toast.error(error.message); setLoading(false); return; }
        if (data) matched.push(...data);
      }
      matched.sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
      totalCount = matched.length;
      const from = page * pageSize;
      profiles = matched.slice(from, from + pageSize);
    }

    const pageIds = profiles.map((p: any) => p.id);
    const subMap = new Map<string, any>();
    if (pageIds.length > 0) {
      const { data: subs, error: sErr } = await (supabase as any)
        .from("subscriptions")
        .select("user_id, status, plan_type, current_period_end, seats_override")
        .in("user_id", pageIds);
      if (sErr) toast.error(sErr.message);
      (subs ?? []).forEach((s: any) => subMap.set(s.user_id, s));
    }

    const merged: Row[] = profiles.map((p: any) => ({
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      created_at: p.created_at,
      status: subMap.get(p.id)?.status ?? null,
      plan_type: subMap.get(p.id)?.plan_type ?? null,
      current_period_end: subMap.get(p.id)?.current_period_end ?? null,
      seats_override: subMap.get(p.id)?.seats_override ?? null,
    }));

    setRows(merged);
    setTotal(totalCount);
    setLoading(false);
  }, [ensureExcludeIds, debouncedSearch, statusFilter, planFilter, page, pageSize]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadStats(); }, [loadStats]);

  async function saveSeats(userId: string, value: number | null) {
    const payload: any = {
      user_id: userId,
      seats_override: value,
      updated_at: new Date().toISOString(),
    };
    const { error } = await (supabase as any)
      .from("subscriptions")
      .upsert(payload, { onConflict: "user_id" });
    if (error) { toast.error("Erro ao salvar assentos: " + error.message); return; }
    setRows((prev) => prev.map((r) => (r.id === userId ? { ...r, seats_override: value } : r)));
    toast.success("Assentos atualizados com sucesso.");
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="max-w-6xl">
      <div className="mb-4 space-y-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <span>Acesso</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground/80">Nutricionistas</span>
        </div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
          Gerencie os <span className="italic text-gradient-brand">nutricionistas</span>
        </h1>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Cadastrados", value: stats.total },
          { label: "Assinaturas Ativas", value: stats.active },
          { label: "Em Período Trial", value: stats.trial },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border bg-card shadow-sm" style={{ padding: "24px" }}>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">{s.label}</p>
            <p className="font-mono font-bold text-4xl tracking-tight text-foreground mt-2">{s.value}</p>
          </div>
        ))}
      </div>

      <Card className="mt-10 rounded-2xl border bg-card shadow-sm">
        <CardHeader className="border-b space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Acesso</p>
              <CardTitle className="text-lg font-serif font-normal mt-1">Lista de nutricionistas</CardTitle>
            </div>
            <div className="relative w-full md:w-72">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 rounded-xl"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px] rounded-xl"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="active">Ativa</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
                <SelectItem value="past_due">Atrasada</SelectItem>
                <SelectItem value="canceled">Cancelada</SelectItem>
              </SelectContent>
            </Select>
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-[160px] rounded-xl"><SelectValue placeholder="Plano" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os planos</SelectItem>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="basic">Basic</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="w-[120px] rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25 / pág</SelectItem>
                <SelectItem value="50">50 / pág</SelectItem>
                <SelectItem value="100">100 / pág</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center">
              <div className="h-12 w-12 mx-auto rounded-2xl bg-accent/60 flex items-center justify-center mb-4">
                <Stethoscope className="h-6 w-6 text-accent-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Nenhum nutricionista encontrado.</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent" style={{ borderBottom: "1.5px solid var(--border)" }}>
                    {["Nome", "Email", "Plano", "Status", "Validade", "Assentos", "Cadastro"].map((h, i) => (
                      <TableHead key={h} className={i === 5 ? "w-[160px]" : undefined}
                        style={{ fontSize: "11px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--muted-foreground)" }}>
                        {h}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id} className="border-b last:border-0">
                      <TableCell className="font-medium py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-gradient-brand flex items-center justify-center text-white text-xs font-semibold uppercase">
                            {(r.full_name || r.email).slice(0, 2)}
                          </div>
                          <span>{r.full_name || "—"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.email}</TableCell>
                      <TableCell className="capitalize">{r.plan_type ?? "—"}</TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell>{r.current_period_end ? new Date(r.current_period_end).toLocaleDateString("pt-BR") : "—"}</TableCell>
                      <TableCell><SeatsEditor value={r.seats_override} onSave={(v) => saveSeats(r.id, v)} /></TableCell>
                      <TableCell className="text-muted-foreground">{new Date(r.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between pt-4 mt-4 border-t">
                <p className="text-xs text-muted-foreground">
                  {total === 0 ? "Nenhum resultado" : `Mostrando ${page * pageSize + 1}–${Math.min((page + 1) * pageSize, total)} de ${total}`}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {page + 1} / {totalPages}
                  </span>
                  <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    <ChevronRightIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SeatsEditor({ value, onSave }: { value: number | null; onSave: (v: number | null) => void | Promise<void> }) {
  const [draft, setDraft] = useState<string>(value != null ? String(value) : "");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(value != null ? String(value) : ""); }, [value]);
  const dirty = draft !== (value != null ? String(value) : "");

  async function commit() {
    const trimmed = draft.trim();
    let next: number | null = null;
    if (trimmed !== "") {
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n <= 0) {
        toast.error("Informe um número inteiro positivo (ou vazio para usar o plano).");
        return;
      }
      next = n;
    }
    setSaving(true);
    try { await onSave(next); } finally { setSaving(false); }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number" min={1} step={1} value={draft} placeholder="—"
        onChange={(e) => setDraft(e.target.value)}
        style={{ border: "1px solid var(--border)", borderRadius: "6px", padding: "4px 8px", fontFamily: "var(--font-mono)", width: "64px", textAlign: "center", background: "transparent", outline: "none" }}
      />
      <button type="button" disabled={!dirty || saving} onClick={commit} aria-label="Salvar assentos"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted disabled:opacity-30"
        style={{ color: "oklch(0.54 0.13 160)" }}>
        <Check className="h-4 w-4" />
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const tones: Record<string, { hue: number; label: string }> = {
    active: { hue: 160, label: "Ativa" },
    trial: { hue: 160, label: "Trial" },
    past_due: { hue: 30, label: "Atrasada" },
    canceled: { hue: 20, label: "Cancelada" },
  };
  const t = tones[status ?? ""] ?? { hue: 285, label: "—" };
  return (
    <span style={{
      display: "inline-block",
      backgroundColor: `oklch(0.96 0.04 ${t.hue})`,
      border: `1px solid oklch(0.7 0.12 ${t.hue})`,
      color: `oklch(0.4 0.12 ${t.hue})`,
      fontSize: "11px", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em",
      borderRadius: "4px", padding: "2px 8px",
    }}>
      {t.label}
    </span>
  );
}
