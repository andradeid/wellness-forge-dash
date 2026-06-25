import { Apple, ClipboardList, Pill, Droplet, Brain, Microscope, Search, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NextStepsSuggestionProps {
  onSelectModule: (trigger: string | null) => void;
  /**
   * Oculta o atalho "Sugerir formulações" quando o banner contextual
   * "Gerar receita" (handoff estruturado) já está ativo, evitando duplicidade.
   * Caminho de evolução: migrar todos os próximos passos para banners
   * contextuais emitidos pelo agente (marcadores) e aposentar este grid.
   */
  hideFormulacoes?: boolean;
}

export function NextStepsSuggestion({ onSelectModule, hideFormulacoes = false }: NextStepsSuggestionProps) {
  const allSteps = [
    {
      label: "Analisar outro exame",
      icon: "🩸",
      trigger: "exames_de_sangue",
    },
    {
      label: "Criar plano alimentar para este paciente",
      icon: "📋",
      trigger: "plano_alimentar",
    },
    {
      label: "Sugerir formulações para este paciente",
      icon: "💊",
      trigger: "plano_alimentar",
    },
    {
      label: "Discutir o caso clínico deste paciente",
      icon: "🧠",
      trigger: "casos_clinicos",
    },
    {
      label: "Analisar genética e microbioma",
      icon: "🔬",
      trigger: "genetica_microbioma",
    },
    {
      label: "Pesquisar evidências científicas",
      icon: "🔍",
      trigger: "pesquisa_cientifica",
    },
  ];

  // Filtra o atalho duplicado quando o banner contextual de receita está ativo.
  // Marcador para a migração C: trocar este array por banners emitidos pelos agentes.
  const steps = hideFormulacoes
    ? allSteps.filter((s) => s.label !== "Sugerir formulações para este paciente")
    : allSteps;

  return (
    <div className="mx-auto w-full max-w-2xl mt-2 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white/60 backdrop-blur-md border border-[#e8a04c]/20 rounded-2xl p-3 sm:p-4 shadow-lg">
        <div className="text-center mb-3">
          <h3 className="text-sm font-bold text-foreground mb-0.5">
            ✨ Exame analisado! O que você quer fazer agora?
          </h3>
          <p className="text-xs text-muted-foreground">
            Escolha o próximo passo para continuar o atendimento
          </p>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
          {steps.map((step, idx) => (
            <Button
              key={idx}
              variant="outline"
              onClick={() => onSelectModule(step.trigger)}
              className="w-full h-auto py-1.5 px-3 justify-start text-left bg-white/50 hover:bg-white border-[#e8a04c]/10 hover:border-[#e8a04c]/30 text-xs font-medium gap-2 transition-all hover:shadow-sm"
            >
              <span className="text-base shrink-0">{step.icon}</span>
              <span className="leading-tight truncate">{step.label}</span>
            </Button>
          ))}
        </div>
        
        <div className="border-t border-[#e8a04c]/10 pt-2 mt-2">
          <Button
            variant="ghost"
            onClick={() => onSelectModule(null)}
            className="w-full h-8 px-4 justify-center bg-[#e8a04c]/5 hover:bg-[#e8a04c]/10 text-xs font-medium gap-2 text-[#e8a04c] transition-all"
          >
            <span className="text-base">💬</span>
            Tenho uma dúvida sobre este exame
          </Button>
        </div>
      </div>
    </div>
  );
}
