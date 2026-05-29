import { supabase } from "@/integrations/supabase/client";

export interface RawMarker {
  // English keys (from Dify primary schema)
  parameter?: unknown;
  name?: unknown;
  result?: unknown;
  value?: unknown;
  unit?: unknown;
  reference_value?: unknown;
  reference?: unknown;
  classification?: unknown;
  analysis?: unknown;
  category?: unknown;
  // Portuguese variants
  parametro?: unknown;
  resultado?: unknown;
  unidade?: unknown;
  valor_referencia?: unknown;
  classificacao?: unknown;
  analise?: unknown;
  categoria?: unknown;
  [k: string]: unknown;
}

export interface NormalizedMarker {
  name: string;
  value: string;
  value_numeric: number | null;
  unit: string;
  reference: string;
  classification: string;
  analysis: string;
  category: string;
}

export interface MarkerValidation {
  valid: NormalizedMarker[];
  invalid: Array<{ raw: RawMarker; missing: string[] }>;
}

/**
 * Convert "1,2", "82", "≤2.15", "75-85" → first numeric value or null.
 */
export function toNumeric(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input !== "string") return null;
  const cleaned = input.replace(/\s+/g, "").replace(",", ".");
  const m = cleaned.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

function pickStr(obj: RawMarker, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return "";
}

/**
 * Visual state derived from the clinical classification term.
 * The original term is preserved in `classification` for the database;
 * this only drives card colors/badges in the UI.
 */
export type ClassificationVisualState = "otimo" | "normal" | "atencao" | "baixo" | "alto" | "desconhecido";

export function classificationVisualState(raw: string | null | undefined): ClassificationVisualState {
  if (!raw) return "desconhecido";
  const k = raw
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/[\s-]+/g, "_");
  if (k === "otimo" || k === "ideal" || k === "funcional_otimo") return "otimo";
  if (k === "normal" || k === "dentro_da_referencia" || k === "adequado") return "normal";
  if (
    k === "levemente_baixo" ||
    k === "levemente_alto" ||
    k === "limitrofe" ||
    k === "atencao" ||
    k === "alerta"
  ) return "atencao";
  if (k === "baixo" || k === "deficiente" || k === "insuficiente") return "baixo";
  if (k === "alto" || k === "elevado") return "alto";
  return "desconhecido";
}

export function normalizeMarker(raw: RawMarker): NormalizedMarker {
  const name = pickStr(raw, "name", "parameter", "parametro");
  const valueStr = pickStr(raw, "value", "result", "resultado");
  const unit = pickStr(raw, "unit", "unidade");
  const reference = pickStr(raw, "reference", "reference_value", "valor_referencia");
  const classification = pickStr(raw, "classification", "classificacao");
  const analysis = pickStr(raw, "analysis", "analise");
  const category = pickStr(raw, "category", "categoria") || "outros";
  return {
    name,
    value: valueStr,
    value_numeric: toNumeric(valueStr),
    unit,
    reference,
    classification,
    analysis,
    category,
  };
}

/**
 * Required fields per spec: name, value, unit, classification.
 * Returns valid + invalid (with which fields were missing).
 */
export function validateMarkers(raws: RawMarker[]): MarkerValidation {
  const valid: NormalizedMarker[] = [];
  const invalid: Array<{ raw: RawMarker; missing: string[] }> = [];
  for (const r of raws) {
    const n = normalizeMarker(r);
    const missing: string[] = [];
    if (!n.name) missing.push("name");
    if (!n.value) missing.push("value");
    if (!n.unit) missing.push("unit");
    if (!n.classification) missing.push("classification");
    if (missing.length === 0) valid.push(n);
    else invalid.push({ raw: r, missing });
  }
  return { valid, invalid };
}

/**
 * Persist audit log via server function (uses service role to bypass RLS).
 */
