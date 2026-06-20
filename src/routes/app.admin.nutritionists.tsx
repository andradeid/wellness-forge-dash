import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronRight, Search, Stethoscope, Users, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
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
}

function statusVariant(status: string | null): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active": return "default";
    case "trial": return "secondary";
    case "past_due": return "destructive";
    case "canceled": return "outline";
    default: return "outline";
  }
}

function statusLabel(status: string | null) {
  return ({ active: "Ativa", trial: "Trial", past_due: "Atrasada", canceled: "Cancelada" } as Record<string, string>)[status ?? ""] ?? "—";
}

function NutritionistsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      // 1. nutri ids
      const { data: roleRows, error: rErr } = await (supabase as any)
        .from("user_roles")
        .select("user_id")
        .eq("role", "nutri");
      if (rErr) { toast.error(rErr.message); setLoading(false); return; }
      const ids = (roleRows ?? []).map((r: any) => r.user_id);
      if (ids.length === 0) { setRows([]); setLoading(false); return; }

      const [profilesRes, subsRes] = await Promise.all([
        (supabase as any).from("profiles").select("id, full_name, email, created_at").in("id", ids),
        (supabase as any).from("subscriptions").select("user_id, status, plan_type, current_period_end").in("user_id", ids),
      ]);
      if (profilesRes.error) toast.error(profilesRes.error.message);
      if (subsRes.error) toast.error(subsRes.error.message);

      const subMap = new Map<string, any>();
      (subsRes.data ?? []).forEach((s: any) => subMap.set(s.user_id, s));

      const merged: Row[] = (profilesRes.data ?? []).map((p: any) => ({
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        created_at: p.created_at,
        status: subMap.get(p.id)?.status ?? null,
        plan_type: subMap.get(p.id)?.plan_type ?? null,
        current_period_end: subMap.get(p.id)?.current_period_end ?? null,
      }));

      setRows(merged);
      setLoading(false);
    })();
  }, []);

  const filtered = rows.filter((r) =>
    (r.full_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    r.email.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = rows.filter((r) => r.status === "active").length;
  const trialCount = rows.filter((r) => r.status === "trial").length;

  return (
    <div className="space-y-10 max-w-6xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
        <span>Acesso</span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground/80">Nutricionistas</span>
      </div>

      {/* Hero */}
      <div className="space-y-4">
        <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
          Painel administrativo
        </p>
        <h1 className="font-serif text-5xl md:text-6xl font-normal leading-[1.05] tracking-tight text-foreground">
          Gerencie os{" "}
          <span className="italic text-gradient-brand">nutricionistas</span>
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground leading-relaxed">
          Acompanhe quem está utilizando a Lumma, o status de cada assinatura e
          mantenha o controle dos acessos profissionais — tudo num só lugar,
          calmo e organizado.
        </p>
      </div>

      {/* Stat tiles */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Cadastrados", value: rows.length, icon: Users },
          { label: "Assinaturas ativas", value: activeCount, icon: Stethoscope },
          { label: "Em período trial", value: trialCount, icon: Stethoscope },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border bg-card p-5 shadow-sm flex items-center gap-4"
          >
            <div className="h-10 w-10 rounded-xl bg-accent/60 flex items-center justify-center">
              <s.icon className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {s.label}
              </p>
              <p className="text-2xl font-semibold text-foreground">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Lista */}
      <Card className="rounded-2xl border bg-card shadow-sm">
        <CardHeader className="flex-row items-center justify-between gap-4 border-b">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Acesso
            </p>
            <CardTitle className="text-lg font-serif font-normal mt-1">
              Lista de nutricionistas
            </CardTitle>
          </div>
          <div className="relative w-64 max-w-full">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-xl"
            />
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <div className="h-12 w-12 mx-auto rounded-2xl bg-accent/60 flex items-center justify-center mb-4">
                <Stethoscope className="h-6 w-6 text-accent-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Nenhum nutricionista encontrado.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Nome</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Email</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Plano</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Status</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Validade</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Cadastro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
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
                    <TableCell><Badge variant={statusVariant(r.status)} className="rounded-full">{statusLabel(r.status)}</Badge></TableCell>
                    <TableCell>{r.current_period_end ? new Date(r.current_period_end).toLocaleDateString("pt-BR") : "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(r.created_at).toLocaleDateString("pt-BR")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
