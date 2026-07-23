import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";
import loginBg from "@/assets/login-bg.png";
import lummaSymbol from "@/assets/lumma-symbol.svg";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Redefinir senha — LUMMA" },
      { name: "description", content: "Defina uma nova senha para sua conta LUMMA." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ResetPasswordPage,
});

const RECOVERY_SESSION_WAIT_MS = 5_000;
const RECOVERY_SESSION_INTERVAL_MS = 250;

type SupportedResetType = "recovery" | "invite";

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getHashParams() {
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  return new URLSearchParams(hash);
}

function getSupportedResetType(value: string | null): SupportedResetType | null {
  if (value === "recovery" || value === "invite") return value;
  return null;
}

function translateResetLinkError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();
  if (
    normalized.includes("expired") ||
    normalized.includes("otp_expired") ||
    normalized.includes("token")
  ) {
    return "Esse link expirou ou já foi usado. Solicite um novo link abaixo e use sempre o e-mail mais recente.";
  }
  return "Não conseguimos validar este link. Solicite um novo link abaixo para redefinir sua senha.";
}

function getUrlResetError() {
  const url = new URL(window.location.href);
  const hashParams = getHashParams();
  const errorCode = url.searchParams.get("error_code") ?? hashParams.get("error_code");
  const errorDescription =
    url.searchParams.get("error_description") ?? hashParams.get("error_description");
  if (!errorCode && !errorDescription) return null;
  return translateResetLinkError(`${errorCode ?? ""} ${errorDescription ?? ""}`);
}

async function waitForRecoverySession() {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= RECOVERY_SESSION_WAIT_MS) {
    const { data } = await supabase.auth.getSession();
    if (data.session) return true;
    await delay(RECOVERY_SESSION_INTERVAL_MS);
  }
  return false;
}

async function establishSessionFromResetUrl() {
  const url = new URL(window.location.href);
  const hashParams = getHashParams();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash") ?? hashParams.get("token_hash");
  const type = getSupportedResetType(url.searchParams.get("type") ?? hashParams.get("type"));
  let validationError: unknown = null;
  let shouldCleanUrl = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) validationError = error;
    else shouldCleanUrl = true;
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) validationError = error;
    else shouldCleanUrl = true;
  }

  if (shouldCleanUrl) {
    window.history.replaceState({}, "", url.pathname);
  }

  const hasSession = await waitForRecoverySession();
  if (!hasSession && validationError) throw validationError;
  return hasSession;
}

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    // Supabase pode entregar o link em dois formatos:
    //  - implicit: #access_token=...&type=recovery (detectSessionInUrl trata)
    //  - PKCE:     ?code=... (precisa de exchangeCodeForSession)
    // Também escutamos PASSWORD_RECOVERY como fallback.
    let cancelled = false;

    const check = async () => {
      const urlError = getUrlResetError();
      if (urlError) {
        if (!cancelled) {
          setLinkError(urlError);
          setHasSession(false);
          setReady(true);
        }
        return;
      }

      try {
        const foundSession = await establishSessionFromResetUrl();
        if (cancelled) return;
        setHasSession(foundSession);
        setLinkError(
          foundSession
            ? null
            : "Não conseguimos validar este link. Solicite um novo link abaixo para redefinir sua senha.",
        );
      } catch (err) {
        console.error("[reset-password] validação do link", err);
        if (cancelled) return;
        setHasSession(false);
        setLinkError(translateResetLinkError(err));
      } finally {
        if (!cancelled) setReady(true);
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        setHasSession(!!session);
        if (session) setLinkError(null);
        setReady(true);
      }
    });

    void check();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleResend = async () => {
    const target = email.trim().toLowerCase();
    if (!target) {
      toast.error("Digite seu email para receber um novo link.");
      return;
    }
    setResending(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(target, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      toast.success("Enviamos um novo link. Use sempre o e-mail mais recente.");
      setLinkError("Enviamos um novo link de redefinição. Abra o e-mail mais recente recebido da Lumma.");
    } catch (err) {
      console.error("[reset-password] reenvio", err);
      toast.error("Não foi possível enviar o novo link agora. Tente novamente em alguns instantes.");
    } finally {
      setResending(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setSaving(true);
    // Revalida a sessão antes de tentar atualizar — o link de recovery é
    // consumido uma única vez, e sem sessão o updateUser lança
    // "Auth session missing".
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      setSaving(false);
      setHasSession(false);
      toast.error("Sua sessão de redefinição expirou. Solicite um novo e-mail.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      toast.error(error.message || "Não foi possível atualizar a senha.");
      return;
    }
    toast.success("Senha atualizada com sucesso.");
    await supabase.auth.signOut();
    setTimeout(() => navigate({ to: "/login" }), 500);
  };


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
          <CardTitle className="text-2xl">Redefinir senha</CardTitle>
          <CardDescription>
            {ready && !hasSession
              ? "Solicite um novo link para criar sua senha com segurança."
              : "Escolha uma nova senha para acessar sua conta."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!ready ? (
            <p className="text-sm text-center text-muted-foreground">Validando link...</p>
          ) : hasSession ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Nova senha</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirmar nova senha</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={saving}
                className="w-full text-white border-0 shadow-md"
                style={{ backgroundImage: "var(--gradient-brand)" }}
              >
                {saving ? "Salvando..." : "Atualizar senha"}
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              {linkError && (
                <div className="flex gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{linkError}</span>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <Button
                type="button"
                disabled={resending}
                onClick={handleResend}
                className="w-full text-white border-0 shadow-md"
                style={{ backgroundImage: "var(--gradient-brand)" }}
              >
                {resending ? "Enviando..." : "Enviar novo link"}
              </Button>
              <Link
                to="/login"
                className="block w-full text-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                Voltar para o login
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
