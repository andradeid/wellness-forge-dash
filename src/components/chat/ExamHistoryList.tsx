import { FileText } from "lucide-react";
import { format } from "date-fns";

export interface ExamItem {
  id: string;
  file_name: string;
  mime_type: string | null;
  created_at: string;
}

export function ExamHistoryList({ exams }: { exams: ExamItem[] }) {
  if (!exams.length) {
    return (
      <p className="text-xs text-muted-foreground px-3">
        Nenhum exame enviado ainda.
      </p>
    );
  }
  return (
    <ul className="space-y-1">
      {exams.map((e) => (
        <li
          key={e.id}
          className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted/60 text-sm"
        >
          <FileText className="h-4 w-4 text-[#3d5a4a] shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{e.file_name}</div>
            <div className="text-[11px] text-muted-foreground">
              {format(new Date(e.created_at), "dd/MM/yyyy HH:mm")}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
