import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ChevronDown, Coins, ExternalLink, LogOut, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { useMyCredits } from "@/hooks/useCredits";
import { ProfileDialog } from "@/components/ProfileDialog";
import { topUpStore } from "@/lib/topup-store";

const LOW_CREDIT_THRESHOLD = 20;

export function UserMenu() {
  const { user, profile, role, signOut, refresh } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const { data: credits } = useMyCredits();
  const balance = credits?.balance ?? 0;
  const lowCredits = balance < LOW_CREDIT_THRESHOLD;

  const email = profile?.email ?? user?.email ?? "";
  const initials = (profile?.full_name || email).slice(0, 2).toUpperCase();
  const roleLabel =
    role === "super_admin"
      ? "Super Admin"
      : role === "admin"
        ? "Administrador"
        : "Nutricionista";

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1 hover:bg-muted/60 transition-colors">
            <Avatar className="h-8 w-8">
              <AvatarImage src={profile?.avatar_url ?? undefined} />
              <AvatarFallback className="bg-gradient-brand text-white text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <span className="hidden sm:inline text-sm font-medium text-foreground max-w-[160px] truncate">
              {profile?.full_name || email}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-72 rounded-2xl p-2 shadow-lg"
        >
          <div className="px-3 pt-3 pb-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {roleLabel}
            </p>
            <p className="text-sm font-medium text-foreground mt-1 break-all">
              {email}
            </p>
          </div>
          <div className="px-3 pb-2">
            <div className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2">
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Coins className="h-3.5 w-3.5" />
                Créditos
              </span>
              <span
                className={
                  lowCredits
                    ? "text-sm font-semibold text-destructive"
                    : "text-sm font-semibold text-foreground"
                }
              >
                {balance.toLocaleString("pt-BR")}
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
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="rounded-lg gap-3 cursor-pointer py-2.5"
            onClick={() => setEditing(true)}
          >
            <User className="h-4 w-4" />
            Meu perfil
          </DropdownMenuItem>
          <DropdownMenuItem
            className="rounded-lg gap-3 cursor-pointer py-2.5"
            onClick={() => navigate({ to: "/app" })}
          >
            <ExternalLink className="h-4 w-4" />
            Voltar ao app
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

      {user && (
        <ProfileDialog
          open={editing}
          onOpenChange={setEditing}
          emailReadOnly
          value={{
            id: user.id,
            full_name: profile?.full_name ?? null,
            email,
            phone: (profile as any)?.phone ?? null,
            avatar_url: profile?.avatar_url ?? null,
          }}
          onSaved={refresh}
        />
      )}
    </>
  );
}
