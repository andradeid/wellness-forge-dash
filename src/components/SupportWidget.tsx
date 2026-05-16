import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MessageSquareText, X, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SupportWidget() {
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [message, setMessage] = useState("");

  return (
    <>
      {isSupportOpen && (
        <div className="fixed bottom-24 right-6 w-80 sm:w-96 h-[450px] bg-background border rounded-2xl shadow-2xl flex flex-col z-50 animate-in fade-in slide-in-from-bottom-4 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center">
                <MessageSquareText className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight">Suporte LUMMA</p>
                <p className="text-[11px] flex items-center gap-1 opacity-90">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block" />
                  Online agora
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsSupportOpen(false)}
              className="p-1 rounded-full hover:bg-white/20 transition-colors"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-muted/30">
            <div className="flex gap-2">
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[#e8a04c] to-[#e89bcf] shrink-0" />
              <div className="bg-background border rounded-2xl rounded-tl-sm px-3 py-2 max-w-[80%]">
                <p className="text-sm">Olá, Dr(a). Como posso te ajudar com a plataforma hoje?</p>
                <p className="text-[10px] text-muted-foreground mt-1">Atendente LUMMA · agora</p>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="h-7 w-7 rounded-full bg-gradient-to-br from-[#e8a04c] to-[#e89bcf] shrink-0" />
              <div className="bg-background border rounded-2xl rounded-tl-sm px-3 py-2 max-w-[80%]">
                <p className="text-sm">
                  Estou aqui para tirar dúvidas sobre análises, pacientes ou integrações. Tempo médio de resposta: 2 min.
                </p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t bg-background">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setMessage("");
              }}
              className="flex items-center gap-2 px-3 py-2"
            >
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Digite sua mensagem..."
                className="border-0 focus-visible:ring-0 shadow-none"
              />
              <Button
                type="submit"
                size="icon"
                className="rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] hover:opacity-90"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
            <p className="text-[10px] text-center text-muted-foreground pb-2">
              Suporte Integrado LUMMA
            </p>
          </div>
        </div>
      )}

      <button
        onClick={() => setIsSupportOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-gradient-to-br from-[#e8a04c] to-[#e89bcf] text-white shadow-xl flex items-center justify-center hover:scale-105 transition-transform group"
        aria-label="Abrir suporte"
      >
        <span className="absolute inset-0 rounded-full bg-[#e89bcf]/40 animate-ping opacity-60 group-hover:opacity-0" />
        {isSupportOpen ? <X className="h-6 w-6 relative" /> : <MessageSquareText className="h-6 w-6 relative" />}
      </button>
    </>
  );
}
