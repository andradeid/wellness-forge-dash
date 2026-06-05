import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  Check,
  Eye,
  EyeOff,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Power,
  Save,
  Wifi,
  X,
  User,
  UserMinus,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface DifyAgent {
  id: string;
  agent_id: string;
  label: string;
  description: string | null;
  api_key: string | null;
  endpoint: string;
  is_active: boolean;
  sort_order: number;
}

const DEFAULT_ENDPOINT = "https://api.dify.ai/v1";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

interface AgentFormState {
  label: string;
  agent_id: string;
  description: string;
  api_key: string;
  endpoint: string;
  sort_order: number;
}

function emptyForm(nextSort: number): AgentFormState {
  return {
    label: "",
    agent_id: "",
    description: "",
    api_key: "",
    endpoint: DEFAULT_ENDPOINT,
    sort_order: nextSort,
  };
}

export function DifyAgentsPanel() {
  const [agents, setAgents] = useState<DifyAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<Record<string, boolean>>({});
  const [togglingActive, setTogglingActive] = useState<Record<string, boolean>>({});
  type TestState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "success"; appName?: string | null }
    | { status: "error"; message: string };
  const [testState, setTestState] = useState<Record<string, TestState>>({});
  const [lastAppName, setLastAppName] = useState<Record<string, string>>({});

  const runAgentTest = async (agent: DifyAgent) => {
    setTestState((s) => ({ ...s, [agent.id]: { status: "loading" } }));
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const res = await fetch("/api/dify/agent-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ agent_id: agent.agent_id }),
      });
      const json = await res.json().catch(() => ({ ok: false, error: "Resposta inválida" }));
      if (json?.ok) {
        const name = (json.app_name ?? "").toString().trim();
        setTestState((s) => ({
          ...s,
          [agent.id]: { status: "success", appName: name || null },
        }));
        if (name) {
          setLastAppName((m) => ({ ...m, [agent.id]: name }));
        }
      } else {
        setTestState((s) => ({
          ...s,
          [agent.id]: { status: "error", message: json?.error ?? "Falha desconhecida" },
        }));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTestState((s) => ({ ...s, [agent.id]: { status: "error", message: msg } }));
    } finally {
      setTimeout(() => {
        setTestState((s) => ({ ...s, [agent.id]: { status: "idle" } }));
      }, 4000);
    }
  };



  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<AgentFormState>(emptyForm(1));
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [agentIdEdited, setAgentIdEdited] = useState(false);

  const [editTarget, setEditTarget] = useState<DifyAgent | null>(null);
  const [editForm, setEditForm] = useState<AgentFormState | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const nextSort = useMemo(
    () => (agents.length === 0 ? 1 : Math.max(...agents.map((a) => a.sort_order)) + 1),
    [agents],
  );

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("dify_agents")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) {
      toast.error("Falha ao carregar agentes.", { description: error.message });
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as DifyAgent[];
    setAgents(rows);
    const d: Record<string, string> = {};
    rows.forEach((a) => (d[a.id] = a.api_key ?? ""));
    setDrafts(d);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setCreateForm(emptyForm(nextSort));
    setAgentIdEdited(false);
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    const form = createForm;
    const label = form.label.trim();
    const agent_id = slugify(form.agent_id);
    if (!label || !agent_id) {
      toast.error("Preencha o nome e o identificador do agente.");
      return;
    }
    setCreatingAgent(true);
    const { error } = await (supabase as any).from("dify_agents").insert({
      label,
      agent_id,
      description: form.description.trim() || null,
      api_key: form.api_key.trim() || null,
      endpoint: form.endpoint.trim() || DEFAULT_ENDPOINT,
      sort_order: form.sort_order,
    });
    setCreatingAgent(false);
    if (error) {
      toast.error("Não foi possível criar o agente.", { description: error.message });
      return;
    }
    toast.success(`Agente "${label}" criado com sucesso.`);
    setCreateOpen(false);
    load();
  };

  const handleSaveKey = async (agent: DifyAgent) => {
    setSavingKey((s) => ({ ...s, [agent.id]: true }));
    const value = (drafts[agent.id] ?? "").trim();
    const { error } = await (supabase as any)
      .from("dify_agents")
      .update({ api_key: value || null })
      .eq("id", agent.id);
    setSavingKey((s) => ({ ...s, [agent.id]: false }));
    if (error) {
      toast.error("Falha ao salvar.", { description: error.message });
      return;
    }
    toast.success(`API Key de "${agent.label}" atualizada.`);
    setAgents((all) =>
      all.map((a) => (a.id === agent.id ? { ...a, api_key: value || null } : a)),
    );
  };

  const toggleActive = async (agent: DifyAgent) => {
    setTogglingActive((s) => ({ ...s, [agent.id]: true }));
    const { error } = await (supabase as any)
      .from("dify_agents")
      .update({ is_active: !agent.is_active })
      .eq("id", agent.id);
    setTogglingActive((s) => ({ ...s, [agent.id]: false }));
    if (error) {
      toast.error("Falha ao atualizar status.", { description: error.message });
      return;
    }
    toast.success(
      agent.is_active
        ? `"${agent.label}" foi desativado.`
        : `"${agent.label}" foi reativado.`,
    );
    setAgents((all) =>
      all.map((a) => (a.id === agent.id ? { ...a, is_active: !a.is_active } : a)),
    );
  };

  const openEdit = (agent: DifyAgent) => {
    setEditTarget(agent);
    setEditForm({
      label: agent.label,
      agent_id: agent.agent_id,
      description: agent.description ?? "",
      api_key: agent.api_key ?? "",
      endpoint: agent.endpoint || DEFAULT_ENDPOINT,
      sort_order: agent.sort_order,
    });
  };

  const handleSaveEdit = async () => {
    if (!editTarget || !editForm) return;
    const label = editForm.label.trim();
    if (!label) {
      toast.error("O nome do agente é obrigatório.");
      return;
    }
    setSavingEdit(true);
    const { error } = await (supabase as any)
      .from("dify_agents")
      .update({
        label,
        description: editForm.description.trim() || null,
        api_key: editForm.api_key.trim() || null,
        endpoint: editForm.endpoint.trim() || DEFAULT_ENDPOINT,
        sort_order: editForm.sort_order,
      })
      .eq("id", editTarget.id);
    setSavingEdit(false);
    if (error) {
      toast.error("Falha ao salvar alterações.", { description: error.message });
      return;
    }
    toast.success(`Agente "${label}" atualizado.`);
    setEditTarget(null);
    setEditForm(null);
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h3 className="text-base font-medium flex items-center gap-2">
            <Bot className="h-4 w-4 text-[oklch(0.55_0.18_25)]" />
            Agentes Dify
          </h3>
          <p className="text-xs text-muted-foreground max-w-xl">
            Cada agente é um app independente no Dify com sua própria chave de API.
          </p>
        </div>
        <Button
          onClick={openCreate}
          className="rounded-full bg-gradient-brand text-white border-0 hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          Novo Agente
        </Button>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando agentes...
        </div>
      ) : agents.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground border rounded-lg">
          Nenhum agente cadastrado ainda.
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => {
            const revealed = reveal[agent.id];
            const draft = drafts[agent.id] ?? "";
            const isConfigured = !!(agent.api_key && agent.api_key.trim().length > 0);
            const dirty = draft !== (agent.api_key ?? "");
            return (
              <div
                key={agent.id}
                className={cn(
                  "rounded-lg border bg-card p-4 grid gap-4 md:grid-cols-[1.1fr_1.4fr_auto] items-start",
                  !agent.is_active && "opacity-70",
                )}
              >
                {/* Left: label + description + id */}
                <div className="space-y-1 min-w-0">
                  <div className="font-medium text-sm text-foreground truncate">
                    {agent.label}
                  </div>
                  {agent.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {agent.description}
                    </p>
                  )}
                  <Badge
                    variant="outline"
                    className="font-mono text-[10px] mt-1 rounded-md"
                  >
                    {agent.agent_id}
                  </Badge>
                </div>

                {/* Middle: api_key input */}
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    API Key
                  </Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={revealed ? "text" : "password"}
                        value={draft}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [agent.id]: e.target.value }))
                        }
                        placeholder="Não configurado"
                        className="rounded-lg pr-10 font-mono text-sm"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setReveal((r) => ({ ...r, [agent.id]: !r[agent.id] }))
                        }
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {revealed ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <Button
                      onClick={() => handleSaveKey(agent)}
                      disabled={savingKey[agent.id] || !dirty}
                      className="rounded-full bg-gradient-brand text-white border-0 hover:opacity-90"
                    >
                      {savingKey[agent.id] ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Salvar
                    </Button>
                    {(() => {
                      const ts = testState[agent.id] ?? { status: "idle" as const };
                      const hasKey = isConfigured;
                      const baseBtn = (
                        <Button
                          variant="outline"
                          onClick={() => runAgentTest(agent)}
                          disabled={!hasKey || ts.status === "loading"}
                          className={cn(
                            "rounded-full",
                            ts.status === "success" &&
                              "border-emerald-300 text-emerald-700 hover:text-emerald-700",
                            ts.status === "error" &&
                              "border-red-300 text-red-700 hover:text-red-700",
                          )}
                        >
                          {ts.status === "loading" ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Testando...
                            </>
                          ) : ts.status === "success" ? (
                            <>
                              <Check className="h-4 w-4" />
                              Conectado
                            </>
                          ) : ts.status === "error" ? (
                            <>
                              <X className="h-4 w-4" />
                              Falhou
                            </>
                          ) : (
                            <>
                              <Wifi className="h-4 w-4" />
                              Testar
                            </>
                          )}
                        </Button>
                      );
                      if (hasKey) return baseBtn;
                      return (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span tabIndex={0}>{baseBtn}</span>
                            </TooltipTrigger>
                            <TooltipContent>Configure a API Key primeiro</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    })()}
                  </div>
                  {(() => {
                    const ts = testState[agent.id];
                    const persistedName = lastAppName[agent.id];
                    if (ts?.status === "error") {
                      return (
                        <p className="text-[11px] text-red-700 mt-1">{ts.message}</p>
                      );
                    }
                    const name =
                      (ts?.status === "success" ? ts.appName : null) ?? persistedName;
                    if (name) {
                      return (
                        <p className="text-[11px] text-emerald-700 mt-1">
                          ✓ {name}
                        </p>
                      );
                    }
                    return null;
                  })()}
                </div>

                {/* Right: status + menu */}
                <div className="flex items-center gap-2 self-center">
                  {!agent.is_active ? (
                    <Badge
                      variant="outline"
                      className="rounded-full border-amber-300 bg-amber-50 text-amber-700"
                    >
                      Inativo
                    </Badge>
                  ) : isConfigured ? (
                    <Badge
                      variant="outline"
                      className="rounded-full border-emerald-200 bg-emerald-50 text-emerald-700"
                    >
                      Configurado
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="rounded-full bg-muted text-muted-foreground"
                    >
                      Pendente
                    </Badge>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="rounded-full">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-lg">
                      <DropdownMenuItem onClick={() => openEdit(agent)}>
                        <Pencil className="h-4 w-4" />
                        Editar informações
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => toggleActive(agent)}
                        disabled={togglingActive[agent.id]}
                      >
                        <Power className="h-4 w-4" />
                        {agent.is_active ? "Desativar agente" : "Reativar agente"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="rounded-lg sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo Agente Dify</DialogTitle>
            <DialogDescription>
              Cadastre um novo app Dify e sua API Key. Você pode configurar a chave depois.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome do agente *</Label>
              <Input
                value={createForm.label}
                onChange={(e) => {
                  const v = e.target.value;
                  setCreateForm((f) => ({
                    ...f,
                    label: v,
                    agent_id: agentIdEdited ? f.agent_id : slugify(v),
                  }));
                }}
                placeholder="Ex: App de Exames"
                className="rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Identificador (agent_id) *</Label>
              <Input
                value={createForm.agent_id}
                onChange={(e) => {
                  setAgentIdEdited(true);
                  setCreateForm((f) => ({ ...f, agent_id: slugify(e.target.value) }));
                }}
                placeholder="exam"
                className="rounded-lg font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Usado no código para selecionar este agente. Apenas letras, números e _.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea
                value={createForm.description}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="O que esse agente faz?"
                className="rounded-lg"
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label>API Key</Label>
              <Input
                type="password"
                value={createForm.api_key}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, api_key: e.target.value }))
                }
                placeholder="app-..."
                className="rounded-lg font-mono"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label>Endpoint</Label>
                <Input
                  value={createForm.endpoint}
                  onChange={(e) =>
                    setCreateForm((f) => ({ ...f, endpoint: e.target.value }))
                  }
                  className="rounded-lg font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Ordem</Label>
                <Input
                  type="number"
                  value={createForm.sort_order}
                  onChange={(e) =>
                    setCreateForm((f) => ({
                      ...f,
                      sort_order: Number(e.target.value) || 0,
                    }))
                  }
                  className="rounded-lg"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => setCreateOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creatingAgent}
              className="rounded-full bg-gradient-brand text-white border-0 hover:opacity-90"
            >
              {creatingAgent ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Criar Agente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(o) => {
          if (!o) {
            setEditTarget(null);
            setEditForm(null);
          }
        }}
      >
        <DialogContent className="rounded-lg sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Agente</DialogTitle>
            <DialogDescription>
              Atualize as informações do agente. O identificador não pode ser alterado.
            </DialogDescription>
          </DialogHeader>
          {editForm && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Nome do agente *</Label>
                <Input
                  value={editForm.label}
                  onChange={(e) =>
                    setEditForm((f) => (f ? { ...f, label: e.target.value } : f))
                  }
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Identificador (agent_id)</Label>
                <Input
                  value={editForm.agent_id}
                  readOnly
                  className="rounded-lg font-mono bg-muted/40"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Descrição</Label>
                <Textarea
                  value={editForm.description}
                  onChange={(e) =>
                    setEditForm((f) =>
                      f ? { ...f, description: e.target.value } : f,
                    )
                  }
                  className="rounded-lg"
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label>API Key</Label>
                <Input
                  type="password"
                  value={editForm.api_key}
                  onChange={(e) =>
                    setEditForm((f) =>
                      f ? { ...f, api_key: e.target.value } : f,
                    )
                  }
                  className="rounded-lg font-mono"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5 col-span-2">
                  <Label>Endpoint</Label>
                  <Input
                    value={editForm.endpoint}
                    onChange={(e) =>
                      setEditForm((f) =>
                        f ? { ...f, endpoint: e.target.value } : f,
                      )
                    }
                    className="rounded-lg font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Ordem</Label>
                  <Input
                    type="number"
                    value={editForm.sort_order}
                    onChange={(e) =>
                      setEditForm((f) =>
                        f
                          ? { ...f, sort_order: Number(e.target.value) || 0 }
                          : f,
                      )
                    }
                    className="rounded-lg"
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => {
                setEditTarget(null);
                setEditForm(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={savingEdit}
              className="rounded-full bg-gradient-brand text-white border-0 hover:opacity-90"
            >
              {savingEdit ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
