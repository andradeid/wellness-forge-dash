/**
 * Builders especializados de contexto por agente.
 *
 * Cada agente do Dify recebe APENAS o recorte clínico que importa para sua
 * especialidade. Isso reduz ruído, foca o raciocínio e economiza tokens.
 *
 * REGRAS DE SEGURANÇA (não negociáveis):
 *  - Agentes `exam_*` NUNCA passam por aqui (early-return null no dispatcher).
 *  - Se um builder específico não tem dados suficientes, retorna `null` e o
 *    chamador cai no comportamento padrão atual — sem regressão possível.
 *  - Nomes de agente e categorias foram confirmados na fonte (dify_agents /
 *    patient_exam_results) antes da implementação.
 *
 * Nota sobre tokens: NÃO instrumentamos contagem aqui. Monitoramento de
 * tokens fica a cargo do Langfuse na camada do gateway.
 */
import type { Marker } from "@/components/chat/ExamResultCard";
import { classificationVisualState } from "@/lib/exam-markers";
import type { ExamContext } from "@/hooks/useDifyChat";

// ---------------------------------------------------------------------------
// Normalização e mapeamento de categorias
// ---------------------------------------------------------------------------
// O banco hoje tem categorias bagunçadas (snake_case + Title Case + acentos).
// Normalizamos para comparar por keyword. Confirmado via:
//   SELECT DISTINCT category FROM patient_exam_results;
// ---------------------------------------------------------------------------

