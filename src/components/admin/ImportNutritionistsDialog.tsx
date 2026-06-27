import { useRef, useState } from "react";
import Papa from "papaparse";
import { Upload, Loader2, CheckCircle2, AlertCircle, FileText, ChevronDown, Sparkles } from "lucide-react";

import { useServerFn } from "@tanstack/react-start";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { importNutritionistsBatch, checkImportPrerequisites } from "@/lib/import-nutritionists.functions";

const BATCH_SIZE = 25;

type CsvRow = {
  id?: string | null;
  email: string;
  full_name: string;
  old_plan: string;
  professional_id?: string | null;
  phone?: string | null;
  clinic_name?: string | null;
  subscription_created_at?: string | null;
  current_period_end?: string | null;
  cancelled_at?: string | null;
  legacy_status?: string | null;
  legacy_last_login_at?: string | null;
  name_inferred?: boolean;
};

type DetailRow = {
  email: string;
  status: "created" | "skipped" | "failed" | "inferred";
  reason?: string;
};


function normalizeRow(raw: Record<string, any>): CsvRow | null {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const v = raw[k] ?? raw[k.toLowerCase()] ?? raw[k.toUpperCase()];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    return "";
  };
  const email = get("email", "Email", "e-mail").toLowerCase();
  if (!email) return null;
  let full_name = get("full_name", "name", "nome");
  let name_inferred = false;
  if (!full_name) {
    name_inferred = true;
    const localPart = email.split("@")[0] ?? "";
    full_name = localPart
      .replace(/[._-]+/g, " ")
      .replace(/\d+/g, "")
      .trim()
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ") || email;
  }
  return {
    id: get("id", "user_id") || null,
    email,
    full_name,
    old_plan: (get("plan", "plan_type", "old_plan") || "free").toLowerCase(),
    professional_id: get("professional_id", "crn") || null,
    phone: get("phone", "telefone", "whatsapp") || null,
    clinic_name: get("clinic_name", "clinica", "clínica") || null,
    subscription_created_at: get("subscription_created_at", "subscribed_at", "signed_up_at") || null,
    current_period_end: get("current_period_end", "next_billing_date", "vencimento") || null,
    cancelled_at: get("cancelled_at", "canceled_at", "cancelado_em") || null,
    legacy_status: get("old_status", "legacy_status", "status") || null,
    legacy_last_login_at: get("last_login_at", "last_sign_in_at", "ultimo_login") || null,
    name_inferred,
  };
}


