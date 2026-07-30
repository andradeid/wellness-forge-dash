import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleDot, Search, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/app/curadoria/baseline")({
  component: BaselinePage,
});

/**
 * Item da baseline. Os campos técnicos (camada / comportamento_tecnico) só são
 * requisitados ao banco quando o usuário é super admin — assim o dado técnico
 * nem trafega para o cliente do curador.
 */
interface BaselineItem {
  id: string;
  area: string;
  funcionalidade: string;
  legivel: string;
  situacao_legivel: string;
  sort_order: number;
  camada?: string | null;
  comportamento_tecnico?: string | null;
}

const SITUACAO: Record<
  string,
  { label: string; icon: typeof CheckCircle2; className: string }
> = {
  ja_fazia: {
    label: "Já fazia na entrega",
    icon: CheckCircle2,
    className: "border-emerald-300 bg-emerald-50 text-emerald-800",
  },
  nao_fazia: {
    label: "Não fazia (novidade)",
    icon: Sparkles,
    className: "border-orange-300 bg-orange-50 text-orange-800",
  },
  em_parte: {
    label: "Fazia em parte",
    icon: CircleDot,
    className: "border-sky-300 bg-sky-50 text-sky-800",
  },
};

const CAMADA_LABELS: Record<string, string> = {
  dify: "Dify",
  lovable: "App",
  banco: "Banco",
};

const CURATOR_COLUMNS = "id, area, funcionalidade, legivel, situacao_legivel, sort_order";
const ADMIN_COLUMNS = `${CURATOR_COLUMNS}, camada, comportamento_tecnico`;

function BaselinePage() {
  const { role, loading } = useAuth();
  const isFull = role === "super_admin";
  const allowed = role === "curator" || isFull;

  const [search, setSearch] = useState("");
  const [area, setArea] = useState("todas");

  const query = useQuery({
    queryKey: ["baseline-items", isFull],
    enabled: allowed,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<BaselineItem[]> => {
      const { data, error } = await (supabase as any)
        .from("baseline_items")
        .select(isFull ? ADMIN_COLUMNS : CURATOR_COLUMNS)
        .eq("baseline_version", "1.0")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BaselineItem[];
    },
  });

  const items = query.data ?? [];

  const areas = useMemo(
    () => Array.from(new Set(items.map((i) => i.area))),
    [items],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (area !== "todas" && item.area !== area) return false;
      if (!term) return true;
      return (
        item.legivel.toLowerCase().includes(term) ||
        item.funcionalidade.toLowerCase().includes(term) ||
        item.area.toLowerCase().includes(term)
      );
    });
  }, [items, search, area]);

  const grouped = useMemo(() => {
    const map = new Map<string, BaselineItem[]>();
    for (const item of filtered) {
      const list = map.get(item.area) ?? [];
      list.push(item);
      map.set(item.area, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Carregando...</div>;
  }

  if (!allowed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Acesso restrito</CardTitle>
          <CardDescription>
            Esta área é exclusiva do time de curadoria.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Baseline da entrega</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Retrato do sistema na entrega (v1.0, 29/07/2026). Referência para saber se uma
          solicitação é ajuste (já existia) ou melhoria (novidade).
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por funcionalidade ou descrição..."
            className="pl-9"
          />
        </div>
        <Select value={area} onValueChange={setArea}>
          <SelectTrigger className="sm:w-64">
            <SelectValue placeholder="Todas as áreas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as áreas</SelectItem>
            {areas.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {query.isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando baseline...</div>
      ) : query.isError ? (
        <div className="text-sm text-destructive">
          Não foi possível carregar a baseline.
        </div>
      ) : grouped.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          Nenhum item encontrado com esses filtros.
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([areaName, list]) => (
            <Card key={areaName}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{areaName}</CardTitle>
                <CardDescription>
                  {list.length} {list.length === 1 ? "item" : "itens"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {list.map((item) => {
                  const situacao = SITUACAO[item.situacao_legivel];
                  const Icon = situacao?.icon ?? CircleDot;
                  return (
                    <div key={item.id} className="rounded-lg border bg-card p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-sm font-medium text-foreground">
                          {item.legivel}
                        </p>
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
                            situacao?.className,
                          )}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {situacao?.label ?? item.situacao_legivel}
                        </span>
                      </div>

                      {isFull && (
                        <div className="mt-2 space-y-1 border-t pt-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary">
                              {CAMADA_LABELS[item.camada ?? ""] ?? item.camada}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {item.funcionalidade}
                            </span>
                          </div>
                          {item.comportamento_tecnico && (
                            <p className="text-xs leading-relaxed text-muted-foreground">
                              {item.comportamento_tecnico}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
