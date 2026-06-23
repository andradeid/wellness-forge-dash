import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, MessageSquare, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { EditPatientSheet, type EditablePatient } from "@/components/EditPatientSheet";
import { BirthDatePicker } from "@/components/BirthDatePicker";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { QuickAnalysisDialog } from "@/components/QuickAnalysisDialog";

export const Route = createFileRoute("/app/patients")({
  component: PatientsPage,
});

interface Patient {
  id: string;
  name: string;
  birth_date: string | null;
  gender: "male" | "female" | "other" | null;
  created_at: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  notes: string | null;
  is_pregnant?: boolean;
  gestational_weeks?: number;
  pregnancy_type?: "single" | "multiple";
  menstrual_cycle_phase?: string | null;
}

function PatientsPage() {
  const { user } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const [name, setName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState<Patient["gender"]>(null);
  const [isPregnant, setIsPregnant] = useState(false);
  const [gestationalWeeks, setGestationalWeeks] = useState("");
  const [pregnancyType, setPregnancyType] = useState<"single" | "multiple">("single");
  const [menstrualCyclePhase, setMenstrualCyclePhase] = useState<string>("nao_sei");
  const [submitting, setSubmitting] = useState(false);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [deleteTarget, setDeleteTarget] = useState<Patient | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editTarget, setEditTarget] = useState<EditablePatient | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [examPatientIds, setExamPatientIds] = useState<Set<string>>(new Set());
  const [analyzedPatientIds, setAnalyzedPatientIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<"name" | "birth_date" | "created_at">("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [activeFilter, setActiveFilter] = useState<"all" | "pregnant" | "with_exams" | "no_analysis">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const toggleSort = (key: "name" | "birth_date" | "created_at") => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const askDelete = (p: Patient) => {
    setDeleteTarget(p);
    setDeleteStep(1);
  };

  const confirmDeletePatient = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const patientId = deleteTarget.id;
      const { data: chats } = await (supabase as any)
        .from("patient_chats")
        .select("id")
        .eq("patient_id", patientId);
      const chatIds = (chats ?? []).map((c: { id: string }) => c.id);

      await (supabase as any).from("patient_exam_results").delete().eq("patient_id", patientId);
      await (supabase as any).from("patient_exams").delete().eq("patient_id", patientId);
      if (chatIds.length > 0) {
        await (supabase as any).from("chat_messages").delete().in("chat_id", chatIds);
        await (supabase as any).from("patient_exams").delete().in("chat_id", chatIds);
        await (supabase as any).from("patient_chats").delete().in("id", chatIds);
      }

      const { error } = await (supabase as any)
        .from("patients")
        .delete()
        .eq("id", patientId);
      if (error) {
        toast.error(error.message);
        setDeleting(false);
        return;
      }

      setPatients((prev) => prev.filter((p) => p.id !== patientId));
      toast.success("Paciente excluído com sucesso");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao excluir paciente");
    } finally {
      setDeleting(false);
      setDeleteStep(0);
      setDeleteTarget(null);
    }
  };


  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("patients")
      .select("id, name, birth_date, gender, created_at, email, phone, avatar_url, notes, is_pregnant, gestational_weeks, pregnancy_type, menstrual_cycle_phase")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setPatients((data as Patient[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!birthDate) {
      toast.error("Selecione dia, mês e ano de nascimento");
      return;
    }
    setSubmitting(true);
    const { error } = await (supabase as any).from("patients").insert({
      created_by: user.id,
      name,
      birth_date: birthDate,
      gender,
      is_pregnant: gender === "female" ? isPregnant : false,
      gestational_weeks: gender === "female" && isPregnant ? parseInt(gestationalWeeks) || null : null,
      pregnancy_type: gender === "female" && isPregnant ? pregnancyType : null,
      menstrual_cycle_phase: gender === "female" && !isPregnant ? (menstrualCyclePhase || "nao_sei") : null,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Paciente cadastrado");
    setOpen(false);
    setName("");
    setBirthDate("");
    setGender(null);
    setIsPregnant(false);
    setGestationalWeeks("");
    setPregnancyType("single");
    setMenstrualCyclePhase("nao_sei");
    load();
  };

  const filtered = patients.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const genderLabel = (g: Patient["gender"]) =>
    g === "male" ? "Masculino" : g === "female" ? "Feminino" : g === "other" ? "Outro" : "—";

  return (
    <div className="space-y-6 max-w-6xl mx-auto px-3 sm:px-4 lg:px-0 overflow-x-hidden">
      <div className="flex flex-row items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-3xl font-semibold tracking-tight truncate">Pacientes</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 hidden sm:block">
            Bem-vinda ao Painel. Tudo em um só lugar — calmo, organizado, à mão.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <QuickAnalysisDialog 
            onCreated={load} 
            moduleContext="exames_de_sangue"
          />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                className="rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white border-0 hover:opacity-90 shadow-md h-10 sm:h-11 px-4 sm:px-6"
              >
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Novo Paciente</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-2xl border-0 shadow-xl">
              <div className="h-1.5 bg-gradient-to-r from-[#e8a04c] to-[#e89bcf]" />
              <div className="px-6 pt-6 pb-2 bg-gradient-to-b from-[#f7f5f0] to-white">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-[#e8a04c] to-[#e89bcf] flex items-center justify-center shadow-md">
                    <Plus className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <DialogHeader className="space-y-0 text-left">
                      <DialogTitle className="text-lg font-semibold tracking-tight text-foreground text-left">
                        Novo paciente
                      </DialogTitle>
                      <DialogDescription className="text-xs text-muted-foreground text-left">
                        Cadastre um paciente. Mais campos virão na criação do chat.
                      </DialogDescription>
                    </DialogHeader>
                  </div>
                </div>
              </div>
              <form onSubmit={handleCreate} className="space-y-4 px-6 pb-6 pt-2">
                <div className="space-y-1.5">
                  <Label htmlFor="p-name" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nome</Label>
                  <Input
                    id="p-name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nome completo"
                    className="rounded-xl h-11 bg-white border-muted focus-visible:ring-[#e8a04c]/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nascimento *</Label>
                  <BirthDatePicker value={birthDate} onChange={setBirthDate} />
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
                          <Label htmlFor="weeks" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Semanas</Label>
                          <Input
                            id="weeks"
                            type="number"
                            min="1"
                            max="42"
                            value={gestationalWeeks}
                            onChange={(e) => setGestationalWeeks(e.target.value)}
                            placeholder="Ex: 24"
                            className="rounded-xl h-11 bg-white border-muted focus-visible:ring-[#e8a04c]/30"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tipo</Label>
                          <Select value={pregnancyType ?? ""} onValueChange={(v) => setPregnancyType(v as "single" | "multiple")}>
                            <SelectTrigger className="rounded-xl h-11 bg-white border-muted focus:ring-[#e8a04c]/30">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="single">Única</SelectItem>
                              <SelectItem value="multiple">Gemelar</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {gender === "female" && !isPregnant && (
                  <div className="space-y-1.5 animate-in fade-in duration-300">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Fase do Ciclo Menstrual</Label>
                    <Select value={menstrualCyclePhase || "nao_sei"} onValueChange={setMenstrualCyclePhase}>
                      <SelectTrigger className="rounded-xl h-11 bg-white border-muted focus:ring-[#e8a04c]/30">
                        <SelectValue placeholder="Não sei" />
                      </SelectTrigger>
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

                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Gênero</Label>
                    <Select value={gender ?? undefined} onValueChange={(v) => setGender(v as Patient["gender"])}>
                      <SelectTrigger className="rounded-xl h-11 bg-white border-muted focus:ring-[#e8a04c]/30">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Masculino</SelectItem>
                        <SelectItem value="female">Feminino</SelectItem>
                        <SelectItem value="other">Outro</SelectItem>
                      </SelectContent>
                  </Select>
                </div>
                <DialogFooter className="pt-2">
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full rounded-full h-11 bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white border-0 hover:opacity-90 shadow-md font-medium"
                  >
                    {submitting ? "Salvando..." : "Salvar paciente"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="bg-white shadow-sm rounded-lg border-muted">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <CardTitle className="text-base font-medium">Lista de pacientes</CardTitle>
          <div className="relative w-full sm:w-64 sm:max-w-full">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar paciente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-11 sm:h-10"
            />
          </div>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                {patients.length === 0 ? "Nenhum paciente cadastrado ainda." : "Nenhum resultado."}
              </p>
            </div>
          ) : (
            <>
              {/* Mobile: card list */}
              <div className="md:hidden space-y-3 pt-2">
                {filtered.map((p) => (
                  <div key={p.id} className="rounded-2xl border border-muted bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12 shrink-0">
                        <AvatarImage src={p.avatar_url ?? undefined} alt={p.name} />
                        <AvatarFallback className="bg-gradient-to-br from-[#e8a04c] to-[#e89bcf] text-white text-sm font-semibold">
                          {p.name.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-800 truncate">{p.name}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                          <span>{genderLabel(p.gender)}</span>
                          {p.is_pregnant && (
                            <span className="text-[#e8a04c] font-medium">
                              · Gestante {p.gestational_weeks ? `(${p.gestational_weeks}s)` : ""}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t pt-3">
                      <Button asChild size="sm" className="rounded-full gap-2 bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] hover:opacity-90 h-9 px-5">
                        <Link to="/app/chat/$patientId" params={{ patientId: p.id }} search={{ module: "exames_de_sangue" }}>
                          <MessageSquare className="h-4 w-4" /> Chat
                        </Link>
                      </Button>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => { setEditTarget(p); setEditOpen(true); }}
                          className="h-9 w-9 rounded-full text-slate-500"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => askDelete(p)}
                          className="h-9 w-9 rounded-full text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Nascimento</TableHead>
                      <TableHead>Gênero</TableHead>
                      <TableHead>Gestação</TableHead>
                      <TableHead>Cadastrado em</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarImage src={p.avatar_url ?? undefined} alt={p.name} />
                              <AvatarFallback className="bg-gradient-to-br from-[#e8a04c] to-[#e89bcf] text-white text-xs">
                                {p.name.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join("")}
                              </AvatarFallback>
                            </Avatar>
                            <span>{p.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>{p.birth_date ? new Date(p.birth_date).toLocaleDateString("pt-BR") : "—"}</TableCell>
                        <TableCell>{genderLabel(p.gender)}</TableCell>
                        <TableCell>
                          {p.is_pregnant ? (
                            <span className="text-[#e8a04c] font-medium">
                              Gestante {p.gestational_weeks ? `(${p.gestational_weeks}s)` : ""}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell>{new Date(p.created_at).toLocaleDateString("pt-BR")}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button asChild size="sm" variant="ghost" className="rounded-full gap-1">
                              <Link to="/app/chat/$patientId" params={{ patientId: p.id }} search={{ module: "exames_de_sangue" }}>
                                <MessageSquare className="h-4 w-4" /> Chat
                              </Link>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { setEditTarget(p); setEditOpen(true); }}
                              className="rounded-full"
                              aria-label="Editar paciente"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => askDelete(p)}
                              className="rounded-full gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                              aria-label="Excluir paciente"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteStep === 1} onOpenChange={(o) => !o && setDeleteStep(0)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir paciente {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              O cadastro do paciente, todos os chats, mensagens e exames vinculados serão removidos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); setDeleteStep(2); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Continuar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteStep === 2} onOpenChange={(o) => !o && !deleting && setDeleteStep(0)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmação final</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. Tem certeza que deseja excluir <strong>{deleteTarget?.name}</strong> e todo o histórico?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => { e.preventDefault(); confirmDeletePatient(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Excluindo..." : "Excluir definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <EditPatientSheet
        patient={editTarget}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={load}
      />
    </div>
  );
}
