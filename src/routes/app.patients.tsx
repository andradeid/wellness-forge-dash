import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { MessageSquare, Plus, Search, Trash2, Users } from "lucide-react";
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

export const Route = createFileRoute("/app/patients")({
  component: PatientsPage,
});

interface Patient {
  id: string;
  name: string;
  birth_date: string | null;
  gender: "male" | "female" | "other" | null;
  created_at: string;
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
      .select("id, name, birth_date, gender, created_at")
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
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Pacientes</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bem-vinda ao Painel. Tudo em um só lugar — calmo, organizado, à mão.
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                className="rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white border-0 hover:opacity-90 shadow-md"
              >
                <Plus className="h-4 w-4 mr-2" />
                Novo Paciente
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Novo paciente</DialogTitle>
                <DialogDescription>Cadastre um paciente. Mais campos virão na criação do chat.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="p-name">Nome</Label>
                  <Input id="p-name" required value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="p-birth">Nascimento</Label>
                    <Input id="p-birth" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Gênero</Label>
                    <Select value={gender ?? undefined} onValueChange={(v) => setGender(v as Patient["gender"])}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Masculino</SelectItem>
                        <SelectItem value="female">Feminino</SelectItem>
                        <SelectItem value="other">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? "Salvando..." : "Salvar"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="bg-white shadow-sm rounded-lg border-muted">
        <CardHeader className="flex-row items-center justify-between gap-4">
          <CardTitle className="text-base font-medium">Lista de pacientes</CardTitle>
          <div className="relative w-64 max-w-full">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar paciente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
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
                    <TableCell className="font-medium">{p.name}</TableCell>
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
    </div>
  );
}
