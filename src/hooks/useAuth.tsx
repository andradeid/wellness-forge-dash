import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { clearLocalSessionToken } from "@/lib/session-guard";

export type AppRole = "super_admin" | "admin" | "nutri";

export interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  phone: string | null;
  is_blocked: boolean;
  pronoun: string | null;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const AUTH_BOOT_TIMEOUT_MS = 4_000;

async function withAuthTimeout<T>(
  operation: PromiseLike<T>,
  fallback: T,
  label: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((resolve) => {
        timeoutId = setTimeout(() => {
          console.warn(`[auth] ${label} excedeu o tempo limite; liberando a tela com fallback`);
          resolve(fallback);
        }, AUTH_BOOT_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    console.warn(`[auth] ${label} falhou; liberando a tela com fallback`, error);
    return fallback;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function fetchProfileAndRole(userId: string): Promise<{
  profile: Profile | null;
  role: AppRole | null;
}> {
  const [profileRes, roleRes] = await withAuthTimeout(
    Promise.allSettled([
      (supabase as any)
        .from("profiles")
        .select("id, full_name, email, avatar_url, phone, is_blocked, pronoun")
        .eq("id", userId)
        .maybeSingle(),
      (supabase as any)
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .order("role", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]),
    [
      { status: "fulfilled", value: { data: null, error: null } },
      { status: "fulfilled", value: { data: null, error: null } },
    ] as PromiseSettledResult<any>[],
    "carregamento de perfil/permissão",
  );

  const profileQuery = profileRes.status === "fulfilled" ? profileRes.value : null;
  const roleQuery = roleRes.status === "fulfilled" ? roleRes.value : null;

  if (profileRes.status === "rejected" || profileQuery?.error) {
    console.warn("[auth] falha ao carregar perfil", profileRes.status === "rejected" ? profileRes.reason : profileQuery.error);
  }

  if (roleRes.status === "rejected" || roleQuery?.error) {
    console.warn("[auth] falha ao carregar role", roleRes.status === "rejected" ? roleRes.reason : roleQuery.error);
  }

  return {
    profile: (profileQuery?.data as Profile | null) ?? null,
    role: (roleQuery?.data?.role as AppRole | null) ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const authRequestRef = useRef(0);

  const loadUserData = async (currentUser: User | null) => {
    if (!currentUser) {
      setProfile(null);
      setRole(null);
      return;
    }
    const { profile, role } = await fetchProfileAndRole(currentUser.id);
    if (profile?.is_blocked) {
      const { toast } = await import("sonner");
      toast.error("Sua conta foi bloqueada. Entre em contato com o suporte.");
      await supabase.auth.signOut();
      setProfile(null);
      setRole(null);
      setSession(null);
      setUser(null);
      return;
    }
    setProfile(profile);
    setRole(role);
  };

  const applySession = async (nextSession: Session | null) => {
    const requestId = ++authRequestRef.current;
    setSession(nextSession);
    setUser(nextSession?.user ?? null);

    if (!nextSession?.user) {
      setProfile(null);
      setRole(null);
      setLoading(false);
      return;
    }

    // Em /reset-password a sessão é de recuperação e não pode ser invalidada
    // (senão o updateUser falha com "Auth session missing"). Não busca
    // profile/role aqui — a página cuida do fluxo sozinha.
    const isRecoveryRoute =
      typeof window !== "undefined" && window.location.pathname.startsWith("/reset-password");
    if (isRecoveryRoute) {
      setLoading(false);
      return;
    }

    try {
      const { profile, role } = await fetchProfileAndRole(nextSession.user.id);
      if (requestId !== authRequestRef.current) return;
      if (profile?.is_blocked) {
        const { toast } = await import("sonner");
        toast.error("Sua conta foi bloqueada. Entre em contato com o suporte.");
        await supabase.auth.signOut();
        setProfile(null);
        setRole(null);
        setSession(null);
        setUser(null);
        return;
      }
      setProfile(profile);
      setRole(role);
    } catch (error) {
      if (requestId === authRequestRef.current) {
        console.error("[auth] erro inesperado ao aplicar sessão", error);
        setProfile(null);
        setRole(null);
      }
    } finally {
      if (requestId === authRequestRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    const initialRequestId = authRequestRef.current;
    // Listener FIRST, then getSession
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        // INITIAL_SESSION é tratado pelo getSession() abaixo — ignora aqui
        // para não disparar re-render duplicado que reinicializa o chat.
        if (event === "INITIAL_SESSION") return;

        // TOKEN_REFRESHED mantém o JWT atualizado sem refazer fetch de
        // profile/role. Isso evita que streams longos (ex.: exames de 3min+)
        // sejam interrompidos por uma re-renderização da árvore.
        if (event === "TOKEN_REFRESHED") {
          setSession(newSession);
          setUser(newSession?.user ?? null);
          return;
        }

        // PASSWORD_RECOVERY: a sessão é temporária, exclusiva para redefinir a
        // senha em /reset-password. NUNCA rodar applySession aqui — ela busca
        // profile/role e, se o profile.is_blocked=true (ou o fetch falhar),
        // dispara supabase.auth.signOut() e invalida o link de recuperação
        // antes da pessoa conseguir salvar a nova senha.
        if (event === "PASSWORD_RECOVERY") {
          setSession(newSession);
          setUser(newSession?.user ?? null);
          setLoading(false);
          return;
        }

        // SIGNED_IN, SIGNED_OUT, USER_UPDATED → aplica sessão completa.
        setTimeout(() => {
          void applySession(newSession);
        }, 0);
      }
    );

    withAuthTimeout(
      supabase.auth.getSession(),
      { data: { session: null }, error: null },
      "restauração da sessão",
    )
      .then(({ data }) => {
        if (initialRequestId !== authRequestRef.current) return;
        void applySession(data.session);
      })
      .catch((error) => {
        console.error("[auth] erro ao restaurar sessão", error);
        clearLocalSessionToken();
        setSession(null);
        setUser(null);
        setProfile(null);
        setRole(null);
        setLoading(false);
      });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      throw error;
    }
    await applySession(data.session);
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/app`,
        data: { full_name: fullName },
      },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setRole(null);
  };

  const refresh = async () => {
    if (user) await loadUserData(user);
  };

  return (
    <AuthContext.Provider
      value={{ session, user, profile, role, loading, signIn, signUp, signOut, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
