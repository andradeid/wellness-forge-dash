import { FileText, Search, Utensils, Lock, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import lummaSymbol from "@/assets/lumma-symbol.svg";

export type FaseCiclo =
  | "folicular"
  | "ovulatoria"
  | "lutea"
  | "nao_menstrua"
  | "menopausa"
  | "nao_sei";

export type AgentType = "exam" | "production" | "reasoning" | "research";

export type ExamFilters = {
  publico: "adulto" | "gestante" | null;
  sexo: "masculino" | "feminino" | null;
  gestanteTipo: "monofetal" | "gemelar" | null;
  gestantePeriodo: "1t" | "2t" | "3t" | null;
  faseCiclo: FaseCiclo | null;
  dataExame: string; // YYYY-MM-DD
};

export const FASE_CICLO_LABEL: Record<FaseCiclo, string> = {
  folicular: "Folicular",
  ovulatoria: "Ovulatória",
  lutea: "Lútea",
  nao_menstrua: "Paciente não menstrua",
  menopausa: "Paciente na menopausa",
  nao_sei: "Não sei",
};

export const FASE_CICLO_OPTIONS: { value: FaseCiclo; label: string }[] = [
  { value: "folicular", label: "Folicular" },
  { value: "ovulatoria", label: "Ovulatória" },
  { value: "lutea", label: "Lútea" },
  { value: "nao_menstrua", label: "Paciente não menstrua" },
  { value: "menopausa", label: "Paciente na menopausa" },
  { value: "nao_sei", label: "Não sei" },
];

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function emptyFilters(): ExamFilters {
  return { publico: null, sexo: null, gestanteTipo: null, gestantePeriodo: null, faseCiclo: null, dataExame: todayISO() };
}

export function filtersToContext(f: ExamFilters): string | null {
  const parts: string[] = [];
  if (f.publico) parts.push(`Público: ${f.publico === "adulto" ? "Adulto" : "Gestante"}`);
  if (f.sexo) parts.push(`Sexo biológico: ${f.sexo === "masculino" ? "Masculino" : "Feminino"}`);
  if (f.publico === "gestante" && f.gestanteTipo)
    parts.push(`Gestação: ${f.gestanteTipo === "monofetal" ? "Monofetal" : "Gemelar"}`);
  if (f.publico === "gestante" && f.gestantePeriodo) {
    const map = { "1t": "1º Trimestre", "2t": "2º Trimestre", "3t": "3º Trimestre" } as const;
    parts.push(`Período: ${map[f.gestantePeriodo]}`);
  }
  if (f.publico === "adulto" && f.sexo === "feminino" && f.faseCiclo) {
    parts.push(`Fase do ciclo: ${FASE_CICLO_LABEL[f.faseCiclo]}`);
  }
  if (f.dataExame) {
    const [y, m, d] = f.dataExame.split("-");
    parts.push(`Data de realização do exame: ${d}/${m}/${y}`);
  }
  return parts.length ? `[Contexto clínico] ${parts.join(" · ")}` : null;
}

export function faseCicloToInput(f: ExamFilters): string {
  if (f.publico === "adulto" && f.sexo === "feminino" && f.faseCiclo) {
    return FASE_CICLO_LABEL[f.faseCiclo];
  }
  return "";
}

function Pill({
  active,
  disabled,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-full px-4 py-1.5 text-xs font-medium border transition-all",
        active
          ? "bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white border-transparent shadow-sm"
          : "bg-white/70 text-foreground border-white hover:bg-white",
        disabled && "opacity-50 cursor-not-allowed hover:bg-white/70",
      )}
    >
      {children}
    </button>
  );
}

