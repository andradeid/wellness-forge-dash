import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Paperclip, FileText, Type, Trash2, Clock, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChatThinking } from "@/components/chat/ChatThinking";
import { toast } from "sonner";

export const Route = createFileRoute("/app/admin/playground")({
  component: PlaygroundPage,
});

type Mode = "pdf" | "text";

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  meta?: { latencyMs?: number; fileName?: string };
}

interface RawEvent {
  ts: number;
  event: string;
  payload: unknown;
}

interface DifyAgentRow {
  agent_id: string;
  label: string;
  api_key: string | null;
  sort_order: number;
  is_active: boolean;
}

function PlaygroundPage() {
  const { role, loading } = useAuth();
  const [mode, setMode] = useState<Mode>("pdf");
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [rawEvents, setRawEvents] = useState<RawEvent[]>([]);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [conversationId, setConversationId] = useState<string>("");
  const [agents, setAgents] = useState<DifyAgentRow[]>([]);
  const [agentType, setAgentType] = useState<string>("exam");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (role !== "super_admin") return;
    (async () => {
      const { data, error } = await supabase
        .from("dify_agents")
        .select("agent_id,label,api_key,sort_order,is_active")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) return;
      const rows = (data ?? []) as DifyAgentRow[];
      setAgents(rows);
      const hasExam = rows.some((r) => r.agent_id === "exam" && r.api_key);
      if (!hasExam) {
        const firstEnabled = rows.find((r) => r.api_key);
        if (firstEnabled) setAgentType(firstEnabled.agent_id);
      }
    })();
  }, [role]);

  const selectedAgent = useMemo(
    () => agents.find((a) => a.agent_id === agentType),
    [agents, agentType],
  );

  const handleAgentChange = (value: string) => {
    setAgentType(value);
    setTurns([]);
    setRawEvents([]);
    setConversationId("");
    setLatencyMs(null);
  };

  // Guard: super_admin only
  useEffect(() => {
    if (!loading && role && role !== "super_admin") {
      toast.error("Acesso restrito ao Super Admin.");
    }
  }, [loading, role]);

  if (loading) {
    return <div className="p-10 text-sm text-muted-foreground">Carregando…</div>;
  }
  if (role !== "super_admin") {
    return (
      <div className="p-10 text-center">
        <h1 className="text-xl font-semibold mb-2">Acesso restrito</h1>
        <p className="text-sm text-muted-foreground">
          Somente Super Admin pode acessar o Playground.
        </p>
      </div>
    );
  }

  const reset = () => {
    setTurns([]);
    setRawEvents([]);
    setLatencyMs(null);
    setConversationId("");
    setFile(null);
    setText("");
    setQuery("");
  };

  const runTest = async () => {
    if (running) return;
    if (mode === "pdf" && !file && !query.trim()) {
      toast.error("Anexe um arquivo ou escreva uma pergunta.");
      return;
    }
    if (mode === "text" && !text.trim() && !query.trim()) {
      toast.error("Cole um texto ou escreva uma pergunta.");
      return;
    }

    setRunning(true);
    setLatencyMs(null);
    const t0 = performance.now();

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setRunning(false);
      toast.error("Sessão inválida.");
      return;
    }

    // 1) Upload (PDF mode) — does NOT save to Supabase storage
    let difyFiles: Array<{ type: string; transfer_method: "local_file"; upload_file_id: string }> = [];
    if (mode === "pdf" && file) {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/dify/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!res.ok) {
        toast.error(`Falha no upload Dify (${res.status})`);
        setRunning(false);
        return;
      }
      const json = await res.json() as { id?: string };
      if (json.id) {
        difyFiles.push({
          type: file.type.startsWith("image/") ? "image" : "document",
          transfer_method: "local_file",
          upload_file_id: json.id,
        });
      }
      setRawEvents((p) => [...p, { ts: Date.now(), event: "upload.response", payload: json }]);
    }

    const composedQuery =
      mode === "text" && text.trim()
        ? `${query || "Analise o texto a seguir:"}\n\n${text}`
        : (query || "Analise o exame anexado.");

    const userTurn: ChatTurn = {
      role: "user",
      content: composedQuery,
      meta: file ? { fileName: file.name } : undefined,
    };
    setTurns((p) => [...p, userTurn, { role: "assistant", content: "" }]);

    let assistantText = "";
    try {
      const res = await fetch("/api/dify/chat", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: composedQuery,
          conversation_id: conversationId || undefined,
          files: difyFiles,
        }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`Dify ${res.status}: ${await res.text().catch(() => "")}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const l = line.trim();
          if (!l.startsWith("data:")) continue;
          const payload = l.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const evt = JSON.parse(payload);
            setRawEvents((p) => [...p, { ts: Date.now(), event: evt.event ?? "data", payload: evt }]);
            if (evt.event === "message" || evt.event === "agent_message") {
              assistantText += evt.answer ?? "";
              setTurns((prev) => {
                const next = [...prev];
                next[next.length - 1] = { role: "assistant", content: assistantText };
                return next;
              });
            } else if (evt.conversation_id) {
              setConversationId(evt.conversation_id);
            } else if (evt.event === "error") {
              throw new Error(evt.message ?? "Erro do Dify");
            }
          } catch {
            setRawEvents((p) => [...p, { ts: Date.now(), event: "raw", payload }]);
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      setTurns((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", content: `⚠️ ${msg}` };
        return next;
      });
      toast.error(msg);
    } finally {
      setLatencyMs(Math.round(performance.now() - t0));
      setRunning(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 space-y-6 bg-[#f5f5f0] min-h-[calc(100vh-0px)]">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1
            className="text-3xl bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] bg-clip-text text-transparent"
            style={{ fontFamily: "'Instrument Serif', serif" }}
          >
            Playground · Sandbox do Super Admin
          </h1>
          <p className="text-sm text-muted-foreground">
            Teste o workflow Dify sem gerar registros reais de pacientes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {latencyMs !== null && (
            <Badge variant="outline" className="gap-1 font-mono">
              <Clock className="h-3 w-3" /> {latencyMs} ms
            </Badge>
          )}
          {conversationId && (
            <Badge variant="outline" className="font-mono text-[10px]">
              conv: {conversationId.slice(0, 8)}…
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={reset} className="gap-1">
            <Trash2 className="h-4 w-4" /> Limpar
          </Button>
        </div>
      </header>

      <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
        <TabsList>
          <TabsTrigger value="pdf" className="gap-1"><FileText className="h-4 w-4" /> Simular PDF</TabsTrigger>
          <TabsTrigger value="text" className="gap-1"><Type className="h-4 w-4" /> Simular Texto</TabsTrigger>
        </TabsList>

        <TabsContent value="pdf" className="mt-4">
          <Card className="p-3 rounded-lg">
            <p className="text-xs text-muted-foreground">
              No modo PDF, anexe o arquivo direto no campo do chat abaixo (ícone de clipe).
              Os arquivos enviados aqui <strong>não</strong> são salvos no bucket — vão direto para a API do Dify.
            </p>
          </Card>
        </TabsContent>

        <TabsContent value="text" className="mt-4">
          <Card className="p-4 rounded-lg">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Cole aqui o texto bruto do exame para o Dify processar…"
              className="min-h-[140px] font-mono text-xs"
            />
          </Card>
        </TabsContent>
      </Tabs>

      <input
        ref={fileInputRef}
        type="file"
        hidden
        accept=".pdf,image/*"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chat */}
        <Card className="rounded-lg flex flex-col h-[60vh]">
          <div className="px-4 py-3 border-b text-sm font-medium">Chat de teste</div>
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {turns.length === 0 && !running && (
              <p className="text-xs text-muted-foreground text-center py-8">
                Nenhuma execução ainda. Configure o teste e clique em Executar.
              </p>
            )}
            {turns.map((t, i) => (
              <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                    t.role === "user"
                      ? "bg-[#3d5a4a] text-white"
                      : "bg-white border border-muted-foreground/10"
                  }`}
                >
                  {t.meta?.fileName && (
                    <div className="mb-1 text-xs opacity-80">📎 {t.meta.fileName}</div>
                  )}
                  {t.content || (t.role === "assistant" && running ? "…" : "")}
                </div>
              </div>
            ))}
            {running && <ChatThinking />}
          </div>
          <div className="border-t p-3 space-y-2">
            {file && (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs bg-muted rounded-full px-3 py-1 max-w-full">
                  <Paperclip className="h-3 w-3 shrink-0" />
                  <span className="truncate">{file.name}</span>
                  <span className="text-muted-foreground shrink-0">
                    · {Math.round(file.size / 1024)} KB
                  </span>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="ml-1 text-muted-foreground hover:text-foreground"
                    aria-label="Remover arquivo"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              </div>
            )}
            <Textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              rows={2}
              placeholder="Pergunta para a Lumma (opcional)…"
              className="resize-none text-sm"
            />
            <div className="flex items-center justify-between gap-2">
              {mode === "pdf" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-full gap-1"
                >
                  <Paperclip className="h-4 w-4" /> Anexar arquivo
                </Button>
              ) : <span />}
              <Button
                onClick={runTest}
                disabled={running}
                className="rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white gap-2"
              >
                <Play className="h-4 w-4" /> Executar Teste
              </Button>
            </div>
          </div>
        </Card>

        {/* Raw response */}
        <Card className="rounded-lg flex flex-col h-[60vh]">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <span className="text-sm font-medium">Resposta da API (eventos brutos)</span>
            <Badge variant="outline" className="font-mono text-[10px]">
              {rawEvents.length} eventos
            </Badge>
          </div>
          <div className="flex-1 overflow-y-auto bg-[#0f1729]">
            {rawEvents.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8 px-4">
                O JSON bruto retornado pelo Dify aparecerá aqui em tempo real.
              </p>
            ) : (
              <pre className="text-[11px] font-mono text-emerald-200 p-4 leading-relaxed">
{rawEvents.map((e, i) => (
`// ${new Date(e.ts).toISOString().slice(11, 23)} · ${e.event}
${typeof e.payload === "string" ? e.payload : JSON.stringify(e.payload, null, 2)}

`
)).join("")}
              </pre>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
