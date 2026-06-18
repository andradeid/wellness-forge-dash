import { supabase } from "@/integrations/supabase/client";

export const SESSION_TOKEN_KEY = "lumma:session_token";
export const SESSION_KICKED_KEY = "lumma:session_kicked";

export function generateSessionToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function getLocalSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SESSION_TOKEN_KEY);
}

export function setLocalSessionToken(token: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_TOKEN_KEY, token);
}

export function clearLocalSessionToken() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_TOKEN_KEY);
}

/** Lê o token ativo armazenado no banco para o usuário. */
export async function fetchActiveSessionToken(userId: string): Promise<string | null> {
  const { data, error } = await (supabase as any)
    .from("user_sessions")
    .select("active_session_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[session-guard] fetch error", error);
    return null;
  }
  return (data?.active_session_token as string | null) ?? null;
}

/** Grava (upsert) o token deste dispositivo como sessão ativa. */
export async function claimSession(userId: string, token: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("user_sessions")
    .upsert(
      { user_id: userId, active_session_token: token, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) {
    console.error("[session-guard] claim error", error);
    throw error;
  }
  setLocalSessionToken(token);
}

/**
 * Verifica se o token local ainda confere com o do banco.
 * Retorna `true` se válido (ou se não houver registro/local — ignora silenciosamente),
 * `false` se foi tomado por outro dispositivo.
 */
export async function isSessionStillValid(userId: string): Promise<boolean> {
  const local = getLocalSessionToken();
  if (!local) return true; // sem token local ainda — não derruba (evita falso positivo em rotas sem login interativo)
  const remote = await fetchActiveSessionToken(userId);
  if (!remote) return true; // sem registro no banco — não derruba
  return remote === local;
}

/**
 * Verifica a sessão antes de ações sensíveis (ex.: enviar mensagem ao chat).
 * Se a sessão foi tomada por outro dispositivo, faz cleanup completo,
 * mostra toast e redireciona para /login. Retorna `true` se pode prosseguir.
 */
export async function enforceSessionGuard(userId: string): Promise<boolean> {
  const valid = await isSessionStillValid(userId);
  if (valid) return true;

  try {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(SESSION_KICKED_KEY, "1");
    }
    clearLocalSessionToken();
    const { toast } = await import("sonner");
    toast.warning(
      "Sua sessão foi encerrada porque esta conta foi conectada em outro dispositivo.",
    );
    await supabase.auth.signOut();
  } finally {
    if (typeof window !== "undefined") {
      window.location.assign("/login");
    }
  }
  return false;
}