export async function logStructuredAudit(payload: {
  source: string;
  event: string;
  status: "ok" | "warn" | "error";
  message?: string;
  data: unknown;
}): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;
    await fetch("/api/audit/structured", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn("[Audit] Falha ao persistir log:", e);
  }
}

/**
 * Persist each normalized marker into patient_exam_results.
 */
export async function persistMarkers(args: {
  userId: string;
  patientId: string;
  examId?: string | null;
  chatId?: string | null;
  markers: NormalizedMarker[];
  measuredAt?: string;
}): Promise<{ inserted: number; error?: string }> {
  if (!args.markers.length) return { inserted: 0 };
  const rows = args.markers.map((m) => ({
    patient_id: args.patientId,
    exam_id: args.examId ?? null,
    chat_id: args.chatId ?? null,
    created_by: args.userId,
    marker_name: m.name,
    marker_value: m.value_numeric,
    marker_value_raw: m.value,
    marker_unit: m.unit || null,
    reference_value: m.reference || null,
    classification: m.classification || null,
    analysis: m.analysis || null,
    category: m.category || 'outros',
    measured_at: args.measuredAt ?? new Date().toISOString(),
  }));
  const { error, data } = await (supabase as any)
    .from("patient_exam_results")
    .insert(rows)
    .select("id");
  if (error) {
    console.error("[Markers] Falha ao persistir patient_exam_results:", error);
    return { inserted: 0, error: error.message };
  }
  return { inserted: (data as unknown[])?.length ?? 0 };
}

/**
 * Pipeline: validates raw markers, logs audit, persists valid ones.
 * Returns the validation result so the UI can react (✅ / ⚠️).
 */
export async function processAndPersistMarkers(args: {
  userId: string;
  patientId: string;
  examId?: string | null;
  chatId?: string | null;
  rawMarkers: RawMarker[];
  source?: string;
}): Promise<MarkerValidation & { inserted: number }> {
  const { valid, invalid } = validateMarkers(args.rawMarkers);

  console.groupCollapsed(
    `[Marcadores] Validação — ${valid.length} válidos · ${invalid.length} inválidos`,
  );
  console.log("Recebidos:", args.rawMarkers);
  console.log("Válidos (normalizados):", valid);
  if (invalid.length) console.warn("Inválidos:", invalid);
  console.groupEnd();

  await logStructuredAudit({
    source: args.source ?? "dify-chat",
    event: "structured_data.received",
    status: invalid.length ? "warn" : "ok",
    message: `${valid.length} marcadores válidos, ${invalid.length} inválidos`,
    data: {
      patient_id: args.patientId,
      chat_id: args.chatId ?? null,
      exam_id: args.examId ?? null,
      raw: args.rawMarkers,
      valid,
      invalid,
    },
  });

  let inserted = 0;
  if (valid.length) {
    const r = await persistMarkers({
      userId: args.userId,
      patientId: args.patientId,
      examId: args.examId ?? null,
      chatId: args.chatId ?? null,
      markers: valid,
    });
    inserted = r.inserted;
  }
  return { valid, invalid, inserted };
}

/**
 * History helper — ready for charts/evolution screens.
 */
export interface MarkerHistoryPoint {
  id: string;
  measured_at: string;
  marker_value: number | null;
  marker_value_raw: string | null;
  marker_unit: string | null;
  reference_value: string | null;
  classification: string | null;
}

export async function getMarkerHistory(
  patientId: string,
  markerName: string,
): Promise<MarkerHistoryPoint[]> {
  const { data, error } = await (supabase as any)
    .from("patient_exam_results")
    .select("id, measured_at, marker_value, marker_value_raw, marker_unit, reference_value, classification")
    .eq("patient_id", patientId)
    .ilike("marker_name", markerName)
    .order("measured_at", { ascending: true });
  if (error) {
    console.error("[Markers] Falha ao buscar histórico:", error);
    return [];
  }
  return (data as MarkerHistoryPoint[]) ?? [];
}
