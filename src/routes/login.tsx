import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
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

  useEffect(() => {
    if (!loading && session) {
      navigate({ 
        to: role === "nutri" ? "/app/fale-com-lumma" : "/app", 
        replace: true 
      });
    }
  }, [session, loading, navigate]);

  const handleSignIn = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await signIn(email, password);
      toast.success("Bem-vindo de volta!");
      // Não navega aqui — o useEffect acima detecta `session` e redireciona,
      // evitando race com o AuthProvider (que ainda não propagou o contexto).
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao entrar");
      setSubmitting(false);
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
    </div>
  );
}
