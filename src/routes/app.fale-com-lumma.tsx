import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Paperclip, Mic, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import lummaSymbol from "@/assets/lumma-symbol.svg";

export const Route = createFileRoute("/app/fale-com-lumma")({
  component: FaleComLummaPage,
});

function FaleComLummaPage() {
  const [message, setMessage] = useState("");

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Fundo gradiente aurora */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(circle at 20% 30%, #ffe5cc 0%, transparent 45%), radial-gradient(circle at 75% 25%, #ffc4e0 0%, transparent 45%), radial-gradient(circle at 80% 70%, #b8e0ff 0%, transparent 50%), radial-gradient(circle at 25% 80%, #ffd6b8 0%, transparent 45%), linear-gradient(135deg, #fff4ea 0%, #f5e6ff 50%, #d6ecff 100%)",
          filter: "blur(0.5px)",
        }}
      />

      {/* Conteúdo central */}
      <div className="flex h-full flex-col items-center justify-between px-6 py-12">
        <div className="flex flex-1 flex-col items-center justify-center text-center max-w-2xl mx-auto">
          <img
            src={lummaSymbol}
            alt="Lumma"
            className="h-20 w-20 mb-8 drop-shadow-sm"
          />
          <h1 className="text-5xl font-light tracking-tight text-foreground mb-6">
            Bem-vinda
          </h1>
          <p className="text-lg text-foreground/70 leading-relaxed mb-10 max-w-xl">
            Sou sua mentora virtual, inspirada na metodologia da Ana Paula
            Pujol. Estou aqui para apoiar seu raciocínio clínico em Nutrição
            Funcional e Integrativa.
          </p>
          <Button
            size="lg"
            className="rounded-full px-8 h-12 text-white shadow-lg hover:shadow-xl transition-shadow"
            style={{
              background: "linear-gradient(135deg, #e8a04c 0%, #e89bcf 100%)",
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mr-2"
            >
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Identificar paciente
          </Button>
        </div>

        {/* Barra de input */}
        <div className="w-full max-w-3xl">
          <div className="bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.06)] border border-white/60 p-4">
            <div className="flex items-center gap-3">
              <img src={lummaSymbol} alt="" className="h-6 w-6 shrink-0" />
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Escreva sua mensagem..."
                className="flex-1 bg-transparent outline-none text-foreground placeholder:text-muted-foreground text-base"
              />
            </div>
            <div className="flex items-center justify-between mt-3">
              <button
                type="button"
                className="h-9 w-9 rounded-full flex items-center justify-center text-white shadow-sm transition-opacity hover:opacity-90"
                style={{
                  background:
                    "linear-gradient(135deg, #e8a04c 0%, #e89bcf 100%)",
                }}
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="h-9 w-9 rounded-full flex items-center justify-center text-white shadow-sm transition-opacity hover:opacity-90"
                  style={{
                    background:
                      "linear-gradient(135deg, #e8a04c 0%, #e89bcf 100%)",
                  }}
                >
                  <Mic className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="h-9 w-9 rounded-full flex items-center justify-center text-white/90 shadow-sm transition-opacity hover:opacity-90"
                  style={{ background: "#f5c7d8" }}
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          <p className="text-center text-xs text-muted-foreground mt-3">
            Máximo de 10 arquivos de 20MB
          </p>
        </div>
      </div>
    </div>
  );
}
