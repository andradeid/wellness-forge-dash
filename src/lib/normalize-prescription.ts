/**
 * Normaliza texto de receita/markdown vindo do agente para garantir
 * quebras e espaçamento corretos no ReactMarkdown, independente do
 * número de linhas recebidas.
 *
 * Regras:
 *  - CRLF/CR → LF
 *  - Garante linha em branco antes de cabeçalhos markdown (#, ##, ###)
 *  - Garante linha em branco antes/depois de seções clínicas conhecidas
 *    (FORMULAÇÃO N, POSOLOGIA, INDICAÇÃO, USO, OBSERVAÇÕES, etc.)
 *  - Garante linha em branco antes de listas (-, *, 1.)
 *  - Garante quebra antes de "Rx", "Uso:", "Posologia:" inline
 *  - Colapsa 3+ quebras consecutivas em apenas 2
 *  - Trim final
 */

const SECTION_HEADINGS = [
  "FORMULAÇÃO",
  "FORMULACAO",
  "POSOLOGIA",
  "INDICAÇÃO",
  "INDICACAO",
  "INDICAÇÕES",
  "MODO DE USO",
  "USO",
  "OBSERVAÇÕES",
  "OBSERVACOES",
  "JUSTIFICATIVA",
  "COMPOSIÇÃO",
  "COMPOSICAO",
  "RECOMENDAÇÕES",
  "RECOMENDACOES",
  "CONTRAINDICAÇÕES",
  "CONTRAINDICACOES",
  "DURAÇÃO",
  "DURACAO",
];

export function normalizePrescription(input: string): string {
  if (!input) return "";

  let text = input.replace(/\r\n?/g, "\n");

  // Garante quebra antes de cabeçalhos markdown que vierem colados
  text = text.replace(/([^\n])\n(#{1,6}\s)/g, "$1\n\n$2");

  // Quebra linha antes de seções clínicas conhecidas quando aparecem inline
  const sectionPattern = new RegExp(
    `([^\\n])\\s*(\\*{0,2}\\s*(?:${SECTION_HEADINGS.join("|")})(?:\\s+\\d+)?\\s*[:\\-–]?)`,
    "gi",
  );
  text = text.replace(sectionPattern, (_m, prev: string, heading: string) => {
    if (/\n/.test(prev)) return `${prev}\n\n${heading}`;
    return `${prev}\n\n${heading}`;
  });

  // Garante linha em branco antes de listas
  text = text.replace(/([^\n])\n([-*]\s|\d+\.\s)/g, "$1\n\n$2");

  // Quebra antes de marcadores inline comuns
  text = text.replace(/([^\n])\s+(Rx:|Uso:|Posologia:|Indicação:|Indicacao:)/g, "$1\n\n$2");

  // Colapsa quebras excessivas
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}
