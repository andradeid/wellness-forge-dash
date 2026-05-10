import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Sparkles, Upload, FileText, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import lummaSymbol from "@/assets/lumma-symbol.svg";

interface PatientData {
  name?: string;
  dob?: string; // YYYY-MM-DD
  gender?: "male" | "female" | "other" | string;
}

interface Marker { [k: string]: unknown }

function extractJsonBlocks(text: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  const tryPush = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") out.push(parsed);
    } catch { /* ignore */ }
  };

  // 1) Fenced ```json ... ``` blocks
  const fence = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(text))) tryPush(m[1]);

  // 2) Brace-matched JSON objects anywhere in text (handles "json { ... }" without fences)
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") continue;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let j = i; j < text.length; j++) {
      const ch = text[j];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
      } else {
        if (ch === '"') inStr = true;
        else if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) {
            tryPush(text.slice(i, j + 1));
            i = j;
            break;
          }
        }
      }
    }
  }
  return out;
}

function normalizeKeys<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k.trim()] = v;
  return out;
}

function normalizeDob(input?: string): string | undefined {
  if (!input) return undefined;
  const s = input.trim();
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY or DD-MM-YYYY
  const br = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return undefined;
}

function normalizeGender(input?: string): "male" | "female" | "other" | undefined {
  if (!input) return undefined;
  const s = input.trim().toLowerCase();
  if (["male", "m", "masculino", "homem"].includes(s)) return "male";
  if (["female", "f", "feminino", "mulher"].includes(s)) return "female";
  if (["other", "outro", "outros"].includes(s)) return "other";
  return undefined;
}

function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function nameTokens(s: string): string[] {
  return normalizeName(s).split(" ").filter((t) => t.length >= 2);
}

function isPartialNameMatch(a: string, b: string): boolean {
  const ta = new Set(nameTokens(a));
  const tb = new Set(nameTokens(b));
  if (!ta.size || !tb.size) return false;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  // At least 2 common tokens, or every token of the shorter set is contained in the other
  const minSize = Math.min(ta.size, tb.size);
  return common >= 2 || (minSize > 0 && common === minSize);
}

async function findExistingPatient(
  userId: string,
  detected: PatientData,
): Promise<{ patient: { id: string; name: string; birth_date: string | null }; kind: "exact" | "suggestion" } | null> {
  if (!detected.name) return null;
  const dob = detected.dob || null;

  // Restrict by created_by (RLS already enforces this, but explicit for safety)
  let query = (supabase as any)
    .from("patients")
    .select("id, name, birth_date")
    .eq("created_by", userId);

  if (dob) query = query.eq("birth_date", dob);

  const { data, error } = await query;
  if (error || !Array.isArray(data)) return null;

  const target = normalizeName(detected.name);
  // Exact (case-insensitive) match with same dob
  const exact = data.find((p: any) => normalizeName(p.name) === target);
  if (exact) return { patient: exact, kind: "exact" };

  // If dob matches, partial-name suggestion
  if (dob) {
    const partial = data.find((p: any) => isPartialNameMatch(p.name, detected.name!));
    if (partial) return { patient: partial, kind: "suggestion" };
  }

  return null;
}
  return typeof obj.name === "string" && (obj.dob !== undefined || obj.gender !== undefined || obj.birth_date !== undefined);
}

function looksLikeMarker(obj: Record<string, unknown>): boolean {
  return (
    (typeof obj.parameter === "string" || typeof obj.parametro === "string") &&
    (obj.result !== undefined || obj.resultado !== undefined)
  );
}

