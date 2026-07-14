/**
 * Extração e limpeza do bloco JSON de estimativa de refeição por foto
 * emitido pelo Super Agente "Refeição por Foto SA".
 *
 * Formato esperado (com ou sem cerca ```json):
 *   { "foods": [ { name, estimated_portion, calories, protein_g,
 *                  carbs_g, fat_g, confidence } , ... ] }
 *
 * O texto em prosa (resumo total, observações clínicas) vem DEPOIS
 * do bloco JSON. Nosso trabalho é:
 *   1) achar o bloco e devolver os dados estruturados
 *   2) remover o bloco cru do texto para não poluir a bolha do chat
 */

export type MealConfidence = "alta" | "media" | "média" | "baixa" | string;

export interface MealFood {
  name: string;
  estimated_portion?: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  confidence?: MealConfidence;
}

export interface MealEstimation {
  foods: MealFood[];
  totals: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
  };
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

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function computeTotals(foods: MealFood[]) {
  return foods.reduce(
    (acc, f) => ({
      calories: acc.calories + (f.calories ?? 0),
      protein_g: acc.protein_g + (f.protein_g ?? 0),
      carbs_g: acc.carbs_g + (f.carbs_g ?? 0),
      fat_g: acc.fat_g + (f.fat_g ?? 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
}

function normalizeFoods(raw: any[]): MealFood[] {
  return raw
    .filter((r) => r && typeof r === "object")
    .map((r) => ({
      name: String(r.name ?? r.food ?? "").trim() || "Item",
      estimated_portion: r.estimated_portion ? String(r.estimated_portion) : undefined,
      calories: num(r.calories),
      protein_g: num(r.protein_g ?? r.protein),
      carbs_g: num(r.carbs_g ?? r.carbs),
      fat_g: num(r.fat_g ?? r.fat),
      confidence: r.confidence ? String(r.confidence).toLowerCase() : undefined,
    }));
}

/** Tenta extrair o bloco { "foods": [...] } — fenced ou solto. */
export function extractMealEstimation(text: string): MealEstimation | null {
  if (!text || text.indexOf('"foods"') === -1) return null;

  // 1) ```json ... ``` fenced
  const fenced = /```json\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fenced.exec(text))) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (Array.isArray(parsed?.foods)) {
        const foods = normalizeFoods(parsed.foods);
        if (foods.length) return { foods, totals: computeTotals(foods) };
      }
    } catch { /* segue tentando */ }
  }

  // 2) JSON solto — pega o `{` que precede o primeiro "foods"
  const idx = text.indexOf('"foods"');
  const start = text.lastIndexOf("{", idx);
  if (start !== -1) {
    const end = findBalancedEnd(text, start);
    if (end !== -1) {
      try {
        const parsed = JSON.parse(text.slice(start, end + 1));
        if (Array.isArray(parsed?.foods)) {
          const foods = normalizeFoods(parsed.foods);
          if (foods.length) return { foods, totals: computeTotals(foods) };
        }
      } catch { /* ignore */ }
    }
  }
  return null;
}

/** Remove o bloco JSON de foods do texto (para não aparecer cru na bolha). */
export function stripMealEstimationJson(text: string): string {
  if (!text) return text;
  let out = text;

  // fenced
  out = out.replace(/```json\s*([\s\S]*?)```/gi, (full, body: string) =>
    /"foods"\s*:/.test(body) ? "" : full,
  );

  // solto
  const idx = out.search(/"foods"\s*:/);
  if (idx !== -1) {
    const start = out.lastIndexOf("{", idx);
    if (start !== -1) {
      const end = findBalancedEnd(out, start);
      if (end !== -1) {
        out = out.slice(0, start).replace(/\s+$/, "") + "\n\n" + out.slice(end + 1).replace(/^\s+/, "");
      } else {
        // ainda em streaming — corta dali
        out = out.slice(0, start);
      }
    }
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
}
