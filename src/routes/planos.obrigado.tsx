import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import lummaSymbol from "@/assets/lumma-symbol.svg";

export const Route = createFileRoute("/planos/obrigado")({
  head: () => ({ meta: [{ title: "Assinatura confirmada — LUMMA" }, { name: "robots", content: "noindex" }] }),
  component: Obrigado,
});

function Obrigado() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0b0414] text-white font-sans antialiased flex items-center justify-center px-4">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-[#7c3aed] opacity-30 blur-[140px]" />
        <div className="absolute bottom-[-160px] right-0 h-[560px] w-[560px] rounded-full bg-[#e8a04c] opacity-20 blur-[160px]" />
      </div>
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-white/10 bg-white/[0.05] backdrop-blur-xl p-7 sm:p-9 text-center">
        <img src={lummaSymbol} alt="LUMMA" className="h-10 w-10 mx-auto" />
        <CheckCircle2 className="h-12 w-12 mx-auto mt-6 text-[#e8a04c]" />
        <h1 className="mt-4 text-2xl font-semibold">Assinatura confirmada!</h1>
        <p className="mt-3 text-white/75 leading-relaxed">
          Obrigado por escolher a Lumma. Em alguns minutos você recebe no e-mail informado na compra o seu acesso,
          com uma senha temporária. No primeiro login você cria a sua senha.
        </p>
        <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-left text-sm text-white/70 flex gap-3">
          <Mail className="h-5 w-5 shrink-0 text-[#e89bcf]" />
          <span>
            Não chegou? Confira também spam e promoções. Se preferir, na tela de entrada clique em
            <strong className="text-white"> “Esqueceu a senha ou é seu primeiro acesso?”</strong> e informe o mesmo e-mail.
          </span>
        </div>
        <Button
          asChild
          className="mt-7 w-full rounded-full border-0 text-white h-11 hover:opacity-90"
          style={{ backgroundImage: "linear-gradient(135deg, #e8a04c, #e89bcf 55%, #7c3aed)" }}
        >
          <Link to="/login">Entrar na Lumma</Link>
        </Button>
      </div>
    </div>
  );
}
