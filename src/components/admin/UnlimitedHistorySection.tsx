import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface ChangeRow {
  id: string;
  user_id: string;
  old_value: boolean | null;
  new_value: boolean;
  changed_by: string | null;
  source: string;
  reason: string | null;
  subscription_status: string | null;
  created_at: string;
}

interface ProfileLite {
  id: string;
  email: string;
  full_name: string | null;
}

/** Histórico imutável de toda mudança no crédito ilimitado (somente super admin via RLS). */
export function UnlimitedHistorySection() {
  const [q, setQ] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["unlimited-change-log"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: rows, error: e1 } = await (supabase as any)
        .from("unlimited_change_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (e1) throw e1;
      const list = (rows ?? []) as ChangeRow[];
      const ids = Array.from(new Set(list.flatMap((r) => [r.user_id, r.changed_by].filter(Boolean) as string[])));
      let profiles: ProfileLite[] = [];
      if (ids.length) {
        const { data: p, error: e2 } = await supabase.from("profiles").select("id, email, full_name").in("id", ids);
        if (e2) throw e2;
        profiles = (p ?? []) as ProfileLite[];
      }
      return { list, byId: new Map(profiles.map((p) => [p.id, p])) };
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    if (!term) return data.list;
    return data.list.filter((r) => {
      const p = data.byId.get(r.user_id);
      return [p?.email, p?.full_name, r.source, r.reason].some((v) => v?.toLowerCase().includes(term));
    });
  }, [data, q]);

  return (
    <Card className="rounded-lg">
      <CardHeader className="space-y-3">
        <CardTitle className="text-base">Mudanças no ilimitado</CardTitle>
        <p className="text-xs text-muted-foreground">
          Toda vez que o crédito ilimitado liga ou desliga, venha do painel, da importação, de uma compra, da rotina ou do banco.
        </p>
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por e-mail, nome, origem ou motivo"
            className="pl-8"
            aria-label="Buscar no histórico"
          />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico...
          </div>
        ) : error ? (
          <p className="py-8 text-sm text-destructive">Não foi possível carregar o histórico.</p>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-sm text-muted-foreground">Nenhuma mudança registrada ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3">Data</th>
                  <th className="py-2 pr-3">Conta</th>
                  <th className="py-2 pr-3">Mudança</th>
                  <th className="py-2 pr-3">Origem</th>
                  <th className="py-2 pr-3">Quem</th>
                  <th className="py-2">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const p = data!.byId.get(r.user_id);
                  const by = r.changed_by ? data!.byId.get(r.changed_by) : null;
                  return (
                    <tr key={r.id} className="border-b border-border/60 align-top">
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      <td className="py-2 pr-3">
                        <div className="text-foreground">{p?.full_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{p?.email ?? r.user_id}</div>
                      </td>
                      <td className="py-2 pr-3">
                        <Badge variant={r.new_value ? "default" : "secondary"}>
                          {r.new_value ? "Ligado" : "Desligado"}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">{r.source}</td>
                      <td className="py-2 pr-3 text-xs">{by?.email ?? (r.changed_by ? r.changed_by : "Automático / sistema")}</td>
                      <td className="py-2 text-xs text-muted-foreground">{r.reason ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
