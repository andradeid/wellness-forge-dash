import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Link2, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getHublaOverview, linkHublaPending, searchHublaUsers } from "@/lib/hubla-admin.functions";

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString("pt-BR") : "—");
const fmtBRL = (c: number | null) =>
  ((c ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const PLANS = [
  { v: "", l: "Manter plano atual" },
  { v: "starter", l: "Starter" },
  { v: "pro", l: "Pro" },
  { v: "legado_500", l: "Legado 500" },
  { v: "clinica", l: "Clínica" },
] as const;

function LinkRow({ pendingId, onDone }: { pendingId: string; onDone: () => void }) {
  const [plan, setPlan] = useState<string>("");
  const search = useServerFn(searchHublaUsers);
  const link = useServerFn(linkHublaPending);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Array<{ id: string; email: string | null; full_name: string | null }>>([]);
  const [busy, setBusy] = useState(false);

  const doSearch = async () => {
    if (q.trim().length < 2) return;
    setBusy(true);
    try { setResults(await search({ data: { q } })); } catch { toast.error("Falha na busca."); }
    setBusy(false);
  };
  const doLink = async (userId: string, email: string | null) => {
    if (!confirm(`Vincular este pagamento a ${email} e renovar a assinatura?`)) return;
    setBusy(true);
    try {
      const r = await link({ data: { pendingId, userId, planType: (plan || undefined) as any } });
      toast.success(r.status === "renewed" ? `Renovado: ${r.creditsAdded} créditos.` : "Fatura já processada; pendência encerrada.");
      onDone();
    } catch (e: any) { toast.error(e?.message ?? "Falha ao vincular."); }
    setBusy(false);
  };

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por e-mail ou nome"
          onKeyDown={(e) => e.key === "Enter" && doSearch()} className="h-9" />
        <Button size="sm" variant="outline" onClick={doSearch} disabled={busy} className="rounded-full">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </div>
      <select value={plan} onChange={(e) => setPlan(e.target.value)} aria-label="Plano"
        className="h-9 w-full rounded-lg border bg-background px-2 text-sm">
        {PLANS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
      {results.map((u) => (
        <div key={u.id} className="flex items-center justify-between text-sm border rounded-lg px-3 py-2">
          <span>{u.full_name ?? "—"} · {u.email}</span>
          <Button size="sm" onClick={() => doLink(u.id, u.email)} disabled={busy} className="rounded-full">Vincular</Button>
        </div>
      ))}
    </div>
  );
}

export function HublaSection() {
  const fetchOverview = useServerFn(getHublaOverview);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["hubla-overview"], queryFn: () => fetchOverview(), staleTime: 30_000 });
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <Card className="rounded-2xl border bg-card shadow-sm">
      <CardHeader className="border-b">
        <CardTitle className="text-lg font-serif font-normal">Hubla — renovações</CardTitle>
        <p className="text-xs text-muted-foreground">URL: https://lumma.ia.br/api/public/hubla-webhook</p>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>
        ) : (
          <>
            <div className="text-sm">
              <span className="text-muted-foreground">Último evento: </span>
              {data?.lastEvent ? (
                <>{fmtDate(data.lastEvent.created_at)} · {data.lastEvent.event}{" "}
                  <Badge variant="outline" className="rounded-full ml-1">{data.lastEvent.status}</Badge></>
              ) : "nenhum evento recebido ainda"}
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Pagamentos sem aluna vinculada ({data?.pending.length ?? 0})</p>
              {data?.pending.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma pendência.</p>}
              <div className="space-y-2">
                {data?.pending.map((p) => (
                  <div key={p.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap text-sm">
                      <div>
                        <p className="font-medium">{p.name ?? "—"} · {p.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.reason ? `${p.reason} · ` : ""}{p.offer_name ?? "Oferta"} · {fmtBRL(p.amount_cents)} · venda {fmtDate(p.sale_date)}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" className="rounded-full"
                        onClick={() => setOpenId(openId === p.id ? null : p.id)}>
                        <Link2 className="h-4 w-4" /> Vincular a um usuário
                      </Button>
                    </div>
                    {openId === p.id && (
                      <LinkRow pendingId={p.id} onDone={() => { setOpenId(null); qc.invalidateQueries({ queryKey: ["hubla-overview"] }); }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
