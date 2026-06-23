import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Brain,
  ChevronRight,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  Heart,
  Key,
  Link as LinkIcon,
  Loader2,
  MessageCircle,
  RotateCcw,
  Save,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { DifyAgentsPanel } from "@/components/admin/DifyAgentsPanel";

export const Route = createFileRoute("/app/admin/integrations")({
  component: IntegrationsPage,
});

interface Integration {
  id: string;
  key: string;
  value: string | null;
  is_secret: boolean;
  label: string | null;
  category: string | null;
  description: string | null;
}

interface LogRow {
  id: string;
  source: string;
  event: string;
  status: string;
  message: string | null;
  created_at: string;
}

const CARDS: Array<{
  category: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}> = [
  {
    category: "ai",
    title: "Inteligência Artificial",
    subtitle: "Dify, OpenAI e Gemini",
    icon: Brain,
    accent: "from-violet-500/20 to-fuchsia-400/20",
  },
  {
    category: "payments",
    title: "Pagamentos",
    subtitle: "Hubla — webhooks e segredos",
    icon: CreditCard,
    accent: "from-emerald-500/20 to-teal-400/20",
  },
  {
    category: "whatsapp",
    title: "WhatsApp",
    subtitle: "Uazapi — instância e token",
    icon: MessageCircle,
    accent: "from-amber-500/20 to-pink-400/20",
  },
];

function maskValue(v: string) {
  if (!v) return "";
  if (v.length <= 8) return "•".repeat(v.length);
  return `${v.slice(0, 4)}${"•".repeat(Math.max(8, v.length - 8))}${v.slice(-4)}`;
}

