import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import lummaSymbol from "@/assets/lumma-symbol.svg";
import {
  createPublicSubscriptionCheckout,
  getPublicPlans,
  type PublicPlan,
} from "@/lib/public-plans.functions";

export const Route = createFileRoute("/planos/")({
  head: () => ({
    meta: [
      { title: "Planos — LUMMA" },
      {
        name: "description",
        content:
          "Assine a Lumma: inteligência clínica para nutricionistas. Exames, bioimpedância, plano alimentar, casos clínicos e mais.",
      },
      { property: "og:title", content: "Planos — LUMMA" },
      { property: "og:type", content: "website" },
    ],
  }),
  loader: () => getPublicPlans(),
  component: PlanosPublicos,
});

const TASKS = [
  "Exames de Sangue",
  "Bioimpedância e Calorimetria",
  "Plano Alimentar & Formulações",
  "Casos Clínicos & Sintomas",
  "Genética e Saúde Intestinal",
  "Refeição e Composição por Foto",
  "Pesquisa Científica",
];

const FAQ = [
  {
    q: "Como recebo o acesso depois de assinar?",
    a: "Assim que o pagamento é aprovado, você recebe no e-mail informado na compra o acesso à Lumma (e-mail e senha temporária). No primeiro login você cria sua própria senha.",
  },
  {
    q: "O que são os créditos?",
    a: "Cada análise feita na Lumma usa créditos. Os créditos do seu plano são renovados todo mês, e você pode comprar pacotes avulsos dentro da plataforma se precisar de mais.",
  },
  {
    q: "Posso cancelar?",
    a: "Sim. Dentro da Lumma, em Planos & Créditos → Gerenciar assinatura, você cancela a renovação quando quiser.",
  },
  {
    q: "Já sou cliente. Preciso assinar por aqui?",
    a: "Não. Entre na sua conta e acesse Planos & Créditos para ver seu plano, trocar de plano ou comprar créditos.",
  },
];

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });

