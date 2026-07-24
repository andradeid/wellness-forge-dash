import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { UserMenu } from "@/components/UserMenu";
import { useAuth } from "@/hooks/useAuth";
import { Toaster } from "@/components/ui/sonner";
import { PaywallDialog } from "@/components/PaywallDialog";
import { usePaywallState, paywallStore } from "@/lib/paywall-store";
import { TopUpDialog } from "@/components/TopUpDialog";
import { useTopUpState, topUpStore } from "@/lib/topup-store";
import { supabase } from "@/integrations/supabase/client";
import {
  clearLocalSessionToken,
  getLocalSessionToken,
  isSessionStillValid,
  SESSION_KICKED_KEY,
} from "@/lib/session-guard";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { canBypassMaintenance } from "@/lib/maintenance-bypass";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

type AppRole = "super_admin" | "admin" | "nutri" | "support";

// RBAC central: rota (prefixo) -> roles permitidos.
// Defesa em profundidade: páginas continuam com seus guards locais.
const ROUTE_ACCESS: Array<{ prefix: string; roles: AppRole[] }> = [
  // Somente super_admin
  { prefix: "/app/admin/users", roles: ["super_admin"] },
  { prefix: "/app/admin/ranking", roles: ["super_admin"] },
  { prefix: "/app/admin/playground", roles: ["super_admin"] },
  { prefix: "/app/admin/feedbacks", roles: ["super_admin"] },
  { prefix: "/app/admin/system", roles: ["super_admin"] },
  // Admin + super_admin
  { prefix: "/app/admin/administrators", roles: ["admin", "super_admin"] },
  { prefix: "/app/admin/integrations", roles: ["admin", "super_admin"] },
  // Nutricionistas: apenas super_admin e suporte (CS)
  { prefix: "/app/admin/nutritionists", roles: ["super_admin", "support"] },

  // Qualquer outra rota /app/admin/* exige pelo menos admin
  { prefix: "/app/admin", roles: ["admin", "super_admin"] },
];

// Rotas permitidas para o papel Suporte (CS), fora do /app/admin.
// Whitelist rigorosa: qualquer outra rota /app/* redireciona para a permitida.
const SUPPORT_ALLOWED_PREFIXES = [
  "/app/admin/nutritionists",
  "/app/trocar-senha",
  "/app/politicas",
];

function isAllowed(pathname: string, role: AppRole | null): boolean {
  // Suporte (CS) tem whitelist explícita: bloqueia tudo fora dela.
  if (role === "support") {
    return SUPPORT_ALLOWED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p));
  }
  const match = ROUTE_ACCESS.find((r) => pathname.startsWith(r.prefix));
  if (!match) return true; // rotas /app não administrativas: liberadas para qualquer role logada
  if (!role) return false;
  return match.roles.includes(role);
}


