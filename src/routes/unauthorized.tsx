import { createFileRoute, Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import lummaSymbol from "@/assets/lumma-symbol.svg";

export const Route = createFileRoute("/unauthorized")({
  head: () => ({
    meta: [
      { title: "Acesso negado — LUMMA" },
      { name: "description", content: "Você não tem permissão para acessar esta área." },
    ],
  }),
  component: UnauthorizedPage,
});

function UnauthorizedPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#f5f5f0] px-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex flex-col items-center gap-3">
          <img src={lummaSymbol} alt="" className="h-12 w-12 opacity-80 animate-pulse" />
          <ShieldAlert className="h-7 w-7 text-[#3d5a4a]" />
        </div>
        <div>
          <h1
            className="text-5xl bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] bg-clip-text text-transparent"
            style={{ fontFamily: "'Instrument Serif', serif" }}
          >
            Acesso negado
          </h1>
          <p className="mt-3 text-sm text-[#3d5a4a]">
            Esta área é restrita ao Super Admin. Se você acredita que isso é um engano,
            fale com o responsável pela conta.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2">
          <Button
            asChild
            className="rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white hover:opacity-95"
          >
            <Link to="/app">Voltar ao painel</Link>
          </Button>
          <Button asChild variant="outline" className="rounded-full">
            <Link to="/">Ir para o início</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
