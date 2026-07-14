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

  // CRÍTICO: cabeçalhos markdown (#/##/### ...) colados inline na frase anterior,
  // com ou sem espaço antes do cardinal. Ex.: "...frase anterior.)# 2. TÍTULO"
  text = text.replace(/([^\n])[ \t]*(#{1,6}[ \t]+(?=\S))/g, "$1\n\n$2");

  // Garante quebra antes de cabeçalhos com quebra simples (\n -> \n\n)
  text = text.replace(/([^\n])\n(#{1,6}\s)/g, "$1\n\n$2");

  // Garante linha em branco DEPOIS do título do heading
  text = text.replace(/(^|\n)(#{1,6}\s[^\n]+)\n(?!\n)/g, "$1$2\n\n");

  // Quebra linha antes de seções clínicas conhecidas quando aparecem inline.
  // Só dispara quando o heading está em CAIXA ALTA (cabeçalho real do Dify)
  // e vem após pontuação forte, início de linha ou marcador markdown — evita
  // quebrar palavras comuns em minúscula no meio da prosa (ex.: "uso",
  // "posologia", "composição corporal", "duração").
  const sectionPattern = new RegExp(
    `(^|[\\n\\r]|[.!?;:…\\)\\]])[ \\t]*(\\*{0,2}\\s*(?:${SECTION_HEADINGS.join("|")})(?:\\s+\\d+)?\\s*[:\\-–])`,
    "g",
  );
  text = text.replace(sectionPattern, (_m, prev: string, heading: string) => {
    return `${prev}\n\n${heading}`;
  });

  // Garante linha em branco antes de listas
  text = text.replace(/([^\n])\n([-*]\s|\d+\.\s)/g, "$1\n\n$2");

  // Listas que chegam coladas na mesma linha após uma frase/seção.
  // Ex.: "Marcadores alterados: - Glicose: ... - Insulina: ..."
  text = text.replace(/([:.;!?…\)])\s+([-*][ \t]+(?=\S))/g, "$1\n\n$2");

  // Dá respiro entre seções conectadas por seta quando o agente junta dois blocos.
  text = text.replace(/\b(Suplementaç(?:ã|a)o)\s*→\s*(Fitoter[áa]picos)\b/gi, "$1\n\n→ $2");

  // Quebra antes de marcadores inline comuns
  text = text.replace(/([^\n])\s+(Rx:|Uso:|Posologia:|Indicação:|Indicacao:)/g, "$1\n\n$2");

  // Parágrafos grudados por quebra simples: frase termina em .!? seguida de \n
  // e nova frase começa em maiúscula → promove para \n\n (separa <p>).
  // Não toca em listas, headings nem linhas que já têm \n\n.
  text = text.replace(
    /([.!?…"'”’\)])\n(?!\n)(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/g,
    "$1\n\n",
  );

  // Colapsa quebras excessivas
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}
