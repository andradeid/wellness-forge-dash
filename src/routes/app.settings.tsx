import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import {
  Camera,
  Loader2,
  ExternalLink,
  ShieldCheck,
  User,
  Sparkles,
  CreditCard,
  Palette,
  ImageIcon,
  Printer,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BrandingDocumentPreview } from "@/components/branding/BrandingDocumentPreview";
import { PRONOUN_OPTIONS } from "@/hooks/useBrandingProfile";

export const Route = createFileRoute("/app/settings")({
  component: SettingsPage,
});


const HUBLA_PORTAL_URL = "https://app.hub.la/customer/subscriptions";

type Subscription = {
  plan_type: "free" | "basic" | "pro";
  status: string;
  current_period_end: string;
};

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

const planLabel = (p?: string | null) =>
  p === "pro" ? "Master" : p === "basic" ? "Essencial" : "Gratuito";

function SettingsPage() {
  const { user, profile, refresh } = useAuth();
  const [tab, setTab] = useState<string>("identity");

  // Identity
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [crn, setCrn] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [aiTone, setAiTone] = useState<"technical" | "educational">("educational");
  const [uploading, setUploading] = useState(false);
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [savingTone, setSavingTone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Security
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);

  // Branding
  const [pronoun, setPronoun] = useState<string>("");
  const [clinicName, setClinicName] = useState("");
  const [clinicLogoUrl, setClinicLogoUrl] = useState<string>("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingBranding, setSavingBranding] = useState(false);
  const logoFileRef = useRef<HTMLInputElement>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // Subscription
  const [sub, setSub] = useState<Subscription | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("profiles")
        .select(
          "full_name, email, phone, avatar_url, professional_id, ai_tone, pronoun, clinic_name, clinic_logo_url",
        )
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setFullName(data.full_name ?? "");
        setEmail(data.email ?? user.email ?? "");
        setPhone(data.phone ?? "");
        setCrn(data.professional_id ?? "");
        setAvatarUrl(data.avatar_url ?? "");
        setAiTone((data.ai_tone as any) ?? "educational");
        setPronoun(data.pronoun ?? "");
        setClinicName(data.clinic_name ?? "");
        setClinicLogoUrl(data.clinic_logo_url ?? "");
      }
      const { data: s } = await (supabase as any)
        .from("subscriptions")
        .select("plan_type, status, current_period_end")
        .eq("user_id", user.id)
        .maybeSingle();
      if (s) setSub(s as Subscription);
    })();
  }, [user]);


  const handleUpload = async (file: File) => {
    if (!user) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      setAvatarUrl(data.publicUrl);
      await (supabase as any).from("profiles").update({ avatar_url: data.publicUrl }).eq("id", user.id);
      await refresh();
      toast.success("Foto atualizada.");
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao enviar foto");
    } finally {
      setUploading(false);
    }
  };

  const saveIdentity = async () => {
    if (!user) return;
    setSavingIdentity(true);
    try {
      const { error } = await (supabase as any)
        .from("profiles")
        .update({ full_name: fullName, phone, professional_id: crn })
        .eq("id", user.id);
      if (error) throw error;
      await refresh();
      toast.success("Dados salvos com sucesso.");
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao salvar");
    } finally {
      setSavingIdentity(false);
    }
  };

  const saveTone = async (v: "technical" | "educational") => {
    if (!user) return;
    setAiTone(v);
    setSavingTone(true);
    try {
      const { error } = await (supabase as any)
        .from("profiles")
        .update({ ai_tone: v })
        .eq("id", user.id);
      if (error) throw error;
      toast.success("Preferência da Lumma atualizada.");
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao salvar preferência");
    } finally {
      setSavingTone(false);
    }
  };

  const changePassword = async () => {
    if (newPwd.length < 8) {
      toast.error("A nova senha deve ter ao menos 8 caracteres.");
      return;
    }
    if (newPwd !== confirmPwd) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setSavingPwd(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;
      setNewPwd("");
      setConfirmPwd("");
      toast.success("Senha atualizada com sucesso.");
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao trocar senha");
    } finally {
      setSavingPwd(false);
    }
  };

  const initials = (fullName || email).slice(0, 2).toUpperCase();
  const statusLabel =
    sub?.status === "active" ? "Ativa"
    : sub?.status === "trial" ? "Em teste"
    : sub?.status === "past_due" ? "Pagamento pendente"
    : sub?.status === "canceled" ? "Cancelada" : "—";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header>
        <h1 className="font-serif text-3xl">Minha conta</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie suas informações, segurança, assinatura e preferências da Lumma.
        </p>
      </header>

      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList className="rounded-full p-1 bg-muted/60">
          <TabsTrigger value="identity" className="rounded-full gap-2"><User className="h-4 w-4" />Identidade</TabsTrigger>
          <TabsTrigger value="security" className="rounded-full gap-2"><ShieldCheck className="h-4 w-4" />Segurança</TabsTrigger>
          <TabsTrigger value="subscription" className="rounded-full gap-2"><CreditCard className="h-4 w-4" />Assinatura</TabsTrigger>
          <TabsTrigger value="ai" className="rounded-full gap-2"><Sparkles className="h-4 w-4" />Preferências da IA</TabsTrigger>
        </TabsList>

        {/* IDENTIDADE */}
        <TabsContent value="identity">
          <Card className="rounded-2xl shadow-md border-0">
            <CardHeader>
              <CardTitle className="font-serif text-2xl font-normal">Identidade</CardTitle>
              <CardDescription>Atualize seus dados pessoais e foto de perfil.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-5">
                <div className="relative">
                  <Avatar className="h-20 w-20 border-2 border-background shadow-sm">
                    <AvatarImage src={avatarUrl} />
                    <AvatarFallback className="bg-gradient-brand text-white font-semibold">{initials}</AvatarFallback>
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
                  <p className="text-[11px] text-muted-foreground mt-2">PNG ou JPG, até ~5MB.</p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="full_name">Nome completo</Label>
                  <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="rounded-lg" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" value={email} readOnly disabled className="rounded-lg bg-muted/40" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} placeholder="(11) 91234-5678" className="rounded-lg" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="crn">Registro profissional (CRN)</Label>
                  <Input id="crn" value={crn} onChange={(e) => setCrn(e.target.value)} placeholder="CRN-3 12345" className="rounded-lg" />
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={saveIdentity}
                  disabled={savingIdentity}
                  className="rounded-full bg-gradient-brand text-white hover:opacity-90 border-0"
                >
                  {savingIdentity && <Loader2 className="h-4 w-4 animate-spin" />}
                  Salvar alterações
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SEGURANÇA */}
        <TabsContent value="security">
          <Card className="rounded-2xl shadow-md border-0">
            <CardHeader>
              <CardTitle className="font-serif text-2xl font-normal">Segurança</CardTitle>
              <CardDescription>Atualize sua senha de acesso ao painel.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-w-md">
              <div className="space-y-2">
                <Label htmlFor="new_pwd">Nova senha</Label>
                <Input id="new_pwd" type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} className="rounded-lg" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm_pwd">Confirmar nova senha</Label>
                <Input id="confirm_pwd" type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} className="rounded-lg" />
              </div>
              <p className="text-xs text-muted-foreground">Use ao menos 8 caracteres. Recomendamos misturar letras, números e símbolos.</p>
              <div className="flex justify-end pt-2">
                <Button
                  onClick={changePassword}
                  disabled={savingPwd}
                  className="rounded-full bg-gradient-brand text-white hover:opacity-90 border-0"
                >
                  {savingPwd && <Loader2 className="h-4 w-4 animate-spin" />}
                  Atualizar senha
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ASSINATURA */}
        <TabsContent value="subscription">
          <Card className="rounded-2xl shadow-md border-0 overflow-hidden">
            <div className="bg-gradient-brand p-6 text-white">
              <p className="text-xs uppercase tracking-[0.22em] opacity-90">Plano atual</p>
              <h2 className="font-serif text-3xl mt-1">{planLabel(sub?.plan_type)}</h2>
              <div className="flex items-center gap-2 mt-3">
                <Badge className="bg-white/20 text-white border-0 rounded-full">{statusLabel}</Badge>
                {sub?.current_period_end && (
                  <span className="text-xs opacity-90">
                    Próxima renovação: {new Date(sub.current_period_end).toLocaleDateString("pt-BR")}
                  </span>
                )}
              </div>
            </div>
            <CardContent className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                Sua assinatura é gerenciada pela Hubla. Acesse o portal para trocar de plano,
                atualizar forma de pagamento ou baixar faturas.
              </p>
              <Button
                asChild
                className="rounded-full bg-gradient-brand text-white hover:opacity-90 border-0"
              >
                <a href={HUBLA_PORTAL_URL} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Gerenciar assinatura na Hubla
                </a>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PREFERÊNCIAS DA IA */}
        <TabsContent value="ai">
          <Card className="rounded-2xl shadow-md border-0">
            <CardHeader>
              <CardTitle className="font-serif text-2xl font-normal">Preferências da Lumma</CardTitle>
              <CardDescription>
                Defina o tom dos laudos e respostas geradas pela Lumma.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={aiTone}
                onValueChange={(v) => saveTone(v as any)}
                className="grid sm:grid-cols-2 gap-4"
              >
                <label
                  htmlFor="tone-technical"
                  className={`cursor-pointer rounded-2xl border p-5 transition-all ${aiTone === "technical" ? "border-transparent ring-2 ring-offset-2 ring-[#e8a04c]" : "hover:bg-muted/40"}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">Mais técnico</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Linguagem clínica, terminologia precisa e referências bioquímicas.
                      </p>
                    </div>
                    <RadioGroupItem id="tone-technical" value="technical" />
                  </div>
                </label>
                <label
                  htmlFor="tone-educational"
                  className={`cursor-pointer rounded-2xl border p-5 transition-all ${aiTone === "educational" ? "border-transparent ring-2 ring-offset-2 ring-[#e89bcf]" : "hover:bg-muted/40"}`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">Mais educativo / simples</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Explicações acessíveis, ideais para compartilhar com o paciente.
                      </p>
                    </div>
                    <RadioGroupItem id="tone-educational" value="educational" />
                  </div>
                </label>
              </RadioGroup>
              {savingTone && (
                <p className="text-xs text-muted-foreground mt-3 flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Salvando preferência...
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
