import { Apple, ClipboardList, Pill, Droplet, Brain, Microscope, Search, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NextStepsSuggestionProps {
  onSelectModule: (trigger: string | null) => void;
}

export function NextStepsSuggestion({ onSelectModule }: NextStepsSuggestionProps) {
  const steps = [
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

  return (
    <div className="mx-auto w-full max-w-2xl mt-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white/60 backdrop-blur-md border border-[#e8a04c]/20 rounded-2xl p-5 sm:p-6 shadow-lg">
        <div className="text-center mb-6">
          <h3 className="text-lg font-bold text-foreground mb-1">
            ✨ Exame analisado! O que você quer fazer agora?
          </h3>
          <p className="text-sm text-muted-foreground">
            Escolha o próximo passo para continuar o atendimento
          </p>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {steps.map((step, idx) => (
            <Button
              key={idx}
              variant="outline"
              onClick={() => onSelectModule(step.trigger)}
              className="w-full h-auto py-3 px-4 justify-start text-left bg-white/50 hover:bg-white border-[#e8a04c]/10 hover:border-[#e8a04c]/30 text-sm font-medium gap-3 transition-all hover:shadow-sm"
            >
              <span className="text-lg shrink-0">{step.icon}</span>
              <span className="leading-tight">{step.label}</span>
            </Button>
          ))}
        </div>
        
        <div className="border-t border-[#e8a04c]/10 pt-4">
          <Button
            variant="ghost"
            onClick={() => onSelectModule(null)}
            className="w-full h-auto py-3 px-4 justify-center bg-[#e8a04c]/5 hover:bg-[#e8a04c]/10 text-sm font-medium gap-3 text-[#e8a04c] transition-all"
          >
            <span className="text-lg">💬</span>
            Tenho uma dúvida sobre este exame
          </Button>
        </div>
      </div>
    </div>
  );
}