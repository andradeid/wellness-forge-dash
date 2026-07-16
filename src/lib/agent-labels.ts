/** Mapping of internal agent_id → user-facing chip label + visual tone. */
export interface AgentLabel {
  label: string;
  icon: string;
  /** Tailwind classes for the chip (bg + text + border). */
  chip: string;
}

const MAP: Record<string, AgentLabel> = {
  exam_masculino: { label: "Exame · Masculino", icon: "🧪", chip: "bg-sky-50 text-sky-700 border-sky-200" },
  exam_feminino: { label: "Exame · Feminino", icon: "🧪", chip: "bg-pink-50 text-pink-700 border-pink-200" },
  exam_gestante_mono: { label: "Exame · Gestante (mono)", icon: "🤰", chip: "bg-rose-50 text-rose-700 border-rose-200" },
  exam_gestante_gemelar: { label: "Exame · Gestante (gemelar)", icon: "🤰", chip: "bg-rose-50 text-rose-700 border-rose-200" },
  production: { label: "Produção", icon: "💊", chip: "bg-amber-50 text-amber-700 border-amber-200" },
  reasoning: { label: "Raciocínio", icon: "🧠", chip: "bg-violet-50 text-violet-700 border-violet-200" },
  genetics: { label: "Genética", icon: "🧬", chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  research: { label: "Pesquisa científica", icon: "📚", chip: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  estimativa_refeicao_foto: { label: "Refeição por Foto", icon: "🍽️", chip: "bg-amber-50 text-amber-700 border-amber-200" },
  composicao_corporal_foto: { label: "Composição por Foto", icon: "🧍", chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  nutricao_visual: { label: "Nutrição Visual", icon: "📷", chip: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  super_masculino: { label: "Masculino", icon: "👨", chip: "bg-sky-50 text-sky-700 border-sky-200" },
  super_feminino: { label: "Feminino", icon: "👩", chip: "bg-pink-50 text-pink-700 border-pink-200" },
  super_gestante_mono: { label: "Gestante Única", icon: "🤰", chip: "bg-rose-50 text-rose-700 border-rose-200" },
  super_gestante_gemelar: { label: "Gestante Gemelar", icon: "👶", chip: "bg-rose-50 text-rose-700 border-rose-200" },
};

export function getAgentLabel(agentId?: string | null): AgentLabel | null {
  if (!agentId) return null;
  return MAP[agentId] ?? { label: agentId, icon: "🤖", chip: "bg-slate-50 text-slate-700 border-slate-200" };
}
