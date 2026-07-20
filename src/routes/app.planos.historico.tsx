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
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as TxRow[];
    },
  });

  const filteredTx = (txQ.data ?? []).filter((t) => {
    if (txFilter === "all") return true;
    if (txFilter === "in") return t.type !== "debit";
    return t.type === "debit";
  });

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
            <CardHeader className="flex flex-row items-center justify-between">
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
                  Nenhuma movimentação registrada.
                </p>
              ) : (
                <div className="divide-y">
                  {filteredTx.map((t) => {
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
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
