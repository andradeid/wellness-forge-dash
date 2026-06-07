import { useEffect, useState } from "react";
import { FlaskConical, Brain, FileSearch, Stethoscope, Sparkles, Activity } from "lucide-react";
import lummaSymbol from "@/assets/lumma-symbol.svg";

const STEPS = [
  { icon: FileSearch, text: "Lendo o exame com atenção…" },
  { icon: FlaskConical, text: "Identificando marcadores laboratoriais…" },
  { icon: Activity, text: "Comparando com valores de referência…" },
  { icon: Brain, text: "Cruzando achados clínicos…" },
  { icon: Stethoscope, text: "Avaliando o contexto da paciente…" },
  { icon: Sparkles, text: "Organizando a interpretação para você…" },
];

const RESEARCH_STEPS = [
  { icon: FileSearch, text: "Consultando bases científicas…" },
  { icon: Activity, text: "Buscando evidências no PubMed…" },
  { icon: FlaskConical, text: "Analisando artigos encontrados…" },
  { icon: Brain, text: "Sintetizando descobertas acadêmicas…" },
  { icon: Sparkles, text: "Organizando a análise científica para você…" },
];

export function ChatThinking({ mode = "analysis", agentType }: { mode?: "analysis" | "simple", agentType?: string }) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (mode !== "analysis") return;
    const steps = agentType === 'research' ? RESEARCH_STEPS : STEPS;
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % steps.length);
    }, 2200);
    return () => clearInterval(id);
  }, [mode, agentType]);

  if (mode === "simple") {
    return (
      <div className="flex items-center gap-3 px-4 py-3 min-w-[220px]">
        <img src={lummaSymbol} alt="Lumma" className="h-5 w-5 animate-spin shrink-0" />
        <span className="text-sm font-medium animate-pulse bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] bg-clip-text text-transparent">
          Lumma está pensando…
        </span>
      </div>
    );
  }

  const Step = STEPS[idx];
  const Icon = Step.icon;

  return (
    <div className="flex items-center gap-3 px-4 py-3 min-w-[280px]">
      <img src={lummaSymbol} alt="Lumma" className="h-6 w-6 animate-spin shrink-0" />
      <div className="flex items-center gap-2 overflow-hidden">
        <Icon
          key={`icon-${idx}`}
          className="h-4 w-4 shrink-0 text-[#e8a04c] animate-fade-in"
        />
        <span
          key={`text-${idx}`}
          className="text-sm font-medium animate-fade-in bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] bg-clip-text text-transparent whitespace-nowrap"
        >
          {Step.text}
        </span>
        <span className="ml-1 inline-flex gap-0.5">
          <span className="h-1 w-1 rounded-full bg-[#e89bcf] animate-bounce [animation-delay:0ms]" />
          <span className="h-1 w-1 rounded-full bg-[#e89bcf] animate-bounce [animation-delay:150ms]" />
          <span className="h-1 w-1 rounded-full bg-[#e89bcf] animate-bounce [animation-delay:300ms]" />
        </span>
      </div>
    </div>
  );
}
