import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Mail,
  Plus,
  Play,
  Pause,
  Trash2,
  Eye,
  Send,
  RefreshCw,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import {
  listCampaigns,
  getCampaign,
  createCampaign,
  setCampaignStatus,
  deleteCampaign,
  processCampaignBatch,
  previewCampaignSegment,
  listUserTags,
} from "@/lib/email-campaigns.functions";
import { listEmailTemplates } from "@/lib/email-templates.functions";
import { useAuth } from "@/hooks/useAuth";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/app/admin/emails/campanhas")({
  component: CampanhasPage,
});

type Campaign = {
  id: string;
  name: string;
  subject: string;
  html: string;
  from_name: string;
  from_email: string;
  segment: any;
  include_recovery_link: boolean;
  status: "draft" | "ready" | "sending" | "paused" | "done" | "failed";
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

function statusColor(s: Campaign["status"]) {
  return s === "done"
    ? "bg-emerald-100 text-emerald-800"
    : s === "sending"
      ? "bg-blue-100 text-blue-800"
      : s === "paused"
        ? "bg-amber-100 text-amber-800"
        : s === "failed"
          ? "bg-red-100 text-red-800"
          : "bg-slate-100 text-slate-700";
}

function statusLabel(s: Campaign["status"]) {
  return {
    draft: "Rascunho",
    ready: "Pronta",
    sending: "Enviando",
    paused: "Pausada",
    done: "Concluída",
    failed: "Falhou",
  }[s];
}

function CampanhasPage() {
  const { role, loading: authLoading } = useAuth();
  const isSuper = role === "super_admin";

  const list = useServerFn(listCampaigns);
  const qc = useQueryClient();

  const [openCreate, setOpenCreate] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["email-campaigns"],
    queryFn: () => list(),
    enabled: isSuper,
    refetchInterval: 5000,
  });

  if (authLoading)
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );

  if (!isSuper)
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acesso restrito a super administradores.
      </div>
    );

  const campaigns = ((q.data ?? []) as unknown) as Campaign[];

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#e8a04c] to-[#e89bcf] text-white">
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Campanhas de e-mail</h1>
            <p className="text-sm text-muted-foreground">
              Disparos segmentados via Resend. Ideal para boas-vindas, avisos e novidades.
            </p>
          </div>
        </div>
        <Button
          onClick={() => setOpenCreate(true)}
          className="bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4 mr-2" />
          Nova campanha
        </Button>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Últimas campanhas</CardTitle>
        </CardHeader>
        <CardContent>
          {q.isLoading ? (
            <div className="p-6 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : campaigns.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhuma campanha ainda. Clique em <strong>Nova campanha</strong> para começar.
            </p>
          ) : (
            <div className="space-y-2">
              {campaigns.map((c) => {
                const pct = c.total > 0 ? Math.round(((c.sent + c.failed) / c.total) * 100) : 0;
                return (
                  <button
                    key={c.id}
                    onClick={() => setOpenId(c.id)}
                    className="w-full text-left rounded-lg border p-3 hover:bg-muted transition"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{c.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{c.subject}</div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {c.sent}/{c.total}
                          {c.failed > 0 && (
                            <span className="text-red-600 ml-1">· {c.failed} falhas</span>
                          )}
                        </span>
                        <Badge className={statusColor(c.status)} variant="secondary">
                          {statusLabel(c.status)}
                        </Badge>
                      </div>
                    </div>
                    {(c.status === "sending" || c.status === "paused") && (
                      <Progress value={pct} className="h-1.5 mt-2" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {openCreate && (
        <CreateCampaignDialog
          onClose={() => setOpenCreate(false)}
          onCreated={(id) => {
            setOpenCreate(false);
            qc.invalidateQueries({ queryKey: ["email-campaigns"] });
            setOpenId(id);
          }}
        />
      )}

      {openId && <CampaignDetailDialog id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

// -------------------- CREATE --------------------
function CreateCampaignDialog(props: { onClose: () => void; onCreated: (id: string) => void }) {
  const listTpl = useServerFn(listEmailTemplates);
  const listTags = useServerFn(listUserTags);
  const preview = useServerFn(previewCampaignSegment);
  const create = useServerFn(createCampaign);

  const tpls = useQuery({ queryKey: ["email-templates"], queryFn: () => listTpl() });
  const tags = useQuery({ queryKey: ["user-tags"], queryFn: () => listTags() });

  const [name, setName] = useState("");
  const [fromName, setFromName] = useState("Lumma");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [includeRecoveryLink, setIncludeRecoveryLink] = useState(true);
  const [segmentType, setSegmentType] = useState<"all_active" | "unlimited" | "tags" | "emails">(
    "unlimited",
  );
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [emailsText, setEmailsText] = useState("");
  const [previewInfo, setPreviewInfo] = useState<{ total: number; sample: any[] } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const templates = ((tpls.data ?? []) as any[]).filter((t: any) => t.category === "transactional");
  const tagList = ((tags.data ?? []) as any[]) as Array<{ id: string; label: string; color: string | null }>;

  const buildSegment = () => {
    if (segmentType === "tags") {
      return { type: "tags" as const, tag_ids: selectedTags };
    }
    if (segmentType === "emails") {
      const emails = emailsText
        .split(/[\s,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
      return { type: "emails" as const, emails };
    }
    return { type: segmentType } as any;
  };

  const runPreview = async () => {
    try {
      setLoadingPreview(true);
      const seg = buildSegment();
      if (seg.type === "tags" && seg.tag_ids.length === 0) {
        toast.error("Selecione pelo menos uma etiqueta");
        return;
      }
      if (seg.type === "emails" && seg.emails.length === 0) {
        toast.error("Cole ao menos 1 e-mail válido");
        return;
      }
      const r = await preview({ data: { segment: seg } });
      setPreviewInfo(r as any);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao pré-visualizar");
    } finally {
      setLoadingPreview(false);
    }
  };

  const submitting = useMutation({
    mutationFn: async () => {
      const seg = buildSegment();
      return create({
        data: {
          name,
          subject,
          html,
          from_name: fromName,
          segment: seg,
          include_recovery_link: includeRecoveryLink,
        },
      });
    },
    onSuccess: (r: any) => {
      toast.success(`Campanha criada com ${r.total} destinatários`);
      props.onCreated(r.id);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao criar campanha"),
  });

  const applyTemplate = (tplId: string) => {
    const t = templates.find((x: any) => x.id === tplId);
    if (!t) return;
    setSubject(t.subject);
    setHtml(t.html);
    if (!name) setName(t.name);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova campanha</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">Nome interno</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Boas-vindas migrados — Ago/26" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Remetente (nome)</Label>
            <Input value={fromName} onChange={(e) => setFromName(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">De: {fromName} &lt;no-reply@lumma.ia.br&gt;</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Usar template</Label>
          <Select onValueChange={applyTemplate}>
            <SelectTrigger>
              <SelectValue placeholder="Selecionar template..." />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t: any) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Assunto</Label>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">HTML</Label>
          <Textarea
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            className="font-mono text-xs min-h-[180px]"
          />
          <p className="text-[11px] text-muted-foreground">
            Variáveis: <code>{"{{first_name_comma}}"}</code>, <code>{"{{reset_password_url}}"}</code>,{" "}
            <code>{"{{dashboard_url}}"}</code>
          </p>
        </div>

        <div className="flex items-center gap-3 rounded-lg border p-3">
          <Switch checked={includeRecoveryLink} onCheckedChange={setIncludeRecoveryLink} />
          <div className="text-sm">
            <div className="font-medium">Gerar link de definição de senha</div>
            <div className="text-xs text-muted-foreground">
              Ideal para boas-vindas de usuários migrados. Cada e-mail recebe um link único de 24h.
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border p-3">
          <Label className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4" /> Segmento
          </Label>
          <Select value={segmentType} onValueChange={(v: any) => { setSegmentType(v); setPreviewInfo(null); }}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_active">Todos os ativos</SelectItem>
              <SelectItem value="unlimited">Somente com créditos ilimitados</SelectItem>
              <SelectItem value="tags">Por etiqueta</SelectItem>
              <SelectItem value="emails">Lista de e-mails (colar)</SelectItem>
            </SelectContent>
          </Select>

          {segmentType === "tags" && (
            <div className="space-y-1 max-h-40 overflow-y-auto border rounded p-2">
              {tagList.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma etiqueta cadastrada.</p>}
              {tagList.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-sm py-1">
                  <Checkbox
                    checked={selectedTags.includes(t.id)}
                    onCheckedChange={(v) => {
                      setSelectedTags((prev) => (v ? [...prev, t.id] : prev.filter((x) => x !== t.id)));
                      setPreviewInfo(null);
                    }}
                  />
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ background: t.color ?? "#999" }}
                  />
                  {t.label}
                </label>
              ))}
            </div>
          )}

          {segmentType === "emails" && (
            <Textarea
              value={emailsText}
              onChange={(e) => { setEmailsText(e.target.value); setPreviewInfo(null); }}
              placeholder="um@exemplo.com&#10;outro@exemplo.com"
              className="min-h-[120px] font-mono text-xs"
            />
          )}

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={runPreview} disabled={loadingPreview}>
              {loadingPreview ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" /> : <Eye className="h-3.5 w-3.5 mr-2" />}
              Pré-visualizar destinatários
            </Button>
            {previewInfo && (
              <span className="text-sm">
                <strong>{previewInfo.total}</strong> destinatários
              </span>
            )}
          </div>
          {previewInfo && previewInfo.sample.length > 0 && (
            <div className="text-[11px] text-muted-foreground border-t pt-2">
              Amostra: {previewInfo.sample.map((s: any) => s.email).join(", ")}
              {previewInfo.total > previewInfo.sample.length && " …"}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={props.onClose}>Cancelar</Button>
          <Button
            onClick={() => submitting.mutate()}
            disabled={
              submitting.isPending ||
              !name || !subject || !html || !previewInfo || previewInfo.total === 0
            }
            className="bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white hover:opacity-90"
          >
            {submitting.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Criar campanha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------------------- DETAIL / SEND --------------------
function CampaignDetailDialog(props: { id: string; onClose: () => void }) {
  const get = useServerFn(getCampaign);
  const setStatus = useServerFn(setCampaignStatus);
  const process = useServerFn(processCampaignBatch);
  const del = useServerFn(deleteCampaign);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["campaign", props.id],
    queryFn: () => get({ data: { id: props.id } }),
    refetchInterval: 3000,
  });

  const data = q.data as { campaign: Campaign; samples: any[] } | undefined;
  const c = data?.campaign;

  // auto-loop de envio quando status = sending
  useEffect(() => {
    if (!c || c.status !== "sending") return;
    let cancelled = false;
    (async () => {
      try {
        const r = (await process({ data: { id: c.id } })) as any;
        if (cancelled) return;
        await qc.invalidateQueries({ queryKey: ["campaign", c.id] });
        await qc.invalidateQueries({ queryKey: ["email-campaigns"] });
        if (r.remaining > 0 && r.status === "sending") {
          // dispara próximo lote
          setTimeout(() => qc.invalidateQueries({ queryKey: ["campaign", c.id] }), 500);
        }
      } catch (e: any) {
        toast.error(e?.message ?? "Erro no envio do lote");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.id, c?.status, c?.sent, c?.failed]);

  if (!c) {
    return (
      <Dialog open onOpenChange={(o) => !o && props.onClose()}>
        <DialogContent>
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const pct = c.total > 0 ? Math.round(((c.sent + c.failed) / c.total) * 100) : 0;
  const canStart = c.status === "ready" || c.status === "paused";
  const canPause = c.status === "sending";
  const canDelete = c.status !== "sending";

  return (
    <Dialog open onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {c.name}
            <Badge className={statusColor(c.status)} variant="secondary">
              {statusLabel(c.status)}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            <strong>Assunto:</strong> {c.subject}
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg border p-3">
              <div className="text-2xl font-semibold">{c.total}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-2xl font-semibold text-emerald-600">{c.sent}</div>
              <div className="text-xs text-muted-foreground">Enviados</div>
            </div>
            <div className="rounded-lg border p-3">
              <div className="text-2xl font-semibold text-red-600">{c.failed}</div>
              <div className="text-xs text-muted-foreground">Falhas</div>
            </div>
          </div>

          <Progress value={pct} className="h-2" />

          <div className="flex flex-wrap gap-2">
            {canStart && (
              <Button
                onClick={async () => {
                  await setStatus({ data: { id: c.id, status: "sending" } });
                  qc.invalidateQueries({ queryKey: ["campaign", c.id] });
                  qc.invalidateQueries({ queryKey: ["email-campaigns"] });
                }}
                className="bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white hover:opacity-90"
              >
                <Play className="h-4 w-4 mr-2" />
                {c.status === "paused" ? "Retomar envio" : "Iniciar envio"}
              </Button>
            )}
            {canPause && (
              <Button
                variant="outline"
                onClick={async () => {
                  await setStatus({ data: { id: c.id, status: "paused" } });
                  qc.invalidateQueries({ queryKey: ["campaign", c.id] });
                }}
              >
                <Pause className="h-4 w-4 mr-2" />
                Pausar
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => qc.invalidateQueries({ queryKey: ["campaign", c.id] })}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Atualizar
            </Button>
            {canDelete && (
              <Button
                variant="ghost"
                className="text-red-600 hover:text-red-700 ml-auto"
                onClick={async () => {
                  if (!confirm("Excluir esta campanha e todos os registros de envio?")) return;
                  await del({ data: { id: c.id } });
                  qc.invalidateQueries({ queryKey: ["email-campaigns"] });
                  props.onClose();
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir
              </Button>
            )}
          </div>

          {c.status === "sending" && (
            <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900 flex items-center gap-2">
              <Send className="h-3.5 w-3.5" />
              Enviando em lotes de 40 a ~7 e-mails/s. Você pode fechar essa janela — o envio
              continua no servidor.
            </div>
          )}

          {data?.samples && data.samples.length > 0 && (
            <div className="border rounded-lg divide-y max-h-60 overflow-y-auto text-xs">
              {data.samples.map((s: any, i: number) => (
                <div key={i} className="flex items-center justify-between p-2">
                  <span className="truncate">{s.email}</span>
                  <span className="shrink-0 ml-2">
                    <Badge
                      variant="secondary"
                      className={
                        s.status === "sent"
                          ? "bg-emerald-100 text-emerald-800"
                          : s.status === "failed"
                            ? "bg-red-100 text-red-800"
                            : "bg-slate-100 text-slate-700"
                      }
                    >
                      {s.status}
                    </Badge>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