function normalize(s: string | null | undefined): string {
  return (s ?? "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

const CATEGORY_KEYWORDS = {
  metabolic: ["metabol", "lipid", "glicid", "glicidico", "purina"],
  hormonal: ["hormon", "tireoid", "eixohormon", "endocrin"],
  inflammatory: ["inflama", "imunidade"],
  hematology: ["hemograma", "anemia", "ferro", "coagula"],
  vitaminsMinerals: ["vitamina", "mineral", "micronutri", "estadonutricional", "osseo"],
} as const;

type CategoryGroup = keyof typeof CATEGORY_KEYWORDS;

function matchesGroup(category: string | null | undefined, group: CategoryGroup): boolean {
  const n = normalize(category);
  if (!n) return false;
  return CATEGORY_KEYWORDS[group].some((kw) => n.includes(kw));
}

function matchesAnyGroup(category: string | null | undefined, groups: CategoryGroup[]): boolean {
  return groups.some((g) => matchesGroup(category, g));
}

// ---------------------------------------------------------------------------
// Helpers de formatação
// ---------------------------------------------------------------------------

function formatMarkerLine(m: Marker): string {
  const value = `${m.value}${m.unit ? " " + m.unit : ""}`.trim();
  const cls = m.classification ? ` (${m.classification})` : "";
  return `- ${m.name}: ${value}${cls}`;
}

function patientHeader(ctx: ExamContext): string[] {
  const lines = [
    `Paciente: ${ctx.patient_name}`,
    `Perfil: ${ctx.patient_profile} | Sexo: ${ctx.patient_sex}`,
  ];
  if (ctx.gestante_tipo) {
    lines.push(`Gestação: ${ctx.gestante_tipo}${ctx.gestante_periodo ? " — " + ctx.gestante_periodo : ""}`);
  }
  return lines;
}

// "Não-normal" para fins de receita: tudo que NÃO é normal/ótimo, INCLUINDO
// `desconhecido`. Princípio clínico: 'desconhecido' não é 'normal', é
// 'não sei' — na dúvida, inclui.
function isClinicallyRelevant(m: Marker): boolean {
  const v = classificationVisualState(m.classification);
  return v !== "normal" && v !== "otimo";
}

// ---------------------------------------------------------------------------
// Builders por agente
// ---------------------------------------------------------------------------

interface BuilderInput {
  examContext: ExamContext | null;
  markers: Marker[];
}

/**
 * Production (Receituário): foco em marcadores ALTERADOS + desconhecidos,
 * sem ruído de normais. O agente decide as formulações com base nesse recorte.
 */
function buildProductionContext({ examContext, markers }: BuilderInput): string | null {
  if (!examContext) return null;
  const relevant = markers.filter(isClinicallyRelevant);
  if (relevant.length === 0 && !examContext.alteracoes?.length) return null;

  const lines = [
    `[CONTEXTO CLÍNICO PARA FORMULAÇÃO]`,
    `Use este recorte para propor a prescrição. Ignore marcadores normais —`,
    `eles foram omitidos de propósito. Marcadores 'desconhecidos' estão inclusos`,
    `como cautela (parser não classificou; trate como alterado potencial).`,
    ...patientHeader(examContext),
    "",
    `Marcadores relevantes (alterados + desconhecidos):`,
  ];

  if (relevant.length > 0) {
    lines.push(...relevant.map(formatMarkerLine));
  } else {
    // Fallback: usa o resumo string do examContext (já contém só não-normais).
    lines.push(...examContext.alteracoes.map((s) => `- ${s}`));
  }

  lines.push("", `[FIM DO CONTEXTO]`, "");
  return lines.join("\n");
}

/**
 * Composition (Composição/Metabolismo): recorte metabólico + lipídico +
 * inflamatório + glicídico. Antropometria estruturada ainda NÃO existe no
 * banco — quando entrar, plugar aqui.
 */
function buildCompositionContext({ examContext, markers }: BuilderInput): string | null {
  if (!examContext) return null;

  const subset = markers.filter((m) =>
    matchesAnyGroup(m.category, ["metabolic", "inflammatory"]),
  );
  if (subset.length === 0) return null;

  const lines = [
    `[CONTEXTO METABÓLICO]`,
    `Recorte focado em metabolismo, perfil lipídico, glicídico e inflamação.`,
    `Outros marcadores (hormonais, renais, hepáticos) estão disponíveis sob`,
    `demanda — peça se precisar.`,
    // TODO: incluir antropometria (peso, % gordura, circunferências) quando
    // a captura estruturada entrar no banco.
    ...patientHeader(examContext),
    "",
    `Marcadores metabólicos / inflamatórios:`,
    ...subset.map(formatMarkerLine),
    "",
    `[FIM DO CONTEXTO]`,
    "",
  ];
  return lines.join("\n");
}

/**
 * Genetics (Genética & Microbioma): perfil do paciente + lista enxuta de
 * alterações. Genética hoje é entrada manual / arquivo do nutri — não há
 * dados estruturados de SNP no banco. Damos só o contexto de paciente +
 * sumário de alterações para o agente saber com quem está conversando.
 */
function buildGeneticsContext({ examContext }: BuilderInput): string | null {
  if (!examContext) return null;
  const lines = [
    `[PERFIL DO PACIENTE]`,
    ...patientHeader(examContext),
  ];
  if (examContext.alteracoes?.length) {
    lines.push("", `Marcadores laboratoriais alterados (resumo):`);
    lines.push(...examContext.alteracoes.map((s) => `- ${s}`));
  }
  lines.push("", `[FIM DO CONTEXTO]`, "");
  return lines.join("\n");
}

/**
 * Estimativa de Refeição por Foto: só precisa saber quem é o paciente
 * (perfil / sexo / gestação) para calibrar necessidades calóricas.
 * Marcadores laboratoriais são ruído aqui — não entram.
 */
function buildMealPhotoContext({ examContext }: BuilderInput): string | null {
  if (!examContext) return null;
  const lines = [
    `[PERFIL DO PACIENTE — ESTIMATIVA DE REFEIÇÃO POR FOTO]`,
    `Use apenas o perfil para calibrar calorias e macros. Ignore marcadores`,
    `laboratoriais — foram omitidos de propósito.`,
    ...patientHeader(examContext),
    "",
    `[FIM DO CONTEXTO]`,
    "",
  ];
  return lines.join("\n");
}

/**
 * Composição Corporal por Foto: mesmo recorte metabólico/inflamatório do
 * agente `composition` (antropometria estruturada ainda não existe no banco).
 * Reaproveita o builder para manter consistência clínica.
 */
function buildBodyPhotoContext(input: BuilderInput): string | null {
  const composition = buildCompositionContext(input);
  if (composition) return composition;
  // Sem marcadores metabólicos: cai para header mínimo em vez de null,
  // para o agente saber com quem está conversando.
  if (!input.examContext) return null;
  const lines = [
    `[PERFIL DO PACIENTE — COMPOSIÇÃO CORPORAL POR FOTO]`,
    ...patientHeader(input.examContext),
    "",
    `[FIM DO CONTEXTO]`,
    "",
  ];
  return lines.join("\n");
}

/**
 * Nutrição Visual (geração de imagem): contexto mínimo — menos texto =
 * geração mais fiel e mais barata. Só o essencial do paciente.
 */
function buildVisualNutritionContext({ examContext }: BuilderInput): string | null {
  if (!examContext) return null;
  const lines = [
    `[PERFIL DO PACIENTE — NUTRIÇÃO VISUAL]`,
    ...patientHeader(examContext),
    "",
    `[FIM DO CONTEXTO]`,
    "",
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/**
 * Retorna o prefixo de contexto especializado para o agente, ou `null` para
 * indicar que o chamador deve usar o builder padrão.
 *
 * Agentes `exam_*` e `research` NÃO passam por aqui — esse early-return é
 * tratado no chamador (useDifyChat) para preservar o fluxo já validado.
 *
 * Nomes confirmados em `dify_agents` (is_active = true):
 *   composition, exam_feminino, exam_gestante_gem, exam_gestante_mono,
 *   exam_masculino, genetics, production, reasoning, research,
 *   composicao_corporal_foto, estimativa_refeicao_foto, nutricao_visual
 */
export function buildAgentContextPrefix(
  agentType: string,
  input: BuilderInput,
): string | null {
  switch (agentType) {
    case "production":
      return buildProductionContext(input);
    case "composition":
      return buildCompositionContext(input);
    case "genetics":
      return buildGeneticsContext(input);
    case "estimativa_refeicao_foto":
      return buildMealPhotoContext(input);
    case "composicao_corporal_foto":
      return buildBodyPhotoContext(input);
    case "nutricao_visual":
      return buildVisualNutritionContext(input);
    // reasoning: usa o builder padrão (contexto amplo) — fallback no chamador.
    // research: chamador já retorna sem prefixo.
    // exam_*: chamador não invoca o dispatcher.
    default:
      return null;
  }
}

