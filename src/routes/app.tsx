import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { UserMenu } from "@/components/UserMenu";
import { useAuth } from "@/hooks/useAuth";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/app")({
  component: AppLayout,
});

function AppLayout() {
  const { session, loading, role } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  useEffect(() => {
    if (!loading && !session) {
      navigate({ to: "/login", replace: true });
    }
  }, [session, loading, navigate]);

  // RBAC: nutri não acessa rotas administrativas
  useEffect(() => {
    if (!loading && session && role && role === "nutri" && pathname.startsWith("/app/admin")) {
      navigate({ to: "/app/patients", replace: true });
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
  const isEvolution = pathname.startsWith("/app/evolution/");
  const isFaleComLumma = pathname.startsWith("/app/fale-com-lumma");
  const immersive = isChat || isEvolution || isFaleComLumma;

  const showStagingBanner = role === "nutri";

  return (
    <SidebarProvider>
      <div className="h-[100dvh] flex flex-col w-full bg-background overflow-hidden">
        <div className="flex flex-1 min-h-0 w-full">
          {!immersive && <AppSidebar />}
          <div className="flex-1 flex flex-col min-w-0">
            {showStagingBanner && (
              <div className="shrink-0 bg-amber-100 text-amber-900 border-b border-amber-200/80 text-[11px] sm:text-xs font-medium px-3 py-1.5 text-center leading-snug whitespace-normal break-words">
                ⚠️ AMBIENTE DE HOMOLOGAÇÃO E TESTES (ETAPA 2) • Recursos de processamento em fase de validação estrutural. A migração para a VPS de alta performance ocorrerá na Etapa 3.
              </div>
            )}
            {!immersive && (
              <header className="h-14 flex items-center border-b bg-card px-4 gap-2">
                <div className="text-sm font-medium text-muted-foreground">
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
      </div>
    </SidebarProvider>
  );
}
