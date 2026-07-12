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
  AlertTriangle,
  Trash2,
  Layers,
} from "lucide-react";
import { SuperAgentEditor } from "@/components/admin/SuperAgentEditor";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
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
  card_trigger: string | null;
  patient_required: boolean;
  is_super_agent: boolean;
}

const DEFAULT_ENDPOINT = "https://api.dify.ai/v1";

const CARD_TRIGGER_OPTIONS = [
  { value: "exames_de_sangue", label: "Exames de Sangue" },
  { value: "composicao_metabolismo", label: "Composição e Metabolismo" },
  { value: "genetica_microbioma", label: "Genética e Microbioma" },
  { value: "casos_clinicos", label: "Casos Clínicos & Sintomas" },
  { value: "plano_alimentar", label: "Plano Alimentar & Receitas" },
  { value: "pesquisa_cientifica", label: "Pesquisa Científica" },
  { value: "estimativa_refeicao_foto", label: "Refeição por Foto" },
  { value: "composicao_corporal_foto", label: "Composição por Foto" },
  { value: "nutricao_visual", label: "Nutrição Visual" },
  { value: "geral", label: "Geral (sem card específico)" },
];

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
  card_trigger: string;
  patient_required: boolean;
  is_active: boolean;
  is_super_agent: boolean;
}

