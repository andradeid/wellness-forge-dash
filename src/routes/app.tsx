import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
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

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

type AppRole = "super_admin" | "admin" | "nutri";

// RBAC central: rota (prefixo) -> roles permitidos.
// Defesa em profundidade: páginas continuam com seus guards locais.
const ROUTE_ACCESS: Array<{ prefix: string; roles: AppRole[] }> = [
  // Somente super_admin
  { prefix: "/app/admin/users", roles: ["super_admin"] },
  { prefix: "/app/admin/ranking", roles: ["super_admin"] },
  { prefix: "/app/admin/playground", roles: ["super_admin"] },
  { prefix: "/app/admin/feedbacks", roles: ["super_admin"] },
  // Admin + super_admin
  { prefix: "/app/admin/administrators", roles: ["admin", "super_admin"] },
  { prefix: "/app/admin/integrations", roles: ["admin", "super_admin"] },
  { prefix: "/app/admin/nutritionists", roles: ["admin", "super_admin"] },
  // Qualquer outra rota /app/admin/* exige pelo menos admin
  { prefix: "/app/admin", roles: ["admin", "super_admin"] },
];

function isAllowed(pathname: string, role: AppRole | null): boolean {
  const match = ROUTE_ACCESS.find((r) => pathname.startsWith(r.prefix));
  if (!match) return true; // rotas /app não administrativas: liberadas para qualquer role logada
  if (!role) return false;
  return match.roles.includes(role);
}

function AppLayout() {
  const { session, loading, role } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const paywall = usePaywallState();
  const topup = useTopUpState();

  useEffect(() => {
    if (!loading && !session) {
      navigate({ to: "/login", replace: true });
    }
  }, [session, loading, navigate]);

  // RBAC: redireciona para /unauthorized se a role atual não tiver permissão.
  useEffect(() => {
    if (loading || !session || !role) return;
    if (!isAllowed(pathname, role)) {
      navigate({ to: "/unauthorized", replace: true });
    }
  }, [loading, session, role, pathname, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Carregando...</div>
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
                <SidebarTrigger className="md:hidden" />
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
      </div>
    </SidebarProvider>
  );
}