export function ImportNutritionistsDialog({
  open,
  onOpenChange,
  onFinished,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onFinished: () => void;
}) {
  const importFn = useServerFn(importNutritionistsBatch);
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [stats, setStats] = useState({ created: 0, skipped: 0, failed: 0, inferred: 0 });
  const [details, setDetails] = useState<DetailRow[]>([]);
  const [showDetails, setShowDetails] = useState(false);

  const reset = () => {
    setRows([]);
    setFileName("");
    setDone(0);
    setStats({ created: 0, skipped: 0, failed: 0, inferred: 0 });
    setDetails([]);
    setShowDetails(false);
    if (fileRef.current) fileRef.current.value = "";
  };


  const pickFile = (file: File) => {
    setFileName(file.name);
    Papa.parse<Record<string, any>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const parsed = res.data
          .map(normalizeRow)
          .filter((r): r is CsvRow => r !== null);
        if (parsed.length === 0) {
          toast.error("Nenhuma linha válida encontrada. Verifique colunas email e full_name.");
          return;
        }
        setRows(parsed);
        toast.success(`${parsed.length} linhas carregadas`);
      },
      error: (err) => toast.error(`Erro lendo CSV: ${err.message}`),
    });
  };

  const run = async () => {
    if (rows.length === 0) return;
    setRunning(true);
    setDone(0);
    setStats({ created: 0, skipped: 0, failed: 0, inferred: 0 });
    setDetails([]);
    setShowDetails(false);
    const batchId = `import-${Date.now()}`;
    const inferredByEmail = new Map(rows.map((r) => [r.email, !!r.name_inferred]));
    let processed = 0;
    let created = 0, skipped = 0, failed = 0, inferred = 0;
    const allDetails: DetailRow[] = [];

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const chunk = rows.slice(i, i + BATCH_SIZE);
      try {
        const res = await importFn({ data: { batch: batchId, rows: chunk } });
        created += res.created;
        skipped += res.skipped;
        failed += res.failed;
        for (const d of res.details) {
          const wasInferred = inferredByEmail.get(d.email);
          if (d.status === "created" && wasInferred) {
            inferred++;
            allDetails.push({ email: d.email, status: "inferred", reason: "nome derivado do email" });
          } else {
            allDetails.push(d as DetailRow);
          }
        }
      } catch (err) {
        failed += chunk.length;
        const msg = err instanceof Error ? err.message : String(err);
        for (const r of chunk) allDetails.push({ email: r.email, status: "failed", reason: msg });
      }
      processed += chunk.length;
      setDone(processed);
      setStats({ created, skipped, failed, inferred });
      setDetails([...allDetails]);
    }

    setRunning(false);
    setShowDetails(true);
    toast.success(
      `Importação concluída: ${created} criados${inferred ? ` (${inferred} c/ nome inferido)` : ""}, ${skipped} pulados, ${failed} falhas`,
    );
    onFinished();
  };


  const progress = rows.length > 0 ? Math.round((done / rows.length) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!running) { onOpenChange(o); if (!o) reset(); } }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl font-normal">Importar nutricionistas</DialogTitle>
          <DialogDescription>
            Colunas aceitas: <code>id</code>, <code>email</code>, <code>full_name</code>,{" "}
            <code>plan</code> (free | basic | premium | pro | black), <code>professional_id</code>,{" "}
            <code>phone</code>, <code>clinic_name</code>, <code>subscription_created_at</code>,{" "}
            <code>current_period_end</code>. Apenas email, full_name e plan são obrigatórios. Usuários entram
            bloqueados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) pickFile(f);
            }}
          />

          {rows.length === 0 ? (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-2 text-muted-foreground hover:border-primary hover:text-foreground transition"
            >
              <Upload className="h-8 w-8" />
              <span className="text-sm font-medium">Selecionar arquivo CSV</span>
            </button>
          ) : (
            <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{fileName}</p>
                <p className="text-xs text-muted-foreground">{rows.length} linhas válidas</p>
              </div>
              {!running && (
                <Button variant="ghost" size="sm" onClick={reset}>Trocar</Button>
              )}
            </div>
          )}

          {(running || done > 0) && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Progresso</span>
                <span>{done} / {rows.length} ({progress}%)</span>
              </div>
              <Progress value={progress} />
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs pt-1">
                <span className="inline-flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="h-3 w-3" /> {stats.created} criados
                </span>
                <span className="inline-flex items-center gap-1 text-amber-600">
                  <Sparkles className="h-3 w-3" /> {stats.inferred} inferidos
                </span>
                <span className="text-muted-foreground">{stats.skipped} já existentes</span>
                <span className="inline-flex items-center gap-1 text-destructive">
                  <AlertCircle className="h-3 w-3" /> {stats.failed} rejeitados
                </span>
              </div>
            </div>
          )}

          {details.length > 0 && (
            <div className="rounded-xl border bg-card">
              <button
                type="button"
                onClick={() => setShowDetails((s) => !s)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium hover:bg-muted/50 transition"
              >
                <span>Ver detalhes ({details.length})</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${showDetails ? "rotate-180" : ""}`} />
              </button>
              {showDetails && (
                <ul className="max-h-56 overflow-y-auto border-t divide-y text-xs">
                  {details.map((d, i) => {
                    const color =
                      d.status === "created" ? "text-emerald-600"
                      : d.status === "inferred" ? "text-amber-600"
                      : d.status === "skipped" ? "text-muted-foreground"
                      : "text-destructive";
                    const label =
                      d.status === "created" ? "criado"
                      : d.status === "inferred" ? "criado (nome inferido)"
                      : d.status === "skipped" ? "já existente"
                      : "rejeitado";
                    return (
                      <li key={i} className="px-3 py-1.5 flex items-start gap-2">
                        <span className={`font-medium shrink-0 ${color}`}>{label}</span>
                        <span className="font-mono truncate">{d.email}</span>
                        {d.reason && d.status !== "inferred" && (
                          <span className="text-muted-foreground truncate">— {d.reason}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>


        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>
            Fechar
          </Button>
          <Button
            onClick={run}
            disabled={rows.length === 0 || running}
            className="bg-gradient-brand text-white"
          >
            {running ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importando…</>) : `Importar ${rows.length || ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
