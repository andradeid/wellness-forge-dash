import { useEffect, useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export interface ProfileDialogValue {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  is_blocked?: boolean;
}

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: ProfileDialogValue;
  /** When true, show is_blocked toggle (super admin editing another user). */
  showBlockToggle?: boolean;
  /** When true, email field is read-only (editing self). */
  emailReadOnly?: boolean;
  onSaved?: () => void;
}

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10)
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function ProfileDialog({
  open,
  onOpenChange,
  value,
  showBlockToggle = false,
  emailReadOnly = false,
  onSaved,
}: ProfileDialogProps) {
  const [fullName, setFullName] = useState(value.full_name ?? "");
  const [email, setEmail] = useState(value.email);
  const [phone, setPhone] = useState(value.phone ?? "");
  const [avatarUrl, setAvatarUrl] = useState(value.avatar_url ?? "");
  const [isBlocked, setIsBlocked] = useState(!!value.is_blocked);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setFullName(value.full_name ?? "");
      setEmail(value.email);
      setPhone(value.phone ?? "");
      setAvatarUrl(value.avatar_url ?? "");
      setIsBlocked(!!value.is_blocked);
    }
  }, [open, value]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${value.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setAvatarUrl(data.publicUrl);
      toast.success("Foto enviada com sucesso.");
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao enviar foto");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const update: any = {
        full_name: fullName,
        phone,
        avatar_url: avatarUrl || null,
      };
      if (showBlockToggle) update.is_blocked = isBlocked;
      const { error } = await (supabase as any)
        .from("profiles")
        .update(update)
        .eq("id", value.id);
      if (error) throw error;
      toast.success("Perfil atualizado.");
      onOpenChange(false);
      onSaved?.();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const initials = (fullName || email).slice(0, 2).toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl font-normal">
            Editar perfil
          </DialogTitle>
          <DialogDescription>
            Atualize as informações pessoais e a foto de perfil.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="h-20 w-20 border-2 border-background shadow-sm">
                <AvatarImage src={avatarUrl} />
                <AvatarFallback className="bg-gradient-brand text-white font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              {uploading && (
                <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 text-white animate-spin" />
                </div>
              )}
            </div>
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                <Camera className="h-4 w-4" />
                {uploading ? "Enviando..." : "Trocar foto"}
              </Button>
              <p className="text-[11px] text-muted-foreground mt-2">
                PNG, JPG até ~5MB.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="full_name">Nome completo</Label>
            <Input
              id="full_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="rounded-lg"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={emailReadOnly}
              readOnly={emailReadOnly}
              className={cn("rounded-lg", emailReadOnly && "bg-muted/40")}
            />
            {emailReadOnly && (
              <p className="text-[11px] text-muted-foreground">
                A alteração de e-mail é feita pelo Supabase Auth.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Telefone</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(maskPhone(e.target.value))}
              placeholder="(11) 91234-5678"
              className="rounded-lg"
            />
          </div>

          {showBlockToggle && (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Bloquear acesso</p>
                <p className="text-xs text-muted-foreground">
                  Usuários bloqueados não conseguem entrar no painel.
                </p>
              </div>
              <Switch checked={isBlocked} onCheckedChange={setIsBlocked} />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-full"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || uploading}
            className="rounded-full bg-gradient-brand text-white hover:opacity-90 border-0"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
