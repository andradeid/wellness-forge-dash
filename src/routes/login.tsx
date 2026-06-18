import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth, type AppRole } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  claimSession,
  clearLocalSessionToken,
  fetchActiveSessionToken,
  generateSessionToken,
  getLocalSessionToken,
  SESSION_KICKED_KEY,
} from "@/lib/session-guard";
import { toast } from "sonner";
import loginBg from "@/assets/login-bg.png";
import lummaSymbol from "@/assets/lumma-symbol.svg";
import lummaLockup from "@/assets/lumma-lockup-dark.svg";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — LUMMA" },
      { name: "description", content: "Acesse sua conta LUMMA, a plataforma para nutricionistas." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { session, signIn, signUp, loading, role } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"signin" | "signup">("signin");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Estado da interceptação de sessão concorrente
  const [conflictOpen, setConflictOpen] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [pendingRole, setPendingRole] = useState<AppRole | null>(null);
  const [resolving, setResolving] = useState(false);
  const conflictConfirmedRef = useRef(false);
  const cleanupInProgressRef = useRef(false);

  // Aviso quando o usuário foi derrubado por outro dispositivo
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(SESSION_KICKED_KEY)) {
      window.sessionStorage.removeItem(SESSION_KICKED_KEY);
      toast.warning(
        "Sua sessão foi encerrada porque esta conta foi conectada em outro dispositivo.",
      );
    }
  }, []);

  useEffect(() => {
    if (loading || !session || submitting || pendingUserId) return;
    if (getLocalSessionToken()) return;
    clearLocalSessionToken();
    void supabase.auth.signOut();
  }, [loading, session, submitting, pendingUserId]);

  useEffect(() => {
    if (!pendingUserId) return;
    const cleanupPendingAuth = () => {
      if (conflictConfirmedRef.current || cleanupInProgressRef.current) return;
      cleanupInProgressRef.current = true;
      clearLocalSessionToken();
      void supabase.auth.signOut().finally(() => {
        cleanupInProgressRef.current = false;
      });
    };
    window.addEventListener("beforeunload", cleanupPendingAuth);
    return () => {
      window.removeEventListener("beforeunload", cleanupPendingAuth);
      cleanupPendingAuth();
    };
  }, [pendingUserId]);

  const finalizeEntry = (currentRole: AppRole | null) => {
    toast.success("Bem-vindo de volta!");
    navigate({
      to: currentRole === "nutri" ? "/app/fale-com-lumma" : "/app",
      replace: true,
    });
  };

  const fetchRoleForNavigation = async (userId: string): Promise<AppRole | null> => {
    const { data, error } = await (supabase as any)
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .order("role", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data?.role as AppRole | null) ?? null;
  };

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    conflictConfirmedRef.current = false;
    try {
      await signIn(email, password);
      // Após login bem-sucedido, precisamos do user.id
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Não foi possível identificar o usuário.");

      const newToken = generateSessionToken();
      const existing = await fetchActiveSessionToken(uid);
      const currentRole = await fetchRoleForNavigation(uid);

      if (!existing) {
        await claimSession(uid, newToken);
        finalizeEntry(currentRole);
        return;
      }

      // Conflito: já existe sessão ativa em outro dispositivo
      setPendingUserId(uid);
      setPendingToken(newToken);
      setPendingRole(currentRole);
      setConflictOpen(true);
      setSubmitting(false);
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao entrar");
      setSubmitting(false);
    }
  };

  const handleConflictConfirm = async () => {
    if (!pendingUserId || !pendingToken) return;
    setResolving(true);
    try {
      conflictConfirmedRef.current = true;
      await claimSession(pendingUserId, pendingToken);
      setConflictOpen(false);
      setPendingUserId(null);
      setPendingToken(null);
      setPendingRole(null);
      finalizeEntry(pendingRole);
    } catch (err: any) {
      conflictConfirmedRef.current = false;
      toast.error(err.message ?? "Não foi possível encerrar a outra sessão.");
    } finally {
      setResolving(false);
    }
  };

  const handleConflictCancel = async () => {
    if (cleanupInProgressRef.current) return;
    cleanupInProgressRef.current = true;
    conflictConfirmedRef.current = false;
    setConflictOpen(false);
    setPendingUserId(null);
    setPendingToken(null);
    setPendingRole(null);
    setSubmitting(false);
    clearLocalSessionToken();
    try {
      await supabase.auth.signOut();
      toast.info("Login cancelado. Você permanece desconectado.");
    } finally {
      cleanupInProgressRef.current = false;
    }
  };

  const handleSignUp = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await signUp(email, password, fullName);
      toast.success("Conta criada! Verifique seu email se necessário.");
      navigate({ to: role === "nutri" ? "/app/fale-com-lumma" : "/app" });
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao cadastrar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full bg-cover bg-center bg-no-repeat flex items-center justify-center px-4 py-10"
      style={{ backgroundImage: `url(${loginBg})` }}
    >
      <div className="w-full max-w-6xl grid md:grid-cols-2 gap-10 items-center">
        {/* Coluna esquerda — branding (desktop) */}
        <div className="hidden md:flex flex-col items-start gap-6 pl-4">
          <img src={lummaLockup} alt="LUMMA" className="h-20 w-auto drop-shadow-sm" />
          <h2 className="text-4xl font-semibold tracking-tight text-white/95 max-w-md leading-tight">
            Atendimento nutricional,{" "}
            <span className="text-gradient-brand" style={{ backgroundImage: "linear-gradient(135deg, #ffffff, #fff7e9)" }}>
              inteligente e organizado.
            </span>
          </h2>
          <p className="text-white/80 max-w-md text-base leading-relaxed">
            Centralize pacientes, exames e planos em um único lugar — pensado para a rotina clínica do nutricionista.
          </p>
        </div>

        {/* Coluna direita — card de login */}
        <div className="w-full max-w-md mx-auto md:mx-0 md:ml-auto">
          <Card className="border-white/40 bg-white/85 backdrop-blur-xl shadow-2xl rounded-2xl">
            <CardHeader className="items-center text-center space-y-3 pb-2">
              <div className="h-16 w-16 rounded-2xl bg-white shadow-md flex items-center justify-center">
                <img src={lummaSymbol} alt="LUMMA" className="h-12 w-12" />
              </div>
              <CardTitle className="text-2xl">Acesse sua conta</CardTitle>
              <CardDescription>Entre ou crie uma conta para começar.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="signin">Entrar</TabsTrigger>
                  <TabsTrigger value="signup">Criar conta</TabsTrigger>
                </TabsList>

                <TabsContent value="signin" className="mt-5">
                  <form onSubmit={handleSignIn} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signin-email">Email</Label>
                      <Input id="signin-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signin-password">Senha</Label>
                      <Input id="signin-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                    </div>
                    <Button
                      type="submit"
                      className="w-full text-white border-0 shadow-md hover:opacity-90 transition-opacity"
                      style={{ backgroundImage: "var(--gradient-brand)" }}
                      disabled={submitting}
                    >
                      {submitting ? "Entrando..." : "Entrar"}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="signup" className="mt-5">
                  <form onSubmit={handleSignUp} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signup-name">Nome completo</Label>
                      <Input id="signup-name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">Email</Label>
                      <Input id="signup-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Senha</Label>
                      <Input id="signup-password" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                    </div>
                    <Button
                      type="submit"
                      className="w-full text-white border-0 shadow-md hover:opacity-90 transition-opacity"
                      style={{ backgroundImage: "var(--gradient-brand)" }}
                      disabled={submitting}
                    >
                      {submitting ? "Criando..." : "Criar conta"}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>

              <div className="mt-6 text-center">
                <Link to="/" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  ← Voltar para a home
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Branding mobile */}
          <div className="md:hidden mt-6 text-center">
            <img src={lummaLockup} alt="LUMMA" className="h-10 w-auto mx-auto opacity-90" />
          </div>
        </div>
      </div>

      <AlertDialog open={conflictOpen} onOpenChange={(v) => !v && !resolving && handleConflictCancel()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conexão Ativa Detectada</AlertDialogTitle>
            <AlertDialogDescription>
              Identificamos que este perfil já possui um acesso ativo em outro dispositivo.
              Deseja encerrar a outra conexão e continuar neste aparelho?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resolving} onClick={handleConflictCancel}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={resolving}
              onClick={handleConflictConfirm}
              className="text-white border-0"
              style={{ backgroundImage: "var(--gradient-brand)" }}
            >
              {resolving ? "Encerrando..." : "Sim, encerrar outra conexão e continuar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
