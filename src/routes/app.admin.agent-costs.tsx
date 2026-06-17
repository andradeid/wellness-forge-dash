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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/app/admin/agent-costs")({
  component: AgentCostsPage,
});

type Row = {
  id: string;
  agent_key: string;
  display_name: string;
  cost_credits: number;
  is_active: boolean;
};

function AgentCostsPage() {
  const { role } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState<Record<string, Partial<Row>>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("agent_costs" as any)
      .select("id, agent_key, display_name, cost_credits, is_active")
      .order("display_name");
    if (error) toast.error(error.message);
    setRows((data as Row[]) ?? []);
    setLoading(false);
  }

  function patch(id: string, p: Partial<Row>) {
    setDirty((d) => ({ ...d, [id]: { ...d[id], ...p } }));
    setRows((r) => r.map((row) => (row.id === id ? { ...row, ...p } : row)));
  }

  async function save(id: string) {
    const change = dirty[id];
    if (!change) return;
    setSaving(id);
    const { error } = await supabase
      .from("agent_costs" as any)
      .update(change)
      .eq("id", id);
    setSaving(null);
    if (error) return toast.error(error.message);
    setDirty((d) => {
      const n = { ...d };
      delete n[id];
      return n;
    });
    toast.success("Salvo");
  }

  if (role && role !== "super_admin" && role !== "admin") {
    return <div className="p-12 text-center text-sm text-muted-foreground">Acesso restrito.</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Valores dos Agentes</CardTitle>
          <p className="text-sm text-muted-foreground">
            Defina quantos créditos cada agente consome por interação.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agente</TableHead>
                  <TableHead>Chave</TableHead>
                  <TableHead className="w-40">Custo (créditos)</TableHead>
                  <TableHead className="w-32">Ativo</TableHead>
                  <TableHead className="w-32 text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const isDirty = !!dirty[r.id];
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.display_name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-xs">
                          {r.agent_key}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          value={r.cost_credits}
                          onChange={(e) =>
                            patch(r.id, { cost_credits: Math.max(0, Number(e.target.value) || 0) })
                          }
                          className="w-24"
                        />
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={r.is_active}
                          onCheckedChange={(v) => patch(r.id, { is_active: v })}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          disabled={!isDirty || saving === r.id}
                          onClick={() => save(r.id)}
                        >
                          {saving === r.id ? (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