function PlanosPublicos() {
  const plans = Route.useLoaderData() as PublicPlan[];
  const [cycle, setCycle] = useState<"monthly" | "yearly">("yearly");
  const [loading, setLoading] = useState<string | null>(null);

  const hasYearly = plans.some((p) => p.priceYearlyCents);
  const maxSavingPct = Math.max(
    0,
    ...plans
      .filter((p) => p.priceYearlyCents)
      .map((p) => Math.round((1 - (p.priceYearlyCents as number) / (p.priceMonthlyCents * 12)) * 100)),
  );

  async function assinar(slug: "starter" | "pro") {
    setLoading(slug);
    try {
      const { url } = await createPublicSubscriptionCheckout({ data: { planSlug: slug, cycle } });
      if (url) window.location.href = url;
      else throw new Error("Não foi possível abrir o pagamento.");
    } catch (err: any) {
      toast.error(err?.message ?? "Não foi possível abrir o pagamento. Tente de novo.");
      setLoading(null);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0b0414] text-white font-sans antialiased">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-[#7c3aed] opacity-30 blur-[140px]" />
        <div className="absolute top-1/3 -right-32 h-[480px] w-[480px] rounded-full bg-[#e89bcf] opacity-20 blur-[140px]" />
        <div className="absolute bottom-[-160px] left-1/3 h-[560px] w-[560px] rounded-full bg-[#e8a04c] opacity-25 blur-[160px]" />
      </div>

      <header className="relative z-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={lummaSymbol} alt="LUMMA" className="h-7 w-7" />
            <span className="font-semibold tracking-[0.2em] text-sm text-white/80">LUMMA</span>
          </Link>
          <Button asChild variant="ghost" size="sm" className="text-white/70 hover:text-white hover:bg-white/10 rounded-full">
            <Link to="/login">Já sou cliente · Entrar</Link>
          </Button>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6">
        <section className="pt-12 md:pt-20 pb-10 text-center">
          <h1 className="text-3xl md:text-5xl font-semibold tracking-tight max-w-3xl mx-auto leading-tight">
            Escolha seu plano e comece{" "}
            <span className="bg-gradient-to-r from-[#e8a04c] via-[#e89bcf] to-[#c4b5fd] bg-clip-text text-transparent">
              hoje mesmo
            </span>
          </h1>
          <p className="mt-4 text-base md:text-lg text-white/70 max-w-2xl mx-auto leading-relaxed">
            Inteligência clínica para nutricionistas: leitura de exames, composição corporal, plano alimentar e
            raciocínio clínico em um só lugar.
          </p>

          {hasYearly && (
            <div className="mt-8 inline-flex items-center rounded-full border border-white/15 bg-white/[0.05] p-1 text-sm">
              {(["yearly", "monthly"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCycle(c)}
                  className={`rounded-full px-4 py-1.5 transition-colors ${
                    cycle === c ? "bg-white text-[#0b0414] font-medium" : "text-white/70 hover:text-white"
                  }`}
                >
                  {c === "monthly" ? "Mensal" : "Anual"}
                  {c === "yearly" && maxSavingPct > 0 && (
                    <span className={`ml-2 text-xs ${cycle === c ? "text-[#7c3aed]" : "text-[#e8a04c]"}`}>
                      até {maxSavingPct}% off
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="grid md:grid-cols-2 gap-5 max-w-4xl mx-auto pb-16">
          {plans.map((p) => {
            const highlight = p.slug === "pro";
            const yearly = cycle === "yearly" && p.priceYearlyCents ? p.priceYearlyCents : null;
            const perMonth = yearly ? Math.round(yearly / 12) : p.priceMonthlyCents;
            return (
              <div
                key={p.slug}
                className={`relative rounded-2xl border p-6 sm:p-7 backdrop-blur-xl flex flex-col ${
                  highlight ? "border-[#e89bcf]/50 bg-white/[0.08]" : "border-white/10 bg-white/[0.04]"
                }`}
              >
                {highlight && (
                  <span className="absolute -top-3 left-6 rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] px-3 py-1 text-xs font-medium text-[#0b0414]">
                    Para quem atende mais
                  </span>
                )}
                <h2 className="text-xl font-semibold">{p.name}</h2>
                <p className="mt-1 text-sm text-white/60">
                  {p.monthlyCredits.toLocaleString("pt-BR")} créditos por mês
                </p>

                <div className="mt-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-semibold">{brl(perMonth)}</span>
                    <span className="text-white/60">/mês</span>
                  </div>
                  <p className="mt-1 text-xs text-white/50 h-4">
                    {yearly
                      ? `${brl(yearly)} cobrados uma vez por ano`
                      : p.priceYearlyCents
                        ? `ou ${brl(p.priceYearlyCents)} no plano anual`
                        : ""}
                  </p>
                </div>

                <ul className="mt-6 space-y-2.5 text-sm text-white/80 flex-1">
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 mt-0.5 shrink-0 text-[#e8a04c]" />
                    {p.monthlyCredits.toLocaleString("pt-BR")} créditos renovados todo mês
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 mt-0.5 shrink-0 text-[#e8a04c]" />
                    Todas as tarefas da Lumma
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 mt-0.5 shrink-0 text-[#e8a04c]" />
                    Pacientes, exames e evolução organizados
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 mt-0.5 shrink-0 text-[#e8a04c]" />
                    Relatório em PDF com a sua marca
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 mt-0.5 shrink-0 text-[#e8a04c]" />
                    Suporte pelo WhatsApp
                  </li>
                </ul>

                <Button
                  onClick={() => assinar(p.slug)}
                  disabled={loading !== null}
                  className="mt-7 w-full rounded-full border-0 text-white h-11 text-base hover:opacity-90"
                  style={{ backgroundImage: "linear-gradient(135deg, #e8a04c, #e89bcf 55%, #7c3aed)" }}
                >
                  {loading === p.slug ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Abrindo pagamento…
                    </>
                  ) : (
                    `Assinar ${p.name}`
                  )}
                </Button>
              </div>
            );
          })}
        </section>

        <section className="max-w-4xl mx-auto pb-16">
          <h2 className="text-lg font-semibold text-center">O que você faz com a Lumma</h2>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {TASKS.map((t) => (
              <span key={t} className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-white/80">
                {t}
              </span>
            ))}
          </div>
        </section>

        <section className="max-w-4xl mx-auto pb-16">
          <h2 className="text-lg font-semibold text-center">Como funciona</h2>
          <ol className="mt-6 grid sm:grid-cols-3 gap-4">
            {[
              ["Escolha o plano", "Mensal ou anual, no cartão, em ambiente seguro de pagamento."],
              ["Receba o acesso", "O login chega no e-mail que você informar na compra."],
              ["Comece a usar", "Cadastre seus pacientes e faça a primeira análise."],
            ].map(([t, d], i) => (
              <li key={t} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <span className="text-xs text-[#e8a04c] font-medium">Passo {i + 1}</span>
                <h3 className="mt-1 font-medium">{t}</h3>
                <p className="mt-1 text-sm text-white/60 leading-relaxed">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="max-w-3xl mx-auto pb-20">
          <h2 className="text-lg font-semibold text-center">Perguntas frequentes</h2>
          <div className="mt-6 divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/[0.04]">
            {FAQ.map((f) => (
              <details key={f.q} className="group p-5">
                <summary className="cursor-pointer list-none font-medium flex justify-between gap-4">
                  {f.q}
                  <span className="text-white/40 group-open:rotate-45 transition-transform">+</span>
                </summary>
                <p className="mt-3 text-sm text-white/70 leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="relative z-10">
        <div className="max-w-6xl mx-auto px-6 pb-8 text-center">
          <p className="text-[11px] tracking-wide text-white/40">© 2026 LUMMA.</p>
        </div>
      </footer>
    </div>
  );
}
