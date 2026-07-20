import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { canBypassMaintenance } from "@/lib/maintenance-bypass";
import {
  addSessionSeat,
  clearLocalSessionToken,
  generateSessionToken,
  getLocalSessionToken,
  getSeatInfo,
  replaceOldestSeat,
  SESSION_KICKED_KEY,
  type SeatInfo,
} from "@/lib/session-guard";
import { toast } from "sonner";
import loginBg from "@/assets/login-bg.png";
import lummaSymbol from "@/assets/lumma-symbol.svg";
import lummaLockup from "@/assets/lumma-lockup-dark.svg";

function LoginErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  if (typeof console !== "undefined") {
    console.error("[login] errorComponent capturou falha, renderizando fallback", error);
  }
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center px-4 py-10 bg-cover bg-center"
      style={{ backgroundImage: `url(${loginBg})` }}
    >
      <Card className="w-full max-w-md border-white/40 bg-white/90 backdrop-blur-xl shadow-2xl rounded-2xl">
        <CardHeader className="items-center text-center space-y-3">
          <div className="h-16 w-16 rounded-2xl bg-white shadow-md flex items-center justify-center">
            <img src={lummaSymbol} alt="LUMMA" className="h-12 w-12" />
          </div>
          <CardTitle className="text-2xl">Login temporariamente indisponível</CardTitle>
          <CardDescription>
            Não foi possível carregar a validação de sessão agora. Recarregue a página para tentar novamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            className="w-full text-white border-0 shadow-md"
            style={{ backgroundImage: "var(--gradient-brand)" }}
            onClick={() => {
              try { reset(); } catch { /* noop */ }
              if (typeof window !== "undefined") window.location.reload();
            }}
          >
            Tentar novamente
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Se o problema persistir, verifique sua conexão ou tente em alguns instantes.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — LUMMA" },
      { name: "description", content: "Acesse sua conta LUMMA, a plataforma para nutricionistas." },
    ],
  }),
  component: LoginPage,
  errorComponent: LoginErrorFallback,
});

