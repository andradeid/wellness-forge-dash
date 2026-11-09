/**
 * Recupera os marcadores quando o JSON do exame vem com UM objeto quebrado
 * (ex.: o modelo esquece o valor de "name"). Sem isso, um erro de sintaxe num
 * único marcador apagava o painel inteiro. Lê o array "markers" objeto por
 * objeto e descarta só os que não fecham ou não têm nome e valor.
 */
function matchingBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function salvageMarkersArray(text: string): Record<string, unknown>[] | null {
  const key = text.search(/"markers"\s*:\s*\[/);
  if (key === -1) return null;
  let i = text.indexOf("[", key) + 1;
  const out: Record<string, unknown>[] = [];
  let dropped = 0;
  while (i > 0 && i < text.length) {
    while (i < text.length && /[\s,]/.test(text[i])) i++;
    if (text[i] !== "{") break; // fim do array (]) ou lixo
    const end = matchingBrace(text, i);
    if (end === -1) break; // objeto sem fechamento (resposta cortada)
    try {
      const obj = JSON.parse(text.slice(i, end + 1));
      const name = typeof obj?.name === "string" ? obj.name.trim() : "";
      const hasValue = obj?.value !== undefined && obj?.value !== null && String(obj.value).trim() !== "";
      if (name && hasValue) out.push(obj);
      else dropped++;
    } catch {
      dropped++;
    }
    i = end + 1;
  }
  if (dropped) console.warn(`[salvageMarkersArray] ${dropped} marcador(es) com JSON inválido descartado(s)`);
  return out.length ? out : null;
}
