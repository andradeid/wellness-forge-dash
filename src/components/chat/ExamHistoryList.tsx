import { useState } from "react";
import { CalendarIcon, Download, FileText, Pencil } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ExamItem {
  id: string;
  file_name: string;
  file_path?: string | null;
  mime_type: string | null;
  created_at: string;
  exam_date?: string | null;
}

interface Props {
  exams: ExamItem[];
  onChanged?: () => void | Promise<void>;
}

export function ExamHistoryList({ exams, onChanged }: Props) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  if (!exams.length) {
    return (
      <p className="text-xs text-muted-foreground px-3">
        Nenhum exame enviado ainda.
      </p>
    );
  }

  const handleUpdateDate = async (examId: string, date: Date | undefined) => {
    if (!date) return;
    setSavingId(examId);
    try {
      const { error } = await (supabase as any)
        .from("patient_exams")
        .update({ exam_date: date.toISOString() })
        .eq("id", examId);
      if (error) throw error;
      toast.success("Data do exame atualizada", {
        description: "A evolução clínica foi sincronizada.",
      });
      await onChanged?.();
    } catch (err: any) {
      toast.error("Erro ao atualizar a data", { description: err?.message });
    } finally {
      setSavingId(null);
    }
  };

  const handleDownload = async (exam: ExamItem) => {
    if (!exam.file_path) {
      toast.error("Arquivo indisponível para download");
      return;
    }
    setDownloadingId(exam.id);
    try {
      const { data, error } = await supabase.storage
        .from("exams")
        .createSignedUrl(exam.file_path, 60, { download: exam.file_name });
      if (error || !data?.signedUrl) throw error ?? new Error("Sem URL");
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err: any) {
      toast.error("Erro ao baixar o arquivo", { description: err?.message });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <ul className="space-y-1">
      {exams.map((e) => {
        const dateStr = e.exam_date ?? e.created_at;
        const currentDate = new Date(dateStr);
        return (
          <li
            key={e.id}
            className="group flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted/60 text-sm"
          >
            <FileText className="h-4 w-4 text-[#3d5a4a] shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium" title={e.file_name}>
                {e.file_name}
              </div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                <CalendarIcon className="h-3 w-3" />
                {format(currentDate, "dd/MM/yyyy")}
              </div>
            </div>
            <div className="flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition shrink-0">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="Editar data do exame"
                    disabled={savingId === e.id}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={currentDate}
                    onSelect={(d) => handleUpdateDate(e.id, d)}
                    disabled={(d) => d > new Date()}
                    initialFocus
                    locale={ptBR}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title="Baixar arquivo original"
                disabled={downloadingId === e.id || !e.file_path}
                onClick={() => handleDownload(e)}
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
