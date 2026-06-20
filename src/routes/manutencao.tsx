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

  // Animação de rede neural no fundo.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let width = 0;
    let height = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    type Node = { x: number; y: number; vx: number; vy: number; r: number };
    let nodes: Node[] = [];

    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const density = Math.min(110, Math.floor((width * height) / 14000));
      nodes = Array.from({ length: density }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: Math.random() * 1.6 + 0.6,
      }));
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      // Background gradient glow
      const grad = ctx.createRadialGradient(
        width / 2,
        height / 2,
        0,
        width / 2,
        height / 2,
        Math.max(width, height) / 1.2,
      );
      grad.addColorStop(0, "rgba(232, 160, 76, 0.08)");
      grad.addColorStop(0.6, "rgba(232, 155, 207, 0.05)");
      grad.addColorStop(1, "rgba(10, 10, 20, 0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Update + draw connections
      const maxDist = 140;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > width) n.vx *= -1;
        if (n.y < 0 || n.y > height) n.vy *= -1;

        for (let j = i + 1; j < nodes.length; j++) {
          const m = nodes[j];
          const dx = n.x - m.x;
          const dy = n.y - m.y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < maxDist) {
            const alpha = 1 - d / maxDist;
            const t = (i + j) % 2 === 0 ? "232, 160, 76" : "232, 155, 207";
            ctx.strokeStyle = `rgba(${t}, ${alpha * 0.35})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(m.x, m.y);
            ctx.stroke();
          }
        }
      }

      // Nodes
      for (const n of nodes) {
        ctx.fillStyle = "rgba(255, 220, 200, 0.9)";
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    };

    resize();
    draw();
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
          entregar o que há de melhor em{" "}
          <span className="text-white">inteligência funcional integrativa</span>.
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
