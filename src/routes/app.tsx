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

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-14 flex items-center border-b bg-card px-4 gap-2">
            <SidebarTrigger />
            <div className="ml-2 text-sm font-medium text-muted-foreground">
              LUMMA
            </div>
            <div className="ml-auto">
              <UserMenu />
            </div>
          </header>
          <main className="flex-1 p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
        <Toaster />
      </div>
    </SidebarProvider>
  );
}
