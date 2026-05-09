import {
  createContext,
  useContext,
  useEffect,
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
      .select("id, full_name, email, avatar_url")
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

  const loadUserData = async (currentUser: User | null) => {
    if (!currentUser) {
      setProfile(null);
      setRole(null);
      return;
    }
    const { profile, role } = await fetchProfileAndRole(currentUser.id);
    setProfile(profile);
    setRole(role);
  };

  useEffect(() => {
    // Listener FIRST, then getSession
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        // Defer to avoid deadlocks inside the auth callback
        if (newSession?.user) {
          setTimeout(() => {
            loadUserData(newSession.user);
          }, 0);
        } else {
          setProfile(null);
          setRole(null);
        }
      }
    );

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
      // Load profile/role in background — don't block auth readiness
      if (data.session?.user) {
        loadUserData(data.session.user);
      }
    });

    return () => {
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    setSession(data.session);
    setUser(data.user ?? null);
    if (data.user) {
      loadUserData(data.user);
    }
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
