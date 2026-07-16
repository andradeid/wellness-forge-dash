import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  Sparkles,
  Coins,
  Check,
  ExternalLink,
  Infinity as InfinityIcon,
  TrendingUp,
  TrendingDown,
  CalendarClock,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMyCredits } from "@/hooks/useCredits";
import { topUpStore } from "@/lib/topup-store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/planos")({
  component: PlanosCreditosPage,
});

const HUBLA_PORTAL_URL = "https://app.hub.la/customer/subscriptions";

const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });

const formatDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";

const formatDateTime = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const planSlugLabel = (slug?: string | null) => {
  switch (slug) {
    case "clinica":
      return "Clínica";
    case "pro":
      return "Pro Individual";
    case "starter":
      return "Starter";
    case "free":
      return "Free";
    default:
      return slug ?? "—";
  }
};

const statusLabel = (s?: string | null) => {
  switch (s) {
    case "active":
      return "Ativa";
    case "trial":
      return "Em teste";
    case "past_due":
      return "Pagamento pendente";
    case "canceled":
      return "Cancelada";
    default:
      return s ?? "—";
  }
};

type SubscriptionRow = {
  plan_type: string | null;
  status: string | null;
  current_period_end: string | null;
  unlimited_credits: boolean | null;
};

type PlanRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  monthly_credits: number;
  price_monthly_cents: number;
  price_yearly_cents: number | null;
  max_seats: number;
};

type PackRow = {
  id: string;
  slug: string;
  name: string;
  credits: number;
  price_cents: number;
  is_highlighted: boolean;
  description: string | null;
  perks: string[];
};