function findPatientAndMarkers(text: string): { patient_data?: PatientData; markers?: Marker[] } {
  const blocks = extractJsonBlocks(text);
  let patient_data: PatientData | undefined;
  let markers: Marker[] | undefined;
  const collectedMarkers: Marker[] = [];

  const setPatient = (pdRaw: Record<string, unknown>) => {
    if (patient_data) return;
    const pd = normalizeKeys(pdRaw);
    const dob = typeof pd.dob === "string" ? pd.dob : (typeof pd.birth_date === "string" ? pd.birth_date : undefined);
    patient_data = {
      name: typeof pd.name === "string" ? pd.name : undefined,
      dob: normalizeDob(dob),
      gender: normalizeGender(typeof pd.gender === "string" ? pd.gender : undefined),
    };
  };

  for (const raw of blocks) {
    const b = normalizeKeys(raw);

    // Wrapper with patient_data key
    if (b.patient_data && typeof b.patient_data === "object") {
      setPatient(b.patient_data as Record<string, unknown>);
    }
    // Standalone patient object
    if (!patient_data && looksLikePatient(b)) {
      setPatient(b);
    }
    // Wrapper with markers array
    if (Array.isArray(b.markers)) {
      for (const m of b.markers) {
        if (m && typeof m === "object") collectedMarkers.push(m as Marker);
      }
    }
    // Standalone marker object
    if (looksLikeMarker(b)) {
      collectedMarkers.push(b as Marker);
    }
  }

  if (collectedMarkers.length) markers = collectedMarkers;
  return { patient_data, markers };
}

function getDifyAnswer(evt: Record<string, unknown>): string {
  const direct = evt.answer ?? evt.text ?? evt.content;
  if (typeof direct === "string") return direct;
  const data = evt.data;
  if (data && typeof data === "object") {
    const nested = data as Record<string, unknown>;
    const value = nested.answer ?? nested.text ?? nested.content;
    if (typeof value === "string") return value;
  }
  return "";
}

