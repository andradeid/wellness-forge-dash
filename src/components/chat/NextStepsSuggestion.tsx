import { Apple, ClipboardList, Pill } from "lucide-react";
import { Button } from "@/components/ui/button";

interface NextStepsSuggestionProps {
  onSelectModule: (trigger: string) => void;
}

export function NextStepsSuggestion({ onSelectModule }: NextStepsSuggestionProps) {
  const steps = [
    {
      label: "Plano Alimentar",
      icon: <Apple className="h-3.5 w-3.5" />,
      trigger: "plano_alimentar",
    },
    {
      label: "Formulações",
      icon: <Pill className="h-3.5 w-3.5" />,
      trigger: "plano_alimentar",
    },
    {
      label: "Caso Clínico",
      icon: <ClipboardList className="h-3.5 w-3.5" />,
      trigger: "casos_clinicos",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-2xl mt-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white/40 backdrop-blur-sm border border-[#e8a04c]/20 rounded-2xl p-4 sm:p-5 shadow-sm">
        <p className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
          <span>✨</span> Análise concluída! Explore os próximos passos:
        </p>
        
        <div className="flex flex-wrap gap-2 mb-3">
          {steps.map((step) => (
            <Button
              key={step.label}
              variant="outline"
              size="sm"
              onClick={() => onSelectModule(step.trigger)}
              className="rounded-full bg-white/60 hover:bg-white border-[#e8a04c]/20 hover:border-[#e8a04c]/40 text-xs gap-1.5 h-8"
            >
              <span className="text-[#e8a04c]">{step.icon}</span>
              {step.label}
            </Button>
          ))}
        </div>
        
        <p className="text-[10px] text-muted-foreground">
          Clique em um módulo para continuar o atendimento com a Lumma
        </p>
      </div>
    </div>
  );
}
