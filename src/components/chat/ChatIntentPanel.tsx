import { useState } from "react";
import { FileText, Search, Utensils, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type FaseCiclo = "folicular" | "ovulatoria" | "lutea" | "menopausa";

export type ExamFilters = {
  publico: "adulto" | "gestante" | null;
  sexo: "masculino" | "feminino" | null;
  gestanteTipo: "monofetal" | "gemelar" | null;
  gestantePeriodo: "1t" | "2t" | "3t" | null;
  faseCiclo: FaseCiclo | null;
  dataExame: string; // YYYY-MM-DD
};

const FASE_CICLO_LABEL: Record<FaseCiclo, string> = {
  folicular: "Fase Folicular",
  ovulatoria: "Fase Ovulatória",
  lutea: "Fase Lútea",
  menopausa: "Menopausa",
};

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
}: {
  filters: ExamFilters;
  onChange: (f: ExamFilters) => void;
  userName?: string | null;
}) {
  const update = (patch: Partial<ExamFilters>) => onChange({ ...filters, ...patch });

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-8">
      <header className="text-center mb-8">
        <h2
          className="text-3xl md:text-4xl bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] bg-clip-text text-transparent"
          style={{ fontFamily: "'Instrument Serif', serif" }}
        >
          Olá, {userName || "Nutricionista"}! O que você deseja fazer hoje?
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Selecione um módulo abaixo para iniciar o atendimento.
        </p>
      </header>

      {/* Active card */}
      <article className="rounded-2xl bg-white/85 backdrop-blur-xl border border-white/70 shadow-md p-6 mb-5">
        <div className="flex items-start gap-3 mb-5">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#e8a04c] to-[#e89bcf] text-white flex items-center justify-center shrink-0">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-foreground">
              📑 Interpretar Exame Clínico
              <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 align-middle">
                Módulo Ativo
              </span>
            </h3>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              Faça o upload de PDFs ou imagens de laudos laboratoriais para análise
              estruturada com base no método.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <FilterRow label="Público">
            <Pill active={filters.publico === "adulto"} onClick={() => update({ publico: "adulto", gestanteTipo: null, gestantePeriodo: null })}>
              Adulto
            </Pill>
            <Pill active={filters.publico === "gestante"} onClick={() => update({ publico: "gestante", sexo: "feminino" })}>
              Gestante
            </Pill>
            <Pill disabled>Criança (Em breve)</Pill>
          </FilterRow>

          <FilterRow label="Sexo biológico">
            <Pill
              active={filters.sexo === "masculino"}
              disabled={filters.publico === "gestante"}
              onClick={() => update({ sexo: "masculino" })}
            >
              Masculino
            </Pill>
            <Pill active={filters.sexo === "feminino"} onClick={() => update({ sexo: "feminino" })}>
              Feminino
            </Pill>
          </FilterRow>

          {filters.publico === "adulto" && filters.sexo === "feminino" && (
            <FilterRow label="Fase do ciclo">
              <Pill active={filters.faseCiclo === "folicular"} onClick={() => update({ faseCiclo: "folicular" })}>
                Folicular
              </Pill>
              <Pill active={filters.faseCiclo === "ovulatoria"} onClick={() => update({ faseCiclo: "ovulatoria" })}>
                Ovulatória
              </Pill>
              <Pill active={filters.faseCiclo === "lutea"} onClick={() => update({ faseCiclo: "lutea" })}>
                Lútea
              </Pill>
              <Pill active={filters.faseCiclo === "menopausa"} onClick={() => update({ faseCiclo: "menopausa" })}>
                Menopausa
              </Pill>
            </FilterRow>
          )}

          {filters.publico === "gestante" && (
            <>
              <FilterRow label="Tipo de gestação">
                <Pill active={filters.gestanteTipo === "monofetal"} onClick={() => update({ gestanteTipo: "monofetal" })}>
                  Monofetal
                </Pill>
                <Pill active={filters.gestanteTipo === "gemelar"} onClick={() => update({ gestanteTipo: "gemelar" })}>
                  Gemelar
                </Pill>
              </FilterRow>
              <FilterRow label="Período">
                <Pill active={filters.gestantePeriodo === "1t"} onClick={() => update({ gestantePeriodo: "1t" })}>
                  1º Trimestre
                </Pill>
                <Pill active={filters.gestantePeriodo === "2t"} onClick={() => update({ gestantePeriodo: "2t" })}>
                  2º Trimestre
                </Pill>
                <Pill active={filters.gestantePeriodo === "3t"} onClick={() => update({ gestantePeriodo: "3t" })}>
                  3º Trimestre
                </Pill>
              </FilterRow>
            </>
          )}

          <FilterRow label="Data do exame">
            <div className="flex flex-col gap-1">
              <label htmlFor="data-exame" className="sr-only">
                Data de Realização do Exame
              </label>
              <input
                id="data-exame"
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

        <div className="mt-6 pt-5 border-t border-muted/40 flex items-center justify-between flex-wrap gap-3">
          <p className="text-xs text-muted-foreground">
            Use o campo de mensagem abaixo para anexar o exame e enviar à Lumma.
          </p>
          <div className="text-[11px] text-muted-foreground/80">
            ↓ Anexar PDF ou imagem · Enviar pelo painel inferior
          </div>
        </div>
      </article>

      {/* Disabled future cards */}
      <div className="grid sm:grid-cols-2 gap-4">
        <FutureCard
          icon={<Search className="h-5 w-5" />}
          title="🔍 Pesquisa Científica Avançada"
          desc="Busca direta e resumos automáticos no PubMed, Cochrane e Scopus baseados no método."
        />
        <FutureCard
          icon={<Utensils className="h-5 w-5" />}
          title="🍽️ Cálculos e Prescrição"
          desc="Cálculo preciso de refeições, macronutrientes e Taxa Metabólica Basal pela Equação de Mueller."
        />
      </div>
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:w-40 shrink-0">
        {label}
      </span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function FutureCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div
      aria-disabled
      className="relative rounded-2xl bg-muted/40 border border-dashed border-muted-foreground/20 p-5 opacity-70 cursor-not-allowed select-none"
    >
      <Lock className="absolute top-3 right-3 h-3.5 w-3.5 text-muted-foreground/60" />
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-xl bg-muted text-muted-foreground flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-muted-foreground">
            {title}
            <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Em breve
            </span>
          </h4>
          <p className="text-xs text-muted-foreground/80 mt-1 leading-relaxed">{desc}</p>
        </div>
      </div>
    </div>
  );
}
