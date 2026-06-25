// Parser e máscara para o marcador <!--FORMULACOES_SUGERIDAS:{...}-->
// emitido pelos agentes de exame no final da resposta.

export interface FormulacaoAtivo {
  nome: string;
  dose: number | string;
  unidade: string;
  observacao?: string;
}

export interface FormulacaoSugerida {
  id?: string;
  nome: string;
  forma_farmaceutica?: string;
  ativos: FormulacaoAtivo[];
  posologia?: string;
  duracao?: string;
  alertas?: string[];
  observacoes?: string;
}

export interface FormulacoesPayload {
  versao?: string;
  resumo_exame?: string;
  formulacoes: FormulacaoSugerida[];
  alertas?: string[];
}

const MARKER_RE = /<!--\s*FORMULACOES_SUGERIDAS:\s*([\s\S]*?)-->/i;

/** Extrai o payload do marcador. Retorna null se ausente ou inválido. */
export function extractFormulacoes(text: string): FormulacoesPayload | null {
  if (!text) return null;
  const m = text.match(MARKER_RE);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[1].trim());
    if (!parsed || !Array.isArray(parsed.formulacoes)) return null;
    return parsed as FormulacoesPayload;
  } catch (e) {
    console.warn("[FORMULACOES_SUGERIDAS] JSON inválido:", e);
    return null;
  }
}

/** Remove o marcador (e marcador parcial em streaming) do texto exibido. */
export function stripFormulacoesMarker(text: string): string {
  if (!text) return text;
  let out = text.replace(MARKER_RE, "").trimEnd();
  // Marcador aberto sem fechamento (streaming): corta dali em diante.
  const openIdx = out.search(/<!--\s*FORMULACOES_SUGERIDAS:/i);
  if (openIdx !== -1) out = out.slice(0, openIdx).trimEnd();
  return out;
}
