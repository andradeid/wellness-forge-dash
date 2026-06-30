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
  LifeBuoy,
  FileText,
  Tag,
  Users,
  Stethoscope,
  Shield,
  Plug,
  FlaskRound,
  ChevronDown,
  ChevronsUpDown,
  UserRound,
  LogOut,
  Plus,
  Coins,
  Settings as SettingsIcon,
  User as UserIcon,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CreditsBadge } from "@/components/CreditsBadge";
import { useAuth } from "@/hooks/useAuth";
import { useMyCredits } from "@/hooks/useCredits";

const LOW_CREDIT_THRESHOLD = 20;
import { supabase } from "@/integrations/supabase/client";
import { topUpStore } from "@/lib/topup-store";
import { cn } from "@/lib/utils";
import lummaLockup from "@/assets/lumma-lockup.svg";

const planLabel = (p?: string | null) =>
  p === "clinica" ? "Clínica" : p === "pro" ? "Pro Individual" : p === "starter" ? "Starter" : "Free";

type NavItem = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  superAdminOnly?: boolean;
  matchPrefix?: string;
  exact?: boolean;
};

type NavGroup = {
  key: string;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
};

const nutriGroups: NavGroup[] = [
  {
    key: "visao",
    label: "VISÃO GERAL",
    subtitle: "Panorama da sua base",
    icon: LayoutGrid,
    items: [
      { title: "Dashboard", url: "/app/dashboard", icon: LayoutGrid },
    ],
  },
  {
    key: "nutri",
    label: "ATENDIMENTO",
    subtitle: "Seus pacientes e análises",
    icon: UserRound,
    items: [
      { title: "Pacientes", url: "/app/patients", icon: Users, exact: true },
      { title: "Chat / Consulta", url: "/app/chats", icon: MessageSquare, matchPrefix: "/app/chat", badge: "NOVO" },
      
    ],
  },
  {
    key: "ajuda",
    label: "AJUDA & SUPORTE",
    subtitle: "Documentação e termos",
    icon: LifeBuoy,
    items: [
      { title: "Políticas e Termos", url: "/app/politicas", icon: FileText },
    ],
  },
];

