import { timingSafeEqual } from "node:crypto";

/**
 * Tokens de webhook aceitos (Kiwify, TMB, Hubla). A variável de ambiente pode ter mais de um valor,
 * separado por vírgula: "token-da-conta-nova,token-da-conta-antiga". Assim, ao trocar de conta na
 * plataforma, os avisos da conta antiga (renovação, cancelamento, estorno) continuam sendo aceitos.
 * Um valor só funciona como antes.
 */
export function parseTokenList(envValue: string | null | undefined): string[] {
  return String(envValue ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** true se o token recebido é igual a algum dos tokens configurados. */
export function tokenMatches(supplied: string | null | undefined, envValue: string | null | undefined): boolean {
  const s = String(supplied ?? "");
  if (!s) return false;
  let ok = false;
  for (const t of parseTokenList(envValue)) if (safeEqual(s, t)) ok = true; // sem sair cedo: tempo constante
  return ok;
}
