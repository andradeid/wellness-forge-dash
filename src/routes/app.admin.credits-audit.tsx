import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, Wallet, Plus, Infinity as InfinityIcon, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  findUsers,
  listNutritionists,
  getUserCredits,
  listTransactions,
  adjustBalance,
  setUnlimited,
} from "@/lib/credits-admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/app/admin/credits-audit")({
  component: AuditPage,
});

type User = {
  id: string;
  full_name: string | null;
  email: string;
  plan_type?: string | null;
  unlimited_credits?: boolean;
  balance?: number;
};
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
  by_admin: { full_name: string | null; email: string } | null;
};

const PAGE = 25;

function AuditPage() {
  const { role } = useAuth();
  const isSuperAdmin = role === "super_admin";
  const fnFind = useServerFn(findUsers);
  const fnListNutris = useServerFn(listNutritionists);
  const fnCredits = useServerFn(getUserCredits);
  const fnList = useServerFn(listTransactions);
  const fnAdjust = useServerFn(adjustBalance);
  const fnSetUnlimited = useServerFn(setUnlimited);

  const nutrisQuery = useQuery({
    queryKey: ["admin", "nutritionists"],
    queryFn: () => fnListNutris() as Promise<User[]>,
    enabled: role === "super_admin" || role === "admin",
    staleTime: 60_000,
  });

  const [q, setQ] = useState("");

  const filteredNutris = useMemo<User[]>(() => {
    const list = nutrisQuery.data ?? [];
    const term = q.trim().toLowerCase();
    if (!term) return list;
    return list.filter(
      (u) =>
        (u.full_name ?? "").toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term),
    );
  }, [nutrisQuery.data, q]);
  const [results, setResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<User | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [unlimited, setUnlimitedState] = useState<boolean>(false);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [page, setPage] = useState(1);
  const [totalTx, setTotalTx] = useState(0);
  const totalPages = Math.max(1, Math.ceil(totalTx / PAGE));
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [unlimitedOpen, setUnlimitedOpen] = useState(false);
  const [unlimitedTarget, setUnlimitedTarget] = useState(false);
  const [unlimitedReason, setUnlimitedReason] = useState("");
  const [savingUnlimited, setSavingUnlimited] = useState(false);

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

  async function openAudit(u: User) {
    setSelected(u);
    setResults([]);
    setPage(1);
    await loadCreditsAndPage(u.id, 1);
  }

  async function openAdjust(u: User) {
    setSelected(u);
    setResults([]);
    setAdjustDelta("");
    setAdjustReason("");
    setAdjustOpen(true);
    await loadCreditsAndPage(u.id, 1);
  }

  async function loadCreditsAndPage(userId: string, pageNum: number) {
    setLoadingTx(true);
    try {
      const [c, t] = await Promise.all([
        fnCredits({ data: { userId } }) as Promise<{ balance: number; unlimited_credits: boolean }>,
        fnList({ data: { userId, page: pageNum, pageSize: PAGE } }) as Promise<{
          rows: Tx[];
          total: number;
        }>,
      ]);
      setBalance(c.balance);
      setUnlimitedState(!!c.unlimited_credits);
      setTxs(t.rows);
      setTotalTx(t.total);
      setPage(pageNum);
    } finally {
      setLoadingTx(false);
    }
  }

  async function goToPage(p: number) {
    if (!selected || p < 1 || p > totalPages || p === page) return;
    setLoadingTx(true);
    try {
      const t = (await fnList({
        data: { userId: selected.id, page: p, pageSize: PAGE },
      })) as { rows: Tx[]; total: number };
      setTxs(t.rows);
      setTotalTx(t.total);
      setPage(p);
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
      await loadCreditsAndPage(selected.id, page);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao ajustar");
    } finally {
      setAdjusting(false);
    }
  }

  function openUnlimitedDialog(next: boolean) {
    setUnlimitedTarget(next);
    setUnlimitedReason("");
    setUnlimitedOpen(true);
  }

  async function submitUnlimited() {
    if (!selected) return;
    if (unlimitedReason.trim().length < 3) {
      toast.error("Justifique o motivo");
      return;
    }
    setSavingUnlimited(true);
    try {
      await fnSetUnlimited({
        data: {
          userId: selected.id,
          unlimited: unlimitedTarget,
          reason: unlimitedReason.trim(),
        },
      });
      toast.success(unlimitedTarget ? "Ilimitado ativado" : "Ilimitado desativado");
      setUnlimitedOpen(false);
      await loadCreditsAndPage(selected.id, page);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao alterar ilimitado");
    } finally {
      setSavingUnlimited(false);
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
              placeholder="Filtrar por nome ou e-mail..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <Button type="submit" disabled={searching} title="Busca avançada (ID/qualquer usuário)">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </form>

          {results.length > 0 && (
            <div className="border rounded-lg divide-y">
              {results.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  selected={selected?.id === u.id}
                  onAudit={() => openAudit(u)}
                  onAdjust={() => openAdjust(u)}
                  canAdjust={isSuperAdmin}
                />
              ))}
            </div>
          )}

          {results.length === 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Nutricionistas {nutrisQuery.data ? `(${filteredNutris.length})` : ""}
              </div>
              {nutrisQuery.isLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando...
                </div>
              ) : filteredNutris.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  Nenhum nutricionista encontrado.
                </div>
              ) : (
                <div className="border rounded-lg divide-y max-h-[480px] overflow-y-auto">
                  {filteredNutris.map((u) => (
                    <UserRow
                      key={u.id}
                      user={u}
                      selected={selected?.id === u.id}
                      onAudit={() => openAudit(u)}
                      onAdjust={() => openAdjust(u)}
                      canAdjust={isSuperAdmin}
                    />
                  ))}
                </div>
              )}
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
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Saldo atual:</span>
                <Badge className="text-base">{balance} créditos</Badge>
                {unlimited && (
                  <Badge className="bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white border-0">
                    <InfinityIcon className="h-3 w-3 mr-1" /> Ilimitado
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 mt-3 rounded-md border bg-muted/30 px-3 py-2">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="unlimited-toggle" className="text-sm flex-1 cursor-pointer">
                  Créditos ilimitados {isSuperAdmin ? "" : "(somente super_admin)"}
                </Label>
                <Switch
                  id="unlimited-toggle"
                  checked={unlimited}
                  disabled={!isSuperAdmin || savingUnlimited}
                  onCheckedChange={(v) => openUnlimitedDialog(v)}
                />
              </div>
            </div>
            <Button
              onClick={() => setAdjustOpen(true)}
              variant="outline"
              disabled={!isSuperAdmin}
              title={isSuperAdmin ? "" : "Somente super_admin pode ajustar saldo"}
            >
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
                  <TableHead>Feito por</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Saldo após</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {txs.map((t) => {
                  const isPositive = t.type === "credit" || t.type === "grant" || t.type === "refund";
                  const sign = isPositive ? "+" : "-";
                  const isManual = !!t.metadata?.manual;
                  return (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(t.created_at).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell>
                        {isManual ? (
                          <Badge variant="outline" className="border-amber-500 text-amber-700">
                            Manual
                          </Badge>
                        ) : t.agent_label ? (
                          <Badge variant="secondary">{t.agent_label}</Badge>
                        ) : (
                          <Badge variant="outline">{t.type}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="max-w-md truncate text-xs text-muted-foreground">
                        {t.message_preview ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {t.by_admin ? (
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {t.by_admin.full_name ?? t.by_admin.email}
                            </span>
                            {t.by_admin.full_name && (
                              <span className="text-[10px] text-muted-foreground">
                                {t.by_admin.email}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell
                        className={`text-right font-mono font-medium ${
                          t.amount === 0
                            ? "text-muted-foreground"
                            : isPositive
                            ? "text-emerald-600"
                            : "text-red-600"
                        }`}
                      >
                        {t.amount === 0 ? "—" : `${sign}${t.amount}`}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{t.balance_after}</TableCell>
                    </TableRow>
                  );
                })}
                {txs.length === 0 && !loadingTx && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">

                      Nenhuma transação.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {totalTx > 0 && (
              <div className="flex items-center justify-between mt-4 text-sm">
                <span className="text-muted-foreground">
                  Página {page} de {totalPages} — {totalTx} transações
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => goToPage(page - 1)}
                    disabled={loadingTx || page <= 1}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => goToPage(page + 1)}
                    disabled={loadingTx || page >= totalPages}
                  >
                    Próximo
                  </Button>
                </div>
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

      <Dialog open={unlimitedOpen} onOpenChange={setUnlimitedOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {unlimitedTarget ? "Ativar créditos ilimitados" : "Desativar créditos ilimitados"}
            </DialogTitle>
            <DialogDescription>
              {unlimitedTarget
                ? "Este usuário deixará de consumir créditos em todas as interações."
                : "Este usuário voltará a consumir créditos normalmente."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Motivo (obrigatório)</Label>
              <Textarea
                placeholder="Ex.: cliente legado com compromisso contratual de ilimitado"
                value={unlimitedReason}
                onChange={(e) => setUnlimitedReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnlimitedOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitUnlimited} disabled={savingUnlimited}>
              {savingUnlimited ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : unlimitedTarget ? (
                "Ativar ilimitado"
              ) : (
                "Desativar ilimitado"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

  );
}

function UserRow({
  user,
  selected,
  onAudit,
  onAdjust,
  canAdjust,
}: {
  user: User;
  selected: boolean;
  onAudit: () => void;
  onAdjust: () => void;
  canAdjust: boolean;
}) {
  const planLabel = user.unlimited_credits
    ? "Ilimitado"
    : user.plan_type
    ? user.plan_type.charAt(0).toUpperCase() + user.plan_type.slice(1)
    : "—";
  const creditsLabel = user.unlimited_credits ? "Ilimitado" : `${user.balance ?? 0} créditos`;
  return (
    <div
      className={`w-full px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-muted/50 ${
        selected ? "bg-muted/60" : ""
      }`}
    >
      <button
        onClick={onAudit}
        className="flex-1 min-w-0 text-left"
      >
        <div className="font-medium truncate">{user.full_name ?? "(sem nome)"}</div>
        <div className="text-xs text-muted-foreground truncate">{user.email}</div>
      </button>
      <div className="hidden md:flex items-center gap-2 shrink-0">
        {user.unlimited_credits ? (
          <Badge className="bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white border-0">
            <InfinityIcon className="h-3 w-3 mr-1" /> {planLabel}
          </Badge>
        ) : (
          <Badge variant="secondary">{planLabel}</Badge>
        )}
        <Badge variant="outline" className="font-mono">{creditsLabel}</Badge>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" variant="outline" onClick={onAudit}>
          <Search className="h-3.5 w-3.5 mr-1" /> Ver auditoria
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onAdjust}
          disabled={!canAdjust}
          title={canAdjust ? "" : "Somente super_admin"}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Ajustar saldo
        </Button>
      </div>
    </div>
  );
}

