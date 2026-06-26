import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Search,
  Users as UsersIcon,
  Eye,
  CreditCard,
  Mail,
  Ban,
  Trash2,
  CheckCircle2,
  Loader2,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  UserPlus,
  Tag as TagIcon,
  Plus,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/app/admin/users")({
  component: UsersPage,
});

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200];
const DEFAULT_COLORS = ["#e8a04c", "#e89bcf", "#7c9a92", "#6b7fd7", "#d97757", "#8a8a8a", "#2c2c2c"];


type PlanType = "free" | "basic" | "pro" | "premium";
type SubStatus = "trial" | "active" | "past_due" | "canceled";

interface UserRow {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  is_blocked: boolean;
  deleted_at: string | null;
  created_at: string;
  status: SubStatus | null;
  plan_type: PlanType | null;
  current_period_end: string | null;
  exam_count?: number;
}

function statusVariant(status: string | null, blocked?: boolean): "default" | "secondary" | "destructive" | "outline" {
  if (blocked) return "destructive";
  switch (status) {
    case "active": return "default";
    case "trial": return "secondary";
    case "past_due": return "destructive";
    case "canceled": return "outline";
    default: return "outline";
  }
}

function statusLabel(status: string | null, blocked?: boolean) {
  if (blocked) return "Bloqueada";
  return ({ active: "Ativa", trial: "Trial", past_due: "Inadimplente", canceled: "Cancelada" } as Record<string, string>)[status ?? ""] ?? "Sem plano";
}

function planLabel(plan: string | null) {
  return ({ free: "Free", basic: "Basic", pro: "Pro", premium: "Premium" } as Record<string, string>)[plan ?? ""] ?? "—";
}

