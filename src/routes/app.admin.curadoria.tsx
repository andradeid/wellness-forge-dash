import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CurationDetailDrawer,
  STATUS_LABEL,
  STATUS_ORDER,
  type CurationAdminRow,
  type CurationStatus,
} from "@/components/admin/CurationDetailDrawer";
import {
  CLASSIFICATION_LABELS,
  DIMENSION_LABELS,
  type Classification,
  type Dimension,
} from "@/components/curadoria/CurationRequestForm";
import {
  CAMADA_BADGE_CLASS,
  CAMADA_ORDER,
  camadaLabel,
  classificationStripeClass,
  decisionFlag,
  finalClassificationOf,
  parseCamada,
} from "@/lib/curation-camada";

export const Route = createFileRoute("/app/admin/curadoria")({
  component: CuradoriaAdminPage,
  head: () => ({
    meta: [
      { title: "Curadoria de Feedback | LUMMA" },
      {
        name: "description",
        content:
          "Painel interno de curadoria de feedback clínico da Lumma: gerencie as solicitações registradas pelo time de curadoria.",
      },
      { property: "og:title", content: "Curadoria de Feedback | LUMMA" },
      {
        property: "og:description",
        content:
          "Painel interno de curadoria de feedback clínico da Lumma: gerencie as solicitações registradas pelo time de curadoria.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const ALL = "__all__";

function formatDateBR(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function CuradoriaAdminPage() {
  const { role, loading: authLoading } = useAuth();
  const isSuperAdmin = role === "super_admin";

  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [classificationFilter, setClassificationFilter] = useState<string>(ALL);
  const [curatorFilter, setCuratorFilter] = useState<string>(ALL);
  const [camadaFilter, setCamadaFilter] = useState<string>(ALL);
  const [grupoFilter, setGrupoFilter] = useState<string>(ALL);
  const [onlyDecision, setOnlyDecision] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["curation-requests-admin"],
    enabled: isSuperAdmin,
    staleTime: 30_000,
    queryFn: async (): Promise<CurationAdminRow[]> => {
      const { data, error } = await (supabase as any)
        .from("curation_requests")
        .select(
          "id, numero_sequencial, created_at, title, description, status, agent_key, chat_id, message_id, patient_id, created_by, curator_classification, curator_dimension, image_url, ai_classification, ai_confidence, ai_justification, ai_technical_direction, ai_status, ai_confidence_label, ai_functionality, ai_baseline_item, ai_error, duplicate_of, curator_agreement, admin_final_classification, admin_notes, attachment_mime_type, grupo_tematico",
        )
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as CurationAdminRow[];
    },
  });

  const curatorIds = useMemo(
    () => Array.from(new Set((data ?? []).map((row) => row.created_by))),
    [data],
  );

  const { data: curators } = useQuery({
    queryKey: ["curation-curators", curatorIds],
    enabled: isSuperAdmin && curatorIds.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", curatorIds);
      if (error) return {};
      const map: Record<string, string> = {};
      for (const p of data ?? []) {
        map[p.id] = p.full_name || p.email || p.id.slice(0, 8);
      }
      return map;
    },
  });

  const nameOf = (id: string) => curators?.[id] ?? `${id.slice(0, 8)}…`;

  const counters = useMemo(() => {
    const rows = data ?? [];
    const byStatus: Record<string, number> = {};
    for (const key of STATUS_ORDER) byStatus[key] = 0;
    let suporte = 0;
    let melhoria = 0;
    let aiPending = 0;
    for (const row of rows) {
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
      if (row.curator_classification === "suporte") suporte += 1;
      if (row.curator_classification === "melhoria") melhoria += 1;
      if (!row.ai_classification) aiPending += 1;
    }
    return { total: rows.length, byStatus, suporte, melhoria, aiPending };
  }, [data]);

  /** Contagem de reports por grupo temático (para o badge e o filtro). */
  const grupoCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      const grupo = row.grupo_tematico?.trim();
      if (!grupo) continue;
      counts[grupo] = (counts[grupo] ?? 0) + 1;
    }
    return counts;
  }, [data]);

  const grupoOptions = useMemo(
    () => Object.keys(grupoCounts).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [grupoCounts],
  );

  const decisionCount = useMemo(
    () => (data ?? []).filter((row) => decisionFlag(row).needsDecision).length,
    [data],
  );

  const filtered = useMemo(() => {
    return (data ?? []).filter((row) => {
      if (statusFilter !== ALL && row.status !== statusFilter) return false;
      if (classificationFilter !== ALL && row.curator_classification !== classificationFilter)
        return false;
      if (curatorFilter !== ALL && row.created_by !== curatorFilter) return false;
      if (camadaFilter !== ALL && (parseCamada(row.ai_technical_direction) ?? "") !== camadaFilter)
        return false;
      if (grupoFilter !== ALL && (row.grupo_tematico?.trim() ?? "") !== grupoFilter) return false;
      if (onlyDecision && !decisionFlag(row).needsDecision) return false;
      return true;
    });
  }, [data, statusFilter, classificationFilter, curatorFilter, camadaFilter, grupoFilter, onlyDecision]);

  const selected = useMemo(
    () => (data ?? []).find((row) => row.id === selectedId) ?? null,
    [data, selectedId],
  );

  if (authLoading) {
    return <Skeleton className="h-64 w-full rounded-lg" />;
  }

  if (!isSuperAdmin) {
    return (
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Acesso restrito</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Esta área é exclusiva do super administrador.
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-gradient-to-br from-[#e8a04c] to-[#e89bcf] p-2 text-white">
            <ClipboardList className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">Curadoria de Feedback</h1>
            <p className="text-sm text-muted-foreground">
              Gestão das solicitações registradas pelo time de curadoria.
            </p>
          </div>
        </div>

        {/* Contadores */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="rounded-lg shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Total</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{counters.total}</p>
            </CardContent>
          </Card>

          <Card className="rounded-lg shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">Por situação</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {STATUS_ORDER.map((key) => (
                <button key={key} type="button" onClick={() => setStatusFilter(key)}>
                  <Badge
                    variant={statusFilter === key ? "default" : "secondary"}
                    className="cursor-pointer"
                  >
                    {STATUS_LABEL[key]}: {counters.byStatus[key] ?? 0}
                  </Badge>
                </button>
              ))}
              {statusFilter !== ALL && (
                <button type="button" onClick={() => setStatusFilter(ALL)}>
                  <Badge variant="outline" className="cursor-pointer">
                    Limpar
                  </Badge>
                </button>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-lg shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground">
                Classificação do curador
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setClassificationFilter("suporte")}>
                  <Badge
                    variant={classificationFilter === "suporte" ? "default" : "secondary"}
                    className="cursor-pointer"
                  >
                    Suporte: {counters.suporte}
                  </Badge>
                </button>
                <button type="button" onClick={() => setClassificationFilter("melhoria")}>
                  <Badge
                    variant={classificationFilter === "melhoria" ? "default" : "secondary"}
                    className="cursor-pointer"
                  >
                    Melhoria: {counters.melhoria}
                  </Badge>
                </button>
                {classificationFilter !== ALL && (
                  <button type="button" onClick={() => setClassificationFilter(ALL)}>
                    <Badge variant="outline" className="cursor-pointer">
                      Limpar
                    </Badge>
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Classificação da IA: {counters.aiPending} aguardando análise
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Lista + filtros */}
        <Card className="rounded-lg shadow-md">
          <CardHeader className="gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-base">Solicitações ({filtered.length})</CardTitle>
              <Button
                type="button"
                size="sm"
                variant={onlyDecision ? "default" : "outline"}
                onClick={() => setOnlyDecision((value) => !value)}
              >
                <AlertTriangle className="h-4 w-4" />
                Requer minha decisão ({decisionCount})
              </Button>
            </div>
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Situação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas as situações</SelectItem>
                  {STATUS_ORDER.map((key) => (
                    <SelectItem key={key} value={key}>
                      {STATUS_LABEL[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={classificationFilter} onValueChange={setClassificationFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Classificação" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas as classificações</SelectItem>
                  <SelectItem value="suporte">Suporte</SelectItem>
                  <SelectItem value="melhoria">Melhoria</SelectItem>
                </SelectContent>
              </Select>

              <Select value={camadaFilter} onValueChange={setCamadaFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Camada" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todas as camadas</SelectItem>
                  {CAMADA_ORDER.map((key) => (
                    <SelectItem key={key} value={key}>
                      {camadaLabel(key)}
                    </SelectItem>
                  ))}
                  <SelectItem value="">Sem camada definida</SelectItem>
                </SelectContent>
              </Select>

              <Select value={grupoFilter} onValueChange={setGrupoFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Grupo temático" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos os grupos</SelectItem>
                  {grupoOptions.map((grupo) => (
                    <SelectItem key={grupo} value={grupo}>
                      {grupo} ({grupoCounts[grupo]})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={curatorFilter} onValueChange={setCuratorFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Curador" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos os curadores</SelectItem>
                  {curatorIds.map((id) => (
                    <SelectItem key={id} value={id}>
                      {nameOf(id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : error ? (
              <p className="text-sm text-destructive">
                Não foi possível carregar as solicitações. Tente novamente em instantes.
              </p>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma solicitação encontrada com os filtros atuais.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Nº</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead>Curador</TableHead>
                    <TableHead>Classificação</TableHead>
                    <TableHead>Camada</TableHead>
                    <TableHead>Dimensão</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Criada em</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => {
                    const camada = parseCamada(row.ai_technical_direction);
                    const decision = decisionFlag(row);
                    const grupo = row.grupo_tematico?.trim() || null;
                    const grupoCount = grupo ? (grupoCounts[grupo] ?? 0) : 0;

                    return (
                      <TableRow
                        key={row.id}
                        className={cn(
                          "cursor-pointer",
                          classificationStripeClass(finalClassificationOf(row)),
                        )}
                        onClick={() => {
                          setSelectedId(row.id);
                          setDrawerOpen(true);
                        }}
                      >
                        <TableCell className="font-mono text-muted-foreground">
                          #{row.numero_sequencial}
                        </TableCell>
                        <TableCell className="max-w-[280px]">
                          <div className="flex items-start gap-2">
                            {decision.needsDecision && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="mt-0.5 shrink-0 text-amber-600">
                                    <AlertTriangle className="h-4 w-4" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs">
                                  {decision.reason}
                                </TooltipContent>
                              </Tooltip>
                            )}
                            <div className="min-w-0">
                              <p className="truncate font-medium">{row.title}</p>
                              {grupo && grupoCount > 1 && (
                                <Badge
                                  variant="outline"
                                  className="mt-1 text-[10px] font-normal text-muted-foreground"
                                >
                                  {grupo} ({grupoCount})
                                </Badge>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {nameOf(row.created_by)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.curator_classification
                            ? (CLASSIFICATION_LABELS[
                                row.curator_classification as Classification
                              ] ?? row.curator_classification)
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {camada ? (
                            <Badge
                              variant="outline"
                              className={cn("font-normal", CAMADA_BADGE_CLASS[camada])}
                            >
                              {camadaLabel(camada)}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.curator_dimension
                            ? (DIMENSION_LABELS[row.curator_dimension as Dimension] ??
                              row.curator_dimension)
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{row.chat_id ? "Chat" : "Avulso"}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {STATUS_LABEL[row.status as CurationStatus] ?? row.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDateBR(row.created_at)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <CurationDetailDrawer
          request={selected}
          curatorName={selected ? nameOf(selected.created_by) : ""}
          open={drawerOpen}
          onOpenChange={(open) => {
            setDrawerOpen(open);
            if (!open) setSelectedId(null);
          }}
        />
      </div>
    </TooltipProvider>
  );
}
