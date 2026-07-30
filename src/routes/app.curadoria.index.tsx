import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  ImageIcon,
  Inbox,
  Loader2,
  Plus,
  Search,
  Sparkles,
  LifeBuoy,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  CurationRequestForm,
  CLASSIFICATION_LABELS,
  DIMENSION_LABELS,
  ATTACHMENT_BUCKET,
  type Classification,
  type Dimension,
} from "@/components/curadoria/CurationRequestForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/app/curadoria/")({
  component: CuradoriaPage,
});

const STATUS_LABELS: Record<string, string> = {
  registrado: "Registrado",
  em_analise: "Em análise",
  classificado: "Classificado",
  classificado_melhoria: "Classificado como melhoria",
  aprovado: "Aprovado",
  aprovado_ajuste: "Aprovado para ajuste",
  em_desenvolvimento: "Em desenvolvimento",
  concluido: "Concluído",
  rejeitado: "Rejeitado",
  arquivado: "Arquivado",
};

const OPEN_STATUSES = ["registrado", "em_analise", "classificado", "classificado_melhoria"];
const DONE_STATUSES = ["concluido", "aprovado", "aprovado_ajuste", "arquivado", "rejeitado"];

interface CurationRow {
  id: string;
  title: string;
  description: string | null;
  curator_classification: string | null;
  curator_dimension: string | null;
  status: string;
  created_at: string;
  updated_at: string | null;
  image_url: string | null;
  chat_id: string | null;
  message_id: string | null;
  patient_id: string | null;
  agent_key: string | null;
  /** Visão do curador: nunca inclui a direção técnica (exclusiva do super admin). */
  ai_classification: string | null;
  ai_justification: string | null;
  ai_status: string | null;
  curator_agreement: string | null;
  duplicate_of: string | null;
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function classificationLabel(value: string | null) {
  if (!value) return "—";
  return CLASSIFICATION_LABELS[value as Classification] ?? value;
}

function dimensionLabel(value: string | null) {
  if (!value) return "—";
  return DIMENSION_LABELS[value as Dimension] ?? value;
}

function useSignedAttachment(path: string | null | undefined) {
  return useQuery({
    queryKey: ["curation-attachment", path],
    enabled: !!path,
    staleTime: 4 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from(ATTACHMENT_BUCKET)
        .createSignedUrl(path!, 300);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

function AttachmentThumbnail({ path }: { path: string }) {
  const { data, isLoading } = useSignedAttachment(path);

  if (isLoading) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }

  if (!data) {
    return <ImageIcon className="h-4 w-4 text-muted-foreground" />;
  }

  return (
    <img
      src={data}
      alt="Miniatura da imagem anexada à solicitação"
      loading="lazy"
      className="h-10 w-10 shrink-0 rounded-md border object-cover"
    />
  );
}

function AttachmentPreview({ path }: { path: string }) {
  const { data, isLoading } = useSignedAttachment(path);

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) {
    return (
      <p className="text-sm text-muted-foreground">
        Não foi possível carregar a imagem anexada.
      </p>
    );
  }

  return (
    <a href={data} target="_blank" rel="noreferrer" title="Abrir imagem em nova aba">
      <img
        src={data}
        alt="Imagem anexada à solicitação"
        className="max-h-80 w-full rounded-md border object-contain transition-opacity hover:opacity-90"
      />
    </a>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Inbox;
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-semibold leading-none">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{label}</p>
          {hint ? <p className="truncate text-[11px] text-muted-foreground">{hint}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,120px)_minmax(0,1fr)] gap-2 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words">{value}</span>
    </div>
  );
}

function CuradoriaPage() {
  const { user, role, loading } = useAuth();
  const allowed = role === "curator" || role === "super_admin";

  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<CurationRow | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"todos" | "abertas" | "concluidas">("todos");

  const listQuery = useQuery({
    queryKey: ["curation-requests", "mine", user?.id],
    enabled: !!user?.id && allowed,
    queryFn: async (): Promise<CurationRow[]> => {
      const { data, error } = await (supabase as any)
        .from("curation_requests")
        .select(
          "id, title, description, curator_classification, curator_dimension, status, created_at, updated_at, image_url, chat_id, message_id, patient_id, agent_key, ai_classification, ai_justification, ai_status, curator_agreement, duplicate_of",
        )
        .eq("created_by", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CurationRow[];
    },
  });

  const rows = listQuery.data ?? [];

  const stats = useMemo(() => {
    const total = rows.length;
    const abertas = rows.filter((r) => OPEN_STATUSES.includes(r.status)).length;
    const concluidas = rows.filter((r) => DONE_STATUSES.includes(r.status)).length;
    const suporte = rows.filter((r) => r.curator_classification === "suporte").length;
    const melhoria = rows.filter((r) => r.curator_classification === "melhoria").length;
    const comImagem = rows.filter((r) => !!r.image_url).length;
    return { total, abertas, concluidas, suporte, melhoria, comImagem };
  }, [rows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter === "abertas" && !OPEN_STATUSES.includes(row.status)) return false;
      if (statusFilter === "concluidas" && !DONE_STATUSES.includes(row.status)) return false;
      if (!term) return true;
      return (
        row.title.toLowerCase().includes(term) ||
        (row.description ?? "").toLowerCase().includes(term)
      );
    });
  }, [rows, search, statusFilter]);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Carregando...</div>;
  }

  if (!allowed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Acesso restrito</CardTitle>
          <CardDescription>Esta área é exclusiva do time de curadoria.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Curadoria</h1>
          <p className="text-sm text-muted-foreground">
            Registre solicitações de suporte ou melhoria e acompanhe o andamento.
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)} className="shrink-0">
          <Plus className="mr-2 h-4 w-4" />
          Nova solicitação
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Inbox} label="Solicitações registradas" value={stats.total} />
        <StatCard icon={Clock} label="Em andamento" value={stats.abertas} />
        <StatCard icon={CheckCircle2} label="Finalizadas" value={stats.concluidas} />
        <StatCard
          icon={LifeBuoy}
          label="Suporte"
          value={stats.suporte}
          hint={`${stats.melhoria} de melhoria · ${stats.comImagem} com imagem`}
        />
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0">
              <CardTitle className="text-base">Minhas solicitações</CardTitle>
              <CardDescription>
                Clique em uma solicitação para ver todos os detalhes.
              </CardDescription>
            </div>
            <div className="flex shrink-0 gap-1 rounded-lg bg-muted p-1">
              {(
                [
                  ["todos", "Todas"],
                  ["abertas", "Em andamento"],
                  ["concluidas", "Finalizadas"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  className={
                    statusFilter === value
                      ? "rounded-md bg-background px-3 py-1 text-xs font-medium shadow-sm"
                      : "rounded-md px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por título ou descrição"
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {listQuery.isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando solicitações...</div>
          ) : listQuery.isError ? (
            <div className="text-sm text-destructive">
              Não foi possível carregar suas solicitações.
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {rows.length === 0
                ? "Você ainda não registrou nenhuma solicitação."
                : "Nenhuma solicitação encontrada com os filtros atuais."}
            </div>
          ) : (
            <ul className="divide-y rounded-lg border">
              {filtered.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(row)}
                    className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/60"
                  >
                    {row.image_url ? (
                      <AttachmentThumbnail path={row.image_url} />
                    ) : (
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border bg-muted/40">
                        <Sparkles className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {classificationLabel(row.curator_classification)} ·{" "}
                        {dimensionLabel(row.curator_dimension)} · {formatDate(row.created_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="secondary">
                        {STATUS_LABELS[row.status] ?? row.status}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova solicitação</DialogTitle>
            <DialogDescription>
              Descreva com clareza o que aconteceu ou o que pode melhorar.
            </DialogDescription>
          </DialogHeader>
          <CurationRequestForm
            idPrefix="curation-dialog"
            onSuccess={() => setFormOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Sheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle className="pr-6 text-left">{selected.title}</SheetTitle>
                <SheetDescription className="text-left">
                  Registrada em {formatDateTime(selected.created_at)}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {STATUS_LABELS[selected.status] ?? selected.status}
                  </Badge>
                  <Badge variant="outline">
                    {classificationLabel(selected.curator_classification)}
                  </Badge>
                  <Badge variant="outline">
                    {dimensionLabel(selected.curator_dimension)}
                  </Badge>
                </div>

                <Separator />

                <div>
                  <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                    Descrição
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {selected.description?.trim() || "Sem descrição."}
                  </p>
                </div>

                {selected.image_url ? (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">
                      Imagem anexada
                    </p>
                    <AttachmentPreview path={selected.image_url} />
                  </div>
                ) : null}

                <Separator />

                <div>
                  <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                    Análise automática
                  </p>
                  <DetailRow
                    label="Classificação"
                    value={
                      selected.ai_status === "done"
                        ? (AI_CLASSIFICATION_LABELS[selected.ai_classification ?? ""] ??
                          selected.ai_classification)
                        : "Em análise"
                    }
                  />
                  {selected.ai_justification ? (
                    <DetailRow label="Justificativa" value={selected.ai_justification} />
                  ) : null}
                  {selected.curator_agreement ? (
                    <DetailRow
                      label="Sua resposta"
                      value={
                        selected.curator_agreement === "concorda"
                          ? "Você concordou com a classificação"
                          : "Você registrou divergência"
                      }
                    />
                  ) : null}
                  {selected.duplicate_of ? (
                    <DetailRow
                      label="Duplicata"
                      value={`Vinculada à solicitação #${selected.duplicate_of.slice(0, 8)}`}
                    />
                  ) : null}
                </div>

                <Separator />


                <div>
                  <p className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                    Acompanhamento
                  </p>
                  <DetailRow
                    label="Situação"
                    value={STATUS_LABELS[selected.status] ?? selected.status}
                  />
                  <DetailRow label="Criada em" value={formatDateTime(selected.created_at)} />
                  {selected.updated_at ? (
                    <DetailRow
                      label="Atualizada em"
                      value={formatDateTime(selected.updated_at)}
                    />
                  ) : null}
                  {selected.chat_id ? (
                    <DetailRow label="Origem" value="Reportada a partir de uma conversa" />
                  ) : (
                    <DetailRow label="Origem" value="Solicitação avulsa" />
                  )}
                  {selected.agent_key ? (
                    <DetailRow label="Agente" value={selected.agent_key} />
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
