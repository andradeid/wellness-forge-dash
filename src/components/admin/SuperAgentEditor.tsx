import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Save, Trash2, Layers, LayoutGrid, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Editor inline de Tarefas + Cards de um Super Agente Dify.
 * Aparece dentro da linha do agente no DifyAgentsPanel quando `is_super_agent = true`.
 *
 * Tarefas: identificam a esteira interna do app Dify (task_key). O custo é global
 * por task_key (mapeado em src/lib/agent-key-map.ts → MAP_TASK).
 * Cards: apontam para uma tarefa e podem opcionalmente ter card_trigger próprio
 * (permite acionar o super agente pela home). O gatilho global (super_agent_cards +
 * dify_agents.card_trigger) é único — o banco valida via trigger.
 */

interface SuperAgentEditorProps {
  /** Slug do agente (dify_agents.agent_id) — coluna FK das tarefas, não o uuid. */
  agentUuid: string;
  agentLabel: string;
}

interface TaskRow {
  id: string;
  agent_id: string;
  task_key: string;
  label: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
}

interface CardRow {
  id: string;
  task_id: string;
  label: string;
  icon: string | null;
  card_trigger: string | null;
  is_active: boolean;
  sort_order: number;
}

function slugifyKey(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export function SuperAgentEditor({ agentUuid, agentLabel }: SuperAgentEditorProps) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [cards, setCards] = useState<CardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Form: nova tarefa
  const [newTaskKey, setNewTaskKey] = useState("");
  const [newTaskLabel, setNewTaskLabel] = useState("");
  const [newTaskDesc, setNewTaskDesc] = useState("");

  // Form: novo card
  const [newCardTaskId, setNewCardTaskId] = useState<string>("");
  const [newCardLabel, setNewCardLabel] = useState("");
  const [newCardIcon, setNewCardIcon] = useState("");
  const [newCardTrigger, setNewCardTrigger] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [tasksRes, cardsRes] = await Promise.all([
      (supabase as any)
        .from("super_agent_tasks")
        .select("*")
        .eq("agent_id", agentUuid)
        .order("sort_order", { ascending: true }),
      (supabase as any)
        .from("super_agent_cards")
        .select("*, super_agent_tasks!inner(agent_id)")
        .eq("super_agent_tasks.agent_id", agentUuid)
        .order("sort_order", { ascending: true }),
    ]);
    if (tasksRes.error) {
      toast.error("Falha ao carregar tarefas.", { description: tasksRes.error.message });
    } else {
      setTasks((tasksRes.data ?? []) as TaskRow[]);
    }
    if (cardsRes.error) {
      // fallback: se o join falhar por RLS, carrega cards sem filtro por agente
      const fallback = await (supabase as any).from("super_agent_cards").select("*");
      const taskIds = new Set(((tasksRes.data ?? []) as TaskRow[]).map((t) => t.id));
      setCards(((fallback.data ?? []) as CardRow[]).filter((c) => taskIds.has(c.task_id)));
    } else {
      setCards((cardsRes.data ?? []) as CardRow[]);
    }
    setLoading(false);
  }, [agentUuid]);

  useEffect(() => {
    load();
  }, [load]);

  const nextTaskSort =
    tasks.length === 0 ? 1 : Math.max(...tasks.map((t) => t.sort_order)) + 1;
  const nextCardSort =
    cards.length === 0 ? 1 : Math.max(...cards.map((c) => c.sort_order)) + 1;

  // ── Tarefas ─────────────────────────────────────────────────────────────
  const createTask = async () => {
    const key = slugifyKey(newTaskKey || newTaskLabel);
    const label = newTaskLabel.trim();
    if (!key || !label) {
      toast.error("Informe o rótulo e o task_key da tarefa.");
      return;
    }
    setSavingId("new-task");
    const { error } = await (supabase as any).from("super_agent_tasks").insert({
      agent_id: agentUuid,
      task_key: key,
      label,
      description: newTaskDesc.trim() || null,
      is_active: true,
      sort_order: nextTaskSort,
    });
    setSavingId(null);
    if (error) {
      toast.error("Falha ao criar tarefa.", { description: error.message });
      return;
    }
    toast.success(`Tarefa "${label}" criada.`);
    setNewTaskKey("");
    setNewTaskLabel("");
    setNewTaskDesc("");
    load();
  };

  const updateTask = async (task: TaskRow, patch: Partial<TaskRow>) => {
    setSavingId(task.id);
    const { error } = await (supabase as any)
      .from("super_agent_tasks")
      .update(patch)
      .eq("id", task.id);
    setSavingId(null);
    if (error) {
      toast.error("Falha ao salvar tarefa.", { description: error.message });
      return;
    }
    setTasks((all) => all.map((t) => (t.id === task.id ? { ...t, ...patch } : t)));
  };

  const deleteTask = async (task: TaskRow) => {
    const attachedCards = cards.filter((c) => c.task_id === task.id);
    const confirmMsg = attachedCards.length
      ? `Excluir "${task.label}" também remove ${attachedCards.length} card(s). Continuar?`
      : `Excluir a tarefa "${task.label}"?`;
    if (!window.confirm(confirmMsg)) return;
    setSavingId(task.id);
    const { error } = await (supabase as any)
      .from("super_agent_tasks")
      .delete()
      .eq("id", task.id);
    setSavingId(null);
    if (error) {
      toast.error("Falha ao excluir.", { description: error.message });
      return;
    }
    toast.success(`Tarefa "${task.label}" excluída.`);
    load();
  };

  // ── Cards ───────────────────────────────────────────────────────────────
  const createCard = async () => {
    if (!newCardTaskId || !newCardLabel.trim()) {
      toast.error("Selecione uma tarefa e informe o rótulo do card.");
      return;
    }
    const trigger = newCardTrigger.trim() || null;
    setSavingId("new-card");
    const { error } = await (supabase as any).from("super_agent_cards").insert({
      task_id: newCardTaskId,
      label: newCardLabel.trim(),
      icon: newCardIcon.trim() || null,
      card_trigger: trigger,
      is_active: true,
      sort_order: nextCardSort,
    });
    setSavingId(null);
    if (error) {
      toast.error("Falha ao criar card.", { description: error.message });
      return;
    }
    toast.success(`Card "${newCardLabel}" criado.`);
    setNewCardTaskId("");
    setNewCardLabel("");
    setNewCardIcon("");
    setNewCardTrigger("");
    load();
  };

  const updateCard = async (card: CardRow, patch: Partial<CardRow>) => {
    setSavingId(card.id);
    const { error } = await (supabase as any)
      .from("super_agent_cards")
      .update(patch)
      .eq("id", card.id);
    setSavingId(null);
    if (error) {
      toast.error("Falha ao salvar card.", { description: error.message });
      return;
    }
    setCards((all) => all.map((c) => (c.id === card.id ? { ...c, ...patch } : c)));
  };

  const deleteCard = async (card: CardRow) => {
    if (!window.confirm(`Excluir o card "${card.label}"?`)) return;
    setSavingId(card.id);
    const { error } = await (supabase as any)
      .from("super_agent_cards")
      .delete()
      .eq("id", card.id);
    setSavingId(null);
    if (error) {
      toast.error("Falha ao excluir.", { description: error.message });
      return;
    }
    toast.success(`Card "${card.label}" excluído.`);
    load();
  };

  return (
    <div className="col-span-full mt-3 border-t pt-4 space-y-5">
      <div className="flex items-center gap-2 text-xs font-medium text-foreground/70">
        <Layers className="h-3.5 w-3.5" />
        Super Agente: <span className="font-normal text-muted-foreground">"{agentLabel}"</span>
      </div>

      {loading ? (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" /> Carregando tarefas e cards...
        </div>
      ) : (
        <>
          {/* Tarefas */}
          <section className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              Tarefas internas (task_key)
            </div>
            <p className="text-[11px] text-muted-foreground/80 flex items-start gap-1.5">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-amber-500" />
              O <code className="font-mono">task_key</code> é enviado ao Dify como{" "}
              <code className="font-mono">selected_task</code> e usado para debitar créditos
              (mapa global em <code className="font-mono">agent-key-map.ts</code>).
            </p>

            {tasks.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nenhuma tarefa cadastrada.</p>
            ) : (
              <div className="space-y-2">
                {tasks.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-md border bg-slate-50/40 p-3 grid gap-2 md:grid-cols-[1fr_1fr_auto_auto_auto] items-center"
                  >
                    <Input
                      value={t.label}
                      onChange={(e) =>
                        setTasks((all) =>
                          all.map((x) => (x.id === t.id ? { ...x, label: e.target.value } : x)),
                        )
                      }
                      className="rounded-md text-sm"
                    />
                    <Input
                      value={t.task_key}
                      onChange={(e) =>
                        setTasks((all) =>
                          all.map((x) =>
                            x.id === t.id ? { ...x, task_key: e.target.value } : x,
                          ),
                        )
                      }
                      className="rounded-md text-xs font-mono"
                      placeholder="task_key"
                    />
                    <div className="flex items-center gap-1.5">
                      <Switch
                        checked={t.is_active}
                        onCheckedChange={(v) => updateTask(t, { is_active: v })}
                      />
                      <span className="text-[10px] text-muted-foreground">
                        {t.is_active ? "Ativa" : "Inativa"}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const label = t.label.trim();
                        const key = slugifyKey(t.task_key);
                        if (!label || !key) {
                          toast.error("Rótulo e task_key são obrigatórios.");
                          return;
                        }
                        updateTask(t, { label, task_key: key });
                      }}
                      disabled={savingId === t.id}
                      className="rounded-full h-8 gap-1.5 text-xs"
                    >
                      {savingId === t.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      Salvar
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteTask(t)}
                      disabled={savingId === t.id}
                      className="rounded-full text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                ))}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground/70">
              Dica: o <code className="font-mono">task_key</code> precisa existir em{" "}
              <code className="font-mono">MAP_TASK</code> (agent-key-map.ts) para debitar créditos.
              Chaves válidas: <code className="font-mono">exam</code>,{" "}
              <code className="font-mono">composition</code>,{" "}
              <code className="font-mono">metabolism</code>,{" "}
              <code className="font-mono">genetics</code>,{" "}
              <code className="font-mono">production</code>,{" "}
              <code className="font-mono">reasoning</code>,{" "}
              <code className="font-mono">research</code>,{" "}
              <code className="font-mono">estimativa_refeicao_foto</code>,{" "}
              <code className="font-mono">composicao_corporal_foto</code>.
            </p>


            {/* Nova tarefa */}
            <div className="rounded-md border border-dashed border-slate-200 p-3 grid gap-2 md:grid-cols-[1fr_1fr_2fr_auto] items-end">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Rótulo
                </Label>
                <Input
                  value={newTaskLabel}
                  onChange={(e) => {
                    setNewTaskLabel(e.target.value);
                    if (!newTaskKey) setNewTaskKey(slugifyKey(e.target.value));
                  }}
                  placeholder="Análise Composição"
                  className="rounded-md text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  task_key
                </Label>
                <Input
                  value={newTaskKey}
                  onChange={(e) => setNewTaskKey(slugifyKey(e.target.value))}
                  placeholder="composition"
                  className="rounded-md text-sm font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Descrição
                </Label>
                <Input
                  value={newTaskDesc}
                  onChange={(e) => setNewTaskDesc(e.target.value)}
                  placeholder="O que a tarefa faz (opcional)"
                  className="rounded-md text-sm"
                />
              </div>
              <Button
                onClick={createTask}
                disabled={savingId === "new-task"}
                className="rounded-full bg-gradient-brand text-white border-0 hover:opacity-90"
              >
                {savingId === "new-task" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                Tarefa
              </Button>
            </div>
          </section>

          {/* Cards */}
          <section className="space-y-2">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground flex items-center gap-2">
              <LayoutGrid className="h-3 w-3" /> Cards (atalhos na home)
            </div>

            {cards.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nenhum card cadastrado.</p>
            ) : (
              <div className="space-y-2">
                {cards.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-md border bg-slate-50/40 p-3 grid gap-2 md:grid-cols-[1.2fr_1fr_0.8fr_1fr_auto_auto_auto] items-center"
                  >
                    <Input
                      value={c.label}
                      onChange={(e) =>
                        setCards((all) =>
                          all.map((x) => (x.id === c.id ? { ...x, label: e.target.value } : x)),
                        )
                      }
                      placeholder="Rótulo"
                      className="rounded-md text-sm"
                    />
                    <Select
                      value={c.task_id}
                      onValueChange={(v) =>
                        setCards((all) =>
                          all.map((x) => (x.id === c.id ? { ...x, task_id: v } : x)),
                        )
                      }
                    >
                      <SelectTrigger className="rounded-md text-xs">
                        <SelectValue placeholder="Tarefa" />
                      </SelectTrigger>
                      <SelectContent>
                        {tasks.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.label}{" "}
                            <span className="text-muted-foreground font-mono">
                              ({t.task_key})
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={c.icon ?? ""}
                      onChange={(e) =>
                        setCards((all) =>
                          all.map((x) =>
                            x.id === c.id ? { ...x, icon: e.target.value || null } : x,
                          ),
                        )
                      }
                      placeholder="Ícone (ex: Scale)"
                      className="rounded-md text-xs font-mono"
                    />
                    <Input
                      value={c.card_trigger ?? ""}
                      onChange={(e) =>
                        setCards((all) =>
                          all.map((x) =>
                            x.id === c.id ? { ...x, card_trigger: e.target.value || null } : x,
                          ),
                        )
                      }
                      placeholder="card_trigger (opc.)"
                      className="rounded-md text-xs font-mono"
                    />
                    <div className="flex items-center gap-1.5">
                      <Switch
                        checked={c.is_active}
                        onCheckedChange={(v) => updateCard(c, { is_active: v })}
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const label = c.label.trim();
                        if (!label) {
                          toast.error("Rótulo é obrigatório.");
                          return;
                        }
                        const trigger = c.card_trigger?.trim()
                          ? slugifyKey(c.card_trigger)
                          : null;
                        updateCard(c, {
                          label,
                          task_id: c.task_id,
                          icon: c.icon?.trim() || null,
                          card_trigger: trigger,
                        });
                      }}
                      disabled={savingId === c.id}
                      className="rounded-full h-8 gap-1.5 text-xs"
                    >
                      {savingId === c.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      Salvar
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteCard(c)}
                      disabled={savingId === c.id}
                      className="rounded-full text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                ))}
              </div>
            )}

            {/* Novo card */}
            {tasks.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic">
                Cadastre pelo menos uma tarefa antes de criar cards.
              </p>
            ) : (
              <div className="rounded-md border border-dashed border-slate-200 p-3 grid gap-2 md:grid-cols-[1fr_1fr_1fr_1fr_auto] items-end">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Tarefa
                  </Label>
                  <Select value={newCardTaskId} onValueChange={setNewCardTaskId}>
                    <SelectTrigger className="rounded-md text-xs">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {tasks.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.label}{" "}
                          <span className="text-muted-foreground font-mono">({t.task_key})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Rótulo
                  </Label>
                  <Input
                    value={newCardLabel}
                    onChange={(e) => setNewCardLabel(e.target.value)}
                    placeholder="Composição Corporal"
                    className="rounded-md text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Ícone (lucide)
                  </Label>
                  <Input
                    value={newCardIcon}
                    onChange={(e) => setNewCardIcon(e.target.value)}
                    placeholder="Scale"
                    className="rounded-md text-sm font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    card_trigger (opc.)
                  </Label>
                  <Input
                    value={newCardTrigger}
                    onChange={(e) => setNewCardTrigger(slugifyKey(e.target.value))}
                    placeholder="composicao_super_masc"
                    className="rounded-md text-sm font-mono"
                  />
                </div>
                <Button
                  onClick={createCard}
                  disabled={savingId === "new-card"}
                  className="rounded-full bg-gradient-brand text-white border-0 hover:opacity-90"
                >
                  {savingId === "new-card" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  Card
                </Button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
