import { useCallback, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { useDropzone } from "react-dropzone";
import { AlertCircle, ArrowUp, CheckCircle2, FileText, ImageIcon, Loader2, Paperclip, X } from "lucide-react";
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
  if (stage === "concluido") return { label: "concluído", icon: CheckCircle2, className: "text-emerald-700" };
  if (stage === "erro") return { label: "erro no envio", icon: AlertCircle, className: "text-rose-700" };
  if (stage === "processando") return { label: "processando", icon: Loader2, className: "text-amber-700" };
  return { label: "enviando", icon: Loader2, className: "text-[#c66f16]" };
}

export function ChatInput({
  onSubmit,
  disabled,
  uploadProgress = [],
}: {
  onSubmit: (text: string, files: File[]) => Promise<void> | void;
  disabled?: boolean;
  uploadProgress?: AttachmentProgressItem[];
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
      // Aceita mesmo sem MIME/extensão reconhecidos (comum no Android) — valida no envio
      valid.push(f);
    }
    if (oversized) toast.error("Arquivo acima do limite de 20MB.");
    if (unknown) toast.warning("Tipo de arquivo não reconhecido — envie PDF, PNG, JPG ou WEBP se necessário.");
    if (!valid.length) return;
    setFiles((prev) => {
      const slots = Math.max(0, MAX_FILES - prev.length);
      const accepted = valid.slice(0, slots);
      if (accepted.length < valid.length) toast.warning("Limite de 10 arquivos por mensagem.");
      toast.success(`${accepted.length} ${accepted.length === 1 ? "arquivo anexado" : "arquivos anexados"}`);
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

  const canSend = !disabled && (text.trim().length > 0 || files.length > 0);
  const hasUploadProgress = uploadProgress.length > 0;

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
      {files.length > 0 && (
        <div className="mb-3 space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              {files.length} {files.length === 1 ? "arquivo anexado" : "arquivos anexados"}
            </span>
            <button
              type="button"
              onClick={() => setFiles([])}
              className="text-[11px] text-muted-foreground hover:text-foreground underline"
            >
              Remover todos
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {files.map((f, i) => {
              const isImg = f.file.type.startsWith("image/");
              const sizeStr = formatFileSize(f.file.size);
              const previewUrl = isImg ? URL.createObjectURL(f.file) : null;
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-2xl border border-[#e8a04c]/20 bg-gradient-to-br from-[#fff7ed] to-[#fef2f8] px-3 py-2 shadow-sm"
                >
                  <div className="h-10 w-10 shrink-0 rounded-xl overflow-hidden bg-white flex items-center justify-center border border-white shadow-inner">
                    {isImg && previewUrl ? (
                      <img src={previewUrl} alt={f.file.name} className="h-full w-full object-cover" />
                    ) : (
                      <FileText className="h-5 w-5 text-[#e8a04c]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-foreground" title={f.file.name}>
                      {f.file.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                      {isImg ? <ImageIcon className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                      {sizeStr} · pronto para envio
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFiles((p) => p.filter((_, idx) => idx !== i))}
                    className="shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/60 transition"
                    aria-label={`Remover ${f.file.name}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {hasUploadProgress && (
        <div className="mb-3 space-y-2 rounded-2xl border border-[#e8a04c]/25 bg-white/85 p-3 shadow-sm">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Upload de arquivos
          </div>
          {uploadProgress.map((item) => {
            const meta = getProgressMeta(item.stage);
            const Icon = meta.icon;
            const isLoading = item.stage === "enviando" || item.stage === "processando";
            return (
              <div key={item.id} className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${meta.className} ${isLoading ? "animate-spin" : ""}`} />
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">{item.name}</span>
                  <span className={`shrink-0 text-[10px] ${meta.className}`}>{meta.label}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[#e8a04c]/15">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] transition-all"
                    style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{item.message ?? meta.label}</span>
                  <span>{formatFileSize(item.size)}</span>
                </div>
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
        placeholder="Pergunte à Lumma sobre o paciente ou anexe um exame..."
        className="min-h-[36px] max-h-40 resize-none border-0 bg-transparent px-1 py-1 shadow-none focus-visible:ring-0 text-[15px]"
        disabled={disabled}
      />
      <div className="mt-2 flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-full h-9 w-9 bg-gradient-to-br from-[#fdba8c] to-[#fb923c] text-white hover:opacity-90 shadow-sm"
          onClick={openPicker}
          disabled={disabled}
          aria-label="Anexar exame"
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          onClick={send}
          disabled={!canSend}
          aria-label="Enviar"
          className="rounded-full h-9 w-9 p-0 bg-gradient-to-br from-[#fbcfe8] to-[#fda4af] text-white hover:opacity-90 shadow-sm disabled:opacity-50"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
