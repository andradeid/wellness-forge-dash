import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronRight, Search, Stethoscope, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nutricionistas</h1>
        <p className="text-sm text-muted-foreground">Todos os nutricionistas cadastrados e o status das assinaturas.</p>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">{rows.length} cadastrados</CardTitle>
          <div className="relative w-64 max-w-full">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Stethoscope className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum nutricionista encontrado.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Validade</TableHead>
                  <TableHead>Cadastro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.full_name || "—"}</TableCell>
                    <TableCell>{r.email}</TableCell>
                    <TableCell className="capitalize">{r.plan_type ?? "—"}</TableCell>
                    <TableCell><Badge variant={statusVariant(r.status)}>{statusLabel(r.status)}</Badge></TableCell>
                    <TableCell>{r.current_period_end ? new Date(r.current_period_end).toLocaleDateString("pt-BR") : "—"}</TableCell>
                    <TableCell>{new Date(r.created_at).toLocaleDateString("pt-BR")}</TableCell>
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
