import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
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
      navigate({ to: "/login" });
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

  if (!session) return null;

  const isChat = pathname.startsWith("/app/chat/");
  const isEvolution = pathname.startsWith("/app/evolution/");
  const immersive = isChat || isEvolution;

  const showStagingBanner = role === "nutri";

  return (
    <SidebarProvider>
      {showStagingBanner && (
        <div className="fixed top-0 inset-x-0 z-50 bg-amber-400 text-black text-[11px] sm:text-xs font-medium px-3 py-1.5 text-center shadow-sm">
          <span className="inline-block">
            ⚠️ AMBIENTE DE HOMOLOGAÇÃO E TESTES (ETAPA 2) • Velocidade reduzida e recursos limitados. A migração para a VPS de alta performance ocorrerá na Etapa 3.
          </span>
        </div>
      )}
      <div className={`min-h-screen flex w-full bg-background ${showStagingBanner ? "pt-8" : ""}`}>
        {!immersive && <AppSidebar />}
        <div className="flex-1 flex flex-col min-w-0">
          {!immersive && (
            <header className="h-14 flex items-center border-b bg-card px-4 gap-2">
              <SidebarTrigger />
              <div className="ml-2 text-sm font-medium text-muted-foreground">
                LUMMA
              </div>
              <div className="ml-auto">
                <UserMenu />
              </div>
            </header>
          )}
          <main className={immersive ? "flex-1 overflow-hidden" : "flex-1 p-6 overflow-auto"}>
            <Outlet />
          </main>
        </div>
        <Toaster />
      </div>
    </SidebarProvider>
  );
}