function AppLayout() {
  const { session, loading, role, user } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [sessionAllowed, setSessionAllowed] = useState(false);
  const [validationTimedOut, setValidationTimedOut] = useState(false);
  const paywall = usePaywallState();
  const topup = useTopUpState();
  const { data: systemSettings } = useSystemSettings();

  useEffect(() => {
    if (!loading && (!session || sessionAllowed)) {
      setValidationTimedOut(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      console.warn("[app] validação de sessão excedeu o tempo limite; evitando tela presa");
      setValidationTimedOut(true);
      if (session?.user) {
        setSessionAllowed(true);
        return;
      }
      void navigate({ to: "/login", replace: true }).catch((error) => {
        console.warn("[app] falha ao redirecionar após timeout de sessão", error);
      });
    }, 6_000);

    return () => window.clearTimeout(timeoutId);
  }, [loading, session, sessionAllowed, navigate]);

  useEffect(() => {
    if (
      systemSettings?.maintenance_enabled &&
      role &&
      !canBypassMaintenance(role, user?.email ?? null)
    ) {
      void navigate({ to: "/manutencao", replace: true }).catch((error) => {
        console.warn("[app] falha ao redirecionar para manutenção", error);
      });
    }
  }, [systemSettings?.maintenance_enabled, role, user?.email, navigate]);

  useEffect(() => {
    if (!loading && !session) {
      setSessionAllowed(false);
      void navigate({ to: "/login", replace: true }).catch((error) => {
        console.warn("[app] falha ao redirecionar para login", error);
      });
    }
  }, [session, loading, navigate]);

  // Gate: senha temporária -> força troca antes de liberar o app
  useEffect(() => {
    if (loading || !session?.user) return;
    if (pathname === "/app/trocar-senha") return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("must_change_password")
        .eq("id", session.user.id)
        .maybeSingle();
      if (cancelled || error) return;
      if (data?.must_change_password) {
        void navigate({ to: "/app/trocar-senha", replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, session?.user?.id, pathname, navigate]);


  // RBAC: redireciona para /unauthorized se a role atual não tiver permissão.
  // Importante: se a rota é administrativa e o role AINDA não carregou,
  // também bloqueamos — assim um usuário nutri nunca vê a UI admin
  // durante a janela entre login e carregamento do role.
  useEffect(() => {
    if (loading || !session || !sessionAllowed) return;
    const isAdminRoute = pathname.startsWith("/app/admin");
    if (isAdminRoute && !role) {
      // Ainda carregando role em rota admin: não deixa renderizar.
      return;
    }
    if (!role) return;
    if (!isAllowed(pathname, role)) {
      const dest = role === "support" ? "/app/admin/nutritionists" : "/unauthorized";
      void navigate({ to: dest, replace: true }).catch((error) => {
        console.warn("[app] falha ao redirecionar acesso negado", error);
      });
    }
  }, [loading, session, sessionAllowed, role, pathname, navigate]);


  // Gatekeeper de sessão única: valida UMA VEZ por sessão (não a cada rota).
  // Revalidar a cada mudança de pathname desmontava a árvore do chat no meio
  // de um stream do Dify (ex.: durante upload/análise de exame), perdendo
  // toda a resposta. Aqui mantemos a UI montada durante a revalidação e só
  // deslogamos se a sessão for confirmadamente inválida.
  useEffect(() => {
    if (loading || !session?.user) return;
    if (role === "super_admin") {
      setSessionAllowed(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const localToken = getLocalSessionToken();
        if (!localToken) {
          if (cancelled) return;
          // Não deixa a aplicação presa em "Validando sessão" quando o token
          // local ainda não foi gravado/restaurado. Ações sensíveis continuam
          // protegidas pelo Supabase Auth e pela RLS.
          console.warn("[app] sessão Supabase sem token local; liberando UI e evitando loop de login");
          setSessionAllowed(true);
          return;
        }
        const valid = await isSessionStillValid(session.user.id);
        if (cancelled) return;
        if (valid) {
          setSessionAllowed(true);
          return;
        }
        try {
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem(SESSION_KICKED_KEY, "1");
          }
          clearLocalSessionToken();
          await supabase.auth.signOut();
        } finally {
          if (!cancelled) await navigate({ to: "/login", replace: true });
        }
      } catch (error) {
        console.warn("[app] falha ao validar sessão; mantendo UI montada", error);
        if (cancelled) return;
        // Em erro transitório de storage/rede/auth, não derruba a rota inteira.
        // Libera a UI e deixa ações sensíveis revalidarem a sessão depois.
        setSessionAllowed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, session?.user?.id, role, navigate]);

  if (!validationTimedOut && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Validando sessão...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Validando acesso...</div>
      </div>
    );
  }


  const isChat = pathname.startsWith("/app/chat/");
  const isGeneralChat = pathname.startsWith("/app/general/");
  const isEvolution = pathname.startsWith("/app/evolution/");
  const isFaleComLumma = pathname.startsWith("/app/fale-com-lumma");
  const immersive = isChat || isGeneralChat || isEvolution || isFaleComLumma;

  const showStagingBanner = false;

  return (
    <SidebarProvider>
      <div className="h-[100dvh] flex flex-col w-full bg-background overflow-hidden">
        <div className="flex flex-1 min-h-0 w-full">
          {!immersive && <AppSidebar />}
          <div className="flex-1 flex flex-col min-w-0">
            {showStagingBanner && (
              <div className="shrink-0 bg-amber-100 text-amber-900 border-b border-amber-200/80 text-[11px] sm:text-xs font-medium px-3 py-1.5 text-center leading-snug whitespace-normal break-words">
                ⚠️ AMBIENTE DE HOMOLOGAÇÃO E TESTES (ETAPA 3) • Foco em extração de dados e ajustes de layout. Operando em nossa VPS.
              </div>
            )}
            {!immersive && (
              <header className="h-14 flex items-center border-b bg-card px-4 gap-2">
                <SidebarTrigger title="Mostrar/ocultar menu" />
                <div className="text-sm font-medium text-muted-foreground ml-2 md:ml-0">
                  LUMMA
                </div>
                <div className="ml-auto">
                  <UserMenu />
                </div>
              </header>
            )}
            <main className={immersive ? "flex-1 min-h-0 overflow-hidden" : "flex-1 p-6 overflow-auto"}>
              {immersive ? (
                <div className="h-full w-full">
                  <Outlet />
                </div>
              ) : (
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={pathname}
                    initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, y: -6, filter: "blur(3px)" }}
                    transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
                    className="w-full"
                  >
                    <Outlet />
                  </motion.div>
                </AnimatePresence>
              )}
            </main>
          </div>
        </div>
        <Toaster />
        <PaywallDialog
          open={paywall.open}
          onOpenChange={(v) => (v ? null : paywallStore.close())}
          needed={paywall.needed}
          balance={paywall.balance}
          agentLabel={paywall.agentLabel}
        />
        <TopUpDialog
          open={topup.open}
          onOpenChange={(v) => (v ? topUpStore.open() : topUpStore.close())}
        />
      </div>
    </SidebarProvider>
  );
}
