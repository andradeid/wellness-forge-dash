import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronRight, Search, Stethoscope, Users, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";


export const Route = createFileRoute("/app/admin/nutritionists")({
  component: NutritionistsPage,
});

interface Row {
  id: string;
  full_name: string | null;
  email: string;
  created_at: string;
  status: string | null;
  plan_type: string | null;
  current_period_end: string | null;
  seats_override: number | null;
}


function statusVariant(status: string | null): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active": return "default";
    case "trial": return "secondary";
    case "past_due": return "destructive";
    case "canceled": return "outline";
    default: return "outline";
  }
}

function statusLabel(status: string | null) {
  return ({ active: "Ativa", trial: "Trial", past_due: "Atrasada", canceled: "Cancelada" } as Record<string, string>)[status ?? ""] ?? "—";
}

function NutritionistsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      // 1. nutri ids
      const { data: roleRows, error: rErr } = await (supabase as any)
        .from("user_roles")
        .select("user_id")
        .eq("role", "nutri");
      if (rErr) { toast.error(rErr.message); setLoading(false); return; }
      const ids = (roleRows ?? []).map((r: any) => r.user_id);
      if (ids.length === 0) { setRows([]); setLoading(false); return; }

      const [profilesRes, subsRes] = await Promise.all([
        (supabase as any).from("profiles").select("id, full_name, email, created_at").in("id", ids),
        (supabase as any).from("subscriptions").select("user_id, status, plan_type, current_period_end, seats_override").in("user_id", ids),
      ]);
      if (profilesRes.error) toast.error(profilesRes.error.message);
      if (subsRes.error) toast.error(subsRes.error.message);

      const subMap = new Map<string, any>();
      (subsRes.data ?? []).forEach((s: any) => subMap.set(s.user_id, s));

      const merged: Row[] = (profilesRes.data ?? []).map((p: any) => ({
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        created_at: p.created_at,
        status: subMap.get(p.id)?.status ?? null,
        plan_type: subMap.get(p.id)?.plan_type ?? null,
        current_period_end: subMap.get(p.id)?.current_period_end ?? null,
        seats_override: subMap.get(p.id)?.seats_override ?? null,
      }));

      setRows(merged);
      setLoading(false);
    })();
  }, []);

  async function saveSeats(userId: string, value: number | null) {
    const payload: any = {
      user_id: userId,
      seats_override: value,
      updated_at: new Date().toISOString(),
    };
    const { error } = await (supabase as any)
      .from("subscriptions")
      .upsert(payload, { onConflict: "user_id" });
    if (error) {
      toast.error("Erro ao salvar assentos: " + error.message);
      return;
    }
    setRows((prev) => prev.map((r) => (r.id === userId ? { ...r, seats_override: value } : r)));
    toast.success("Assentos atualizados com sucesso.");
  }


  const filtered = rows.filter((r) =>
    (r.full_name ?? "").toLowerCase().includes(search.toLowerCase()) ||
    r.email.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = rows.filter((r) => r.status === "active").length;
  const trialCount = rows.filter((r) => r.status === "trial").length;

  return (
    <div className="space-y-10 max-w-6xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
        <span>Acesso</span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground/80">Nutricionistas</span>
      </div>

      {/* Hero */}
      <div style={{ marginTop: 8, marginBottom: -24 }}>
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
          Gerencie os <span className="italic text-gradient-brand">nutricionistas</span>
        </h1>
      </div>


      {/* Stat tiles */}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "Cadastrados", value: rows.length },
          { label: "Assinaturas Ativas", value: activeCount },
          { label: "Em Período Trial", value: trialCount },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border bg-card shadow-sm"
            style={{ padding: "24px" }}
          >
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              {s.label}
            </p>
            <p className="font-mono font-bold text-4xl tracking-tight text-foreground mt-2">
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Lista */}
      <Card className="rounded-2xl border bg-card shadow-sm">
        <CardHeader className="flex-row items-center justify-between gap-4 border-b">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Acesso
            </p>
            <CardTitle className="text-lg font-serif font-normal mt-1">
              Lista de nutricionistas
            </CardTitle>
          </div>
          <div className="relative w-64 max-w-full">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-xl"
            />
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <div className="h-12 w-12 mx-auto rounded-2xl bg-accent/60 flex items-center justify-center mb-4">
                <Stethoscope className="h-6 w-6 text-accent-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Nenhum nutricionista encontrado.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow
                  className="hover:bg-transparent"
                  style={{ borderBottom: "1.5px solid var(--border)" }}
                >
                  {["Nome", "Email", "Plano", "Status", "Validade", "Assentos", "Cadastro"].map((h, i) => (
                    <TableHead
                      key={h}
                      className={i === 5 ? "w-[160px]" : undefined}
                      style={{
                        fontSize: "11px",
                        fontWeight: 500,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color: "var(--muted-foreground)",
                      }}
                    >
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow
                    key={r.id}
                    className="border-b last:border-0 cursor-pointer transition-colors"
                    style={{ transition: "background 120ms ease" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "oklch(0.97 0.006 285)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                  >
                    <TableCell className="font-medium py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-gradient-brand flex items-center justify-center text-white text-xs font-semibold uppercase">
                          {(r.full_name || r.email).slice(0, 2)}
                        </div>
                        <span>{r.full_name || "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.email}</TableCell>
                    <TableCell className="capitalize">{r.plan_type ?? "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell>{r.current_period_end ? new Date(r.current_period_end).toLocaleDateString("pt-BR") : "—"}</TableCell>
                    <TableCell>
                      <SeatsEditor
                        value={r.seats_override}
                        onSave={(v) => saveSeats(r.id, v)}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{new Date(r.created_at).toLocaleDateString("pt-BR")}</TableCell>
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

function SeatsEditor({
  value,
  onSave,
}: {
  value: number | null;
  onSave: (v: number | null) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<string>(value != null ? String(value) : "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(value != null ? String(value) : "");
  }, [value]);

  const dirty = draft !== (value != null ? String(value) : "");

  async function commit() {
    const trimmed = draft.trim();
    let next: number | null = null;
    if (trimmed !== "") {
      const n = Number(trimmed);
      if (!Number.isInteger(n) || n <= 0) {
        toast.error("Informe um número inteiro positivo (ou vazio para usar o plano).");
        return;
      }
      next = n;
    }
    setSaving(true);
    try {
      await onSave(next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={1}
        step={1}
        value={draft}
        placeholder="—"
        onChange={(e) => setDraft(e.target.value)}
        style={{
          border: "1px solid var(--border)",
          borderRadius: "6px",
          padding: "4px 8px",
          fontFamily: "var(--font-mono)",
          width: "64px",
          textAlign: "center",
          background: "transparent",
          outline: "none",
        }}
      />
      <button
        type="button"
        disabled={!dirty || saving}
        onClick={commit}
        aria-label="Salvar assentos"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted disabled:opacity-30"
        style={{ color: "oklch(0.54 0.13 160)" }}
      >
        <Check className="h-4 w-4" />
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const tones: Record<string, { hue: number; label: string }> = {
    active: { hue: 160, label: "Ativa" },
    trial: { hue: 160, label: "Trial" },
    past_due: { hue: 30, label: "Atrasada" },
    canceled: { hue: 20, label: "Cancelada" },
  };
  const t = tones[status ?? ""] ?? { hue: 285, label: "—" };
  return (
    <span
      style={{
        display: "inline-block",
        backgroundColor: `oklch(0.96 0.04 ${t.hue})`,
        border: `1px solid oklch(0.7 0.12 ${t.hue})`,
        color: `oklch(0.4 0.12 ${t.hue})`,
        fontSize: "11px",
        fontWeight: 500,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        borderRadius: "4px",
        padding: "2px 8px",
      }}
    >
      {t.label}
    </span>
  );
}