export function QuickAnalysisDialog({ onCreated }: { onCreated?: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);

  // Result state
  const assistantTextRef = useRef("");
  const conversationIdRef = useRef("");
  const difyFileIdRef = useRef<string | null>(null);
  const storagePathRef = useRef<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [detected, setDetected] = useState<PatientData>({});
  const [markers, setMarkers] = useState<Marker[] | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [matchOpen, setMatchOpen] = useState(false);
  const [matchPatient, setMatchPatient] = useState<{ id: string; name: string; birth_date: string | null } | null>(null);
  const [matchKind, setMatchKind] = useState<"exact" | "suggestion">("exact");
  const [attaching, setAttaching] = useState(false);

  const reset = () => {
    setFile(null);
    setProcessing(false);
    assistantTextRef.current = "";
    conversationIdRef.current = "";
    difyFileIdRef.current = null;
    storagePathRef.current = null;
    setMarkers(undefined);
    setDetected({});
  };

  const handleAnalyze = async () => {
    if (!file || !user) return;
    setProcessing(true);
    assistantTextRef.current = "";

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Sessão expirada");

      // 1) Profile
      const { data: profile } = await (supabase as any)
        .from("profiles").select("full_name, email").eq("id", user.id).maybeSingle();

      // 2) Storage upload (provisional path under user's "_quick" folder)
      const path = `${user.id}/_quick/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("exams").upload(path, file);
      if (upErr) throw new Error(upErr.message);
      storagePathRef.current = path;

      // 3) Dify upload
      const fd = new FormData();
      fd.append("file", file);
      const upRes = await fetch("/api/dify/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (!upRes.ok) throw new Error(`Falha no upload (${upRes.status})`);
      const upJson = await upRes.json() as { id?: string };
      const difyId = upJson.id ?? null;
      difyFileIdRef.current = difyId;

      // 4) Stream chat
      const res = await fetch("/api/dify/chat", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: "Analise o exame anexado e identifique o paciente. Retorne um bloco ```json com { \"patient_data\": { \"name\", \"dob\", \"gender\" }, \"markers\": [...] }.",
          conversation_id: undefined,
          files: difyId ? [{
            type: file.type.startsWith("image/") ? "image" : "document",
            transfer_method: "local_file",
            upload_file_id: difyId,
          }] : [],
          meta: {
            nutritionist_name: (profile?.full_name as string) || (profile?.email as string) || "Nutricionista",
            nutritionist_email: (profile?.email as string) || "",
            patient_name: "novo",
            patient_id: "novo",
          },
        }),
      });
      if (!res.ok || !res.body) throw new Error(`Dify ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const processLine = (line: string) => {
        const l = line.trim();
        if (!l.startsWith("data:")) return;
        const payload = l.slice(5).trim();
        if (!payload || payload === "[DONE]") return;
        try {
          const evt = JSON.parse(payload);
          if (evt.event === "message" || evt.event === "agent_message") {
            assistantTextRef.current += getDifyAnswer(evt);
          } else if (evt.event === "message_end" || evt.event === "agent_thought") {
            if (evt.conversation_id) conversationIdRef.current = evt.conversation_id;
          } else if (evt.event === "error") {
            throw new Error(evt.message ?? "Erro do Dify");
          }
        } catch { /* ignore */ }
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        lines.forEach(processLine);
      }
      if (buffer.trim()) processLine(buffer);

      const fullText = assistantTextRef.current;
      console.groupCollapsed("[QuickAnalysis] Resposta do Dify");
      console.log("Tamanho do texto:", fullText.length);
      console.log("Texto completo:", fullText);
      const fenced = fullText.match(/```(?:json)?[\s\S]*?```/gi);
      console.log("Blocos com cercas ``` encontrados:", fenced?.length ?? 0, fenced);

      const braceMatches: string[] = [];
      for (let i = 0; i < fullText.length; i++) {
        if (fullText[i] !== "{") continue;
        let depth = 0, inStr = false, esc = false;
        for (let j = i; j < fullText.length; j++) {
          const ch = fullText[j];
          if (inStr) {
            if (esc) esc = false;
            else if (ch === "\\") esc = true;
            else if (ch === '"') inStr = false;
          } else {
            if (ch === '"') inStr = true;
            else if (ch === "{") depth++;
            else if (ch === "}") {
              depth--;
              if (depth === 0) { braceMatches.push(fullText.slice(i, j + 1)); i = j; break; }
            }
          }
        }
      }
      console.log("Objetos JSON balanceados encontrados:", braceMatches.length);
      braceMatches.forEach((b, idx) => {
        try {
          const parsed = JSON.parse(b);
          console.log(`  [${idx}] OK — chaves:`, Object.keys(parsed), parsed);
        } catch (err) {
          console.warn(
            `  [${idx}] FALHA no JSON.parse:`,
            (err as Error).message,
            "\n  conteúdo:",
            b.slice(0, 500) + (b.length > 500 ? "…" : ""),
          );
        }
      });

      const { patient_data, markers: m } = findPatientAndMarkers(fullText);
      console.log("patient_data extraído:", patient_data);
      console.log("markers extraídos:", m?.length ?? 0, m);
      console.groupEnd();

      setMarkers(m);

      if (patient_data?.name) {
        const detectedData: PatientData = {
          name: patient_data.name,
          dob: patient_data.dob,
          gender: patient_data.gender,
        };
        setDetected(detectedData);
        setProcessing(false);
        setOpen(false);

        const existing = await findExistingPatient(user.id, detectedData);
        if (existing) {
          setMatchPatient({ id: existing.patient.id, name: existing.patient.name, birth_date: existing.patient.birth_date });
          setMatchKind(existing.kind);
          setMatchOpen(true);
        } else {
          setConfirmOpen(true);
        }
      } else {
        const reason = !braceMatches.length
          ? "nenhum bloco JSON foi encontrado no texto"
          : !patient_data
            ? "JSON encontrado mas sem campo patient_data válido"
            : "patient_data sem name";
        console.error("[QuickAnalysis] Falha na extração:", reason);
        toast.error(`Não consegui identificar o paciente (${reason}). Abra o console (F12) para ver o texto retornado.`);
        setProcessing(false);
      }
    } catch (e) {
      console.error("[QuickAnalysis] Exceção:", e);
      const msg = e instanceof Error ? e.message : "Erro desconhecido";
      toast.error(msg);
      setProcessing(false);
    }
  };

  const handleConfirmCreate = async () => {
    if (!user || !detected.name) return;
    setCreating(true);
    try {
      const normalizedGender =
        detected.gender === "male" || detected.gender === "female" || detected.gender === "other"
          ? detected.gender
          : null;

      // 1) Create patient
      const { data: patient, error: pErr } = await (supabase as any)
        .from("patients")
        .insert({
          created_by: user.id,
          name: detected.name,
          birth_date: detected.dob || null,
          gender: normalizedGender,
        })
        .select("id, name")
        .single();
      if (pErr) throw new Error(pErr.message);

      // 2) Create chat with the existing Dify conversation_id
      const { data: chat, error: cErr } = await (supabase as any)
        .from("patient_chats")
        .insert({
          patient_id: patient.id,
          created_by: user.id,
          dify_conversation_id: conversationIdRef.current || null,
        })
        .select("id")
        .single();
      if (cErr) throw new Error(cErr.message);

      // 3) Persist exam reference
      if (storagePathRef.current && file) {
        await (supabase as any).from("patient_exams").insert({
          patient_id: patient.id,
          chat_id: chat.id,
          uploaded_by: user.id,
          file_path: storagePathRef.current,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          dify_file_id: difyFileIdRef.current,
        });
      }

      // 4) Persist user message + assistant response
      await (supabase as any).from("chat_messages").insert({
        chat_id: chat.id,
        created_by: user.id,
        role: "user",
        content: "Análise rápida do exame anexado.",
        attachments: file ? [{ name: file.name }] : null,
      });
      await (supabase as any).from("chat_messages").insert({
        chat_id: chat.id,
        created_by: user.id,
        role: "assistant",
        content: assistantTextRef.current,
        structured_data: markers ? { markers } : null,
      });

      toast.success(`Paciente ${patient.name} identificado e cadastrado com sucesso!`);
      setConfirmOpen(false);
      reset();
      onCreated?.();
      navigate({ to: "/app/chat/$patientId", params: { patientId: patient.id } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao cadastrar";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!processing) { setOpen(o); if (!o) reset(); } }}>
        <Button
          onClick={() => setOpen(true)}
          variant="outline"
          className="rounded-full border-2 border-transparent bg-gradient-to-r from-[#e8a04c]/10 to-[#e89bcf]/10 hover:from-[#e8a04c]/20 hover:to-[#e89bcf]/20 text-foreground gap-2"
          style={{ backgroundClip: "padding-box" }}
        >
          <Sparkles className="h-4 w-4 text-[#e8a04c]" />
          Análise Rápida
        </Button>

        <DialogContent>
          <DialogHeader>
            <DialogTitle>✨ Análise Rápida</DialogTitle>
            <DialogDescription>
              Envie um exame (PDF ou imagem). A Lumma vai ler, identificar o paciente e preparar o chat automaticamente.
            </DialogDescription>
          </DialogHeader>

          {processing ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10">
              <img src={lummaSymbol} alt="Lumma" className="h-10 w-10 animate-spin" />
              <p className="text-sm font-medium animate-pulse bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] bg-clip-text text-transparent text-center">
                Lumma está lendo o documento e identificando o paciente…
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <Label
                htmlFor="quick-file"
                className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:bg-muted/30 transition"
              >
                {file ? (
                  <>
                    <FileText className="h-8 w-8 text-[#e8a04c]" />
                    <span className="text-sm font-medium">{file.name}</span>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); setFile(null); }}
                      className="text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-destructive"
                    >
                      <X className="h-3 w-3" /> Remover
                    </button>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm">Clique para selecionar um PDF ou imagem</span>
                    <span className="text-xs text-muted-foreground">Até 20MB</span>
                  </>
                )}
                <Input
                  id="quick-file"
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </Label>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={processing}>Cancelar</Button>
            <Button
              onClick={handleAnalyze}
              disabled={!file || processing}
              className="rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white border-0 hover:opacity-90"
            >
              {processing ? "Analisando…" : "Analisar com a Lumma"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => { if (!o && !creating) { setConfirmOpen(false); reset(); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Identifiquei que este exame pertence a {detected.name}</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja cadastrar este paciente agora? Você poderá ajustar os dados antes de confirmar.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="d-name">Nome</Label>
              <Input id="d-name" value={detected.name ?? ""} onChange={(e) => setDetected({ ...detected, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="d-dob">Nascimento</Label>
                <Input id="d-dob" type="date" value={detected.dob ?? ""} onChange={(e) => setDetected({ ...detected, dob: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Gênero</Label>
                <Select
                  value={["male", "female", "other"].includes(detected.gender ?? "") ? detected.gender : undefined}
                  onValueChange={(v) => setDetected({ ...detected, gender: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Masculino</SelectItem>
                    <SelectItem value="female">Feminino</SelectItem>
                    <SelectItem value="other">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={creating}>Agora não</AlertDialogCancel>
            <AlertDialogAction
              disabled={creating || !detected.name}
              onClick={(e) => { e.preventDefault(); handleConfirmCreate(); }}
              className="bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white border-0 hover:opacity-90"
            >
              {creating ? "Cadastrando…" : "Cadastrar e abrir chat"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
