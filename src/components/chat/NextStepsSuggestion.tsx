import { Button } from "@/components/ui/button";

interface NextStepsSuggestionProps {
  onSelectModule: (trigger: string | null) => void;
  /**
   * Mantido por compatibilidade com o call site. Não afeta mais o render
   * porque o grid de atalhos "burros" (sem contexto) foi removido — só
   * o banner contextual "Gerar receita" carrega payload pronto.
   */
  hideFormulacoes?: boolean;
}

export function NextStepsSuggestion({ onSelectModule }: NextStepsSuggestionProps) {
  return (
    <div className="mx-auto w-full max-w-2xl mt-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white/60 backdrop-blur-md border border-[#e8a04c]/20 rounded-2xl p-3 sm:p-4 shadow-lg">
        <Button
          variant="ghost"
          onClick={() => onSelectModule(null)}
          className="w-full h-9 px-4 justify-center bg-[#e8a04c]/5 hover:bg-[#e8a04c]/10 text-xs font-medium gap-2 text-[#e8a04c] transition-all"
        >
          <span className="text-base">💬</span>
          Continuar conversa ou anexar novo exame
        </Button>
      </div>
    </div>
  );
}
