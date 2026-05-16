import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { MessageSquare, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
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
  const [submitting, setSubmitting] = useState(false);
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [deleteTarget, setDeleteTarget] = useState<Patient | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editTarget, setEditTarget] = useState<EditablePatient | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const askDelete = (p: Patient) => {
    setDeleteTarget(p);
    setDeleteStep(1);
  };

  const confirmDeleteChat = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { data: chats } = await (supabase as any)
      .from("patient_chats")
      .select("id")
      .eq("patient_id", deleteTarget.id);
    const chatIds = (chats ?? []).map((c: { id: string }) => c.id);
    if (chatIds.length > 0) {
      await (supabase as any).from("chat_messages").delete().in("chat_id", chatIds);
      await (supabase as any).from("patient_exams").delete().in("chat_id", chatIds);
      const { error } = await (supabase as any)
        .from("patient_chats").delete().in("id", chatIds);
      if (error) {
        toast.error(error.message);
        setDeleting(false);
        return;
      }
    }
    setDeleting(false);
    setDeleteStep(0);
    setDeleteTarget(null);
    toast.success("Chat excluído com sucesso");
  };

  const load = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("patients")
      .select("id, name, birth_date, gender, created_at, email, phone, avatar_url, notes")
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
    setSubmitting(true);
    const { error } = await (supabase as any).from("patients").insert({
      created_by: user.id,
      name,
      birth_date: birthDate || null,
      gender,
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
    load();
  };

  const filtered = patients.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const genderLabel = (g: Patient["gender"]) =>
    g === "male" ? "Masculino" : g === "female" ? "Feminino" : g === "other" ? "Outro" : "—";

  return (
    <div className="space-y-6 max-w-6xl px-3 sm:px-4 lg:px-0 overflow-x-hidden">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight break-words">Pacientes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bem-vinda ao Painel. Tudo em um só lugar — calmo, organizado, à mão.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <QuickAnalysisDialog onCreated={load} />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                className="rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white border-0 hover:opacity-90 shadow-md min-h-[44px] flex-1 md:flex-none"
              >
                <Plus className="h-4 w-4 mr-2" />
                Novo Paciente
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
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nascimento</Label>
                  <BirthDatePicker value={birthDate} onChange={setBirthDate} />
                </div>
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
              <div className="md:hidden space-y-3">
                {filtered.map((p) => (
                  <div key={p.id} className="rounded-xl border border-muted bg-white p-3 shadow-sm">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarImage src={p.avatar_url ?? undefined} alt={p.name} />
                        <AvatarFallback className="bg-gradient-to-br from-[#e8a04c] to-[#e89bcf] text-white text-xs">
                          {p.name.split(" ").filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{p.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {genderLabel(p.gender)} · {p.birth_date ? new Date(p.birth_date).toLocaleDateString("pt-BR") : "—"}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1 justify-end">
                      <Button asChild size="sm" variant="ghost" className="rounded-full gap-1 min-h-[40px]">
                        <Link to="/app/chat/$patientId" params={{ patientId: p.id }}>
                          <MessageSquare className="h-4 w-4" /> Chat
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setEditTarget(p); setEditOpen(true); }}
                        className="rounded-full min-h-[40px] min-w-[40px]"
                        aria-label="Editar paciente"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => askDelete(p)}
                        className="rounded-full gap-1 text-destructive hover:text-destructive hover:bg-destructive/10 min-h-[40px] min-w-[40px]"
                        aria-label="Excluir chat"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
                        <TableCell>{new Date(p.created_at).toLocaleDateString("pt-BR")}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button asChild size="sm" variant="ghost" className="rounded-full gap-1">
                              <Link to="/app/chat/$patientId" params={{ patientId: p.id }}>
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
                              aria-label="Excluir chat"
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
            <AlertDialogTitle>Excluir chat de {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as mensagens e exames vinculados a este chat serão removidos permanentemente. O cadastro do paciente será mantido.
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
              Esta ação é irreversível. Tem certeza que deseja excluir o chat de <strong>{deleteTarget?.name}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => { e.preventDefault(); confirmDeleteChat(); }}
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
