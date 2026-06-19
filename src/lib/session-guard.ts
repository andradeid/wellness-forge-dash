import { supabase } from "@/integrations/supabase/client";

export const SESSION_TOKEN_KEY = "lumma:session_token";
export const SESSION_KICKED_KEY = "lumma:session_kicked";

/** Limites padrão de assentos simultâneos por plano. */
const DEFAULT_SEATS_BY_SLUG: Record<string, number> = {
  starter: 1,
  pro: 2,
  clinica: 5,
};
const DEFAULT_SEATS_BY_PLAN_TYPE: Record<string, number> = {
  free: 1,
  basic: 1,
  pro: 2,
};
const FALLBACK_SEAT_LIMIT = 1;

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

export type ActiveSeat = {
  id: string;
  active_session_token: string;
  updated_at: string;
};

export type SeatInfo = {
  limit: number;
  unlimited: boolean;
  active: ActiveSeat[];
  planLabel: string;
};

/** Verifica se o usuário é super_admin (acesso ilimitado). */
async function isUnlimitedRole(userId: string): Promise<boolean> {
  const { data } = await (supabase as any)
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (!data) return false;
  return (data as Array<{ role: string }>).some(
    (r) => r.role === "super_admin" || r.role === "admin",
  );
}

/** Resolve o limite de assentos do usuário a partir do plano vigente. */
export async function resolveSeatLimit(
  userId: string,
): Promise<{ limit: number; unlimited: boolean; planLabel: string }> {
  if (await isUnlimitedRole(userId)) {
    return { limit: Number.POSITIVE_INFINITY, unlimited: true, planLabel: "Administrador" };
  }

  const { data: sub } = await (supabase as any)
    .from("subscriptions")
    .select("plan_type")
    .eq("user_id", userId)
    .maybeSingle();
  const planType = (sub?.plan_type as string | undefined) ?? null;

  // Tenta casar o plano com subscription_plans pela slug
  if (planType) {
    const { data: plan } = await (supabase as any)
      .from("subscription_plans")
      .select("max_seats, name, slug")
      .eq("slug", planType)
      .maybeSingle();
    if (plan?.max_seats && plan.max_seats > 0) {
      return { limit: plan.max_seats, unlimited: false, planLabel: plan.name ?? planType };
    }
  }

  // Fallbacks
  const fallback =
    (planType && DEFAULT_SEATS_BY_PLAN_TYPE[planType]) ??
    (planType && DEFAULT_SEATS_BY_SLUG[planType]) ??
    FALLBACK_SEAT_LIMIT;
  return {
    limit: fallback,
    unlimited: false,
    planLabel: planType ?? "Starter",
  };
}

/** Lê todas as sessões ativas do usuário, ordenadas da mais antiga para a mais recente. */
export async function fetchActiveSeats(userId: string): Promise<ActiveSeat[]> {
  const { data, error } = await (supabase as any)
    .from("user_sessions")
    .select("id, active_session_token, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: true });
  if (error) {
    console.error("[session-guard] fetchActiveSeats error", error);
    return [];
  }
  return (data ?? []) as ActiveSeat[];
}

/** Compila informações de assentos do usuário. */
export async function getSeatInfo(userId: string): Promise<SeatInfo> {
  const [limitInfo, active] = await Promise.all([
    resolveSeatLimit(userId),
    fetchActiveSeats(userId),
  ]);
  return { ...limitInfo, active };
}

/** Insere o novo token como uma sessão adicional do usuário. */
export async function addSessionSeat(userId: string, token: string): Promise<void> {
  const nowIso = new Date().toISOString();
  const { error } = await (supabase as any).from("user_sessions").upsert(
    {
      user_id: userId,
      active_session_token: token,
      updated_at: nowIso,
    },
    { onConflict: "user_id,active_session_token" },
  );
  if (error) {
    console.error("[session-guard] addSessionSeat error", error);
    throw error;
  }
  setLocalSessionToken(token);
}

/** Remove uma sessão específica (por id). */
export async function removeSessionSeat(seatId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("user_sessions")
    .delete()
    .eq("id", seatId);
  if (error) {
    console.error("[session-guard] removeSessionSeat error", error);
    throw error;
  }
}

/**
 * Substitui o assento mais antigo do usuário pelo novo token deste dispositivo.
 * Usado quando o usuário confirma "derrubar conexão mais antiga".
 */
export async function replaceOldestSeat(userId: string, newToken: string): Promise<void> {
  const seats = await fetchActiveSeats(userId);
  if (seats.length > 0) {
    await removeSessionSeat(seats[0].id);
  }
  await addSessionSeat(userId, newToken);
}

/**
 * Verifica se o token local ainda existe entre as sessões ativas do usuário.
 * Retorna `true` se válido, `false` se foi derrubado (token sumiu do banco).
 */
export async function isSessionStillValid(userId: string): Promise<boolean> {
  const local = getLocalSessionToken();
  if (!local) return true; // sem token local — não derruba (rota sem login interativo)
  const { data, error } = await (supabase as any)
    .from("user_sessions")
    .select("id")
    .eq("user_id", userId)
    .eq("active_session_token", local)
    .maybeSingle();
  if (error) {
    console.error("[session-guard] isSessionStillValid error", error);
    return true; // em caso de erro de rede, não derruba
  }
  return !!data;
}

/**
 * Verifica a sessão antes de ações sensíveis (chat, navegação privada).
 * Se a sessão foi tomada por outro dispositivo, faz cleanup e redireciona.
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
      "Sua sessão foi encerrada porque o limite de acessos simultâneos foi atingido em outro dispositivo.",
    );
    await supabase.auth.signOut();
  } finally {
    if (typeof window !== "undefined") {
      window.location.assign("/login");
    }
  }
  return false;
}

// ---------- Compatibilidade com a API anterior ----------
// Mantém os nomes antigos para evitar quebras enquanto migramos o restante do código.

export async function fetchActiveSessionToken(userId: string): Promise<string | null> {
  const seats = await fetchActiveSeats(userId);
  return seats.length > 0 ? seats[seats.length - 1].active_session_token : null;
}

export async function claimSession(userId: string, token: string): Promise<void> {
  await addSessionSeat(userId, token);
}
