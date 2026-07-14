/**
 * Registry de ícones (Lucide) disponíveis para tarefas de Super Agente.
 * Curadoria focada em saúde, nutrição, exames e prescrição — nada genérico.
 */
import {
  Activity,
  Apple,
  Baby,
  Beef,
  BookOpen,
  Brain,
  Camera,
  Carrot,
  ClipboardList,
  Coffee,
  Croissant,
  Dna,
  Droplet,
  Droplets,
  Dumbbell,
  Egg,
  FileText,
  Fish,
  FlaskConical,
  FlaskRound,
  Heart,
  HeartPulse,
  Leaf,
  Microscope,
  Moon,
  PersonStanding,
  Pill,
  Ruler,
  Salad,
  Scale,
  Search,
  Sparkles,
  Sprout,
  Stethoscope,
  Sun,
  Syringe,
  TestTube,
  TestTubes,
  Thermometer,
  Utensils,
  UtensilsCrossed,
  Wheat,
  Zap,
  type LucideIcon,
} from "lucide-react";

export interface AgentIconOption {
  key: string;
  label: string;
  Icon: LucideIcon;
}

/** Lista curada — ordem usada no picker. */
export const AGENT_ICONS: AgentIconOption[] = [
  { key: "droplet", label: "Gota de sangue", Icon: Droplet },
  { key: "droplets", label: "Hidratação", Icon: Droplets },
  { key: "test-tube", label: "Tubo de ensaio", Icon: TestTube },
  { key: "test-tubes", label: "Amostras", Icon: TestTubes },
  { key: "flask-conical", label: "Frasco cônico", Icon: FlaskConical },
  { key: "flask-round", label: "Frasco redondo", Icon: FlaskRound },
  { key: "microscope", label: "Microscópio", Icon: Microscope },
  { key: "dna", label: "DNA", Icon: Dna },
  { key: "syringe", label: "Seringa", Icon: Syringe },
  { key: "pill", label: "Comprimido", Icon: Pill },
  { key: "stethoscope", label: "Estetoscópio", Icon: Stethoscope },
  { key: "heart", label: "Coração", Icon: Heart },
  { key: "heart-pulse", label: "Pulso cardíaco", Icon: HeartPulse },
  { key: "activity", label: "Atividade", Icon: Activity },
  { key: "brain", label: "Cérebro", Icon: Brain },
  { key: "thermometer", label: "Termômetro", Icon: Thermometer },
  { key: "scale", label: "Balança", Icon: Scale },
  { key: "ruler", label: "Antropometria", Icon: Ruler },
  { key: "person", label: "Corpo", Icon: PersonStanding },
  { key: "dumbbell", label: "Exercício", Icon: Dumbbell },
  { key: "baby", label: "Gestação/bebê", Icon: Baby },
  { key: "apple", label: "Maçã", Icon: Apple },
  { key: "salad", label: "Salada", Icon: Salad },
  { key: "carrot", label: "Cenoura", Icon: Carrot },
  { key: "leaf", label: "Folha", Icon: Leaf },
  { key: "sprout", label: "Broto", Icon: Sprout },
  { key: "wheat", label: "Grãos", Icon: Wheat },
  { key: "egg", label: "Ovo", Icon: Egg },
  { key: "fish", label: "Peixe", Icon: Fish },
  { key: "beef", label: "Proteína", Icon: Beef },
  { key: "croissant", label: "Carboidrato", Icon: Croissant },
  { key: "coffee", label: "Bebida", Icon: Coffee },
  { key: "utensils", label: "Refeição", Icon: Utensils },
  { key: "utensils-crossed", label: "Cardápio", Icon: UtensilsCrossed },
  { key: "camera", label: "Foto/análise visual", Icon: Camera },
  { key: "clipboard-list", label: "Prescrição", Icon: ClipboardList },
  { key: "file-text", label: "Laudo", Icon: FileText },
  { key: "book-open", label: "Referência", Icon: BookOpen },
  { key: "search", label: "Pesquisa", Icon: Search },
  { key: "zap", label: "Metabolismo", Icon: Zap },
  { key: "sun", label: "Vitamina D / manhã", Icon: Sun },
  { key: "moon", label: "Sono / ritmo", Icon: Moon },
  { key: "sparkles", label: "Super Agente", Icon: Sparkles },
];

const ICON_MAP: Record<string, LucideIcon> = AGENT_ICONS.reduce(
  (acc, opt) => {
    acc[opt.key] = opt.Icon;
    return acc;
  },
  {} as Record<string, LucideIcon>,
);

/** Resolve chave → componente. Fallback = Sparkles. */
export function getAgentIcon(key?: string | null): LucideIcon {
  if (!key) return Sparkles;
  return ICON_MAP[key] ?? Sparkles;
}
