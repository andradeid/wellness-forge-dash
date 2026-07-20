import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { ArrowLeft, ExternalLink, Receipt, Coins, TrendingUp, TrendingDown, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/planos/historico")({
  component: HistoricoPage,
});

const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

type PaymentRow = {
  id: string;
  kind: "subscription" | "pack";
  description: string;
  amount_cents: number;
  currency: string;
  status: "paid" | "failed" | "refunded" | "pending";
  credits_added: number | null;
  hosted_invoice_url: string | null;
  receipt_url: string | null;
  created_at: string;
};

type TxRow = {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  agent_label: string | null;
  message_preview: string | null;
  created_at: string;
};

const statusBadge = (s: PaymentRow["status"]) => {
  const map: Record<PaymentRow["status"], { label: string; className: string }> = {
    paid: { label: "Pago", className: "bg-green-100 text-green-700 border-green-200" },
    failed: { label: "Falhou", className: "bg-red-100 text-red-700 border-red-200" },
    refunded: { label: "Reembolsado", className: "bg-amber-100 text-amber-700 border-amber-200" },
    pending: { label: "Pendente", className: "bg-slate-100 text-slate-700 border-slate-200" },
  };
  const { label, className } = map[s];
  return <Badge variant="outline" className={cn("rounded-full text-xs", className)}>{label}</Badge>;
};

function HistoricoPage() {
  const { user } = useAuth();
  const userId = user?.id;
  const [txFilter, setTxFilter] = useState<"all" | "in" | "out">("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pageSize, setPageSize] = useState<number>(20);
  const [page, setPage] = useState(1);

  const paymentsQ = useQuery({
    queryKey: ["payment-history", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_history" as any)
        .select("id,kind,description,amount_cents,currency,status,credits_added,hosted_invoice_url,receipt_url,created_at")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as PaymentRow[];
    },
  });

  const txQ = useQuery({
    queryKey: ["credit-transactions", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_transactions")
        .select("id,type,amount,balance_after,agent_label,message_preview,created_at")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as TxRow[];
    },
  });

  const filteredTx = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom + "T00:00:00").getTime() : null;
    const to = dateTo ? new Date(dateTo + "T23:59:59").getTime() : null;
    return (txQ.data ?? []).filter((t) => {
      if (txFilter === "in" && t.type === "debit") return false;
      if (txFilter === "out" && t.type !== "debit") return false;
      if (q) {
        const hay = `${t.agent_label ?? ""} ${t.message_preview ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const ts = new Date(t.created_at).getTime();
      if (from && ts < from) return false;
      if (to && ts > to) return false;
      return true;
    });
  }, [txQ.data, txFilter, search, dateFrom, dateTo]);

  useEffect(() => {
    setPage(1);
  }, [txFilter, search, dateFrom, dateTo, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredTx.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedTx = filteredTx.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const clearFilters = () => {
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setTxFilter("all");
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="rounded-full">
          <Link to="/app/planos">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl md:text-3xl font-semibold text-foreground">
          Histórico de pagamentos e créditos
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Consulte suas faturas, compras avulsas e a movimentação de créditos.
        </p>
      </div>

      <Tabs defaultValue="payments" className="w-full">
        <TabsList className="rounded-full">
          <TabsTrigger value="payments" className="rounded-full gap-2">
            <Receipt className="h-4 w-4" />
            Pagamentos
          </TabsTrigger>
          <TabsTrigger value="credits" className="rounded-full gap-2">
            <Coins className="h-4 w-4" />
            Movimentação de créditos
          </TabsTrigger>
        </TabsList>

        {/* PAGAMENTOS */}
        <TabsContent value="payments" className="mt-4">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Últimos pagamentos</CardTitle>
            </CardHeader>
            <CardContent>
              {paymentsQ.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              ) : (paymentsQ.data?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Nenhum pagamento registrado ainda.
                </p>
              ) : (
                <div className="divide-y">
                  {paymentsQ.data!.map((p) => (
                    <div
                      key={p.id}
                      className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 py-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {p.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(p.created_at)}
                          {p.credits_added ? ` · +${p.credits_added} créditos` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-foreground">
                          {formatBRL(p.amount_cents)}
                        </span>
                        {statusBadge(p.status)}
                        {(p.hosted_invoice_url || p.receipt_url) && (
                          <a
                            href={(p.hosted_invoice_url ?? p.receipt_url) as string}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-[#e8a04c] hover:underline inline-flex items-center gap-1"
                          >
                            Ver recibo
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CRÉDITOS */}
        <TabsContent value="credits" className="mt-4">
          <Card className="rounded-2xl">
            <CardHeader className="space-y-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <CardTitle className="text-base">Movimentação de créditos</CardTitle>
                <div className="flex gap-1">
                  {(["all", "in", "out"] as const).map((f) => (
                    <Button
                      key={f}
                      size="sm"
                      variant={txFilter === f ? "default" : "ghost"}
                      className={cn(
                        "rounded-full text-xs h-8",
                        txFilter === f && "bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white border-0",
                      )}
                      onClick={() => setTxFilter(f)}
                    >
                      {f === "all" ? "Todos" : f === "in" ? "Entradas" : "Saídas"}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col md:flex-row gap-2 md:items-center">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por agente ou descrição…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 rounded-full h-9 text-sm"
                  />
                </div>
                <div className="flex gap-2 items-center">
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="rounded-full h-9 text-sm w-[150px]"
                  />
                  <span className="text-xs text-muted-foreground">até</span>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="rounded-full h-9 text-sm w-[150px]"
                  />
                </div>
                {(search || dateFrom || dateTo || txFilter !== "all") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full text-xs h-9"
                    onClick={clearFilters}
                  >
                    Limpar
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {txQ.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : filteredTx.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Nenhuma movimentação encontrada com os filtros atuais.
                </p>
              ) : (
                <>
                  <div className="divide-y">
                    {pagedTx.map((t) => {
                      const isOut = t.type === "debit";
                      return (
                        <div
                          key={t.id}
                          className="flex items-center gap-3 py-3"
                        >
                          <div
                            className={cn(
                              "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                              isOut ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600",
                            )}
                          >
                            {isOut ? (
                              <TrendingDown className="h-4 w-4" />
                            ) : (
                              <TrendingUp className="h-4 w-4" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {t.agent_label ?? (isOut ? "Uso de agente" : "Crédito recebido")}
                            </p>
                            {t.message_preview && (
                              <p className="text-xs text-muted-foreground truncate">
                                {t.message_preview}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {formatDateTime(t.created_at)}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p
                              className={cn(
                                "text-sm font-semibold",
                                isOut ? "text-red-600" : "text-green-600",
                              )}
                            >
                              {isOut ? "−" : "+"}
                              {t.amount}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              saldo: {t.balance_after}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Paginação */}
                  <div className="flex flex-col md:flex-row items-center justify-between gap-3 pt-4 mt-2 border-t">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Mostrar</span>
                      <Select
                        value={String(pageSize)}
                        onValueChange={(v) => setPageSize(Number(v))}
                      >
                        <SelectTrigger className="h-8 w-[72px] rounded-full text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[10, 20, 30, 50].map((n) => (
                            <SelectItem key={n} value={String(n)}>
                              {n}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span>
                        de {filteredTx.length} {filteredTx.length === 1 ? "item" : "itens"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-full h-8"
                        disabled={currentPage <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Anterior
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        Página {currentPage} de {totalPages}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-full h-8"
                        disabled={currentPage >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      >
                        Próxima
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}
