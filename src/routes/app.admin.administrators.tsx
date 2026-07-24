import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  Search,
  Shield,
  Trash2,
  UserPlus,
  Loader2,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ProfileDialog, type ProfileDialogValue } from "@/components/ProfileDialog";

export const Route = createFileRoute("/app/admin/administrators")({
  component: AdministratorsPage,
});

interface AdminRow {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  is_blocked: boolean;
  promoted_at: string;
  role: "admin" | "super_admin" | "support";
}

function AdministratorsPage() {
  const { user, role } = useAuth();
  const isSuperAdmin = role === "super_admin";

  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [editing, setEditing] = useState<ProfileDialogValue | null>(null);
  const [deleting, setDeleting] = useState<AdminRow | null>(null);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [promoteEmail, setPromoteEmail] = useState("");
  const [promoting, setPromoting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: roleRows, error: rErr } = await (supabase as any)
      .from("user_roles")
      .select("user_id, created_at, role")
      .in("role", ["admin", "super_admin", "support"]);
    if (rErr) {
      toast.error(rErr.message);
      setLoading(false);
      return;
    }
    const ids = (roleRows ?? []).map((r: any) => r.user_id);
    if (ids.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { data: profiles, error: pErr } = await (supabase as any)
      .from("profiles")
      .select("id, full_name, email, phone, avatar_url, is_blocked")
      .in("id", ids);
    if (pErr) {
      toast.error(pErr.message);
      setLoading(false);
      return;
    }
    const promoMap = new Map<string, { created_at: string; role: AdminRow["role"] }>();
    // priority: super_admin > admin > support
    const priority: Record<string, number> = { super_admin: 3, admin: 2, support: 1 };
    (roleRows ?? []).forEach((r: any) => {
      const existing = promoMap.get(r.user_id);
      if (!existing || priority[r.role] > priority[existing.role]) {
        promoMap.set(r.user_id, { created_at: r.created_at, role: r.role });
      }
    });
    const merged: AdminRow[] = (profiles ?? []).map((p: any) => ({
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      phone: p.phone,
      avatar_url: p.avatar_url,
      is_blocked: !!p.is_blocked,
      promoted_at: promoMap.get(p.id)?.created_at ?? "",
      role: promoMap.get(p.id)?.role ?? "admin",
    }));
    setRows(
      merged.sort((a, b) =>
        (a.promoted_at || "").localeCompare(b.promoted_at || ""),
      ),
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        (r.full_name ?? "").toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const handleRevoke = async (row: AdminRow) => {
    const { error } = await (supabase as any)
      .from("user_roles")
      .delete()
      .eq("user_id", row.id)
      .eq("role", row.role);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Acesso removido.");
    setDeleting(null);
    load();
  };

  const handlePromote = async () => {
    if (!promoteEmail.trim()) return;
    setPromoting(true);
    try {
      const { data: prof, error: pErr } = await (supabase as any)
        .from("profiles")
        .select("id, email")
        .eq("email", promoteEmail.trim().toLowerCase())
        .maybeSingle();
      if (pErr) throw pErr;
      if (!prof) {
        toast.error("Usuário não encontrado. Peça para se cadastrar primeiro.");
        return;
      }
      const { error: insErr } = await (supabase as any)
        .from("user_roles")
        .insert({ user_id: prof.id, role: "admin" });
      if (insErr) throw insErr;
      toast.success("Usuário promovido a administrador.");
      setPromoteOpen(false);
      setPromoteEmail("");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao promover");
    } finally {
      setPromoting(false);
    }
  };

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="mb-4 flex items-end justify-between gap-6 flex-wrap">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <span>Acesso</span>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground/80">Administradores</span>
          </div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
            Administradores
          </h1>
        </div>
        {isSuperAdmin && (
          <Button
            onClick={() => setPromoteOpen(true)}
            className="rounded-full bg-gradient-brand text-white border-0 hover:opacity-90 px-5 h-11 shadow-md"
          >
            <UserPlus className="h-4 w-4" />
            Promover novo admin
          </Button>
        )}
      </div>

      {/* Lista */}
      <Card className="rounded-2xl border bg-card shadow-sm">
        <CardContent className="p-6 space-y-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-muted-foreground">
              {rows.length} administrador(es)
            </p>
            <div className="relative w-72 max-w-full">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 rounded-full"
              />
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <div className="h-12 w-12 mx-auto rounded-2xl bg-accent/60 flex items-center justify-center mb-4">
                <Shield className="h-6 w-6 text-accent-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                Nenhum administrador encontrado.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12"></TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Nome
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Email
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Telefone
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Papel
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Status
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Promovido em
                  </TableHead>
                  <TableHead className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground text-right">
                    Ações
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const isSelf = r.id === user?.id;
                  const initials = (r.full_name || r.email)
                    .slice(0, 2)
                    .toUpperCase();
                  return (
                    <TableRow key={r.id} className="border-b last:border-0">
                      <TableCell>
                        <Avatar className="h-9 w-9">
                          <AvatarImage src={r.avatar_url ?? undefined} />
                          <AvatarFallback className="bg-muted text-xs">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                      </TableCell>
                      <TableCell className="font-medium">
                        {r.full_name || "—"}
                        {isSelf && (
                          <span className="text-muted-foreground ml-1">
                            (você)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.email}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.phone || "—"}
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const map = {
                            super_admin: { label: "Super Admin", cls: "border-violet-200 text-violet-700 bg-violet-50" },
                            admin: { label: "Admin", cls: "border-sky-200 text-sky-700 bg-sky-50" },
                            support: { label: "Suporte (CS)", cls: "border-amber-200 text-amber-700 bg-amber-50" },
                          } as const;
                          const cfg = map[r.role];
                          return (
                            <Badge variant="outline" className={`rounded-full ${cfg.cls}`}>
                              {cfg.label}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        {r.is_blocked ? (
                          <Badge
                            variant="outline"
                            className="rounded-full border-destructive/30 text-destructive bg-destructive/5"
                          >
                            Bloqueado
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="rounded-full border-emerald-200 text-emerald-700 bg-emerald-50"
                          >
                            Ativo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {r.promoted_at
                          ? new Date(r.promoted_at).toLocaleDateString("pt-BR")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {isSuperAdmin && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                              onClick={() =>
                                setEditing({
                                  id: r.id,
                                  full_name: r.full_name,
                                  email: r.email,
                                  phone: r.phone,
                                  avatar_url: r.avatar_url,
                                  is_blocked: r.is_blocked,
                                })
                              }
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {isSuperAdmin && !isSelf && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => setDeleting(r)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                          {isSelf && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 rounded-full text-muted-foreground/40 cursor-not-allowed"
                              disabled
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {!isSuperAdmin && (
        <p className="text-xs text-muted-foreground">
          Apenas Super Admins podem promover, editar ou remover administradores.{" "}
          <Link to="/app" className="underline">
            Voltar ao painel
          </Link>
        </p>
      )}

      {/* Edit profile dialog */}
      {editing && (
        <ProfileDialog
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          value={editing}
          showBlockToggle
          onSaved={load}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Remover administrador</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.full_name || deleting?.email} perderá o acesso ao
              painel administrativo. A conta do usuário não será excluída.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleting && handleRevoke(deleting)}
            >
              Remover acesso
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Promote dialog */}
      <Dialog open={promoteOpen} onOpenChange={setPromoteOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl font-normal">
              Promover novo administrador
            </DialogTitle>
            <DialogDescription>
              Informe o e-mail de um usuário já cadastrado na plataforma.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="promote_email">E-mail do usuário</Label>
            <Input
              id="promote_email"
              type="email"
              value={promoteEmail}
              onChange={(e) => setPromoteEmail(e.target.value)}
              placeholder="usuario@exemplo.com"
              className="rounded-lg"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPromoteOpen(false)}
              className="rounded-full"
            >
              Cancelar
            </Button>
            <Button
              onClick={handlePromote}
              disabled={promoting || !promoteEmail.trim()}
              className="rounded-full bg-gradient-brand text-white border-0 hover:opacity-90"
            >
              {promoting && <Loader2 className="h-4 w-4 animate-spin" />}
              Promover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
