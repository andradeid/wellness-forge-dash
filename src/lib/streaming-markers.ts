/**
 * Parser incremental do array `"markers": [ ... ]` durante o stream do Dify.
 *
 * Objetivo: renderizar cada marcador assim que o SEU objeto fecha, sem
 * esperar o array inteiro. É puramente visual — a fonte da verdade continua
 * sendo a extração completa no `message_end` (tryExtractMarkers), que
 * sobrescreve o resultado parcial.
 *
 * Garantias:
 *  - Só devolve objetos JSON completos e válidos (scanner balanceado,
 *    consciente de strings e escapes).
 *  - Nunca reprocessa: o cursor avança monotonicamente.
 *  - Admissão conservadora: quem não tiver name + value + category fica de
 *    fora do parcial (entra no fechamento), para nunca trocar de seção depois.
 */

import { normalizeCategory, type RawMarker } from "./exam-markers";

export interface IncrementalMarkersResult {
  /** Objetos crus recém-fechados desde o cursor anterior. */
  markers: RawMarker[];
  /** Novo cursor a ser guardado pelo chamador. */
  cursor: number;
  /** Já encontramos a abertura do array `"markers": [`. */
  started: boolean;
}

/** Fim balanceado de um objeto/array iniciado em `start`, ou -1 se ainda aberto. */
function findBalancedEnd(text: string, start: number): number {
  const opener = text[start];
  if (opener !== "{" && opener !== "[") return -1;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Posição do `[` que abre o array de marcadores, ou -1. */
function findMarkersArrayStart(text: string): number {
  const key = text.indexOf('"markers"');
  if (key === -1) return -1;
  for (let i = key + 9; i < text.length; i++) {
    const ch = text[i];
    if (ch === "[") return i;
    if (ch === ":" || ch === " " || ch === "\n" || ch === "\r" || ch === "\t") continue;
    return -1; // formato inesperado
  }
  return -1;
}

/**
 * Extrai os objetos já fechados do array de marcadores a partir de `cursor`.
 * Passe `cursor = 0` na primeira chamada.
 */
export function parseIncrementalMarkers(text: string, cursor: number): IncrementalMarkersResult {
  const out: RawMarker[] = [];
  if (!text) return { markers: out, cursor, started: false };

  let i = cursor;
  if (i <= 0) {
    const arrStart = findMarkersArrayStart(text);
    if (arrStart === -1) return { markers: out, cursor: 0, started: false };
    i = arrStart + 1;
  }

  while (i < text.length) {
    const ch = text[i];
    if (ch === " " || ch === "\n" || ch === "\r" || ch === "\t" || ch === ",") { i++; continue; }
    if (ch === "]") break; // array terminou
    if (ch !== "{") break; // conteúdo inesperado/parcial: aguarda mais texto
    const end = findBalancedEnd(text, i);
    if (end === -1) break; // objeto ainda em construção
    const slice = text.slice(i, end + 1);
    try {
      const parsed = JSON.parse(slice);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        out.push(parsed as RawMarker);
      }
    } catch {
      /* objeto malformado: ignorado no parcial, virá no fechamento */
    }
    i = end + 1;
  }

  return { markers: out, cursor: i, started: true };
}

/** Um marcador só entra no painel parcial se já tiver nome, valor e categoria. */
export function isSafeForProgressiveRender(raw: RawMarker): boolean {
  const name = raw.name ?? raw.parameter ?? raw.parametro;
  const value = raw.value ?? raw.result ?? raw.resultado;
  const category = raw.category ?? raw.categoria;
  const hasName = typeof name === "string" ? name.trim().length > 0 : name !== undefined && name !== null;
  const hasValue =
    typeof value === "string" ? value.trim().length > 0 : typeof value === "number" ? Number.isFinite(value) : false;
  const cat = normalizeCategory(typeof category === "string" ? category : "");
  const hasCategory = !!category && cat !== "outros";
  return hasName && hasValue && hasCategory;
}