function LoginPage() {
  const { session, signIn, signUp, loading, role } = useAuth();
  const navigate = useNavigate();
  const { data: systemSettings } = useSystemSettings();

  useEffect(() => {
    if (
      systemSettings?.maintenance_enabled &&
      role &&
      !canBypassMaintenance(role, session?.user?.email ?? null)
    ) {
      void navigate({ to: "/manutencao", replace: true }).catch((error) => {
        console.warn("[login] falha ao redirecionar para manutenção", error);
      });
    }
  }, [systemSettings?.maintenance_enabled, role, session?.user?.email, navigate]);
  const [tab, setTab] = useState<"signin" | "signup">("signin");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSending, setForgotSending] = useState(false);

  const translateAuthError = (raw: string): string => {
    const msg = (raw || "").toLowerCase();
    if (msg.includes("invalid login") || msg.includes("invalid credentials") || msg.includes("invalid_credentials")) {
      return "Email ou senha incorretos. Se este é seu primeiro acesso, clique em \"Esqueci minha senha\" para definir uma nova senha.";
    }
    if (msg.includes("email not confirmed")) return "Email ainda não confirmado. Verifique sua caixa de entrada.";
    if (msg.includes("too many") || msg.includes("rate limit")) return "Muitas tentativas. Aguarde alguns instantes e tente novamente.";
    if (msg.includes("user not found")) return "Usuário não encontrado. Verifique o email digitado.";
    return raw || "Não foi possível entrar. Tente novamente.";
  };

  const handleForgotPassword = async () => {
    const target = (forgotEmail || email).trim();
    if (!target) {
      toast.error("Digite seu email para receber o link de redefinição.");
      return;
    }
    setForgotSending(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(target, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Enviamos um link para redefinir sua senha. Verifique seu email.");
      setForgotOpen(false);
      setForgotEmail("");
    } catch (err: any) {
      toast.error(err?.message ?? "Não foi possível enviar o email de redefinição.");
    } finally {
      setForgotSending(false);
    }
  };

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
    void supabase.auth.signOut().catch((error) => {
      console.warn("[login] falha ao limpar sessão sem assento", error);
    });
  }, [loading, session, submitting, pendingUserId]);

  useEffect(() => {
    if (!pendingUserId) return;
    const cleanupPendingAuth = () => {
      if (typeof window === "undefined") return;
      if (conflictConfirmedRef.current || cleanupInProgressRef.current) return;
      cleanupInProgressRef.current = true;
      clearLocalSessionToken();
      void supabase.auth.signOut().finally(() => {
        cleanupInProgressRef.current = false;
      }).catch((error) => {
        console.warn("[login] falha ao limpar sessão pendente", error);
      });
    };
    if (typeof window === "undefined") return;
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

  const [pendingSeatInfo, setPendingSeatInfo] = useState<SeatInfo | null>(null);

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSignInError(null);
    conflictConfirmedRef.current = false;
    try {
      await signIn(email, password);
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Não foi possível identificar o usuário.");

      const newToken = generateSessionToken();
      const currentRole = await fetchRoleForNavigation(uid);

      // Super admin não tem assento — entra direto sem gravar sessão única.
      if (currentRole === "super_admin") {
        finalizeEntry(currentRole);
        return;
      }

      const seatInfo = await getSeatInfo(uid);
      const localToken = getLocalSessionToken();

      // Se o token local já está entre os assentos, é o mesmo dispositivo — só renova.
      const sameDevice =
        !!localToken && seatInfo.active.some((s) => s.active_session_token === localToken);

      // Há vaga disponível (ou é admin/super_admin) — entra direto.
      if (sameDevice || seatInfo.unlimited || seatInfo.active.length < seatInfo.limit) {
        await addSessionSeat(uid, newToken);
        finalizeEntry(currentRole);
        return;
      }

      // Limite atingido — pedir confirmação para derrubar o assento mais antigo.
      setPendingUserId(uid);
      setPendingToken(newToken);
      setPendingRole(currentRole);
      setPendingSeatInfo(seatInfo);
      setConflictOpen(true);
      setSubmitting(false);
    } catch (err: any) {
      const friendly = translateAuthError(err?.message ?? "");
      setSignInError(friendly);
      toast.error(friendly);
      setSubmitting(false);
    }
  };

  const handleConflictConfirm = async () => {
    if (!pendingUserId || !pendingToken) return;
    setResolving(true);
    try {
      conflictConfirmedRef.current = true;
      await replaceOldestSeat(pendingUserId, pendingToken);
      setConflictOpen(false);
      setPendingUserId(null);
      setPendingToken(null);
      const role = pendingRole;
      setPendingRole(null);
      setPendingSeatInfo(null);
      finalizeEntry(role);
    } catch (err: any) {
      conflictConfirmedRef.current = false;
      toast.error(err.message ?? "Não foi possível encerrar a conexão mais antiga.");
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
    setPendingSeatInfo(null);
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
              <CardDescription>Entre com suas credenciais para continuar.</CardDescription>
            </CardHeader>
            <CardContent>
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
            <AlertDialogTitle>Limite de Acessos Atingido</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingSeatInfo
                ? `Seu plano ${pendingSeatInfo.planLabel} permite até ${pendingSeatInfo.limit} ${pendingSeatInfo.limit === 1 ? "acesso simultâneo" : "acessos simultâneos"} e todos estão em uso neste momento. Para continuar e entrar neste dispositivo, a conexão ativa mais antiga da sua equipe será encerrada.`
                : "Seu plano atingiu o limite de acessos simultâneos. Para continuar neste dispositivo, a conexão ativa mais antiga será encerrada."}
              {" "}
              <span className="block mt-2 text-xs opacity-80">Dica: faça o upgrade do seu plano para liberar mais acessos.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resolving} onClick={handleConflictCancel}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={resolving}
              onClick={(event) => {
                event.preventDefault();
                void handleConflictConfirm();
              }}
              className="text-white border-0"
              style={{ backgroundImage: "var(--gradient-brand)" }}
            >
              {resolving ? "Encerrando..." : "Sim, encerrar acesso antigo e entrar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
