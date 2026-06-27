import { useRef, useState } from "react";
import Papa from "papaparse";
import { Upload, Loader2, CheckCircle2, AlertCircle, FileText } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { importNutritionistsBatch } from "@/lib/import-nutritionists.functions";

const BATCH_SIZE = 25;

type CsvRow = {
  id?: string | null;
  email: string;
  full_name: string;
  old_plan: string;
  professional_id?: string | null;
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
  const full_name = get("full_name", "name", "nome");
  if (!email || !full_name) return null;
  return {
    id: get("id", "user_id") || null,
    email,
    full_name,
    old_plan: (get("plan", "plan_type", "old_plan") || "free").toLowerCase(),
    professional_id: get("professional_id", "crn") || null,
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
  const [stats, setStats] = useState({ created: 0, skipped: 0, failed: 0 });
  const [errors, setErrors] = useState<Array<{ email: string; reason?: string }>>([]);

  const reset = () => {
    setRows([]);
    setFileName("");
    setDone(0);
    setStats({ created: 0, skipped: 0, failed: 0 });
    setErrors([]);
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
    setStats({ created: 0, skipped: 0, failed: 0 });
    setErrors([]);
    const batchId = `import-${Date.now()}`;
    let processed = 0;
    let created = 0, skipped = 0, failed = 0;
    const localErrors: Array<{ email: string; reason?: string }> = [];

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const chunk = rows.slice(i, i + BATCH_SIZE);
      try {
        const res = await importFn({ data: { batch: batchId, rows: chunk } });
        created += res.created;
        skipped += res.skipped;
        failed += res.failed;
        for (const d of res.details) {
          if (d.status === "failed") localErrors.push({ email: d.email, reason: d.reason });
        }
      } catch (err) {
        failed += chunk.length;
        const msg = err instanceof Error ? err.message : String(err);
        for (const r of chunk) localErrors.push({ email: r.email, reason: msg });
      }
      processed += chunk.length;
      setDone(processed);
      setStats({ created, skipped, failed });
      setErrors([...localErrors]);
    }

    setRunning(false);
    toast.success(`Importação concluída: ${created} criados, ${skipped} pulados, ${failed} falhas`);
    onFinished();
  };

  const progress = rows.length > 0 ? Math.round((done / rows.length) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!running) { onOpenChange(o); if (!o) reset(); } }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl font-normal">Importar nutricionistas</DialogTitle>
          <DialogDescription>
            Envie um CSV com colunas: <code>id</code> (opcional, UUID), <code>email</code>, <code>full_name</code>,{" "}
            <code>plan</code> (free | basic | premium | pro | black). Os usuários entram bloqueados e devem ser
            liberados manualmente.
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
              <div className="flex gap-4 text-xs pt-1">
                <span className="inline-flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="h-3 w-3" /> {stats.created} criados
                </span>
                <span className="text-muted-foreground">{stats.skipped} pulados</span>
                <span className="inline-flex items-center gap-1 text-destructive">
                  <AlertCircle className="h-3 w-3" /> {stats.failed} falhas
                </span>
              </div>
            </div>
          )}

          {errors.length > 0 && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 max-h-40 overflow-y-auto">
              <p className="text-xs font-medium text-destructive mb-1">Falhas ({errors.length})</p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {errors.slice(0, 50).map((e, i) => (
                  <li key={i}><span className="font-mono">{e.email}</span> — {e.reason}</li>
                ))}
                {errors.length > 50 && <li>… e mais {errors.length - 50}</li>}
              </ul>
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
