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

async function fetchProfileAndRole(userId: string): Promise<{
  profile: Profile | null;
  role: AppRole | null;
}> {
  const [profileRes, roleRes] = await Promise.all([
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
  ]);

  return {
    profile: (profileRes.data as Profile | null) ?? null,
    role: (roleRes.data?.role as AppRole | null) ?? null,
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
    setLoading(true);
    setSession(nextSession);
    setUser(nextSession?.user ?? null);

    if (!nextSession?.user) {
      setProfile(null);
      setRole(null);
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
    } finally {
      if (requestId === authRequestRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    const initialRequestId = authRequestRef.current;
    // Listener FIRST, then getSession
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setTimeout(() => {
          void applySession(newSession);
        }, 0);
      }
    );

    supabase.auth.getSession().then(({ data }) => {
      if (initialRequestId !== authRequestRef.current) return;
      void applySession(data.session);
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
