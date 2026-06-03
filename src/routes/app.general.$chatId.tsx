import { createFileRoute, Link, useParams, useSearch } from "@tanstack/react-router";
import { ArrowLeft, Menu, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { ChatMessageList } from "@/components/chat/ChatMessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import { useGeneralChat } from "@/hooks/useGeneralChat";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/app/general/$chatId")({
  validateSearch: (s: Record<string, unknown>) => ({
    module: typeof s.module === "string" ? s.module : "research",
  }),
  component: GeneralChatPage,
});

function GeneralChatPage() {
  const { chatId } = useParams({ from: "/app/general/$chatId" });
  const { module: agentType } = Route.useSearch();
  const { messages, sendMessage, thinking } = useGeneralChat(chatId, agentType);
  const [menuOpen, setMenuOpen] = useState(false);
  const { role } = useAuth();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-gradient-to-br from-[#f3e8ff] via-[#e0f2fe] to-[#fce7f3]">
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <header className="sticky top-0 z-20 shrink-0 px-3 sm:px-6 py-2 border-b border-white/40 bg-white/70 backdrop-blur-md flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="icon" 
            className="shrink-0 h-10 w-10" 
            onClick={() => {}} // Placeholder or navigation if needed
            aria-label="Menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          
          <Link
            to="/app/fale-com-lumma"
            className="hidden sm:inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground shrink-0"
          >
            <ArrowLeft className="h-3 w-3" /> Início
          </Link>
          
          <div className="flex-1">
            <h1 className="text-sm font-semibold text-slate-800 leading-tight">
              {agentType === 'research' ? 'Pesquisa Científica' : 'Pergunta Clínica'}
            </h1>
          </div>
        </header>

        <main className="relative flex-1 min-h-0 overflow-hidden flex flex-col">
          <ChatMessageList 
            messages={messages} 
            thinking={thinking} 
            isStreaming={thinking}
            agentType={agentType}
          />
        </main>

        <div className="shrink-0 px-3 sm:px-4 pb-4 sm:pb-6 pt-3">
          <div className="mx-auto w-full max-w-3xl">
            <ChatInput onSubmit={(text) => sendMessage(text)} disabled={thinking} />
            <p className="mt-1 text-center text-[10px] text-muted-foreground/60">
              Máximo de 10 arquivos de 20MB
            </p>
            {role === "nutri" && (
              <p className="mt-1 text-center text-[10px] italic text-amber-700/80 px-2">
                Nota: Processamento estrutural em modo de validação técnica.
              </p>
            )}
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="mt-3 flex items-start sm:items-center justify-center gap-1.5 text-center text-[10px] text-muted-foreground/70 cursor-help select-none px-2">
                    <ShieldCheck className="h-3 w-3 text-[#7a8f6a] shrink-0 mt-0.5 sm:mt-0" />
                    <span>
                      Análises baseadas nos protocolos de inteligência integrativa da Dra. Ana
                      Paula. Sempre confira os dados estruturados com o laudo original do
                      laboratório.
                    </span>
                  </p>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-[11px] leading-relaxed">
                  A LUMMA é uma ferramenta de suporte à decisão. A validação final e a conduta
                  clínica são de responsabilidade exclusiva do nutricionista conforme as normas
                  do CRN.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>
    </div>
  );
}
