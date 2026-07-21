import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
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

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Supabase pode entregar o link em dois formatos:
    //  - implicit: #access_token=...&type=recovery (detectSessionInUrl trata)
    //  - PKCE:     ?code=... (precisa de exchangeCodeForSession)
    // Também escutamos PASSWORD_RECOVERY como fallback.
    let cancelled = false;

    const check = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (!error) {
            // limpa a query para evitar reuso do code
            url.searchParams.delete("code");
            window.history.replaceState({}, "", url.pathname + url.hash);
          }
        }
      } catch (err) {
        console.error("[reset-password] exchangeCodeForSession", err);
      }

      // Pequeno delay para o detectSessionInUrl processar o hash em iframes/SSR
      await new Promise((r) => setTimeout(r, 150));

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setHasSession(!!data.session);
      setReady(true);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        setHasSession(!!session);
        setReady(true);
      }
    });

    void check();

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);


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
              ? "Link inválido ou expirado. Solicite um novo e-mail de redefinição."
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
            <Link
              to="/login"
              className="block w-full text-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Voltar para o login
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