const adminGroups: NavGroup[] = [
  {
    key: "operacao",
    label: "OPERAÇÃO",
    subtitle: "Acompanhar o negócio",
    icon: Activity,
    items: [
      { title: "Dashboard", url: "/app/admin/dashboard", icon: LayoutGrid },
      { title: "Conversas", url: "#conversas", icon: MessageSquare },
      { title: "Erros", url: "#erros", icon: AlertCircle },
      { title: "Feedbacks", url: "/app/admin/feedbacks", icon: Lightbulb, superAdminOnly: true },
      { title: "Ranking de uso", url: "/app/admin/ranking", icon: Trophy, superAdminOnly: true },
    ],
  },
  {
    key: "produto",
    label: "PRODUTO",
    subtitle: "Configurar o sistema",
    icon: Boxes,
    items: [
      { title: "Planos", url: "/app/admin/plans", icon: CreditCard, badge: "NOVO" },
      { title: "Assentos", url: "/app/admin/agent-costs", icon: Sparkles, badge: "NOVO" },
      { title: "Auditoria", url: "/app/admin/credits-audit", icon: CreditCard, badge: "NOVO" },
      { title: "Ofertas Hubla", url: "#hubla", icon: Package },
      { title: "Vendas s/ mapeamento", url: "#vendas", icon: AlertTriangle },
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
      { title: "Nutricionistas", url: "/app/admin/users", icon: Stethoscope },
      { title: "Administradores", url: "/app/admin/administrators", icon: Shield, badge: "NOVO" },
      { title: "Sistema", url: "/app/admin/system", icon: SettingsIcon, superAdminOnly: true, badge: "NOVO" },
    ],
  },
  {
    key: "ajuda",
    label: "AJUDA & SUPORTE",
    subtitle: "Documentação e termos",
    icon: LifeBuoy,
    items: [
      { title: "Políticas e Termos", url: "/app/politicas", icon: FileText },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user, profile, role, signOut } = useAuth();
  const creditsQuery = useMyCredits();
  const credits = creditsQuery.data;
  const balance = credits?.balance ?? 0;
  const unlimited = !!(credits as any)?.unlimited;
  const lowCredits = !unlimited && balance < LOW_CREDIT_THRESHOLD;
  const navigate = useNavigate();
  const currentPath = useRouterState({ select: (r) => r.location.pathname });

  const [open, setOpen] = useState<Record<string, boolean>>({
    visao: true,
    nutri: true,
    ajuda: true,
    operacao: true,
    produto: true,
    acesso: true,
  });

  const [planType, setPlanType] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (supabase as any)
      .from("subscriptions")
      .select("plan_type")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }: any) => setPlanType(data?.plan_type ?? null));
  }, [user]);

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  const isActive = (item: NavItem) => {
    if (item.matchPrefix) {
      return currentPath === item.matchPrefix || currentPath.startsWith(item.matchPrefix + "/");
    }
    if (item.url.startsWith("#")) return false;
    if (item.exact) return currentPath === item.url;
    return currentPath === item.url || (item.url !== "/app" && currentPath.startsWith(item.url + "/"));
  };

  return (
    <Sidebar
      className="border-r border-white/10 lumma-sidebar"
    >
      <SidebarHeader className="px-5 pt-6 pb-4">
        {collapsed ? (
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-brand" />
            {role !== "super_admin" && (
              <CreditsBadge collapsed balance={balance} unlimited={unlimited} isLoading={creditsQuery.isLoading} />
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-end gap-2">
              <img src={lummaLockup} alt="Lumma" className="h-7" />
              <span className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground pb-[3px]">
                {role === "nutri" ? "Nutri" : "Admin"}
              </span>
            </div>
              {role !== "super_admin" && (
                <CreditsBadge balance={balance} unlimited={unlimited} isLoading={creditsQuery.isLoading} />
              )}
          </div>
        )}

      </SidebarHeader>

      <SidebarContent className="px-3 gap-1">
        {role === "nutri" && (
          <div className={cn("px-1 pb-2", collapsed && "px-0")}>
            <Link to="/app/fale-com-lumma" title="Fale com a Lumma">
              <span
                className={cn(
                  "flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white shadow-sm hover:opacity-90 transition",
                  collapsed && "justify-center px-0 py-2",
                )}
              >
                <Sparkles className="h-4 w-4 shrink-0" />
                {!collapsed && <span>Fale com a Lumma</span>}
              </span>
            </Link>
          </div>
        )}
        {(role === "nutri" ? nutriGroups : adminGroups).map((g) => {
          const visibleItems = g.items.filter(
            (item) => !item.superAdminOnly || role === "super_admin",
          );
          if (visibleItems.length === 0) return null;
          return (
            <div key={g.key} className="py-2">
              <div
                className={cn(
                  "w-full flex items-center gap-3 px-2 py-2",
                  collapsed && "justify-center",
                )}
              >
                <g.icon className="h-4 w-4 text-white/70 shrink-0" />
                {!collapsed && (
                  <div className="flex-1 text-left">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/90">
                      {g.label}
                    </div>
                    <div className="text-[11px] text-white/55 leading-tight">
                      {g.subtitle}
                    </div>
                  </div>
                )}
              </div>

              {true && (
                <ul className="mt-1 space-y-0.5">
                  {visibleItems.map((item) => {
                    const active = isActive(item);
                    const content = (
                      <span
                        className={cn(
                          "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                          active
                            ? "bg-white/15 text-white font-medium"
                            : "text-white/75 hover:bg-white/10 hover:text-white",
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
                              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-white/15 text-white">
                                {item.badge}
                              </span>
                            )}
                          </>
                        )}
                      </span>
                    );

                    return (
                      <li key={`${item.title}-${item.url}`}>
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

      <SidebarFooter className="border-t border-white/10 p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "w-full flex items-center gap-3 rounded-xl p-2 hover:bg-white/10 transition-colors",
                collapsed && "justify-center",
              )}
              title={profile?.email}
            >
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarImage src={profile?.avatar_url ?? undefined} />
                <AvatarFallback className="bg-gradient-brand text-white text-xs font-semibold">
                  {(profile?.full_name || profile?.email || "U").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-sm font-medium text-white truncate">
                      {profile?.full_name || profile?.email || "Usuário"}
                    </div>
                    <div className="text-[11px] text-white/60 truncate">
                      {role === "super_admin" ? "Analista e Desenvolvedor" : `Plano ${planLabel(planType)}`}
                    </div>

                  </div>
                  <ChevronsUpDown className="h-4 w-4 text-white/60 shrink-0" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-60 rounded-2xl p-2 shadow-lg">
            <div className="px-3 pt-2 pb-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                {role === "super_admin" ? "Super Admin" : role === "admin" ? "Administrador" : "Nutricionista"}
              </p>
              <p className="text-sm font-medium mt-1 break-all">{profile?.email}</p>
            </div>
            {role !== "super_admin" && (
              <div className="px-3 pb-2">
                <div className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2">
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Coins className="h-3.5 w-3.5" />
                    Créditos
                  </span>
                  <span
                    className={
                      unlimited
                        ? "text-sm font-semibold bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] bg-clip-text text-transparent"
                        : lowCredits
                          ? "text-sm font-semibold text-destructive"
                          : "text-sm font-semibold text-foreground"
                    }
                  >
                    {unlimited ? "Ilimitado" : balance.toLocaleString("pt-BR")}
                  </span>
                </div>
                {lowCredits && (
                  <button
                    type="button"
                    onClick={() => topUpStore.open()}
                    className="mt-2 w-full flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 hover:bg-destructive/15 transition px-2.5 py-2 text-[11px] text-destructive text-left"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>Saldo baixo. Clique aqui para recarregar.</span>
                  </button>
                )}
              </div>
            )}

            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="rounded-lg gap-3 cursor-pointer py-2.5"
              onClick={() => navigate({ to: "/app/settings", search: { tab: "identity" } as any })}
            >
              <UserIcon className="h-4 w-4" />
              Meu perfil
            </DropdownMenuItem>
            <DropdownMenuItem
              className="rounded-lg gap-3 cursor-pointer py-2.5"
              onClick={() => navigate({ to: "/app/settings" })}
            >
              <SettingsIcon className="h-4 w-4" />
              Configurações
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="rounded-lg gap-3 cursor-pointer py-2.5 text-destructive focus:text-destructive"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
