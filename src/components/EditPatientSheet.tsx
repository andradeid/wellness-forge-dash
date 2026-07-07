import { useEffect, useRef, useState, type FormEvent } from "react";
import { Camera, Loader2 } from "lucide-react";
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeExtension } from "@/lib/sanitize-filename";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface EditablePatient {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  birth_date?: string | null;
  gender?: "male" | "female" | null;
  notes?: string | null;
  avatar_url?: string | null;
  menstrual_cycle_phase?: string | null;
  is_pregnant?: boolean;
  gestational_weeks?: number | null;
  pregnancy_type?: "single" | "multiple" | null;
}

interface Props {
  patient: EditablePatient | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function EditPatientSheet({ patient, open, onOpenChange, onSaved }: Props) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<EditablePatient["gender"]>(null);
  const [notes, setNotes] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [menstrualCyclePhase, setMenstrualCyclePhase] = useState<string>("");
  const [isPregnant, setIsPregnant] = useState(false);
  const [gestationalWeeks, setGestationalWeeks] = useState<string>("");
  const [pregnancyType, setPregnancyType] = useState<"single" | "multiple" | "">("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!patient) return;
    setName(patient.name ?? "");
    setEmail(patient.email ?? "");
    setPhone(patient.phone ?? "");
    setBirthDate(patient.birth_date ?? "");
    setGender(patient.gender ?? null);
    setNotes(patient.notes ?? "");
    setAvatarUrl(patient.avatar_url ?? null);
    setMenstrualCyclePhase(patient.menstrual_cycle_phase ?? "");
    setIsPregnant(patient.is_pregnant ?? false);
    setGestationalWeeks(patient.gestational_weeks ? String(patient.gestational_weeks) : "");
    setPregnancyType((patient.pregnancy_type as "single" | "multiple") ?? "");
  }, [patient]);

  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !patient) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("A imagem deve ter no máximo 5MB");
      return;
    }
    setUploading(true);
    const ext = sanitizeExtension(file.name.split(".").pop() || "jpg") || "jpg";
    const path = `${patient.id}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("patient-photos")
      .upload(path, file, { upsert: true, cacheControl: "3600" });
    if (upErr) {
      toast.error(upErr.message);
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from("patient-photos").getPublicUrl(path);
    setAvatarUrl(data.publicUrl);
    setUploading(false);
    toast.success("Foto carregada — lembre-se de salvar.");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!patient || !user) return;

    // Trava de segurança clínica: gestante exige trimestre + tipo
    if (gender === "female" && isPregnant) {
      const weeks = parseInt(gestationalWeeks);
      if (!gestationalWeeks || isNaN(weeks) || weeks < 1 || weeks > 42) {
        toast.error("Informe as semanas gestacionais (1 a 42) antes de salvar.");
        return;
      }
      if (pregnancyType !== "single" && pregnancyType !== "multiple") {
        toast.error("Selecione o tipo de gestação (única ou gemelar) antes de salvar.");
        return;
      }
    }

    setSaving(true);
    const { error } = await (supabase as any)
      .from("patients")
      .update({
        name: name.trim(),
        email: email.trim() || null,
        phone: phone.trim() || null,
        birth_date: birthDate || null,
        gender,
        notes: notes.trim() || null,
        avatar_url: avatarUrl,
        is_pregnant: gender === "female" ? isPregnant : false,
        gestational_weeks: gender === "female" && isPregnant ? (parseInt(gestationalWeeks) || null) : null,
        pregnancy_type: gender === "female" && isPregnant ? pregnancyType : null,
        menstrual_cycle_phase: gender === "female" && !isPregnant ? menstrualCyclePhase : null,
      })
      .eq("id", patient.id)
      .eq("created_by", user.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Dados atualizados com sucesso!");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Editar Paciente</SheetTitle>
          <SheetDescription>
            Atualize as informações do paciente. As alterações são salvas com segurança.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-5 mt-6">
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <Avatar className="h-24 w-24 ring-2 ring-offset-2 ring-[#e8a04c]/40">
                <AvatarImage src={avatarUrl ?? undefined} alt={name} />
                <AvatarFallback className="bg-gradient-to-br from-[#e8a04c] to-[#e89bcf] text-white text-xl">
                  {initials || "?"}
                </AvatarFallback>
              </Avatar>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white shadow-md flex items-center justify-center hover:opacity-90 disabled:opacity-50"
                aria-label="Alterar foto"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoChange}
              />
            </div>
            <p className="text-xs text-muted-foreground">PNG ou JPG, até 5MB</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ep-name">Nome completo</Label>
            <Input id="ep-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="ep-email">E-mail</Label>
              <Input id="ep-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ep-phone">Telefone</Label>
              <Input id="ep-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(00) 00000-0000" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="ep-birth">Data de nascimento</Label>
              <Input id="ep-birth" type="date" value={birthDate ?? ""} onChange={(e) => setBirthDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Gênero</Label>
              <Select value={gender ?? undefined} onValueChange={(v) => setGender(v as EditablePatient["gender"])}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="female">Feminino</SelectItem>
                  <SelectItem value="male">Masculino</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {gender === "female" && (
            <div className="space-y-4 p-4 rounded-xl bg-[#f7f5f0]/50 border border-muted/50 animate-in fade-in duration-300">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Paciente está gestante?</Label>
                <div className="flex bg-white rounded-lg p-1 border border-muted shadow-sm">
                  <button
                    type="button"
                    onClick={() => setIsPregnant(false)}
                    className={cn(
                      "px-4 py-1.5 text-xs font-medium rounded-md transition-all",
                      !isPregnant
                        ? "bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white shadow-sm"
                        : "text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    Não
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPregnant(true)}
                    className={cn(
                      "px-4 py-1.5 text-xs font-medium rounded-md transition-all",
                      isPregnant
                        ? "bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white shadow-sm"
                        : "text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    Sim
                  </button>
                </div>
              </div>

              {isPregnant && (
                <div className="grid grid-cols-2 gap-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="space-y-1.5">
                    <Label htmlFor="ep-weeks" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Semanas</Label>
                    <Input
                      id="ep-weeks"
                      type="number"
                      min="1"
                      max="42"
                      value={gestationalWeeks}
                      onChange={(e) => setGestationalWeeks(e.target.value)}
                      placeholder="Ex: 24"
                      className="rounded-xl h-11 bg-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tipo</Label>
                    <Select value={pregnancyType || undefined} onValueChange={(v) => setPregnancyType(v as "single" | "multiple")}>
                      <SelectTrigger className="rounded-xl h-11 bg-white"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="single">Única (monofetal)</SelectItem>
                        <SelectItem value="multiple">Gemelar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}

          {gender === "female" && !isPregnant && (
            <div className="space-y-2 animate-in fade-in duration-300">
              <Label>Fase do Ciclo Menstrual</Label>
              <Select value={menstrualCyclePhase || "nao_sei"} onValueChange={setMenstrualCyclePhase}>
                <SelectTrigger><SelectValue placeholder="Não sei" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="folicular">Folicular</SelectItem>
                  <SelectItem value="ovulatoria">Ovulatória</SelectItem>
                  <SelectItem value="lutea">Lútea</SelectItem>
                  <SelectItem value="nao_menstrua">Paciente não menstrua</SelectItem>
                  <SelectItem value="menopausa">Paciente na menopausa</SelectItem>
                  <SelectItem value="nao_sei">Não sei</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="ep-notes">Notas adicionais</Label>
            <Textarea
              id="ep-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Observações clínicas, alergias, preferências..."
            />
          </div>

          <SheetFooter className="gap-2 sm:gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="rounded-full"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                saving ||
                uploading ||
                (gender === "female" && isPregnant && (!gestationalWeeks || (pregnancyType !== "single" && pregnancyType !== "multiple")))
              }
              className="rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white border-0 hover:opacity-90 shadow-md"
            >
              {saving ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...</>
              ) : "Salvar alterações"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
