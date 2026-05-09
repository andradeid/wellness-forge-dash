import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Leaf, Stethoscope, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LUMMA — Plataforma para nutricionistas" },
      { name: "description", content: "Gestão clínica e atendimento inteligente para nutricionistas modernos." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && session) navigate({ to: "/app" });
  }, [session, loading, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
              <Leaf className="h-4 w-4" />
            </div>
            <span className="font-semibold tracking-tight">LUMMA</span>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/login">Entrar</Link>
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6">
        <section className="py-24 text-center">
          <div className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground bg-muted px-3 py-1 rounded-full mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Versão 2.0
          </div>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight max-w-3xl mx-auto">
            Atendimento nutricional, inteligente e organizado.
          </h1>
          <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
            LUMMA centraliza pacientes, exames e planos em um único lugar — pensado para a rotina clínica do nutricionista.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button asChild size="lg">
              <Link to="/login">Entrar na plataforma</Link>
            </Button>
          </div>
        </section>

        <section className="grid md:grid-cols-2 gap-6 pb-24">
          <div className="rounded-xl border p-6 bg-card">
            <Stethoscope className="h-6 w-6 text-primary mb-3" />
            <h3 className="font-medium mb-1">Para nutricionistas</h3>
            <p className="text-sm text-muted-foreground">Cadastre pacientes, organize exames e tenha tudo à mão.</p>
          </div>
          <div className="rounded-xl border p-6 bg-card">
            <ShieldCheck className="h-6 w-6 text-primary mb-3" />
            <h3 className="font-medium mb-1">Seguro por padrão</h3>
            <p className="text-sm text-muted-foreground">Cada profissional só vê os próprios pacientes — multi-tenancy real.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
