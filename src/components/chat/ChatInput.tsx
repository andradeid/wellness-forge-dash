import { useCallback, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { useDropzone } from "react-dropzone";
import { AlertCircle, ArrowUp, CheckCircle2, Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export interface PendingFile {
  file: File;
}

export type AttachmentProgressStage = "pendente" | "enviando" | "processando" | "concluido" | "erro";

export interface AttachmentProgressItem {
  id: string;
  name: string;
  size: number;
  type?: string;
  stage: AttachmentProgressStage;
  progress: number;
  message?: string;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_FILES = 10;
const ALLOWED_MIME = /^(application\/(pdf|x-pdf|acrobat|vnd\.pdf|octet-stream)|text\/pdf|image\/(png|jpe?g|webp))$/i;
const ALLOWED_EXT = /\.(pdf|png|jpe?g|webp)$/i;

function formatFileSize(size: number) {
  const sizeKb = size / 1024;
  return sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(sizeKb))} KB`;
}

function getProgressMeta(stage: AttachmentProgressStage) {
  if (stage === "concluido") return { label: "concluído", icon: CheckCircle2, className: "text-emerald-700", pct: 100 };
  if (stage === "erro") return { label: "erro no envio", icon: AlertCircle, className: "text-rose-700", pct: 100 };
  if (stage === "processando") return { label: "processando", icon: Loader2, className: "text-amber-700", pct: 70 };
  if (stage === "enviando") return { label: "enviando", icon: Loader2, className: "text-[#c66f16]", pct: 35 };
  return { label: "pronto para envio", icon: Paperclip, className: "text-[#c66f16]", pct: 12 };
}

export function ChatInput({
  onSubmit,
  disabled,
  hasModule = true,
  uploadProgress = [],
  onRemoveAttachment,
  toolbarSlot,
}: {
  onSubmit: (text: string, files: File[]) => Promise<void> | void;
  disabled?: boolean;
  hasModule?: boolean;
  uploadProgress?: AttachmentProgressItem[];
  onRemoveAttachment?: (name: string) => void;
  toolbarSlot?: React.ReactNode;
}) {

  const [text, setText] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((picked: File[]) => {
    if (!picked.length) return;
    const valid: File[] = [];
    let oversized = 0;
    let unknown = 0;
    for (const f of picked) {
      if (f.size > MAX_FILE_SIZE) { oversized += 1; continue; }
      const ok = ALLOWED_MIME.test(f.type) || ALLOWED_EXT.test(f.name);
      if (!ok) unknown += 1;
      valid.push(f);
    }
    if (oversized) toast.error("Arquivo acima do limite de 20MB.");
    if (unknown) toast.warning("Tipo de arquivo não reconhecido — envie PDF, PNG, JPG ou WEBP se necessário.");
    if (!valid.length) return;
    setFiles((prev) => {
      const slots = Math.max(0, MAX_FILES - prev.length);
      const accepted = valid.slice(0, slots);
      if (accepted.length < valid.length) toast.warning("Limite de 10 arquivos por mensagem.");
      return [...prev, ...accepted.map((file) => ({ file }))];
    });
  }, []);

  const onDrop = useCallback((accepted: File[]) => {
    addFiles(accepted);
  }, [addFiles]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
    accept: {
      "application/pdf": [".pdf"],
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/webp": [".webp"],
    },
    multiple: true,
    maxSize: MAX_FILE_SIZE,
    onDropRejected: () => toast.error("Não consegui anexar este arquivo. Use PDF, PNG, JPG ou WEBP até 20MB."),
  });

  const openPicker = () => fileInputRef.current?.click();

  const handleNativePick = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    addFiles(picked);
    e.target.value = "";
  };

  const send = async () => {
    if (disabled) return;
    const t = text.trim();
    if (!t && files.length === 0) return;
    await onSubmit(t, files.map((f) => f.file));
    setText("");
    setFiles([]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // Itens pendentes (recém-anexados) que ainda não têm progresso real
  const progressNames = new Set(uploadProgress.map((p) => p.name));
  const pendingItems: AttachmentProgressItem[] = files
    .filter((f) => !progressNames.has(f.file.name))
    .map((f, i) => ({
      id: `pending-${i}-${f.file.name}`,
      name: f.file.name,
      size: f.file.size,
      type: f.file.type,
      stage: "pendente",
      progress: 12,
      message: "pronto para envio",
    }));

  const allProgress = [...pendingItems, ...uploadProgress];
  const isAnyFileLoading = allProgress.some((p) => p.stage === "enviando" || p.stage === "processando");
  const canSend = !disabled && !isAnyFileLoading && (text.trim().length > 0 || files.length > 0);

  return (
    <div
      {...getRootProps()}
      className={`rounded-3xl bg-white/85 backdrop-blur-xl shadow-lg border border-white/70 px-4 py-3 transition ${
        isDragActive ? "ring-2 ring-[#e8a04c]/60" : ""
      }`}
    >
      <input {...getInputProps()} />
      <input
        ref={fileInputRef}
        type="file"
        accept="*/*"
        multiple
        className="hidden"
        onChange={handleNativePick}
      />

      {allProgress.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {allProgress.map((item) => {
            const isLoading = item.stage === "enviando" || item.stage === "processando";
            const sizeStr = formatFileSize(item.size);
            
            return (
              <div
                key={item.id}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition-all ${
                  isLoading ? "bg-muted/30 opacity-60" : "bg-muted/50 border-muted-foreground/10"
                }`}
              >
                {isLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                ) : (
                  <Paperclip className="h-3 w-3 text-muted-foreground" />
                )}
                
                <span className="max-w-[200px] truncate font-medium text-foreground" title={item.name}>
                  {item.name}
                </span>
                
                <span className="text-[10px] text-muted-foreground">
                  · {sizeStr}
                </span>

                <button
                  type="button"
                  onClick={() => {
                    setFiles((p) => p.filter((f) => f.file.name !== item.name));
                    onRemoveAttachment?.(item.name);
                  }}
                  className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/10 transition-colors"
                  aria-label={`Remover ${item.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder={hasModule ? "Pergunte à Lumma sobre o paciente ou anexe um exame..." : "⬆️ Selecione uma tarefa acima para começar"}
        className="min-h-[44px] sm:min-h-[36px] max-h-40 resize-none border-0 bg-transparent px-1 py-1.5 sm:py-1 shadow-none focus-visible:ring-0 text-[15px]"
        disabled={disabled || !hasModule}
      />
      <div className="mt-2 flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-full h-9 w-9 bg-gradient-to-br from-[#fdba8c] to-[#fb923c] text-white hover:opacity-90 shadow-sm"
          onClick={openPicker}
          disabled={disabled || !hasModule}
          aria-label="Anexar exame"
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          onClick={send}
          disabled={!canSend || !hasModule}
          aria-label="Enviar"
          className="rounded-full h-9 w-9 p-0 bg-gradient-to-br from-[#fbcfe8] to-[#fda4af] text-white hover:opacity-90 shadow-sm disabled:opacity-50"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}