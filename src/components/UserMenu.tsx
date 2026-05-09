import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, ExternalLink, LogOut, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { ProfileDialog } from "@/components/ProfileDialog";

export function UserMenu() {
  const { user, profile, role, signOut, refresh } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);

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
