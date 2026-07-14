/**
 * Extração e limpeza do bloco JSON de composição corporal por foto
 * emitido pelo Super Agente "Composição Corporal por Foto SA".
 *
 * Formato esperado (com ou sem cerca ```json):
 *   { "body_assessment": { fat_distribution, estimated_bf_range,
 *       muscle_development, posture_notes,
 *       visual_indicators: [{area, observation, classification}, ...],
 *       confidence } }
 *
 * Nosso trabalho: (1) extrair estruturado e (2) remover o bloco cru
 * do texto para não poluir a bolha do chat.
 */

export interface BodyVisualIndicator {
  area: string;
  observation: string;
  classification?: string;
}

export interface BodyAssessment {
  fat_distribution?: string;
  estimated_bf_range?: string;
  muscle_development?: string;
  posture_notes?: string;
  visual_indicators?: BodyVisualIndicator[];
  confidence?: string;
}

function findBalancedEnd(text: string, start: number): number {
  const opener = text[start];
  if (opener !== "{" && opener !== "[") return -1;
  let brace = 0, bracket = 0;
  let inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "{") brace++;
    else if (ch === "}") brace--;
    else if (ch === "[") bracket++;
    else if (ch === "]") bracket--;
    if (brace === 0 && bracket === 0 && (ch === "}" || ch === "]") && i >= start) return i;
  }
  return -1;
}

export function extractBodyAssessment(text: string): BodyAssessment | null {
  if (!text || text.indexOf('"body_assessment"') === -1) return null;

  const fenced = /```json\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fenced.exec(text))) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (parsed?.body_assessment && typeof parsed.body_assessment === "object") {
        return parsed.body_assessment as BodyAssessment;
      }
    } catch { /* segue */ }
  }

  const idx = text.indexOf('"body_assessment"');
  const start = text.lastIndexOf("{", idx);
  if (start !== -1) {
    const end = findBalancedEnd(text, start);
    if (end !== -1) {
      try {
        const parsed = JSON.parse(text.slice(start, end + 1));
        if (parsed?.body_assessment && typeof parsed.body_assessment === "object") {
          return parsed.body_assessment as BodyAssessment;
        }
      } catch { /* ignore */ }
    }
  }
  return null;
}

/** Remove o bloco JSON de body_assessment do texto exibido. */
export function stripBodyAssessmentJson(text: string): string {
  if (!text) return text;
  let out = text;

  // fenced
  out = out.replace(/```json\s*([\s\S]*?)```/gi, (full, body: string) =>
    /"body_assessment"\s*:/.test(body) ? "" : full,
  );

  // solto
  const idx = out.search(/"body_assessment"\s*:/);
  if (idx !== -1) {
    const start = out.lastIndexOf("{", idx);
    if (start !== -1) {
      const end = findBalancedEnd(out, start);
      if (end !== -1) {
        out = out.slice(0, start).replace(/\s+$/, "") + "\n\n" + out.slice(end + 1).replace(/^\s+/, "");
      } else {
        out = out.slice(0, start);
      }
    }
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
}
