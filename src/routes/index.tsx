import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  clearLocalSessionToken,
  getLocalSessionToken,
  isSessionStillValid,
  SESSION_KICKED_KEY,
} from "@/lib/session-guard";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import lummaSymbol from "@/assets/lumma-symbol.svg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LUMMA 2.0 — A Nova Era da Inteligência Clínica" },
      {
        name: "description",
        content:
          "O motor de raciocínio nutricional mais potente do mercado está sendo calibrado. Prepare-se para uma experiência de precisão absoluta.",
      },
    ],
  }),
  component: Teaser,
});

function Teaser() {
  const { session, loading, role } = useAuth();
  const navigate = useNavigate();
  const { data: systemSettings } = useSystemSettings();

  useEffect(() => {
    if (systemSettings?.maintenance_enabled && role !== "super_admin") {
      navigate({ to: "/manutencao", replace: true });
    }
  }, [systemSettings?.maintenance_enabled, role, navigate]);

  useEffect(() => {
    if (loading || !session?.user) return;
    let cancelled = false;
    (async () => {
      const localToken = getLocalSessionToken();
      const valid = localToken ? await isSessionStillValid(session.user.id) : false;
      if (cancelled) return;
      if (!valid) {
        window.sessionStorage.setItem(SESSION_KICKED_KEY, "1");
        clearLocalSessionToken();
        await supabase.auth.signOut();
        navigate({ to: "/login", replace: true });
        return;
      }
      navigate({ to: role === "nutri" ? "/app/fale-com-lumma" : "/app", replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [session, loading, role, navigate]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0b0414] text-white font-sans antialiased">
      {/* Ambient gradient blobs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-[#7c3aed] opacity-30 blur-[140px]" />
        <div className="absolute top-1/3 -right-32 h-[480px] w-[480px] rounded-full bg-[#e89bcf] opacity-20 blur-[140px]" />
        <div className="absolute bottom-[-160px] left-1/3 h-[560px] w-[560px] rounded-full bg-[#e8a04c] opacity-25 blur-[160px]" />
      </div>

      {/* Subtle grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />

      {/* Header */}
      <header className="relative z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={lummaSymbol} alt="LUMMA" className="h-7 w-7" />
            <span className="font-semibold tracking-[0.2em] text-sm text-white/80">LUMMA</span>
          </div>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-white/70 hover:text-white hover:bg-white/10 rounded-full"
          >
            <Link to="/login">Entrar</Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 max-w-6xl mx-auto px-6">
        <section className="pt-24 md:pt-32 pb-20 text-center">
          <div className="inline-flex items-center gap-2 text-[11px] font-medium tracking-[0.2em] uppercase text-white/70 backdrop-blur-md bg-white/5 border border-white/10 px-4 py-1.5 rounded-full mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] animate-pulse" />
            Em breve
          </div>

          <div className="relative">
            {/* Glow */}
            <div className="absolute inset-0 -z-10 flex items-center justify-center">
              <div className="h-64 w-[80%] rounded-full bg-gradient-to-r from-[#e8a04c] via-[#e89bcf] to-[#7c3aed] opacity-30 blur-3xl animate-pulse" />
            </div>

            <h1 className="text-4xl md:text-6xl lg:text-7xl font-semibold tracking-tight max-w-4xl mx-auto leading-[1.05]">
              LUMMA 2.0:{" "}
              <span className="bg-gradient-to-r from-[#e8a04c] via-[#e89bcf] to-[#c4b5fd] bg-clip-text text-transparent">
                A Nova Era da Inteligência Clínica
              </span>
            </h1>
          </div>

          <p className="mt-6 text-base md:text-lg text-white/70 max-w-2xl mx-auto leading-relaxed">
            O motor de raciocínio nutricional mais potente do mercado está sendo
            calibrado. Prepare-se para uma experiência de precisão absoluta e
            gestão inteligente.
          </p>
        </section>

        {/* Feature cards */}
        <section className="grid sm:grid-cols-3 gap-4 max-w-4xl mx-auto pb-24">
          {[
            {
              title: "Leitura Multi-Modal",
              desc: "PDFs e fotos processados em segundos.",
            },
            {
              title: "Soberania de Dados",
              desc: "Sua própria infraestrutura e segurança.",
            },
            {
              title: "Dashboard Estratégico",
              desc: "Gestão clínica baseada em dados reais.",
            },
          ].map((c) => (
            <div
              key={c.title}
              className="group relative rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-5 transition-all hover:bg-white/[0.07] hover:border-white/20"
            >
              <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
              <h3 className="text-sm font-medium text-white mb-1">{c.title}</h3>
              <p className="text-xs text-white/60 leading-relaxed">{c.desc}</p>
            </div>
          ))}
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10">
        <div className="max-w-6xl mx-auto px-6 pb-8 text-center">
          <p className="text-[11px] tracking-wide text-white/40">
            Desenvolvido com tecnologia de fluxo de elite. © 2026 LUMMA.
          </p>
        </div>
      </footer>
    </div>
  );
}
