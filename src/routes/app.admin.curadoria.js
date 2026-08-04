import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from "@/components/ui/table";
import { CurationDetailDrawer, STATUS_LABEL, STATUS_ORDER, } from "@/components/admin/CurationDetailDrawer";
import { CLASSIFICATION_LABELS, DIMENSION_LABELS, } from "@/components/curadoria/CurationRequestForm";
export const Route = createFileRoute("/app/admin/curadoria")({
    component: CuradoriaAdminPage,
    head: () => ({
        meta: [
            { title: "Curadoria de Feedback | LUMMA" },
            {
                name: "description",
                content: "Painel interno de curadoria de feedback clínico da Lumma: gerencie as solicitações registradas pelo time de curadoria.",
            },
            { property: "og:title", content: "Curadoria de Feedback | LUMMA" },
            {
                property: "og:description",
                content: "Painel interno de curadoria de feedback clínico da Lumma: gerencie as solicitações registradas pelo time de curadoria.",
            },
            { property: "og:type", content: "website" },
            { name: "twitter:card", content: "summary" },
        ],
    }),
});
const ALL = "__all__";
function formatDateBR(iso) {
    try {
        return new Date(iso).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }
    catch {
        return "—";
    }
}
function CuradoriaAdminPage() {
    const { role, loading: authLoading } = useAuth();
    const isSuperAdmin = role === "super_admin";
    const [statusFilter, setStatusFilter] = useState(ALL);
    const [classificationFilter, setClassificationFilter] = useState(ALL);
    const [curatorFilter, setCuratorFilter] = useState(ALL);
    const [selectedId, setSelectedId] = useState(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const { data, isLoading, error } = useQuery({
        queryKey: ["curation-requests-admin"],
        enabled: isSuperAdmin,
        staleTime: 30000,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("curation_requests")
                .select("id, numero_sequencial, created_at, title, description, status, agent_key, chat_id, message_id, patient_id, created_by, curator_classification, curator_dimension, image_url, ai_classification, ai_confidence, ai_justification, ai_technical_direction, ai_status, ai_confidence_label, ai_functionality, ai_baseline_item, ai_error, duplicate_of, curator_agreement, admin_final_classification, admin_notes")
                .order("created_at", { ascending: false })
                .limit(500);
            if (error)
                throw error;
            return (data ?? []);
        },
    });
    const curatorIds = useMemo(() => Array.from(new Set((data ?? []).map((row) => row.created_by))), [data]);
    const { data: curators } = useQuery({
        queryKey: ["curation-curators", curatorIds],
        enabled: isSuperAdmin && curatorIds.length > 0,
        staleTime: 5 * 60 * 1000,
        queryFn: async () => {
            const { data, error } = await supabase
                .from("profiles")
                .select("id, full_name, email")
                .in("id", curatorIds);
            if (error)
                return {};
            const map = {};
            for (const p of data ?? []) {
                map[p.id] = p.full_name || p.email || p.id.slice(0, 8);
            }
            return map;
        },
    });
    const nameOf = (id) => curators?.[id] ?? `${id.slice(0, 8)}…`;
    const counters = useMemo(() => {
        const rows = data ?? [];
        const byStatus = {};
        for (const key of STATUS_ORDER)
            byStatus[key] = 0;
        let suporte = 0;
        let melhoria = 0;
        let aiPending = 0;
        for (const row of rows) {
            byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
            if (row.curator_classification === "suporte")
                suporte += 1;
            if (row.curator_classification === "melhoria")
                melhoria += 1;
            if (!row.ai_classification)
                aiPending += 1;
        }
        return { total: rows.length, byStatus, suporte, melhoria, aiPending };
    }, [data]);
    const filtered = useMemo(() => {
        return (data ?? []).filter((row) => {
            if (statusFilter !== ALL && row.status !== statusFilter)
                return false;
            if (classificationFilter !== ALL && row.curator_classification !== classificationFilter)
                return false;
            if (curatorFilter !== ALL && row.created_by !== curatorFilter)
                return false;
            return true;
        });
    }, [data, statusFilter, classificationFilter, curatorFilter]);
    const selected = useMemo(() => (data ?? []).find((row) => row.id === selectedId) ?? null, [data, selectedId]);
    if (authLoading) {
        return <Skeleton className="h-64 w-full rounded-lg"/>;
    }
    if (!isSuperAdmin) {
        return (<Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Acesso restrito</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Esta área é exclusiva do super administrador.
        </CardContent>
      </Card>);
    }
    return (<div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-gradient-to-br from-[#e8a04c] to-[#e89bcf] p-2 text-white">
          <ClipboardList className="h-5 w-5"/>
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
            {STATUS_ORDER.map((key) => (<Badge key={key} variant="secondary">
                {STATUS_LABEL[key]}: {counters.byStatus[key] ?? 0}
              </Badge>))}
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
              <Badge variant="secondary">Suporte: {counters.suporte}</Badge>
              <Badge variant="secondary">Melhoria: {counters.melhoria}</Badge>
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
          <CardTitle className="text-base">Solicitações ({filtered.length})</CardTitle>
          <div className="grid gap-3 md:grid-cols-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Situação"/>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas as situações</SelectItem>
                {STATUS_ORDER.map((key) => (<SelectItem key={key} value={key}>
                    {STATUS_LABEL[key]}
                  </SelectItem>))}
              </SelectContent>
            </Select>

            <Select value={classificationFilter} onValueChange={setClassificationFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Classificação"/>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todas as classificações</SelectItem>
                <SelectItem value="suporte">Suporte</SelectItem>
                <SelectItem value="melhoria">Melhoria</SelectItem>
              </SelectContent>
            </Select>

            <Select value={curatorFilter} onValueChange={setCuratorFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Curador"/>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Todos os curadores</SelectItem>
                {curatorIds.map((id) => (<SelectItem key={id} value={id}>
                    {nameOf(id)}
                  </SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (<div className="space-y-2">
              <Skeleton className="h-10 w-full"/>
              <Skeleton className="h-10 w-full"/>
              <Skeleton className="h-10 w-full"/>
            </div>) : error ? (<p className="text-sm text-destructive">
              Não foi possível carregar as solicitações. Tente novamente em instantes.
            </p>) : filtered.length === 0 ? (<p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma solicitação encontrada com os filtros atuais.
            </p>) : (<Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Nº</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Curador</TableHead>
                  <TableHead>Classificação</TableHead>
                  <TableHead>Dimensão</TableHead>
                  <TableHead>Origem</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Criada em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (<TableRow key={row.id} className="cursor-pointer" onClick={() => {
                    setSelectedId(row.id);
                    setDrawerOpen(true);
                }}>
                    <TableCell className="font-mono text-muted-foreground">
                      #{row.numero_sequencial}
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate font-medium">
                      {row.title}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {nameOf(row.created_by)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.curator_classification
                    ? (CLASSIFICATION_LABELS[row.curator_classification] ?? row.curator_classification)
                    : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.curator_dimension
                    ? (DIMENSION_LABELS[row.curator_dimension] ??
                        row.curator_dimension)
                    : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.chat_id ? "Chat" : "Avulso"}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {STATUS_LABEL[row.status] ?? row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDateBR(row.created_at)}
                    </TableCell>
                  </TableRow>))}
              </TableBody>
            </Table>)}
        </CardContent>
      </Card>

      <CurationDetailDrawer request={selected} curatorName={selected ? nameOf(selected.created_by) : ""} open={drawerOpen} onOpenChange={(open) => {
            setDrawerOpen(open);
            if (!open)
                setSelectedId(null);
        }}/>
    </div>);
}
