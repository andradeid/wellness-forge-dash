import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/app/admin/plans")({
  component: PlansAdminPage,
});

type Plan = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  price_monthly_cents: number;
  price_yearly_cents: number | null;
  monthly_credits: number;
  max_seats: number;
  is_active: boolean;
  sort_order: number;
};

const centsToBRL = (c: number | null | undefined) =>
  ((c ?? 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const parseBRLToCents = (v: string): number | null => {
  const cleaned = v.replace(/\s|R\$/gi, "").replace(/\./g, "").replace(",", ".");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 100);
};

function PlansAdminPage() {
  const { role } = useAuth();
  const [rows, setRows] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState<Record<string, Partial<Plan>>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("subscription_plans" as any)
      .select("*")
      .order("sort_order");
    if (error) toast.error(error.message);
    setRows(((data as unknown) as Plan[]) ?? []);
    setLoading(false);
  }

  function patch(id: string, p: Partial<Plan>) {
    setDirty((d) => ({ ...d, [id]: { ...d[id], ...p } }));
    setRows((r) => r.map((row) => (row.id === id ? { ...row, ...p } : row)));
  }

  async function save(id: string) {
    const change = dirty[id];
    if (!change) return;
    setSaving(id);
    const { error } = await supabase
      .from("subscription_plans" as any)
      .update(change)
      .eq("id", id);
    setSaving(null);
    if (error) return toast.error(error.message);
    setDirty((d) => {
      const n = { ...d };
      delete n[id];
      return n;
    });
    toast.success("Plano atualizado");
  }

  if (role && role !== "super_admin" && role !== "admin") {
    return <div className="p-12 text-center text-sm text-muted-foreground">Acesso restrito.</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Planos comerciais</CardTitle>
          <p className="text-sm text-muted-foreground">
            Defina o preço (BRL) e a quantidade de créditos mensais entregues por cada plano.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plano</TableHead>
                    <TableHead className="w-[160px]">Preço Mensal (R$)</TableHead>
                    <TableHead className="w-[160px]">Preço Anual (R$)</TableHead>
                    <TableHead className="w-[140px]">Créditos / mês</TableHead>
                    <TableHead className="w-[90px]">Ativo</TableHead>
                    <TableHead className="w-[110px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((p) => {
                    const isDirty = Boolean(dirty[p.id]);
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-muted-foreground">{p.slug}</div>
                          {p.description && (
                            <div className="text-xs text-muted-foreground mt-0.5">{p.description}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            inputMode="decimal"
                            defaultValue={centsToBRL(p.price_monthly_cents)}
                            onBlur={(e) => {
                              const cents = parseBRLToCents(e.target.value);
                              if (cents === null) return;
                              patch(p.id, { price_monthly_cents: cents });
                              e.target.value = centsToBRL(cents);
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            inputMode="decimal"
                            placeholder="—"
                            defaultValue={p.price_yearly_cents != null ? centsToBRL(p.price_yearly_cents) : ""}
                            onBlur={(e) => {
                              const raw = e.target.value.trim();
                              if (raw === "") {
                                patch(p.id, { price_yearly_cents: null });
                                return;
                              }
                              const cents = parseBRLToCents(raw);
                              if (cents === null) return;
                              patch(p.id, { price_yearly_cents: cents });
                              e.target.value = centsToBRL(cents);
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            value={p.monthly_credits}
                            onChange={(e) =>
                              patch(p.id, { monthly_credits: Math.max(0, Number(e.target.value) || 0) })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={p.is_active}
                            onCheckedChange={(v) => patch(p.id, { is_active: v })}
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            disabled={!isDirty || saving === p.id}
                            onClick={() => save(p.id)}
                          >
                            {saving === p.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Save className="h-4 w-4 mr-1" /> Salvar
                              </>
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
