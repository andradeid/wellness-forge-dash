/**
 * Rede de proteção: remove tags de "scaffolding" (raciocínio interno /
 * chamadas de ferramenta verbalizadas) que alguns agentes do Dify deixam
 * vazar dentro do `answer`.
 *
 * REGRAS DE SEGURANÇA:
 *  - Conservador: remove APENAS as 4 tags explicitamente nomeadas abaixo.
 *  - Nunca remove conteúdo clínico, markdown, marcadores HTML de handoff
 *    (<!--FORMULACOES_SUGERIDAS-->) nem qualquer outra tag desconhecida.
 *  - Idempotente: aplicar duas vezes produz o mesmo resultado.
 *  - Trata streaming: se a tag abriu e ainda não fechou, corta dali em
 *    diante (será re-renderizado quando o fechamento chegar).
 */

const SCAFFOLD_TAGS = ["tool_code", "tool_outputs", "thinking", "scratchpad"] as const;

export function stripAgentScaffolding(text: string): string {
  if (!text) return text;
  let out = text;

  for (const tag of SCAFFOLD_TAGS) {
    // 1) Pares completos <tag>...</tag> (case-insensitive, multiline).
    const pairRe = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
    out = out.replace(pairRe, "");

    // 2) Abertura sem fechamento (streaming parcial): corta a partir da abertura.
    const openRe = new RegExp(`<${tag}\\b[^>]*>`, "i");
    const openMatch = out.match(openRe);
    if (openMatch && openMatch.index !== undefined) {
      out = out.slice(0, openMatch.index);
    }
  }

  // Limpa linhas em branco consecutivas deixadas pela remoção.
  return out.replace(/\n{3,}/g, "\n\n").trimEnd();
}