function emptyForm(nextSort: number): AgentFormState {
  return {
    label: "",
    agent_id: "",
    description: "",
    api_key: "",
    endpoint: DEFAULT_ENDPOINT,
    sort_order: nextSort,
    card_trigger: "geral",
    patient_required: true,
    is_active: true,
    is_super_agent: false,
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
  const [agentIdRiskAccepted, setAgentIdRiskAccepted] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<DifyAgent | null>(null);
  const [deletingAgent, setDeletingAgent] = useState(false);

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
    const { error } = await (supabase as any)
      .from("dify_agents")
      .insert({
        label,
        agent_id,
        description: form.description.trim() || null,
        api_key: form.api_key.trim() || null,
        endpoint: form.endpoint.trim() || DEFAULT_ENDPOINT,
        sort_order: form.sort_order,
        card_trigger: form.card_trigger,
        patient_required: form.patient_required,
        is_active: form.is_active,
        is_super_agent: form.is_super_agent,
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
    setAgentIdRiskAccepted(false);
    setEditForm({
      label: agent.label,
      agent_id: agent.agent_id,
      description: agent.description ?? "",
      api_key: agent.api_key ?? "",
      endpoint: agent.endpoint || DEFAULT_ENDPOINT,
      sort_order: agent.sort_order,
      card_trigger: agent.card_trigger || "geral",
      patient_required: agent.patient_required,
      is_active: agent.is_active,
      is_super_agent: agent.is_super_agent ?? false,
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeletingAgent(true);
    const { error } = await (supabase as any)
      .from("dify_agents")
      .delete()
      .eq("id", deleteTarget.id);
    setDeletingAgent(false);
    if (error) {
      toast.error("Não foi possível excluir o agente.", { description: error.message });
      return;
    }
    toast.success(`Agente "${deleteTarget.label}" excluído.`);
    setDeleteTarget(null);
    load();
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
        agent_id: slugify(editForm.agent_id),
        description: editForm.description.trim() || null,
        api_key: editForm.api_key.trim() || null,
        endpoint: editForm.endpoint.trim() || DEFAULT_ENDPOINT,
        sort_order: editForm.sort_order,
        card_trigger: editForm.card_trigger,
        patient_required: editForm.patient_required,
        is_active: editForm.is_active,
        is_super_agent: editForm.is_super_agent,
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
                  <div className="font-medium text-sm text-foreground truncate flex items-center gap-2">
                    {agent.label}
                    {agent.patient_required ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <User className="h-3 w-3 text-slate-400" />
                          </TooltipTrigger>
                          <TooltipContent>Requer paciente</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <UserMinus className="h-3 w-3 text-slate-300" />
                          </TooltipTrigger>
                          <TooltipContent>Livre (não requer paciente)</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                  {agent.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {agent.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className="font-mono text-[10px] mt-1 rounded-md"
                    >
                      {agent.agent_id}
                    </Badge>
                    {agent.card_trigger && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] mt-1 rounded-md bg-slate-100 text-slate-600"
                      >
                        {CARD_TRIGGER_OPTIONS.find((o) => o.value === agent.card_trigger)
                          ?.label || agent.card_trigger}
                      </Badge>
                    )}
                    {agent.is_super_agent && (
                      <Badge
                        variant="outline"
                        className="text-[10px] mt-1 rounded-md border-[#e8a04c]/40 bg-gradient-to-r from-[#e8a04c]/10 to-[#e89bcf]/10 text-[#a35c1f]"
                      >
                        <Layers className="h-3 w-3 mr-1" />
                        Super Agente
                      </Badge>
                    )}
                  </div>
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
                      <DropdownMenuItem
                        onClick={() => setDeleteTarget(agent)}
                        className="text-red-600 focus:text-red-600 focus:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        Excluir agente
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
            <div className="grid grid-cols-2 gap-4">
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
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Card que aciona este agente</Label>
              <Select
                value={createForm.card_trigger}
                onValueChange={(v) =>
                  setCreateForm((f) => ({ ...f, card_trigger: v }))
                }
              >
                <SelectTrigger className="rounded-lg">
                  <SelectValue placeholder="Selecione um card" />
                </SelectTrigger>
                <SelectContent>
                  {CARD_TRIGGER_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg bg-slate-50/50">
              <div className="space-y-0.5">
                <Label>Requer seleção de paciente</Label>
                <p className="text-[11px] text-muted-foreground">
                  Se desativado, o chat abre sem precisar selecionar um paciente
                </p>
              </div>
              <Switch
                checked={createForm.patient_required}
                onCheckedChange={(v) =>
                  setCreateForm((f) => ({ ...f, patient_required: v }))
                }
              />
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
              Atualize as informações do agente. Alterar o identificador requer cuidado.
            </DialogDescription>
          </DialogHeader>
          {editForm && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
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
                  <Label>Identificador (agent_id) *</Label>
                  <Input
                    value={editForm.agent_id}
                    disabled={!agentIdRiskAccepted}
                    onChange={(e) =>
                      setEditForm((f) =>
                        f ? { ...f, agent_id: slugify(e.target.value) } : f,
                      )
                    }
                    className={cn(
                      "rounded-lg font-mono",
                      !agentIdRiskAccepted && "bg-muted/40 opacity-70",
                    )}
                  />
                </div>
              </div>

              <div className="bg-red-50 border border-red-100 rounded-lg p-3 space-y-2">
                <p className="text-[11px] text-red-800 leading-relaxed flex gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    <strong>Atenção:</strong> alterar o identificador pode quebrar conversas 
                    existentes que usam este agente. Só altere se souber o que está fazendo.
                  </span>
                </p>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="risk-accepted"
                    checked={agentIdRiskAccepted}
                    onCheckedChange={(v) => setAgentIdRiskAccepted(!!v)}
                  />
                  <Label
                    htmlFor="risk-accepted"
                    className="text-[11px] font-medium text-red-900 cursor-pointer"
                  >
                    Entendo os riscos e quero editar o identificador
                  </Label>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Card que aciona este agente</Label>
                <Select
                  value={editForm.card_trigger}
                  onValueChange={(v) =>
                    setEditForm((f) => (f ? { ...f, card_trigger: v } : f))
                  }
                >
                  <SelectTrigger className="rounded-lg">
                    <SelectValue placeholder="Selecione um card" />
                  </SelectTrigger>
                  <SelectContent>
                    {CARD_TRIGGER_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg bg-slate-50/50">
                <div className="space-y-0.5">
                  <Label>Requer seleção de paciente</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Se desativado, o chat abre sem precisar selecionar um paciente
                  </p>
                </div>
                <Switch
                  checked={editForm.patient_required}
                  onCheckedChange={(v) =>
                    setEditForm((f) => (f ? { ...f, patient_required: v } : f))
                  }
                />
              </div>
              <div className="flex items-center justify-between p-3 border rounded-lg bg-slate-50/50">
                <div className="space-y-0.5">
                  <Label>Agente ativo</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Agentes inativos não recebem chamadas do frontend
                  </p>
                </div>
                <Switch
                  checked={editForm.is_active}
                  onCheckedChange={(v) =>
                    setEditForm((f) => (f ? { ...f, is_active: v } : f))
                  }
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

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <DialogContent className="rounded-lg sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Excluir Agente
            </DialogTitle>
            <DialogDescription className="py-2">
              Tem certeza que deseja excluir o agente <strong>{deleteTarget?.label}</strong>? 
              Esta ação não pode ser desfeita e pode quebrar conversas existentes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => setDeleteTarget(null)}
              disabled={deletingAgent}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              className="rounded-full"
              onClick={handleDelete}
              disabled={deletingAgent}
            >
              {deletingAgent ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Excluir mesmo assim"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
