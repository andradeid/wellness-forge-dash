import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search, Wallet, Plus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  findUsers,
  getUserCredits,
  listTransactions,
  adjustBalance,
} from "@/lib/credits-admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/app/admin/credits-audit")({
  component: AuditPage,
});

type User = { id: string; full_name: string | null; email: string };
type Tx = {
  id: string;
  created_at: string;
  agent_key: string | null;
  agent_label: string | null;
  type: "debit" | "credit" | "refund" | "grant";
  amount: number;
  balance_after: number;
  message_preview: string | null;
  metadata: any;
};

const PAGE = 25;

function AuditPage() {
  const { role } = useAuth();
  const fnFind = useServerFn(findUsers);
  const fnCredits = useServerFn(getUserCredits);
  const fnList = useServerFn(listTransactions);
  const fnAdjust = useServerFn(adjustBalance);

  const [q, setQ] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<User | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);

  if (role && role !== "super_admin" && role !== "admin") {
    return <div className="p-12 text-center text-sm text-muted-foreground">Acesso restrito.</div>;
  }

  async function doSearch() {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const r = (await fnFind({ data: { q: q.trim() } })) as User[];
      setResults(r);
      if (r.length === 0) toast.info("Nenhum usuário encontrado");
    } catch (e: any) {
      toast.error(e.message ?? "Erro na busca");
    } finally {
      setSearching(false);
    }
  }

  async function pick(u: User) {
    setSelected(u);
    setResults([]);
    setQ("");
    await refreshUser(u.id);
  }

  async function refreshUser(userId: string) {
    setLoadingTx(true);
    try {
      const [c, t] = await Promise.all([
        fnCredits({ data: { userId } }) as Promise<{ balance: number }>,
        fnList({ data: { userId, limit: PAGE } }) as Promise<Tx[]>,
      ]);
      setBalance(c.balance);
      setTxs(t);
      setHasMore(t.length === PAGE);
    } finally {
      setLoadingTx(false);
    }
  }

  async function loadMore() {
    if (!selected || txs.length === 0) return;
    const last = txs[txs.length - 1];
    setLoadingTx(true);
    try {
      const more = (await fnList({
        data: {
          userId: selected.id,
          cursorCreatedAt: last.created_at,
          cursorId: last.id,
          limit: PAGE,
        },
      })) as Tx[];
      setTxs((prev) => [...prev, ...more]);
      setHasMore(more.length === PAGE);
    } finally {
      setLoadingTx(false);
    }
  }

  async function submitAdjust() {
    if (!selected) return;
    const delta = Number(adjustDelta);
    if (!Number.isInteger(delta) || delta === 0) {
      toast.error("Informe um inteiro diferente de zero (ex.: 10 ou -5)");
      return;
    }
    if (adjustReason.trim().length < 3) {
      toast.error("Justifique o motivo");
      return;
    }
    setAdjusting(true);
    try {
      await fnAdjust({ data: { userId: selected.id, delta, reason: adjustReason.trim() } });
      toast.success("Saldo ajustado");
      setAdjustOpen(false);
      setAdjustDelta("");
      setAdjustReason("");
      await refreshUser(selected.id);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao ajustar");
    } finally {
      setAdjusting(false);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Auditoria de Créditos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void doSearch();
            }}
          >
            <Input
              placeholder="Buscar usuário por e-mail ou ID..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <Button type="submit" disabled={searching}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </form>

          {results.length > 0 && (
            <div className="border rounded-lg divide-y">
              {results.map((u) => (
                <button
                  key={u.id}
                  onClick={() => pick(u)}
                  className="w-full px-4 py-2 text-left hover:bg-muted/50 flex justify-between items-center"
                >
                  <div>
                    <div className="font-medium">{u.full_name ?? "(sem nome)"}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </div>
                  <div className="text-xs font-mono text-muted-foreground">{u.id.slice(0, 8)}…</div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selected && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>{selected.full_name ?? selected.email}</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">{selected.email}</p>
              <div className="flex items-center gap-2 mt-3">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Saldo atual:</span>
                <Badge className="text-base">{balance} créditos</Badge>
              </div>
            </div>
            <Button onClick={() => setAdjustOpen(true)} variant="outline">
              <Plus className="h-4 w-4 mr-1" /> Ajustar Saldo Manual
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Agente</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Saldo após</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txs.map((t) => {
                  const isPositive = t.type === "credit" || t.type === "grant" || t.type === "refund";
                  const sign = isPositive ? "+" : "-";
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(t.created_at).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell>
                        {t.agent_label ? (
                          <Badge variant="secondary">{t.agent_label}</Badge>
                        ) : (
                          <Badge variant="outline">{t.type}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="max-w-md truncate text-xs text-muted-foreground">
                        {t.message_preview ?? "—"}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono font-medium ${
                          isPositive ? "text-emerald-600" : "text-red-600"
                        }`}
                      >
                        {sign}
                        {t.amount}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{t.balance_after}</TableCell>
                    </TableRow>
                  );
                })}
                {txs.length === 0 && !loadingTx && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                      Nenhuma transação.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {hasMore && (
              <div className="flex justify-center mt-4">
                <Button variant="outline" onClick={loadMore} disabled={loadingTx}>
                  {loadingTx ? <Loader2 className="h-4 w-4 animate-spin" /> : "Carregar mais"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajustar saldo manual</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Valor do ajuste (+ adiciona, - desconta)</Label>
              <Input
                type="number"
                placeholder="Ex.: 10 ou -5"
                value={adjustDelta}
                onChange={(e) => setAdjustDelta(e.target.value)}
              />
            </div>
            <div>
              <Label>Motivo (obrigatório)</Label>
              <Textarea
                placeholder="Descreva o motivo do ajuste..."
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitAdjust} disabled={adjusting}>
              {adjusting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar ajuste"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
