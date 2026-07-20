import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Coins, Info, Sparkles, TrendingUp, HelpCircle, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { createPackCheckout, createSubscriptionCheckout } from "@/lib/stripe-checkout.functions";
import { toast } from "sonner";

interface Pack {
  id: string;
  slug: string;
  name: string;
  credits: number;
  price_cents: number;
  is_highlighted: boolean;
  perks: string[];
}

interface Plan {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  monthly_credits: number;
  price_monthly_cents: number;
}

interface AgentCost {
  agent_key: string;
  display_name: string;
  cost_credits: number;
}

const SUPPORT_WHATSAPP =
  (import.meta.env.VITE_SUPPORT_WHATSAPP as string | undefined) ?? "5511999999999";

const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function TopUpDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const identifier = user?.email ?? user?.id ?? "não identificado";
  const packCheckout = useServerFn(createPackCheckout);
  const subCheckout = useServerFn(createSubscriptionCheckout);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handlePackCheckout = async (slug: string) => {
    setLoadingId(`pack:${slug}`);
    try {
      const { url } = await packCheckout({ data: { packSlug: slug } });
      if (url) window.location.href = url;
      else throw new Error("URL de checkout ausente");
    } catch (e: any) {
      toast.error("Não foi possível abrir o checkout", {
        description: e?.message ?? "Tente novamente em instantes.",
      });
      setLoadingId(null);
    }
  };

  const handleSubscriptionCheckout = async (planSlug: "starter" | "pro", cycle: "monthly" | "yearly") => {
    setLoadingId(`plan:${planSlug}:${cycle}`);
    try {
      const { url } = await subCheckout({ data: { planSlug, cycle } });
      if (url) window.location.href = url;
      else throw new Error("URL de checkout ausente");
    } catch (e: any) {
      toast.error("Não foi possível abrir o checkout", {
        description: e?.message ?? "Tente novamente em instantes.",
      });
      setLoadingId(null);
    }
  };

  const { data: packs = [] } = useQuery({
    queryKey: ["credit_packs"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("credit_packs")
        .select("id, slug, name, credits, price_cents, is_highlighted, perks")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((p: any) => ({
        ...p,
        perks: Array.isArray(p.perks) ? p.perks : [],
      })) as Pack[];
    },
  });

  const { data: plans = [] } = useQuery({
    queryKey: ["subscription_plans_active"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("id, slug, name, description, monthly_credits, price_monthly_cents")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });

  const { data: agentCosts = [] } = useQuery({
    queryKey: ["agent_costs_active"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_costs")
        .select("agent_key, display_name, cost_credits")
        .eq("is_active", true)
        .order("cost_credits", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AgentCost[];
    },
  });

  const starterPlan = useMemo(
    () => plans.find((p) => p.slug === "starter"),
    [plans],
  );
  const proPlan = useMemo(
    () => plans.find((p) => p.slug === "pro"),
    [plans],
  );

  const buildWhatsAppLink = (subject: string, lines: string[]) => {
    const message = [
      `Olá, ${subject} no LUMMA.`,
      "",
      ...lines,
      `*Usuário:* ${identifier}`,
    ].join("\n");
    return `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(message)}`;
  };

  const CostTooltip = (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            Como os créditos são consumidos?
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-medium mb-1">Custo por interação</p>
            {agentCosts.length === 0 ? (
              <p className="text-xs">Carregando…</p>
            ) : (
              agentCosts.map((a) => (
                <div key={a.agent_key} className="flex justify-between gap-3 text-xs">
                  <span>{a.display_name}</span>
                  <span className="font-mono">
                    {a.cost_credits} {a.cost_credits === 1 ? "crédito" : "créditos"}
                  </span>
                </div>
              ))
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf]">
            <Coins className="h-6 w-6 text-white" />
          </div>
          <DialogTitle className="text-center text-2xl">Aumentar sua capacidade</DialogTitle>
          <DialogDescription className="text-center">
            Faça upgrade do seu plano para mais pacientes por mês, ou compre créditos
            avulsos para um pico pontual.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="upgrade" className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upgrade">
              <TrendingUp className="h-4 w-4 mr-2" /> Upgrade de plano
            </TabsTrigger>
            <TabsTrigger value="avulso">
              <Coins className="h-4 w-4 mr-2" /> Créditos avulsos
            </TabsTrigger>
          </TabsList>

          {/* ---------------- UPGRADE ---------------- */}
          <TabsContent value="upgrade" className="mt-4">
            {proPlan ? (
              <div className="grid gap-4 md:grid-cols-2">
                {starterPlan && (
                  <div className="flex flex-col rounded-lg border bg-card p-5">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-base">{starterPlan.name}</h3>
                      <Badge variant="outline" className="text-[10px]">Seu plano atual</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Para quem atende até 30 pacientes por mês.
                    </p>
                    <div className="mt-4 text-3xl font-bold tabular-nums">
                      até 30 <span className="text-base font-normal text-muted-foreground">pacientes/mês</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {starterPlan.monthly_credits} créditos · {formatBRL(starterPlan.price_monthly_cents)}/mês
                    </p>
                  </div>
                )}

                <div className="relative flex flex-col rounded-lg border-transparent ring-2 ring-[#e89bcf] bg-card p-5 shadow-md">
                  <Badge className="absolute -top-2 right-4 bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white border-0">
                    <Sparkles className="h-3 w-3 mr-1" /> Recomendado
                  </Badge>
                  <h3 className="font-semibold text-base">{proPlan.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Para quem atende mais de 30 pacientes por mês.
                  </p>
                  <div className="mt-4 text-3xl font-bold tabular-nums bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] bg-clip-text text-transparent">
                    +30 <span className="text-base font-normal text-foreground">pacientes/mês</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {proPlan.monthly_credits} créditos · {formatBRL(proPlan.price_monthly_cents)}/mês
                  </p>

                  <ul className="mt-4 space-y-2 text-sm text-muted-foreground flex-1">
                    <li className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                      <span>
                        {starterPlan
                          ? `${Math.round(proPlan.monthly_credits / starterPlan.monthly_credits)}× mais capacidade que o ${starterPlan.name}`
                          : "Maior capacidade mensal"}
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                      <span>Renovação automática todo mês</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                      <span>Cancele quando quiser</span>
                    </li>
                  </ul>

                  <Button
                    disabled
                    className="mt-5 rounded-full"
                    variant="outline"
                    title="Pagamento online em breve"
                  >
                    Em breve
                  </Button>

                </div>
              </div>
            ) : (
              <div className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                Você já está no plano de maior capacidade disponível. Use créditos
                avulsos abaixo para picos pontuais.
              </div>
            )}
          </TabsContent>

          {/* ---------------- AVULSO ---------------- */}
          <TabsContent value="avulso" className="mt-4">
            <div className="grid gap-4 md:grid-cols-3">
              {packs.map((pack) => {
                const sameAsStarter =
                  starterPlan && pack.credits === starterPlan.monthly_credits;
                return (
                  <div
                    key={pack.id}
                    className={cn(
                      "relative flex flex-col rounded-lg border bg-card p-5 shadow-sm transition",
                      pack.is_highlighted
                        ? "border-transparent ring-2 ring-[#e89bcf] shadow-md"
                        : "hover:shadow-md",
                    )}
                  >
                    {pack.is_highlighted && (
                      <Badge className="absolute -top-2 right-4 bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white border-0">
                        <Sparkles className="h-3 w-3 mr-1" /> Mais vendido
                      </Badge>
                    )}
                    <h3 className="font-semibold text-base">{pack.name}</h3>
                    <div className="mt-3 flex items-baseline gap-1">
                      <span
                        className={cn(
                          "text-3xl font-bold tabular-nums",
                          pack.is_highlighted &&
                            "bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] bg-clip-text text-transparent",
                        )}
                      >
                        {pack.credits}
                      </span>
                      <span className="text-sm text-muted-foreground">créditos</span>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      por{" "}
                      <span className="font-semibold text-foreground">
                        {pack.price_cents > 0 ? formatBRL(pack.price_cents) : "—"}
                      </span>
                    </div>

                    <ul className="mt-4 space-y-2 text-sm text-muted-foreground flex-1">
                      {pack.perks.map((perk) => (
                        <li key={perk} className="flex items-start gap-2">
                          <Check className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                          <span>{perk}</span>
                        </li>
                      ))}
                    </ul>

                    {sameAsStarter && starterPlan && pack.price_cents > 0 && (
                      <div className="mt-3 rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">
                        {formatBRL(pack.price_cents)} avulso vs{" "}
                        <strong>{formatBRL(starterPlan.price_monthly_cents)}/mês</strong> no{" "}
                        {starterPlan.name} — mesma quantidade de créditos.
                        {pack.price_cents > starterPlan.price_monthly_cents &&
                          " Assinar sai mais barato."}
                      </div>
                    )}

                    <Button
                      disabled
                      className="mt-4 rounded-full"
                      variant={pack.is_highlighted ? "default" : "outline"}
                      title="Pagamento online em breve"
                    >
                      Em breve
                    </Button>

                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              {CostTooltip}
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-4 flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
          <Info className="h-4 w-4 mt-0.5 shrink-0 text-[#e8a04c]" />
          <p>
            Após a confirmação do pagamento, o saldo é liberado em instantes pelo
            administrador. Você será notificado e o novo saldo aparecerá
            automaticamente no topo da tela.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
