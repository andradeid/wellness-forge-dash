/**
 * Relações clínicas calculadas no código (curadoria #57, #61, #87, #96, #99,
 * #101, #110 e #50).
 *
 * A IA errava contas simples (HOMA-IR "0,00", LDL/HDL "0,01") e estava
 * proibida de calcular o HOMA-β. Aqui as relações são recalculadas a partir
 * dos marcadores extraídos, com as fórmulas e faixas da Base Funcional
 * Integrativa que já estão nas instruções dos agentes:
 *
 *   HOMA-IR      = glicose (mg/dL) × insulina (µUI/mL) ÷ 405     < 1,5 (gestante ≤ 1,6)
 *   HOMA-β       = 360 × insulina ÷ (glicose − 63)                100–150%
 *   TG/HDL       = triglicerídeos ÷ HDL                           0,8–1,2
 *   CT/HDL       = colesterol total ÷ HDL                         < 3,3
 *   LDL/HDL      = LDL ÷ HDL                                      < 2,3
 *   ApoB/ApoA1   = ApoB ÷ ApoA1                                   < 0,6
 *   TGO/TGP      = TGO ÷ TGP                                      0,8–1,2
 *   N/L          = neutrófilos (%) ÷ linfócitos (%)               1,0–1,5
 *   Alb/Glob     = albumina ÷ globulina                           1,5–2,0
 *   TF3/TF4      = T3 livre (ng/dL) ÷ T4 livre (ng/dL)             0,27–0,37
 *   FT3/rT3      = FT3 (pg/mL) ÷ rT3 (ng/dL) × 100                15–22
 *   E2:P4        = estradiol (pg/mL) ÷ progesterona (ng/mL)       100–300
 *
 * Regras:
 *  - Só calcula quando os dois marcadores-base têm valor numérico exato e a
 *    unidade esperada (ou uma conversão inequívoca: pg/mL ↔ ng/dL, ng/mL → ng/dL).
 *  - Relação que a IA mandou sem valor ("não calculado", "—") e que não dá
 *    para calcular sai do painel (#99).
 *  - Cada relação vai para o perfil a que pertence (#50): lipídicas no
 *    Perfil Lipídico, HOMA no Glicídico, TGO/TGP no Hepático etc.
 *  - Classificação pela régua dos 20% usada pelos agentes.
 */

export interface RelationMarker {
  name: string;
  value: string | number;
  unit?: string;
  reference?: string;
  classification?: string;
  analysis?: string;
  category?: string;
  derived?: boolean;
}

type Range = { min: number; max: number; label: string };

