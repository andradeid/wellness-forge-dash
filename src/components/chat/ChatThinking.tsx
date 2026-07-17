import { useEffect, useMemo, useState } from "react";
import {
  FlaskConical,
  Brain,
  FileSearch,
  Stethoscope,
  Sparkles,
  Activity,
  Dna,
  Utensils,
  Camera,
  Ruler,
  BookOpen,
  Pill,
  ChefHat,
  HeartPulse,
  ScanLine,
  ClipboardList,
} from "lucide-react";
import lummaSymbol from "@/assets/lumma-symbol.svg";

type Step = { icon: any; text: string };

const EXAM_STEPS: Step[] = [
  { icon: FileSearch, text: "Lendo o exame com atenção…" },
  { icon: FlaskConical, text: "Identificando marcadores laboratoriais…" },
  { icon: Activity, text: "Comparando com valores de referência…" },
  { icon: Brain, text: "Cruzando achados clínicos…" },
  { icon: Stethoscope, text: "Avaliando o contexto da paciente…" },
  { icon: Sparkles, text: "Organizando a interpretação para você…" },
];

const RESEARCH_STEPS: Step[] = [
  { icon: FileSearch, text: "Consultando bases científicas…" },
  { icon: Activity, text: "Buscando evidências no PubMed…" },
  { icon: FlaskConical, text: "Analisando artigos encontrados…" },
  { icon: Brain, text: "Sintetizando descobertas acadêmicas…" },
  { icon: Sparkles, text: "Organizando a análise científica para você…" },
];

const COMPOSITION_STEPS: Step[] = [
  { icon: Ruler, text: "Lendo os dados de composição corporal…" },
  { icon: Activity, text: "Calculando massa magra e gordura…" },
  { icon: HeartPulse, text: "Avaliando indicadores metabólicos…" },
  { icon: Brain, text: "Comparando com faixas de referência…" },
  { icon: Sparkles, text: "Montando a interpretação clínica…" },
];

const METABOLISM_STEPS: Step[] = [
  { icon: FlaskConical, text: "Analisando marcadores metabólicos…" },
  { icon: Activity, text: "Cruzando glicemia, insulina e lipídios…" },
  { icon: HeartPulse, text: "Avaliando resistência e inflamação…" },
  { icon: Brain, text: "Correlacionando com o quadro clínico…" },
  { icon: Sparkles, text: "Organizando a leitura metabólica…" },
];

const GENETICS_STEPS: Step[] = [
  { icon: Dna, text: "Lendo variantes genéticas…" },
  { icon: FlaskConical, text: "Cruzando SNPs com evidências…" },
  { icon: Brain, text: "Avaliando impacto nutrigenômico…" },
  { icon: Stethoscope, text: "Contextualizando para a paciente…" },
  { icon: Sparkles, text: "Organizando o laudo genético…" },
];

const MEAL_PHOTO_STEPS: Step[] = [
  { icon: Camera, text: "Analisando a foto da refeição…" },
  { icon: Utensils, text: "Identificando alimentos e porções…" },
  { icon: Activity, text: "Estimando calorias e macros…" },
  { icon: Sparkles, text: "Organizando a estimativa nutricional…" },
];

const BODY_PHOTO_STEPS: Step[] = [
  { icon: Camera, text: "Analisando a foto corporal…" },
  { icon: ScanLine, text: "Avaliando proporções e composição visual…" },
  { icon: Ruler, text: "Estimando indicadores antropométricos…" },
  { icon: Sparkles, text: "Organizando a análise visual…" },
];

const PRODUCTION_STEPS: Step[] = [
  { icon: ClipboardList, text: "Estruturando o plano alimentar…" },
  { icon: Utensils, text: "Distribuindo macros nas refeições…" },
  { icon: ChefHat, text: "Selecionando receitas adequadas…" },
  { icon: Brain, text: "Ajustando ao contexto da paciente…" },
  { icon: Sparkles, text: "Finalizando a prescrição alimentar…" },
];

const REASONING_STEPS: Step[] = [
  { icon: Brain, text: "Organizando o raciocínio clínico…" },
  { icon: Stethoscope, text: "Cruzando o quadro apresentado…" },
  { icon: Sparkles, text: "Elaborando a resposta…" },
];

const SUPPLEMENT_STEPS: Step[] = [
  { icon: Pill, text: "Avaliando necessidades de suplementação…" },
  { icon: FlaskConical, text: "Selecionando ativos e doses…" },
  { icon: Brain, text: "Verificando interações e contexto…" },
  { icon: Sparkles, text: "Montando a sugestão de suplementação…" },
];

const FORMULATION_STEPS: Step[] = [
  { icon: Pill, text: "Desenhando a formulação magistral…" },
  { icon: FlaskConical, text: "Ajustando ativos, doses e veículos…" },
  { icon: Brain, text: "Revisando compatibilidades e alertas…" },
  { icon: Sparkles, text: "Finalizando a prescrição magistral…" },
];

const CLINICAL_CASE_STEPS: Step[] = [
  { icon: Stethoscope, text: "Lendo o caso clínico com atenção…" },
  { icon: Brain, text: "Levantando hipóteses e diferenciais…" },
  { icon: Activity, text: "Cruzando sinais e sintomas…" },
  { icon: Sparkles, text: "Organizando a conduta sugerida…" },
];

const DEFAULT_STEPS: Step[] = [
  { icon: Brain, text: "Analisando com atenção…" },
  { icon: Activity, text: "Cruzando as informações…" },
  { icon: Sparkles, text: "Organizando a resposta para você…" },
];

function pickSteps(agentType?: string, taskType?: string | null): Step[] {
  const key = (taskType || agentType || "").toLowerCase();
  if (!key) return DEFAULT_STEPS;

  if (key === "research" || key === "artigos_cientificos") return RESEARCH_STEPS;
  if (key === "composition") return COMPOSITION_STEPS;
  if (key === "metabolism") return METABOLISM_STEPS;
  if (key === "genetics") return GENETICS_STEPS;
  if (key === "estimativa_refeicao_foto") return MEAL_PHOTO_STEPS;
  if (key === "composicao_corporal_foto") return BODY_PHOTO_STEPS;
  if (key === "production" || key === "plano_alimentar" || key === "receitas") return PRODUCTION_STEPS;
  if (key === "reasoning" || key === "conversa_geral") return REASONING_STEPS;
  if (key === "suplementacao") return SUPPLEMENT_STEPS;
  if (key === "formulacao_magistral") return FORMULATION_STEPS;
  if (key === "casos_clinicos" || key === "sintomas" || key === "caso_clinico") return CLINICAL_CASE_STEPS;

  // Exames por perfil e genéricos
  if (key.startsWith("exam")) return EXAM_STEPS;
  if (key.startsWith("super")) return EXAM_STEPS;

  return DEFAULT_STEPS;
}

export function ChatThinking({
  mode = "analysis",
  agentType,
  taskType,
}: {
  mode?: "analysis" | "simple";
  agentType?: string;
  taskType?: string | null;
}) {
  const steps = useMemo(() => pickSteps(agentType, taskType), [agentType, taskType]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (mode !== "analysis") return;
    setIdx(0);
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % steps.length);
    }, 2200);
    return () => clearInterval(id);
  }, [mode, steps]);

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

  const Step = steps[idx % steps.length];
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