function PlanosCreditosPage() {
  const { user } = useAuth();
  const creditsQuery = useMyCredits();
  const credits = creditsQuery.data;

  const subQuery = useQuery({
    queryKey: ["my-subscription", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("plan_type, status, current_period_end, unlimited_credits")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as SubscriptionRow | null;
    },
  });

  const plansQuery = useQuery({
    queryKey: ["subscription_plans_all_active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select(
          "id, slug, name, description, monthly_credits, price_monthly_cents, price_yearly_cents, max_seats",
        )
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlanRow[];
    },
  });

  const packsQuery = useQuery({
    queryKey: ["credit_packs_all_active"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("credit_packs")
        .select(
          "id, slug, name, credits, price_cents, is_highlighted, description, perks",
        )
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((p: any) => ({
        ...p,
        perks: Array.isArray(p.perks) ? p.perks : [],
      })) as PackRow[];
    },
  });


  const sub = subQuery.data;
  const balance = credits?.balance ?? 0;
  const monthlyQuota = credits?.monthly_quota ?? 0;
  const unlimited = !!(credits as any)?.unlimited;

  const currentPlan = useMemo(
    () =>
      plansQuery.data?.find(
        (p) => p.slug === (sub?.plan_type ?? "free"),
      ) ?? null,
    [plansQuery.data, sub?.plan_type],
  );

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          Planos & Créditos
        </h1>
        <p className="text-sm text-muted-foreground">
          Acompanhe seu plano atual, saldo de créditos e todas as opções
          disponíveis.
        </p>
      </div>

      {/* Hero: plano + créditos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2 rounded-2xl border-0 shadow-md overflow-hidden">
          <div className="bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] p-6 text-white">
            <p className="text-xs uppercase tracking-[0.22em] opacity-90">
              Plano atual
            </p>
            {subQuery.isLoading ? (
              <Skeleton className="h-9 w-48 mt-2 bg-white/30" />
            ) : (
              <h2 className="text-3xl mt-1 font-semibold">
                {planSlugLabel(sub?.plan_type)}
              </h2>
            )}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
              <Badge className="bg-white/20 text-white border-0 rounded-full">
                {statusLabel(sub?.status)}
              </Badge>
              {sub?.current_period_end && (
                <span className="text-xs opacity-95 inline-flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5" />
                  Próxima renovação: {formatDate(sub.current_period_end)}
                </span>
              )}
            </div>
          </div>
          <CardContent className="p-6 space-y-3">
            <p className="text-sm text-muted-foreground">
              Sua assinatura é gerenciada pela Hubla. Acesse o portal para
              trocar de plano, atualizar forma de pagamento ou baixar faturas.
            </p>
            <Button
              asChild
              className="rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white hover:opacity-90 border-0"
            >
              <a
                href={HUBLA_PORTAL_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4" />
                Gerenciar assinatura
              </a>
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-0 shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Coins className="h-4 w-4 text-[#e8a04c]" />
              Saldo de créditos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {creditsQuery.isLoading ? (
              <Skeleton className="h-12 w-32" />
            ) : unlimited ? (
              <div className="flex items-center gap-2 text-4xl font-semibold text-foreground">
                <InfinityIcon className="h-9 w-9 text-[#e89bcf]" />
                Ilimitado
              </div>
            ) : (
              <div>
                <p className="text-4xl font-mono font-semibold text-foreground">
                  {balance}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  disponíveis para uso
                </p>
              </div>
            )}

            {!unlimited && (
              <div className="pt-3 border-t space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Cota mensal do plano</span>
                  <span className="font-medium text-foreground">
                    {monthlyQuota}
                  </span>
                </div>
                {credits?.quota_reset_at && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Renova em</span>
                    <span className="font-medium text-foreground">
                      {formatDate(credits.quota_reset_at)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {!unlimited && (
              <Button
                onClick={() => topUpStore.open()}
                className="w-full rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white hover:opacity-90 border-0"
              >
                <Sparkles className="h-4 w-4" />
                Comprar créditos
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Planos disponíveis */}
      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Planos disponíveis
          </h2>
          <p className="text-sm text-muted-foreground">
            Compare as opções de assinatura e créditos mensais incluídos.
          </p>
        </div>

        {plansQuery.isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-2xl" />
            ))}
          </div>
        ) : plansQuery.data && plansQuery.data.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {plansQuery.data.map((p) => {
              const isCurrent = currentPlan?.id === p.id;
              return (
                <Card
                  key={p.id}
                  className={cn(
                    "rounded-2xl border shadow-sm transition-all hover:shadow-md flex flex-col",
                    isCurrent && "ring-2 ring-[#e8a04c] border-transparent",
                  )}
                >
                  <CardHeader className="space-y-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg font-semibold">
                        {p.name}
                      </CardTitle>
                      {isCurrent && (
                        <Badge className="bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white border-0 rounded-full">
                          Seu plano
                        </Badge>
                      )}
                    </div>
                    {p.description && (
                      <p className="text-sm text-muted-foreground min-h-[2.5rem]">
                        {p.description}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col justify-between space-y-4">
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-semibold text-foreground">
                          {p.price_monthly_cents > 0
                            ? formatBRL(p.price_monthly_cents)
                            : "Grátis"}
                        </span>
                        {p.price_monthly_cents > 0 && (
                          <span className="text-sm text-muted-foreground">
                            /mês
                          </span>
                        )}
                      </div>
                      {p.price_yearly_cents ? (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          ou {formatBRL(p.price_yearly_cents)}/ano
                        </p>
                      ) : null}
                    </div>

                    <ul className="space-y-2 text-sm">
                      <li className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-[#e89bcf] mt-0.5 shrink-0" />
                        <span>
                          <strong>{p.monthly_credits}</strong> créditos por mês
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-[#e89bcf] mt-0.5 shrink-0" />
                        <span>
                          {p.max_seats > 1
                            ? `Até ${p.max_seats} assentos`
                            : "1 assento (usuário)"}
                        </span>
                      </li>
                    </ul>

                    <Button
                      asChild
                      variant={isCurrent ? "outline" : "default"}
                      disabled={isCurrent}
                      className={cn(
                        "rounded-full mt-2",
                        !isCurrent &&
                          "bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white hover:opacity-90 border-0",
                      )}
                    >
                      {isCurrent ? (
                        <span>Plano atual</span>
                      ) : (
                        <a
                          href={HUBLA_PORTAL_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-4 w-4" />
                          Escolher plano
                        </a>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="rounded-2xl p-8 text-center text-sm text-muted-foreground">
            Nenhum plano disponível no momento.
          </Card>
        )}
      </section>

      {/* Pacotes de créditos avulsos */}
      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            Pacotes de créditos
          </h2>
          <p className="text-sm text-muted-foreground">
            Créditos avulsos que não expiram — ideais para picos de uso.
          </p>
        </div>

        {packsQuery.isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-56 rounded-2xl" />
            ))}
          </div>
        ) : packsQuery.data && packsQuery.data.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {packsQuery.data.map((pack) => (
              <Card
                key={pack.id}
                className={cn(
                  "rounded-2xl border shadow-sm transition-all hover:shadow-md flex flex-col",
                  pack.is_highlighted &&
                    "ring-2 ring-[#e89bcf] border-transparent",
                )}
              >
                <CardHeader className="space-y-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-semibold">
                      {pack.name}
                    </CardTitle>
                    {pack.is_highlighted && (
                      <Badge className="bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white border-0 rounded-full">
                        Popular
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-semibold text-foreground">
                      {pack.credits}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      créditos
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <p className="text-xl font-semibold text-foreground">
                      {pack.price_cents > 0 ? formatBRL(pack.price_cents) : "—"}
                    </p>
                    {pack.description && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {pack.description}
                      </p>
                    )}
                  </div>

                  {pack.perks.length > 0 && (
                    <ul className="space-y-1.5 text-sm">
                      {pack.perks.map((perk, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <Check className="h-4 w-4 text-[#e89bcf] mt-0.5 shrink-0" />
                          <span className="text-muted-foreground">{perk}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <Button
                    onClick={() => topUpStore.open()}
                    className="rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white hover:opacity-90 border-0 mt-2"
                  >
                    <Sparkles className="h-4 w-4" />
                    Comprar pacote
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="rounded-2xl p-8 text-center text-sm text-muted-foreground">
            Nenhum pacote disponível no momento.
          </Card>
        )}
      </section>
    </div>
  );
}