function IntegrationsPage() {
  const { role } = useAuth();
  const isSuperAdmin = role === "super_admin";

  const [items, setItems] = useState<Integration[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [healthChecking, setHealthChecking] = useState(false);
  const [testingDify, setTestingDify] = useState(false);
  const [savingDify, setSavingDify] = useState(false);
  const [resettingDifyConversations, setResettingDifyConversations] = useState(false);
  const [inspectingDify, setInspectingDify] = useState(false);

  const inspectDifyKey = async () => {
    setInspectingDify(true);
    try {
      const { data, error } = await (supabase as any)
        .from("integrations")
        .select("key, value, updated_at")
        .in("key", ["dify_api_key", "dify_endpoint"]);
      if (error) {
        toast.error("Falha ao consultar Supabase.", { description: error.message });
        return;
      }
      const apiRow = (data ?? []).find((r: any) => r.key === "dify_api_key");
      const epRow = (data ?? []).find((r: any) => r.key === "dify_endpoint");
      const apiVal: string = apiRow?.value ?? "";
      const fp = apiVal ? `${apiVal.slice(0, 6)}…${apiVal.slice(-4)} (len ${apiVal.length})` : "vazia";
      const when = apiRow?.updated_at
        ? new Date(apiRow.updated_at).toLocaleString("pt-BR")
        : "—";
      toast.success("DIFY_API_KEY no Supabase", {
        description: `${fp} • atualizada em ${when} • endpoint: ${epRow?.value ?? "—"}`,
        duration: 12000,
      });
      await (supabase as any).from("integration_logs").insert({
        source: "dify",
        event: "key_inspect",
        status: "success",
        message: `fp=${fp} updated_at=${when}`,
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error("Erro ao inspecionar chave.", { description: message });
    } finally {
      setInspectingDify(false);
    }
  };
  const [health, setHealth] = useState<Record<string, boolean | null>>({
    supabase: null,
    dify: null,
    hubla: null,
  });

  const saveDifyConfig = async () => {
    const endpointItem = items.find((i) => i.key === "dify_endpoint");
    const apiKeyItem = items.find((i) => i.key === "dify_api_key");
    if (!endpointItem || !apiKeyItem) {
      toast.error("Campos do Dify não encontrados na tabela integrations.");
      return;
    }
    const endpointVal = (drafts[endpointItem.id] ?? "").trim();
    const apiKeyVal = (drafts[apiKeyItem.id] ?? "").trim();

    if (!endpointVal || !apiKeyVal) {
      toast.error("Preencha a URL e a API Key do Dify antes de salvar.");
      return;
    }
    try {
      new URL(endpointVal);
    } catch {
      toast.error("DIFY_BASE_URL inválida. Use uma URL completa (https://...).");
      return;
    }

    setSavingDify(true);
    try {
      const updates = await Promise.all([
        (supabase as any)
          .from("integrations")
          .update({ value: endpointVal })
          .eq("id", endpointItem.id),
        (supabase as any)
          .from("integrations")
          .update({ value: apiKeyVal })
          .eq("id", apiKeyItem.id),
      ]);
      const errs = updates.map((u) => u.error).filter(Boolean);
      if (errs.length) {
        toast.error("Falha ao salvar.", { description: errs[0]!.message });
        return;
      }
      setItems((all) =>
        all.map((i) => {
          if (i.id === endpointItem.id) return { ...i, value: endpointVal };
          if (i.id === apiKeyItem.id) return { ...i, value: apiKeyVal };
          return i;
        }),
      );
      toast.success("Configurações do Dify salvas com sucesso.");
      await (supabase as any).from("integration_logs").insert({
        source: "dify",
        event: "config_save",
        status: "success",
        message: `endpoint=${endpointVal}`,
      });
      load();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error("Erro ao salvar configurações.", { description: message });
    } finally {
      setSavingDify(false);
    }
  };

  const testDifyConnection = async () => {
    setTestingDify(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        toast.error("Sessão expirada. Faça login novamente.");
        return;
      }
      const res = await fetch("/api/dify/test", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        baseUrl?: string;
        status?: number;
        reason?:
          | "workspace_archived"
          | "invalid_api_key"
          | "app_not_found"
          | "http_error"
          | "network_error";
        workspaceActive?: boolean;
      };
      if (json.ok) {
        toast.success("Conexão Dify OK — workspace ativo.", {
          description: json.baseUrl,
        });
        setHealth((h) => ({ ...h, dify: true }));
      } else {
        const title =
          json.reason === "workspace_archived"
            ? "Workspace arquivado no Dify"
            : json.reason === "invalid_api_key"
              ? "API Key inválida"
              : json.reason === "app_not_found"
                ? "App não encontrado"
                : json.reason === "network_error"
                  ? "Sem conectividade com o Dify"
                  : "Falha ao conectar com o Dify";
        toast.error(title, {
          description: json.error ?? "Verifique a chave e a URL.",
        });
        setHealth((h) => ({ ...h, dify: false }));
      }
      await (supabase as any).from("integration_logs").insert({
        source: "dify",
        event: "connection_test",
        status: json.ok ? "success" : "error",
        message: json.ok
          ? `OK ${json.baseUrl}`
          : `[${json.reason ?? "error"}] ${json.error?.slice(0, 200) ?? ""}`,
      });
      load();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error("Erro ao testar conexão.", { description: message });
    } finally {
      setTestingDify(false);
    }
  };

  const resetDifyConversations = async () => {
    setResettingDifyConversations(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        toast.error("Sessão expirada. Faça login novamente.");
        return;
      }

      const res = await fetch("/api/dify/reset-conversations", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        resetCount?: number;
        error?: string;
      };

      if (!res.ok || !json.ok) {
        toast.error("Não foi possível resetar as conversas do Dify.", {
          description: json.error ?? `HTTP ${res.status}`,
        });
        return;
      }

      toast.success("Vínculos locais do Dify zerados com segurança.", {
        description: `${json.resetCount ?? 0} conversas vão iniciar um novo histórico na conta Dify atual.`,
      });
      load();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      toast.error("Erro ao resetar conversas do Dify.", { description: message });
    } finally {
      setResettingDifyConversations(false);
    }
  };

  const load = async () => {
    setLoading(true);
    const [intRes, logRes] = await Promise.all([
      (supabase as any).from("integrations").select("*").order("category"),
      (supabase as any)
        .from("integration_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    if (intRes.error) toast.error(intRes.error.message);
    else {
      setItems(intRes.data ?? []);
      const d: Record<string, string> = {};
      (intRes.data ?? []).forEach((i: Integration) => (d[i.id] = i.value ?? ""));
      setDrafts(d);
    }
    if (!logRes.error) setLogs(logRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (isSuperAdmin) load();
    else setLoading(false);
  }, [isSuperAdmin]);

  const grouped = useMemo(() => {
    const map: Record<string, Integration[]> = {};
    items.forEach((i) => {
      const c = i.category ?? "other";
      (map[c] ??= []).push(i);
    });
    return map;
  }, [items]);

  const handleSave = async (item: Integration) => {
    setSaving((s) => ({ ...s, [item.id]: true }));
    const { error } = await (supabase as any)
      .from("integrations")
      .update({ value: drafts[item.id] ?? "" })
      .eq("id", item.id);
    setSaving((s) => ({ ...s, [item.id]: false }));
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${item.label ?? item.key} atualizado.`);
    setItems((all) =>
      all.map((i) =>
        i.id === item.id ? { ...i, value: drafts[item.id] ?? "" } : i,
      ),
    );
  };

  const copy = (v: string) => {
    navigator.clipboard.writeText(v);
    toast.success("Copiado para a área de transferência.");
  };

  const runHealthCheck = async () => {
    setHealthChecking(true);
    setHealth({ supabase: null, dify: null, hubla: null });

    // Supabase
    let sb = false;
    try {
      const { error } = await (supabase as any)
        .from("integrations")
        .select("id")
        .limit(1);
      sb = !error;
    } catch {
      sb = false;
    }
    setHealth((h) => ({ ...h, supabase: sb }));

    // Dify
    const difyEndpoint = items.find((i) => i.key === "dify_endpoint")?.value;
    let dify = false;
    if (difyEndpoint) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 5000);
        const res = await fetch(difyEndpoint, {
          method: "GET",
          signal: ctrl.signal,
          mode: "no-cors",
        });
        clearTimeout(t);
        dify = res.ok || res.type === "opaque";
      } catch {
        dify = false;
      }
    }
    setHealth((h) => ({ ...h, dify }));

    // Hubla webhook URL — we just check if it's configured
    const hublaUrl = items.find((i) => i.key === "hubla_webhook_url")?.value;
    const hubla = !!hublaUrl;
    setHealth((h) => ({ ...h, hubla }));

    // log it
    await (supabase as any).from("integration_logs").insert({
      source: "system",
      event: "health_check",
      status: sb && dify ? "success" : "warning",
      message: `Supabase=${sb ? "ok" : "fail"} Dify=${dify ? "ok" : "fail"} Hubla=${hubla ? "ok" : "missing"}`,
    });

    setHealthChecking(false);
    toast.success("Health check concluído.");
    load();
  };

  if (!isSuperAdmin) {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="font-serif text-3xl">Acesso restrito</h1>
        <p className="text-sm text-muted-foreground">
          Esta área é exclusiva para Super Admins.{" "}
          <Link to="/app" className="underline">
            Voltar
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="mb-4 flex items-end justify-between gap-6 flex-wrap">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <span>Sistema</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground/80">Integrações & APIs</span>
          </div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
            Integrações & APIs
          </h1>
        </div>
        <Button
          onClick={runHealthCheck}
          disabled={healthChecking}
          className="rounded-full bg-gradient-brand text-white border-0 hover:opacity-90 px-5 h-11 shadow-md"
        >
          {healthChecking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Heart className="h-4 w-4" />
          )}
          Health Check
        </Button>
      </div>

      {/* Health pills */}
      <div className="grid gap-3 md:grid-cols-3">
        {[
          { key: "supabase", label: "Supabase", icon: Wifi },
          { key: "dify", label: "Dify (VPS)", icon: Brain },
          { key: "hubla", label: "Hubla", icon: CreditCard },
        ].map((h) => {
          const v = health[h.key];
          const status =
            v === null
              ? { txt: "—", cls: "bg-muted text-muted-foreground" }
              : v
                ? { txt: "Conectado", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" }
                : { txt: "Falha", cls: "bg-destructive/5 text-destructive border-destructive/30" };
          return (
            <div
              key={h.key}
              className="rounded-2xl border bg-card p-4 flex items-center gap-3 shadow-sm"
            >
              <div className="h-10 w-10 rounded-xl bg-accent/60 flex items-center justify-center">
                <h.icon className="h-5 w-5 text-accent-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  {h.label}
                </p>
                <Badge variant="outline" className={cn("rounded-full mt-1", status.cls)}>
                  {status.txt}
                </Badge>
              </div>
            </div>
          );
        })}
      </div>

      {/* Cards */}
      {loading ? (
        <div className="mt-8 py-16 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando integrações...
        </div>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-1">
          {CARDS.map((c) => {
            const fields = grouped[c.category] ?? [];
            return (
              <Card key={c.category} className="rounded-2xl border bg-card shadow-sm overflow-hidden">
                <CardHeader className={cn("border-b bg-gradient-to-r", c.accent)}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-white/80 flex items-center justify-center backdrop-blur">
                        <c.icon className="h-5 w-5 text-foreground" />
                      </div>
                      <div>
                        <CardTitle className="text-lg font-serif font-normal">
                          {c.title}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {c.subtitle}
                        </p>
                      </div>
                    </div>
                    {c.category === "ai" && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          onClick={saveDifyConfig}
                          disabled={savingDify}
                          className="rounded-full bg-gradient-brand text-white border-0 hover:opacity-90"
                        >
                          {savingDify ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4" />
                          )}
                          Salvar Configurações
                        </Button>
                        <Button
                          onClick={testDifyConnection}
                          disabled={testingDify}
                          variant="outline"
                          className="rounded-full border-foreground/15 bg-white/80 backdrop-blur"
                        >
                          {testingDify ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Wifi className="h-4 w-4" />
                          )}
                          Testar Conexão Dify
                        </Button>
                        <Button
                          onClick={inspectDifyKey}
                          disabled={inspectingDify}
                          variant="outline"
                          className="rounded-full border-foreground/15 bg-white/80 backdrop-blur"
                        >
                          {inspectingDify ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Key className="h-4 w-4" />
                          )}
                          Inspecionar chave salva
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              disabled={resettingDifyConversations}
                              className="rounded-full text-muted-foreground hover:text-foreground"
                            >
                              {resettingDifyConversations ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RotateCcw className="h-4 w-4" />
                              )}
                              Zerar vínculos Dify
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="rounded-lg">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Zerar vínculos locais de conversa do Dify?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Esta ação não apaga pacientes, mensagens, exames ou resultados salvos no Supabase.
                                Ela apenas remove os conversation_id antigos para que as próximas mensagens iniciem
                                novas conversas na conta Dify atual, sem depender da conta antiga existir.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="rounded-full">Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={resetDifyConversations}
                                className="rounded-full bg-gradient-brand text-white border-0 hover:opacity-90"
                              >
                                Confirmar reset
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  {c.category === "ai" && (
                    <>
                      <DifyAgentsPanel />
                      <div className="border-t pt-5">
                        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground mb-3">
                          Configuração legada (fallback)
                        </p>
                      </div>
                    </>
                  )}
                  {fields.map((f) => {
                    const revealed = reveal[f.id];
                    const draft = drafts[f.id] ?? "";
                    const isReadOnly = f.key === "hubla_webhook_url";
                    return (
                      <div key={f.id} className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <Label htmlFor={f.id} className="flex items-center gap-2">
                            {f.is_secret ? (
                              <Key className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <LinkIcon className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                            {f.key === "dify_endpoint" ? "Endpoint Global Dify" : (f.label ?? f.key)}
                          </Label>
                          {(f.key === "dify_endpoint" || f.description) && (
                            <span className="text-[11px] text-muted-foreground text-right max-w-[60%]">
                              {f.key === "dify_endpoint"
                                ? "URL base compartilhada por todos os agentes — Dify Cloud (https://api.dify.ai/v1) ou sua VPS"
                                : f.description}
                            </span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Input
                              id={f.id}
                              value={
                                f.is_secret && !revealed && draft
                                  ? maskValue(draft)
                                  : draft
                              }
                              onChange={(e) =>
                                setDrafts((d) => ({ ...d, [f.id]: e.target.value }))
                              }
                              readOnly={
                                isReadOnly || (f.is_secret && !revealed && !!draft)
                              }
                              placeholder={isReadOnly ? "Cole aqui a URL gerada" : "Não configurado"}
                              className={cn(
                                "rounded-lg pr-10 font-mono text-sm",
                                isReadOnly && "bg-muted/40",
                              )}
                            />
                            {f.is_secret && (
                              <button
                                type="button"
                                onClick={() =>
                                  setReveal((r) => ({ ...r, [f.id]: !r[f.id] }))
                                }
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                              >
                                {revealed ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </button>
                            )}
                          </div>
                          {isReadOnly ? (
                            <Button
                              variant="outline"
                              className="rounded-full"
                              onClick={() => copy(draft)}
                              disabled={!draft}
                            >
                              <Copy className="h-4 w-4" />
                              Copiar
                            </Button>
                          ) : (
                            <Button
                              onClick={() => handleSave(f)}
                              disabled={
                                saving[f.id] || draft === (f.value ?? "")
                              }
                              className="rounded-full bg-gradient-brand text-white border-0 hover:opacity-90"
                            >
                              {saving[f.id] ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4" />
                              )}
                              Salvar
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Logs */}
      <Card className="rounded-2xl border bg-card shadow-sm">
        <CardHeader className="flex-row items-center justify-between gap-4 border-b">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-accent/60 flex items-center justify-center">
              <Activity className="h-5 w-5 text-accent-foreground" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Monitoramento
              </p>
              <CardTitle className="text-lg font-serif font-normal mt-1">
                Logs de sincronização
              </CardTitle>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={load}
            className="rounded-full text-muted-foreground"
          >
            Atualizar
          </Button>
        </CardHeader>
        <CardContent className="pt-2">
          {logs.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nenhum evento registrado ainda.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Origem</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Evento</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Status</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Mensagem</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Quando</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id} className="border-b last:border-0">
                    <TableCell className="capitalize font-medium">{l.source}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">{l.event}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-full",
                          l.status === "success" && "border-emerald-200 text-emerald-700 bg-emerald-50",
                          l.status === "error" && "border-destructive/30 text-destructive bg-destructive/5",
                          l.status === "warning" && "border-amber-200 text-amber-700 bg-amber-50",
                        )}
                      >
                        {l.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm max-w-md truncate">
                      {l.message ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(l.created_at).toLocaleString("pt-BR")}
                    </TableCell>
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
