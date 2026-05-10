import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  Boxes,
  KeyRound,
  LayoutGrid,
  MessageSquare,
  AlertCircle,
  Lightbulb,
  Trophy,
  CreditCard,
  Package,
  AlertTriangle,
  FlaskConical,
  BookOpen,
  Tag,
  Users,
  Shield,
  Plug,
  FlaskRound,
  ChevronLeft,
  ChevronDown,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import lummaLockup from "@/assets/lumma-lockup.svg";

type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  superAdminOnly?: boolean;
};

type NavGroup = {
  key: string;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
};

const groups: NavGroup[] = [
  {
    key: "operacao",
    label: "OPERAÇÃO",
    subtitle: "Acompanhar o negócio",
    icon: Activity,
    items: [
      { title: "Dashboard", url: "/app", icon: LayoutGrid },
      { title: "Conversas", url: "#conversas", icon: MessageSquare },
      { title: "Erros", url: "#erros", icon: AlertCircle },
      { title: "Feedback", url: "#feedback", icon: Lightbulb },
      { title: "Ranking de acessos", url: "#ranking", icon: Trophy },
    ],
  },
  {
    key: "produto",
    label: "PRODUTO",
    subtitle: "Configurar o sistema",
    icon: Boxes,
    items: [
      { title: "Planos", url: "#planos", icon: CreditCard },
      { title: "Ofertas Hubla", url: "#hubla", icon: Package },
      { title: "Vendas sem mapeamento", url: "#vendas", icon: AlertTriangle },
      { title: "Formulações", url: "#formulacoes", icon: FlaskConical },
      { title: "Base de Conhecimento", url: "#kb", icon: BookOpen },
      { title: "Categorias", url: "#categorias", icon: Tag, badge: "NOVO" },
      { title: "Integrações & APIs", url: "/app/admin/integrations", icon: Plug, badge: "NOVO" },
      { title: "Playground (Sandbox)", url: "/app/admin/playground", icon: FlaskRound, badge: "BETA", superAdminOnly: true },
    ],
  },
  {
    key: "acesso",
    label: "ACESSO",
    subtitle: "Usuários e permissões",
    icon: KeyRound,
    items: [
      { title: "Usuários", url: "/app/admin/users", icon: Users },
      { title: "Administradores", url: "/app/admin/administrators", icon: Shield, badge: "NOVO" },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { profile, role, signOut } = useAuth();
  const navigate = useNavigate();
  const currentPath = useRouterState({ select: (r) => r.location.pathname });

  const [open, setOpen] = useState<Record<string, boolean>>({
    operacao: true,
    produto: true,
    acesso: true,
  });

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  const isActive = (url: string) =>
    !url.startsWith("#") &&
    (currentPath === url || (url !== "/app" && currentPath.startsWith(url + "/")));

  return (
    <Sidebar collapsible="icon" className="border-r bg-background">
      <SidebarHeader className="px-5 pt-6 pb-4">
        {collapsed ? (
          <div className="h-8 w-8 mx-auto rounded-lg bg-gradient-brand" />
        ) : (
          <div className="flex items-end gap-2">
            <img src={lummaLockup} alt="Lumma" className="h-7" />
            <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground pb-[3px]">
              Admin
            </span>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="px-3 gap-1">
        {groups.map((g) => {
          const isOpen = open[g.key];
          const visibleItems = g.items.filter(
            (item) => !item.superAdminOnly || role === "super_admin",
          );
          if (visibleItems.length === 0) return null;
          return (
            <div key={g.key} className="py-2">
              <button
                type="button"
                onClick={() => setOpen((s) => ({ ...s, [g.key]: !s[g.key] }))}
                className={cn(
                  "w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted/60 transition-colors",
                  collapsed && "justify-center",
                )}
              >
                <g.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                {!collapsed && (
                  <>
                    <div className="flex-1 text-left">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-foreground/80">
                        {g.label}
                      </div>
                      <div className="text-[11px] text-muted-foreground leading-tight">
                        {g.subtitle}
                      </div>
                    </div>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform",
                        !isOpen && "-rotate-90",
                      )}
                    />
                  </>
                )}
              </button>

              {isOpen && (
                <ul className="mt-1 space-y-0.5">
                  {visibleItems.map((item) => {
                    const active = isActive(item.url);
                    const content = (
                      <span
                        className={cn(
                          "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                          active
                            ? "bg-[oklch(0.97_0.025_50)] text-foreground font-medium"
                            : "text-foreground/75 hover:bg-muted/60 hover:text-foreground",
                        )}
                      >
                        {active && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r bg-gradient-brand" />
                        )}
                        <item.icon className="h-[18px] w-[18px] shrink-0" />
                        {!collapsed && (
                          <>
                            <span className="flex-1 truncate">{item.title}</span>
                            {item.badge && (
                              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                {item.badge}
                              </span>
                            )}
                          </>
                        )}
                      </span>
                    );

                    return (
                      <li key={item.url}>
                        {item.url.startsWith("#") ? (
                          <a href={item.url} aria-disabled className="block opacity-70 cursor-not-allowed">
                            {content}
                          </a>
                        ) : (
                          <Link to={item.url}>{content}</Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="px-5 py-4 border-t">
        {!collapsed ? (
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            title={profile?.email}
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Voltar ao app</span>
          </button>
        ) : (
          <button
            onClick={handleSignOut}
            className="mx-auto text-muted-foreground hover:text-foreground"
            aria-label="Sair"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
