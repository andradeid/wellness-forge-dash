import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Loader2, ArrowRight, Sparkles } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCheckoutSessionStatus } from "@/lib/stripe-checkout.functions";

const searchSchema = z.object({
  session_id: z.string().optional(),
});

export const Route = createFileRoute("/app/checkout/sucesso")({
  validateSearch: (s) => searchSchema.parse(s),
  component: CheckoutSucessoPage,
  head: () => ({
    meta: [
      { title: "Compra confirmada — Lumma" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function formatCurrencyBRL(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount == null) return null;
  const value = amount / 100;
  const code = (currency ?? "brl").toUpperCase();
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: code }).format(value);
  } catch {
    return `${code} ${value.toFixed(2)}`;
  }
}

function formatDateBR(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR");
}

function CheckoutSucessoPage() {
  const { session_id } = useSearch({ from: "/app/checkout/sucesso" });
  const confirm = useServerFn(getCheckoutSessionStatus);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["checkout-session", session_id],
    queryFn: () => confirm({ data: { sessionId: session_id! } }),
    enabled: !!session_id,
    // Webhook pode levar 1-3s pra refletir o plano/saldo — refetch progressivo
    refetchInterval: (q) => {
      const d: any = q.state.data;
      if (!d) return false;
      const done = d.paymentStatus === "paid" && (d.balance != null || d.subscription);
      return done ? false : 2000;
    },
    retry: 2,
  });

  if (!session_id) {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              Sessão não informada
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Não recebemos o identificador da compra. Se você acabou de pagar,
              acesse o histórico pra conferir.
            </p>
            <div className="flex gap-2">
              <Button asChild variant="outline">
                <Link to="/app/planos">Ver planos</Link>
              </Button>
              <Button asChild>
                <Link to="/app/planos/historico">Histórico de pagamentos</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (isLoading) {
    return (
      <Shell>
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Confirmando sua compra com o Stripe…</p>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (isError || !data) {
    return (
      <Shell>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-destructive" />
              Não conseguimos confirmar a compra
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {(error as any)?.message ?? "Tente novamente em instantes."}
            </p>
            <div className="flex gap-2">
              <Button onClick={() => refetch()} disabled={isFetching}>
                {isFetching ? "Verificando…" : "Tentar novamente"}
              </Button>
              <Button asChild variant="outline">
                <Link to="/app/planos/historico">Ver histórico</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const paid = data.paymentStatus === "paid" || data.paymentStatus === "no_payment_required";
  const isSubscription = data.kind === "subscription";
  const isPack = data.kind === "pack";
  const total = formatCurrencyBRL(data.amountTotal, data.currency);
  const periodEnd = formatDateBR((data.subscription as any)?.current_period_end);

  return (
    <Shell>
      <Card className="overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-[#e8a04c] to-[#e89bcf]" />
        <CardHeader>
          <div className="flex items-start gap-3">
            {paid ? (
              <CheckCircle2 className="h-7 w-7 text-emerald-500 shrink-0" />
            ) : (
              <Loader2 className="h-7 w-7 animate-spin text-primary shrink-0" />
            )}
            <div>
              <CardTitle className="text-2xl">
                {paid ? "Compra confirmada!" : "Aguardando confirmação do pagamento"}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {paid
                  ? "Obrigada por confiar na Lumma. Tudo pronto pra continuar."
                  : "Assim que o Stripe confirmar, seu plano será ativado automaticamente."}
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoRow label="Status" value={
              <Badge variant={paid ? "default" : "secondary"}>
                {paid ? "Pago" : data.paymentStatus}
              </Badge>
            } />
            {total && <InfoRow label="Total" value={total} />}
            {data.customerEmail && <InfoRow label="E-mail" value={data.customerEmail} />}
            <InfoRow label="Tipo" value={isSubscription ? "Assinatura" : "Pacote de créditos"} />
          </div>

          {isSubscription && data.subscription && (
            <div className="rounded-lg border bg-card p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">Plano ativo</h3>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 text-sm">
                <InfoRow label="Plano" value={String((data.subscription as any).plan_type ?? data.planSlug ?? "—").toUpperCase()} />
                <InfoRow label="Situação" value={(data.subscription as any).status ?? "—"} />
                {periodEnd && <InfoRow label="Próxima renovação" value={periodEnd} />}
                {(data.subscription as any).unlimited_credits && (
                  <InfoRow label="Créditos" value="Ilimitados" />
                )}
              </div>
            </div>
          )}

          {isPack && (
            <div className="rounded-lg border bg-card p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">Créditos adicionados</h3>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 text-sm">
                {data.credits && <InfoRow label="Pacote" value={`+${data.credits} créditos`} />}
                {data.balance != null && <InfoRow label="Saldo atual" value={`${data.balance} créditos`} />}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild className="bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] hover:opacity-90 text-white border-0">
              <Link to="/app">
                Ir para o painel
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/app/planos/historico">Ver histórico</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link to="/app/planos">Ver planos</Link>
            </Button>
          </div>

          {!paid && (
            <p className="text-xs text-muted-foreground">
              Esta página atualiza automaticamente conforme o Stripe confirma o pagamento.
            </p>
          )}
        </CardContent>
      </Card>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6">
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