export function ChatIntentPanel({
  filters,
  onChange,
  userName,
  agentType = "exam",
  onAgentChange,
}: {
  filters: ExamFilters;
  onChange: (f: ExamFilters) => void;
  userName?: string | null;
  agentType?: AgentType;
  onAgentChange?: (t: AgentType) => void;
}) {
  const update = (patch: Partial<ExamFilters>) => onChange({ ...filters, ...patch });
  const selectAgent = (t: AgentType) => onAgentChange?.(t);

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-12">
      <div className="flex flex-1 flex-col items-center justify-center text-center max-w-4xl mx-auto w-full">
        <img
          src={lummaSymbol}
          alt="Lumma"
          className="h-20 w-20 mb-8 drop-shadow-sm"
        />
        <h1 className="text-5xl font-light tracking-tight text-foreground mb-6">
          Bem-vinda
        </h1>
        <p className="text-lg text-foreground/70 leading-relaxed mb-4 max-w-xl mx-auto text-center">
          Sou sua mentora virtual, inspirada na metodologia da Ana Paula
          Pujol. Estou aqui para apoiar seu raciocínio clínico em Nutrição
          Funcional e Integrativa.
        </p>
        <p className="text-sm text-foreground/60 mb-8 max-w-lg mx-auto text-center">
          Faça o upload de PDFs ou imagens de laudos laboratoriais para análise estruturada.
        </p>

        <div className="hidden flex items-center gap-3 flex-wrap justify-center max-w-4xl mb-8">
          <ModuleButton
            active={agentType === "exam"}
            onClick={() => selectAgent("exam")}
            icon="🔬"
            label="Interpretar Exame Clínico"
          />
          <ModuleButton
            active={agentType === "production"}
            onClick={() => selectAgent("production")}
            icon="🥗"
            label="Plano Alimentar & Formulações"
          />
          <ModuleButton
            active={agentType === "reasoning"}
            onClick={() => selectAgent("reasoning")}
            icon="🤔"
            label="Perguntas Clínicas"
          />
          <ModuleButton
            active={agentType === "research"}
            onClick={() => selectAgent("research")}
            icon="🔍"
            label="Pesquisa Científica"
          />
          <ModuleButton
            disabled
            icon="🧮"
            label="Cálculos e Prescrição (em breve)"
          />
        </div>


        {/* Painel de filtros (exclusivo para o módulo de exames) */}
        {agentType === "exam" && (
          <div className="w-full max-w-2xl bg-white/40 backdrop-blur-md rounded-3xl border border-white/60 p-8 shadow-sm animate-in fade-in zoom-in duration-300 mx-auto">
            <div className="space-y-6">
              {(filters.publico as string === "adulto" || filters.publico === null || filters.publico === "gestante") && (
                <FilterRow label="Público">
                  <Pill active={filters.publico === "adulto"} onClick={() => update({ publico: "adulto", gestanteTipo: null, gestantePeriodo: null })}>
                    Adulto
                  </Pill>
                  <Pill active={filters.publico === "gestante"} onClick={() => update({ publico: "gestante", sexo: "feminino", faseCiclo: null })}>
                    Gestante
                  </Pill>
                  <Pill disabled>Criança (Em breve)</Pill>
                </FilterRow>
              )}

              {filters.publico === "gestante" && (
                <FilterRow label="Sexo biológico">
                  <Pill active={filters.sexo === "feminino"} disabled>
                    Feminino
                  </Pill>
                </FilterRow>
              )}

              {!filters.sexo && (
                <FilterRow label="Sexo biológico">
                  <Pill
                    active={filters.sexo === "masculino"}
                    onClick={() => update({ sexo: "masculino", faseCiclo: null })}
                  >
                    Masculino
                  </Pill>
                  <Pill active={filters.sexo === "feminino"} onClick={() => update({ sexo: "feminino" })}>
                    Feminino
                  </Pill>
                </FilterRow>
              )}

              {filters.publico === "adulto" && filters.sexo === "feminino" && (
                <FilterRow label="Fase do ciclo">
                  <Pill active={filters.faseCiclo === null} onClick={() => update({ faseCiclo: null })}>Não informada</Pill>
                  <Pill active={filters.faseCiclo === "folicular"} onClick={() => update({ faseCiclo: "folicular" })}>Folicular (dias 1–13)</Pill>
                  <Pill active={filters.faseCiclo === "ovulatoria"} onClick={() => update({ faseCiclo: "ovulatoria" })}>Ovulatória (dias 14–16)</Pill>
                  <Pill active={filters.faseCiclo === "lutea"} onClick={() => update({ faseCiclo: "lutea" })}>Lútea (dias 17–28)</Pill>
                  <Pill active={filters.faseCiclo === "menopausa"} onClick={() => update({ faseCiclo: "menopausa" })}>Menopausa</Pill>
                </FilterRow>
              )}

              {filters.publico === "gestante" && (
                <>
                  <FilterRow label="Tipo de gestação">
                    <Pill active={filters.gestanteTipo === "monofetal"} onClick={() => update({ gestanteTipo: "monofetal" })}>Monofetal</Pill>
                    <Pill active={filters.gestanteTipo === "gemelar"} onClick={() => update({ gestanteTipo: "gemelar" })}>Gemelar</Pill>
                  </FilterRow>
                  <FilterRow label="Período">
                    <Pill active={filters.gestantePeriodo === "1t"} onClick={() => update({ gestantePeriodo: "1t" })}>1º Trimestre</Pill>
                    <Pill active={filters.gestantePeriodo === "2t"} onClick={() => update({ gestantePeriodo: "2t" })}>2º Trimestre</Pill>
                    <Pill active={filters.gestantePeriodo === "3t"} onClick={() => update({ gestantePeriodo: "3t" })}>3º Trimestre</Pill>
                  </FilterRow>
                </>
              )}

              <FilterRow label="Data do exame">
                <div className="flex flex-col gap-1 items-start">
                  <input
                    type="date"
                    value={filters.dataExame}
                    max={todayISO()}
                    onChange={(e) => update({ dataExame: e.target.value || todayISO() })}
                    className="rounded-full px-4 py-1.5 text-xs font-medium bg-white/80 text-foreground border border-white shadow-sm hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#e8a04c]/40 transition-all"
                  />
                  <span className="text-[10px] text-muted-foreground px-1">
                    Data de realização do exame · usada na linha do tempo clínica
                  </span>
                </div>
              </FilterRow>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ModuleButton({
  active,
  disabled,
  onClick,
  icon,
  label,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  icon: string | React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-6 h-12 border-2 transition-all duration-300 bg-white/70 backdrop-blur-sm text-sm font-medium",
        active
          ? "border-[#e89bcf] text-foreground shadow-md bg-white scale-105"
          : "border-[#e89bcf]/40 text-foreground/80 hover:bg-white hover:shadow-sm hover:border-[#e89bcf]/60",
        disabled && "opacity-40 grayscale cursor-not-allowed border-slate-200 bg-slate-50/70 text-slate-400"
      )}
    >
      <span className="text-xl">{icon}</span>
      {label}
    </button>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:w-40 shrink-0 text-left">
        {label}
      </span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