function key(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[()\[\],;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unitKey(u: unknown): string {
  return String(u ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/µ|μ/g, "u")
    .replace(/\s+/g, "");
}

/** Número exato do resultado ("95", "95,4", "1.234,5"). "<5", ">100", "Negativo" → null. */
export function exactNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || /^[<>≤≥~]/.test(s)) return null;
  const m = s.match(/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?(?!\d)|^-?\d+(?:[.,]\d+)?/);
  if (!m) return null;
  let t = m[0];
  if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(",", ".");
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

function isRatioName(k: string): boolean {
  return /\/|:|relacao|razao|indice|homa|castelli/.test(k);
}

type Base = { value: number; unit: string; name: string; /** Unidade como veio do laudo, para exibir. */ rawUnit?: string };

function find(
  markers: RelationMarker[],
  test: (k: string, u: string) => boolean,
): Base | null {
  for (const m of markers) {
    if (m.derived) continue;
    // Tira unidades escritas no nome ("Albumina (g/dL)") antes de testar se é razão.
    const k = key(m.name)
      .replace(/\b(m?g|u|ui|mui|uui|pg|ng|mm|mmol|umol|meq)\/(dl|ml|l|mm3|h)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!k || isRatioName(k)) continue;
    const u = unitKey(m.unit);
    if (!test(k, u)) continue;
    const n = exactNumber(m.value);
    if (n === null) continue;
    return { value: n, unit: u, name: String(m.name), rawUnit: m.unit ? String(m.unit).trim() : "" };
  }
  return null;
}

const MGDL = (u: string) => u === "" || u === "mg/dl";
const GDL = (u: string) => u === "" || u === "g/dl";
const PCT = (u: string) => u === "%";

function bases(markers: RelationMarker[]) {
  const glicose = find(
    markers,
    (k, u) =>
      /^(glicose|glicemia)\b/.test(k) &&
      !/media|estimad|pos\b|apos|\b1 ?h\b|\b2 ?h\b|\b60\b|\b120\b|totg|curva|urin|capilar|sobrecarga/.test(k) &&
      MGDL(u),
  );
  const insulina = find(
    markers,
    (k, u) =>
      /^insulina\b/.test(k) &&
      !/pos\b|apos|\b1 ?h\b|\b2 ?h\b|\b60\b|\b120\b|curva|anti|sobrecarga/.test(k) &&
      (u === "" || u === "uui/ml" || u === "uu/ml" || u === "mui/l" || u === "uiu/ml" || u === "mcui/ml"),
  );
  const tg = find(markers, (k, u) => /^triglicer/.test(k) && MGDL(u));
  const hdl = find(markers, (k, u) => /\bhdl\b/.test(k) && !/nao|non\b|\bldl\b/.test(k) && MGDL(u));
  const ldl = find(markers, (k, u) => /\bldl\b/.test(k) && !/vldl|nao|non\b|hdl|oxid|particula/.test(k) && MGDL(u));
  const ct = find(markers, (k, u) => /^colesterol total\b|^ct\b/.test(k) && MGDL(u));
  const apoB = find(markers, (k) => /^apo(lipoproteina)? ?-?b\b(?! ?\/)/.test(k));
  const apoA1 = find(markers, (k) => /^apo(lipoproteina)? ?-?a ?-?(1|i)\b/.test(k));
  const tgo = find(markers, (k, u) => /^(tgo|ast|aspartato)\b|transaminase oxalacetica/.test(k) && (u === "" || u === "u/l"));
  const tgp = find(markers, (k, u) => /^(tgp|alt|alanina)\b|transaminase piruvica/.test(k) && (u === "" || u === "u/l"));
  const neut =
    find(markers, (k, u) => /^neutrofilos\b/.test(k) && !/absolut|bastonet|segment/.test(k) && PCT(u)) ??
    find(markers, (k, u) => /^segmentados\b/.test(k) && PCT(u));
  const linf = find(markers, (k, u) => /^linfocitos\b/.test(k) && !/atipic|tipic|absolut/.test(k) && PCT(u));
  const alb = find(markers, (k, u) => /^albumina\b/.test(k) && !/urin|micro|creatin/.test(k) && GDL(u));
  const glob = find(markers, (k, u) => /^globulina/.test(k) && GDL(u));
  const t3l = find(markers, (k, u) => /^(t3 livre|ft3|t3l\b|triiodotironina livre)/.test(k) && (u === "pg/ml" || u === "ng/dl"));
  const t4l = find(markers, (k, u) => /^(t4 livre|ft4|t4l\b|tiroxina livre)/.test(k) && u === "ng/dl");
  const rt3 = find(markers, (k, u) => /^(t3 reverso|rt3|t3r\b|t3 r\b)/.test(k) && (u === "ng/dl" || u === "ng/ml" || u === "pg/ml"));
  const e2 = find(markers, (k, u) => /^estradiol\b|^e2\b/.test(k) && u === "pg/ml");
  const p4 = find(markers, (k, u) => /^progesterona\b|^p4\b/.test(k) && !/17|hidroxi/.test(k) && u === "ng/ml");
  return { glicose, insulina, tg, hdl, ldl, ct, apoB, apoA1, tgo, tgp, neut, linf, alb, glob, t3l, t4l, rt3, e2, p4 };
}

type Def = {
  id: string;
  name: string;
  category: string;
  /** Reconhece a mesma relação vinda da IA (nome normalizado). */
  match: RegExp;
  unit?: string;
  decimals: number;
  range: (profile: string) => Range;
  compute: (b: ReturnType<typeof bases>) => { value: number; inputs: Base[] } | null;
};

const r = (min: number, max: number, label: string): Range => ({ min, max, label });
const isGestante = (p: string) => /gestante|gemelar|monofetal/.test(p);

const t3lNgdl = (b: Base) => (b.unit === "pg/ml" ? b.value / 10 : b.value);
const t3lPgml = (b: Base) => (b.unit === "ng/dl" ? b.value * 10 : b.value);
const rt3Ngdl = (b: Base) => (b.unit === "ng/ml" ? b.value * 100 : b.unit === "pg/ml" ? b.value / 10 : b.value);

const DEFS: Def[] = [
  {
    id: "homa_ir", name: "HOMA-IR", category: "perfil_glicidico", decimals: 2,
    match: /homa ?-? ?ir\b/,
    range: (p) => (isGestante(p) ? r(-Infinity, 1.6, "≤ 1,6") : r(-Infinity, 1.5, "< 1,5")),
    compute: (b) => (b.glicose && b.insulina ? { value: (b.glicose.value * b.insulina.value) / 405, inputs: [b.glicose, b.insulina] } : null),
  },
  {
    id: "homa_beta", name: "HOMA-β", category: "perfil_glicidico", unit: "%", decimals: 1,
    match: /homa ?-? ?(β|beta|b\b)/,
    range: () => r(100, 150, "100–150%"),
    compute: (b) =>
      b.glicose && b.insulina && b.glicose.value > 63
        ? { value: (360 * b.insulina.value) / (b.glicose.value - 63), inputs: [b.insulina, b.glicose] }
        : null,
  },
  {
    id: "tg_hdl", name: "Relação TG/HDL", category: "perfil_lipidico", decimals: 2,
    match: /\btg ?\/ ?hdl|triglicer\w* ?\/ ?hdl/,
    range: () => r(0.8, 1.2, "0,8–1,2"),
    compute: (b) => (b.tg && b.hdl ? { value: b.tg.value / b.hdl.value, inputs: [b.tg, b.hdl] } : null),
  },
  {
    id: "ct_hdl", name: "Relação CT/HDL", category: "perfil_lipidico", decimals: 2,
    match: /\bct ?\/ ?hdl|colesterol total ?\/ ?hdl|castelli i\b(?! ?i)/,
    range: () => r(-Infinity, 3.3, "< 3,3"),
    compute: (b) => (b.ct && b.hdl ? { value: b.ct.value / b.hdl.value, inputs: [b.ct, b.hdl] } : null),
  },
  {
    id: "ldl_hdl", name: "Relação LDL/HDL", category: "perfil_lipidico", decimals: 2,
    match: /\bldl ?\/ ?hdl|castelli ii\b/,
    range: () => r(-Infinity, 2.3, "< 2,3"),
    compute: (b) => (b.ldl && b.hdl ? { value: b.ldl.value / b.hdl.value, inputs: [b.ldl, b.hdl] } : null),
  },
  {
    id: "apob_apoa1", name: "Relação ApoB/ApoA1", category: "perfil_lipidico", decimals: 2,
    match: /apo ?-?b ?\/ ?apo ?-?a/,
    range: () => r(-Infinity, 0.6, "< 0,6"),
    compute: (b) => (b.apoB && b.apoA1 ? { value: b.apoB.value / b.apoA1.value, inputs: [b.apoB, b.apoA1] } : null),
  },
  {
    id: "tgo_tgp", name: "Relação TGO/TGP", category: "funcao_hepatica", decimals: 2,
    match: /tgo ?\/ ?tgp|ast ?\/ ?alt|de ritis/,
    range: () => r(0.8, 1.2, "0,8–1,2"),
    compute: (b) => (b.tgo && b.tgp ? { value: b.tgo.value / b.tgp.value, inputs: [b.tgo, b.tgp] } : null),
  },
  {
    id: "n_l", name: "Relação N/L", category: "hemograma_anemias", decimals: 2,
    match: /\bn ?\/ ?l\b|neutrofilos ?\/ ?linfocitos|\bnlr\b/,
    range: () => r(1.0, 1.5, "1,0–1,5"),
    compute: (b) => (b.neut && b.linf ? { value: b.neut.value / b.linf.value, inputs: [b.neut, b.linf] } : null),
  },
  {
    id: "a_g", name: "Relação Albumina/Globulina", category: "funcao_hepatica", decimals: 2,
    match: /albumina ?\/ ?globulina|\ba ?\/ ?g\b/,
    range: () => r(1.5, 2.0, "1,5–2,0"),
    compute: (b) => (b.alb && b.glob ? { value: b.alb.value / b.glob.value, inputs: [b.alb, b.glob] } : null),
  },
  {
    id: "tf3_tf4", name: "Relação TF3/TF4", category: "perfil_tireoidiano", decimals: 2,
    match: /(tf3|ft3|t3 ?l?(ivre)?) ?\/ ?(tf4|ft4|t4)/,
    range: () => r(0.27, 0.37, "0,27–0,37"),
    compute: (b) => (b.t3l && b.t4l ? { value: t3lNgdl(b.t3l) / b.t4l.value, inputs: [b.t3l, b.t4l] } : null),
  },
  {
    id: "ft3_rt3", name: "Relação FT3/rT3", category: "perfil_tireoidiano", decimals: 1,
    match: /(tf3|ft3|t3 ?l?(ivre)?) ?\/ ?(r ?t3|t3 ?r)/,
    range: () => r(15, 22, "15–22"),
    compute: (b) => (b.t3l && b.rt3 ? { value: (t3lPgml(b.t3l) / rt3Ngdl(b.rt3)) * 100, inputs: [b.t3l, b.rt3] } : null),
  },
  {
    id: "e2_p4", name: "Relação E2:P4", category: "perfil_hormonal", decimals: 1,
    match: /e2 ?[:\/] ?p4|estradiol ?\/ ?progesterona/,
    range: () => r(100, 300, "100–300"),
    compute: (b) => (b.e2 && b.p4 && b.p4.value > 0 ? { value: b.e2.value / b.p4.value, inputs: [b.e2, b.p4] } : null),
  },
];

/** Régua dos 20% (mesma dos agentes). */
export function classifyByRange(v: number, range: { min: number; max: number }): string {
  if (v > range.max) {
    const excess = (v - range.max) / Math.abs(range.max || 1);
    return excess <= 0.2 ? "levemente_alto" : "alto";
  }
  if (v < range.min) {
    const deficit = (range.min - v) / Math.abs(range.min || 1);
    return deficit <= 0.2 ? "levemente_baixo" : "baixo";
  }
  return "normal";
}

function fmt(n: number, decimals: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function describeInputs(inputs: Base[]): string {
  return inputs
    .map((i) => `${i.name} ${i.value.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}${(i.rawUnit ?? i.unit) ? ` ${i.rawUnit ?? i.unit}` : ""}`)
    .join(" e ");
}

const NO_VALUE = /^(|-|—|–|n\/?a|nao calculad\w*|nao disponivel|indisponivel|sem dados|desconhecid\w*)$/;

/**
 * Recalcula as relações clínicas e devolve a lista de marcadores corrigida.
 * Não altera marcadores medidos diretamente.
 */
export function applyClinicalRelations<T extends RelationMarker>(markers: T[], profile?: string | null): T[] {
  if (!Array.isArray(markers) || markers.length === 0) return markers;
  const p = key(profile);
  const b = bases(markers);
  const computed = new Map<string, { def: Def; value: number; inputs: Base[] }>();
  for (const def of DEFS) {
    if (def.id === "e2_p4" && /masculino/.test(p)) continue;
    const c = def.compute(b);
    if (c && Number.isFinite(c.value)) computed.set(def.id, { def, ...c });
  }

  const used = new Set<string>();
  const out: T[] = [];
  for (const m of markers) {
    const k = key(m.name);
    const def = DEFS.find((d) => d.match.test(k));
    if (!def) {
      out.push(m);
      continue;
    }
    const c = computed.get(def.id);
    if (!c) {
      // Sem como calcular: se a IA também não trouxe número, a relação sai (#99).
      const llmValue = exactNumber(m.value);
      if (llmValue === null && NO_VALUE.test(key(m.value))) continue;
      out.push(m);
      continue;
    }
    if (used.has(def.id)) continue; // a mesma relação repetida pela IA
    used.add(def.id);
    out.push(buildMarker(m, c.def, c.value, c.inputs, p));
  }
  // Relações calculáveis que a IA não trouxe.
  for (const [id, c] of computed) {
    if (used.has(id)) continue;
    out.push(buildMarker(null, c.def, c.value, c.inputs, p) as T);
  }
  return out;
}

function buildMarker<T extends RelationMarker>(
  fromLlm: T | null,
  def: Def,
  value: number,
  inputs: Base[],
  profile: string,
): T {
  const range = def.range(profile);
  const classification = classifyByRange(value, range);
  const llmValue = fromLlm ? exactNumber(fromLlm.value) : null;
  const agrees = llmValue !== null && Math.abs(llmValue - value) <= Math.max(0.05 * Math.abs(value), 0.01);
  const analysisFromLlm = (fromLlm?.analysis ?? "").trim();
  const keepAnalysis = agrees && analysisFromLlm && !/nao calculad|indisponivel|conferid/i.test(key(analysisFromLlm));
  const analysis = keepAnalysis
    ? analysisFromLlm
    : `Calculado a partir de ${describeInputs(inputs)}.`;
  return {
    ...(fromLlm ?? ({} as T)),
    name: def.name,
    value: fmt(value, def.decimals),
    unit: def.unit ?? "",
    reference: range.label,
    classification,
    analysis,
    category: def.category,
    derived: true,
  } as T;
}