function UsersPage() {
  const { role } = useAuth();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ total: 0, active: 0, trial: 0, blocked: 0 });

  const nutriIdsRef = useRef<string[] | null>(null);

  // Modais
  const [detailUser, setDetailUser] = useState<UserRow | null>(null);
  const [planUser, setPlanUser] = useState<UserRow | null>(null);
  const [planForm, setPlanForm] = useState<{ plan_type: PlanType; status: SubStatus }>({ plan_type: "free", status: "trial" });
  const [savingPlan, setSavingPlan] = useState(false);
  const [deleteUser, setDeleteUser] = useState<UserRow | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({ full_name: "", email: "", professional_id: "", password: "" });
  const [examCount, setExamCount] = useState<number | null>(null);

  if (role && role !== "super_admin") {
    return (
      <div className="p-12 text-center text-sm text-muted-foreground">
        Acesso restrito ao Super Admin.
      </div>
    );
  }

  // debounce da busca
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // reset da página ao alterar filtros
  useEffect(() => { setPage(0); }, [debouncedSearch, statusFilter, planFilter]);

  const ensureNutriIds = useCallback(async (): Promise<string[]> => {
    if (nutriIdsRef.current) return nutriIdsRef.current;
    const { data, error } = await (supabase as any)
      .from("user_roles")
      .select("user_id")
      .eq("role", "nutri");
    if (error) { toast.error(error.message); return []; }
    const ids = (data ?? []).map((r: any) => r.user_id);
    nutriIdsRef.current = ids;
    return ids;
  }, []);

  // Estatísticas (head count) — atualizadas no mount e após escritas
  const loadStats = useCallback(async () => {
    const ids = await ensureNutriIds();
    if (ids.length === 0) { setStats({ total: 0, active: 0, trial: 0, blocked: 0 }); return; }

    const baseProfiles = () => (supabase as any)
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .in("id", ids)
      .is("deleted_at", null);

    const baseSubs = (status: SubStatus) => (supabase as any)
      .from("subscriptions")
      .select("user_id", { count: "exact", head: true })
      .in("user_id", ids)
      .eq("status", status);

    const [totalRes, activeRes, trialRes, blockedRes] = await Promise.all([
      baseProfiles(),
      baseSubs("active"),
      baseSubs("trial"),
      baseProfiles().eq("is_blocked", true),
    ]);

    setStats({
      total: totalRes.count ?? 0,
      active: activeRes.count ?? 0,
      trial: trialRes.count ?? 0,
      blocked: blockedRes.count ?? 0,
    });
  }, [ensureNutriIds]);

  // Página atual com filtros aplicados no servidor
  const load = useCallback(async () => {
    setLoading(true);
    const ids = await ensureNutriIds();
    if (ids.length === 0) { setRows([]); setTotal(0); setLoading(false); return; }

    // Restringe ids quando há filtro de plano/status (não-bloqueado) — feito em subscriptions
    let scopedIds: string[] = ids;
    const subStatusActive = statusFilter !== "all" && statusFilter !== "blocked";
    if (subStatusActive || planFilter !== "all") {
      let q = (supabase as any)
        .from("subscriptions")
        .select("user_id")
        .in("user_id", ids);
      if (subStatusActive) q = q.eq("status", statusFilter);
      if (planFilter !== "all") q = q.eq("plan_type", planFilter);
      const { data, error } = await q;
      if (error) { toast.error(error.message); setLoading(false); return; }
      scopedIds = (data ?? []).map((r: any) => r.user_id);
      if (scopedIds.length === 0) { setRows([]); setTotal(0); setLoading(false); return; }
    }

    let pq = (supabase as any)
      .from("profiles")
      .select("id, full_name, email, phone, avatar_url, is_blocked, deleted_at, created_at", { count: "exact" })
      .in("id", scopedIds)
      .is("deleted_at", null);

    if (statusFilter === "blocked") pq = pq.eq("is_blocked", true);

    if (debouncedSearch) {
      const term = debouncedSearch.replace(/[%,]/g, "");
      pq = pq.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`);
    }

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    pq = pq.order("created_at", { ascending: false }).range(from, to);

    const { data: profiles, count, error: pErr } = await pq;
    if (pErr) { toast.error(pErr.message); setLoading(false); return; }

    const pageIds = (profiles ?? []).map((p: any) => p.id);
    let subMap = new Map<string, any>();
    if (pageIds.length > 0) {
      const { data: subs, error: sErr } = await (supabase as any)
        .from("subscriptions")
        .select("user_id, status, plan_type, current_period_end")
        .in("user_id", pageIds);
      if (sErr) toast.error(sErr.message);
      (subs ?? []).forEach((s: any) => subMap.set(s.user_id, s));
    }

    const merged: UserRow[] = (profiles ?? []).map((p: any) => ({
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      phone: p.phone,
      avatar_url: p.avatar_url,
      is_blocked: !!p.is_blocked,
      deleted_at: p.deleted_at,
      created_at: p.created_at,
      status: subMap.get(p.id)?.status ?? null,
      plan_type: subMap.get(p.id)?.plan_type ?? null,
      current_period_end: subMap.get(p.id)?.current_period_end ?? null,
    }));

    setRows(merged);
    setTotal(count ?? merged.length);
    setLoading(false);
  }, [ensureNutriIds, debouncedSearch, statusFilter, planFilter, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadStats(); }, [loadStats]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const refreshAll = async () => { await Promise.all([load(), loadStats()]); };

  // ações
  const openDetails = async (u: UserRow) => {
    setDetailUser(u);
    setExamCount(null);
    const { count } = await (supabase as any)
      .from("patient_exams")
      .select("id", { count: "exact", head: true })
      .eq("uploaded_by", u.id);
    setExamCount(count ?? 0);
  };

  const openPlan = (u: UserRow) => {
    setPlanUser(u);
    setPlanForm({
      plan_type: (u.plan_type as PlanType) ?? "free",
      status: (u.status as SubStatus) ?? "trial",
    });
  };

  const savePlan = async () => {
    if (!planUser) return;
    setSavingPlan(true);
    const { error } = await (supabase as any)
      .from("subscriptions")
      .update({ plan_type: planForm.plan_type, status: planForm.status })
      .eq("user_id", planUser.id);
    setSavingPlan(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Plano atualizado com sucesso");
    setPlanUser(null);
    refreshAll();
  };

  const sendWelcome = async (u: UserRow) => {
    const { error } = await supabase.auth.resetPasswordForEmail(u.email);
    if (error) { toast.error(error.message); return; }
    toast.success(`E-mail de boas-vindas enviado para ${u.email}`);
  };

  const toggleBlock = async (u: UserRow) => {
    const next = !u.is_blocked;
    const { data, error } = await supabase.functions.invoke("admin-users", {
      method: "PATCH",
      body: { user_id: u.id, blocked: next },
    });
    if (error || !data?.ok) { toast.error(data?.error ?? error?.message ?? "Falha ao atualizar status"); return; }
    toast.success(next ? "Usuária bloqueada (login impedido)" : "Usuária reativada");
    refreshAll();
  };

  const confirmDelete = async () => {
    if (!deleteUser) return;
    if (deleteConfirm.trim().toLowerCase() !== deleteUser.email.toLowerCase()) {
      toast.error("O e-mail digitado não confere");
      return;
    }
    setDeleting(true);
    const { error } = await (supabase as any)
      .from("profiles")
      .update({ deleted_at: new Date().toISOString(), is_blocked: true })
      .eq("id", deleteUser.id);
    setDeleting(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Usuária excluída");
    setDeleteUser(null);
    setDeleteConfirm("");
    refreshAll();
  };

  const createUser = async () => {
    const f = createForm;
    if (!f.full_name.trim()) { toast.error("Informe o nome completo"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) { toast.error("E-mail inválido"); return; }
    if (f.password.length < 8) { toast.error("A senha precisa ter ao menos 8 caracteres"); return; }
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("admin-users", {
      method: "POST",
      body: f,
    });
    setCreating(false);
    if (error || !data?.ok) { toast.error(data?.error ?? error?.message ?? "Falha ao criar usuário"); return; }
    toast.success("Nutricionista criada com sucesso");
    nutriIdsRef.current = null;
    setCreateOpen(false);
    refreshAll();
  };

  return (
    <div className="max-w-7xl">
      {/* Header */}
      <div className="mb-4 space-y-2">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
          <span>Acesso</span>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground/80">Gestão de usuários</span>
        </div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
          Central de <span className="italic text-gradient-brand">nutricionistas</span>
        </h1>
      </div>


      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Cadastradas", value: stats.total },
          { label: "Ativas", value: stats.active },
          { label: "Em trial", value: stats.trial },
          { label: "Bloqueadas", value: stats.blocked },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border bg-card p-5 shadow-sm">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{s.label}</p>
            <p className="text-2xl font-semibold text-foreground mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Tabela */}
      <Card className="mt-10 rounded-2xl border bg-card shadow-sm">
        <CardHeader className="border-b space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Acesso</p>
              <CardTitle className="text-lg font-serif font-normal mt-1">
                Lista de nutricionistas ({total})
              </CardTitle>
            </div>
            <Button
              onClick={() => { setCreateForm({ full_name: "", email: "", professional_id: "", password: "" }); setCreateOpen(true); }}
              className="bg-gradient-brand text-white rounded-full"
            >
              <UserPlus className="h-4 w-4 mr-2" /> Novo nutricionista
            </Button>
          </div>
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-64">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou e-mail..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 rounded-xl"
              />
            </div>
            <Select value={statusFilter ?? ""} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44 rounded-xl"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="active">Ativa</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
                <SelectItem value="past_due">Inadimplente</SelectItem>
                <SelectItem value="canceled">Cancelada</SelectItem>
                <SelectItem value="blocked">Bloqueada</SelectItem>
              </SelectContent>
            </Select>
            <Select value={planFilter ?? ""} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-40 rounded-xl"><SelectValue placeholder="Plano" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os planos</SelectItem>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="basic">Basic</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="premium">Premium</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {loading ? (
            <div className="py-16 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center">
              <div className="h-12 w-12 mx-auto rounded-2xl bg-accent/60 flex items-center justify-center mb-4">
                <UsersIcon className="h-6 w-6 text-accent-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Nenhuma nutricionista encontrada.</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Usuária</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Plano</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Status</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Cadastro</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id} className="border-b last:border-0">
                      <TableCell className="py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-gradient-brand flex items-center justify-center text-white text-xs font-semibold uppercase overflow-hidden">
                            {r.avatar_url ? (
                              <img src={r.avatar_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                              (r.full_name || r.email).slice(0, 2)
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{r.full_name || "—"}</p>
                            <p className="text-xs text-muted-foreground truncate">{r.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{planLabel(r.plan_type)}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(r.status, r.is_blocked)} className="rounded-full">
                          {statusLabel(r.status, r.is_blocked)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString("pt-BR")}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 justify-end">
                          <Button size="icon" variant="ghost" onClick={() => openDetails(r)} title="Ver detalhes">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => openPlan(r)} title="Plano & Créditos">
                            <CreditCard className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => sendWelcome(r)} title="Enviar boas-vindas / Reset">
                            <Mail className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => toggleBlock(r)}
                            title={r.is_blocked ? "Reativar" : "Bloquear"}
                          >
                            {r.is_blocked ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Ban className="h-4 w-4" />}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => { setDeleteUser(r); setDeleteConfirm(""); }}
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Paginação */}
              <div className="flex items-center justify-between pt-6">
                <p className="text-xs text-muted-foreground">
                  Página {page + 1} de {totalPages} · {total} resultado(s)
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    <ChevronRightIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Modal: Detalhes */}
      <Dialog open={!!detailUser} onOpenChange={(o) => !o && setDetailUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl font-normal">Perfil da nutricionista</DialogTitle>
            <DialogDescription>Informações detalhadas e atividade.</DialogDescription>
          </DialogHeader>
          {detailUser && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 rounded-full bg-gradient-brand flex items-center justify-center text-white text-lg font-semibold uppercase overflow-hidden">
                  {detailUser.avatar_url ? (
                    <img src={detailUser.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    (detailUser.full_name || detailUser.email).slice(0, 2)
                  )}
                </div>
                <div>
                  <p className="font-medium">{detailUser.full_name || "—"}</p>
                  <p className="text-sm text-muted-foreground">{detailUser.email}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border p-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Telefone</p>
                  <p className="mt-1">{detailUser.phone || "—"}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Cadastro</p>
                  <p className="mt-1">{new Date(detailUser.created_at).toLocaleDateString("pt-BR")}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Plano</p>
                  <p className="mt-1">{planLabel(detailUser.plan_type)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</p>
                  <p className="mt-1">{statusLabel(detailUser.status, detailUser.is_blocked)}</p>
                </div>
                <div className="rounded-lg border p-3 col-span-2">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Exames processados</p>
                  <p className="mt-1 text-lg font-semibold">
                    {examCount === null ? <Loader2 className="h-4 w-4 animate-spin inline" /> : examCount}
                  </p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailUser(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal: Plano */}
      <Dialog open={!!planUser} onOpenChange={(o) => !o && setPlanUser(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl font-normal">Atribuir plano</DialogTitle>
            <DialogDescription>
              {planUser?.full_name || planUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Tipo de plano</Label>
              <Select value={planForm.plan_type ?? ""} onValueChange={(v) => setPlanForm((f) => ({ ...f, plan_type: v as PlanType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status da assinatura</Label>
              <Select value={planForm.status ?? ""} onValueChange={(v) => setPlanForm((f) => ({ ...f, status: v as SubStatus }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="trial">Trial</SelectItem>
                  <SelectItem value="active">Ativa</SelectItem>
                  <SelectItem value="past_due">Inadimplente</SelectItem>
                  <SelectItem value="canceled">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanUser(null)}>Cancelar</Button>
            <Button onClick={savePlan} disabled={savingPlan} className="bg-gradient-brand text-white">
              {savingPlan && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: Excluir */}
      <AlertDialog open={!!deleteUser} onOpenChange={(o) => { if (!o) { setDeleteUser(null); setDeleteConfirm(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir nutricionista</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação fará uma exclusão segura (soft delete) — os dados ficarão
              ocultos, mas não removidos imediatamente. Para confirmar, digite o
              e-mail <span className="font-semibold text-foreground">{deleteUser?.email}</span> abaixo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder="Digite o e-mail para confirmar"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmDelete(); }}
              disabled={deleting || deleteConfirm.trim().toLowerCase() !== (deleteUser?.email ?? "").toLowerCase()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Excluir definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal: Novo Nutricionista */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl font-normal">Nova nutricionista</DialogTitle>
            <DialogDescription>
              A conta será criada já confirmada. Use uma senha inicial e oriente
              a redefinir no primeiro acesso.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Nome completo</Label>
              <Input
                value={createForm.full_name}
                onChange={(e) => setCreateForm((f) => ({ ...f, full_name: e.target.value }))}
                placeholder="Maria Silva"
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="maria@exemplo.com"
                maxLength={255}
              />
            </div>
            <div className="space-y-2">
              <Label>CPF / Registro profissional (CRN)</Label>
              <Input
                value={createForm.professional_id}
                onChange={(e) => setCreateForm((f) => ({ ...f, professional_id: e.target.value }))}
                placeholder="Opcional"
                maxLength={50}
              />
            </div>
            <div className="space-y-2">
              <Label>Senha inicial</Label>
              <Input
                type="text"
                value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Mínimo de 8 caracteres"
                maxLength={72}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={createUser} disabled={creating} className="bg-gradient-brand text-white">
              {creating && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Criar nutricionista
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
