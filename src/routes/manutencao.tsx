import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { LogIn, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/manutencao")({
  head: () => ({
    meta: [
      { title: "Em evolução — LUMMA" },
      {
        name: "description",
        content:
          "Estamos aprimorando nossa inteligência artificial para entregar o melhor em inteligência funcional integrativa.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: MaintenancePage,
});

function MaintenancePage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Encerra qualquer sessão ativa durante a manutenção.
  useEffect(() => {
    void supabase.auth.signOut();
  }, []);

  // Animação Matrix (chuva de 0s e 1s) no fundo.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let width = 0;
    let height = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const fontSize = 16;
    const HEAD_LENGTH = 90; // tamanho da cabeça (rastro controlado)
    const MUTATION_RATE = 0.08; // ~8% dos caracteres da cabeça mudam por frame
    let columns = 0;
    let drops: number[] = [];
    let speeds: number[] = [];
    let heads: string[][] = []; // por coluna: array de 30 chars (índice 0 = ponta)
    let last = 0;

    const randomBit = () => (Math.random() < 0.5 ? "0" : "1");

    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      columns = Math.ceil(width / fontSize);
      drops = Array.from({ length: columns }, () =>
        Math.floor(Math.random() * (height / fontSize)),
      );

      speeds = Array.from({ length: columns }, () => 0.12 + Math.random() * 0.35);
      heads = Array.from({ length: columns }, () =>
        Array.from({ length: HEAD_LENGTH }, randomBit),
      );
    };

    const draw = (t: number) => {
      const dt = Math.min(50, t - last);
      last = t;

      // Limpa o frame inteiro (sem rastro do canvas — controlamos o rastro nós mesmos)
      ctx.fillStyle = "rgba(10, 10, 20, 1)";
      ctx.fillRect(0, 0, width, height);

      ctx.font = `${fontSize}px ui-monospace, "SFMono-Regular", Menlo, monospace`;
      ctx.textBaseline = "top";

      for (let i = 0; i < columns; i++) {
        const x = i * fontSize;
        const headY = drops[i] * fontSize;
        const baseColor = i % 2 === 0 ? "232, 160, 76" : "232, 155, 207";

        // Muta apenas alguns caracteres da cabeça (não todos)
        for (let k = 0; k < HEAD_LENGTH; k++) {
          if (Math.random() < MUTATION_RATE) heads[i][k] = randomBit();
        }

        // Desenha os 30 caracteres da cabeça, com opacidade decrescente
        for (let k = 0; k < HEAD_LENGTH; k++) {
          const y = headY - k * fontSize;
          if (y < -fontSize || y > height) continue;
          // ponta (k=0) mais brilhante e quase branca; resto vai esmaecendo
          const alpha = (1 - k / HEAD_LENGTH) * 0.35;
          if (k === 0) {
            ctx.fillStyle = `rgba(255, 230, 200, ${0.9})`;
          } else {
            ctx.fillStyle = `rgba(${baseColor}, ${alpha})`;
          }
          ctx.fillText(heads[i][k], x, y);
        }

        drops[i] += speeds[i] * (dt / 24);
        if (headY - HEAD_LENGTH * fontSize > height && Math.random() > 0.975) {
          drops[i] = Math.floor(Math.random() * -20);
        }
      }

      raf = requestAnimationFrame(draw);
    };


    resize();
    raf = requestAnimationFrame(draw);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a14] text-white">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      />

      {/* Glow vignettes */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-[#e8a04c]/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-[#e89bcf]/20 blur-3xl" />

      <main className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs uppercase tracking-widest text-white/70 backdrop-blur">
          <Sparkles className="h-3.5 w-3.5 text-[#e8a04c]" />
          LUMMA · Em evolução
        </div>

        <h1 className="bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] bg-clip-text text-4xl font-semibold leading-tight text-transparent sm:text-5xl md:text-6xl">
          Estamos em evolução.
        </h1>

        <p className="mt-6 max-w-2xl text-base leading-relaxed text-white/75 sm:text-lg">
          No momento, estamos aprimorando nossa inteligência artificial para
          entregar o que há de melhor raciocínio clínico em{" "}
          <span className="text-white">Nutrição Funcional e Integrativa</span>.
        </p>

        <div className="mt-10 flex items-center gap-3 text-xs text-white/50">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#e8a04c] opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#e89bcf]" />
          </span>
          Treinando modelos · sincronizando agentes · ajustando protocolos
        </div>
      </main>

      <div className="fixed bottom-6 right-6 z-50">
        <Button
          asChild
          size="lg"
          className="rounded-full border-0 bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white shadow-lg hover:opacity-90"
        >
          <Link to="/login">
            <LogIn className="mr-2 h-4 w-4" />
            Voltar ao login
          </Link>
        </Button>
      </div>
    </div>
  );
}
