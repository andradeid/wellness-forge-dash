import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Eye, EyeOff, ShieldAlert } from "lucide-react";
import lummaSymbol from "@/assets/lumma-symbol.svg";

export const Route = createFileRoute("/app/trocar-senha")({
  head: () => ({
    meta: [
      { title: "Trocar senha — LUMMA" },
      { name: "description", content: "Defina sua senha definitiva de acesso à LUMMA." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: TrocarSenhaPage,
});

function TrocarSenhaPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) throw userErr ?? new Error("Sessão inválida");

      const { error: updErr } = await supabase.auth.updateUser({ password });
      if (updErr) throw updErr;

      const { error: profErr } = await supabase
        .from("profiles")
        .update({ must_change_password: false })
        .eq("id", userData.user.id);
      if (profErr) throw profErr;

      toast.success("Senha atualizada! Bem-vinda à LUMMA.");
      await navigate({ to: "/app", replace: true });
    } catch (err) {
      console.error("[trocar-senha] erro", err);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(
        msg.toLowerCase().includes("same")
          ? "A nova senha precisa ser diferente da atual."
          : "Não foi possível atualizar sua senha. Tente novamente."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3 text-center">
          <img src={lummaSymbol} alt="LUMMA" className="h-12 w-12 mx-auto" />
          <CardTitle className="text-xl">Defina sua senha definitiva</CardTitle>
          <CardDescription>
            Por segurança, você precisa trocar a senha temporária antes de continuar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Escolha uma senha forte com no mínimo 8 caracteres. Ela será usada em todos os próximos acessos.
            </span>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Nova senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={show ? "Ocultar senha" : "Mostrar senha"}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirme a nova senha</Label>
              <Input
                id="confirm"
                type={show ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white hover:opacity-90"
            >
              {loading ? "Salvando..." : "Salvar e continuar"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
