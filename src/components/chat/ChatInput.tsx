import { useCallback, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { useDropzone } from "react-dropzone";
import { Paperclip, ArrowUp, X, FileText, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export interface PendingFile {
  file: File;
}

export function ChatInput({
  onSubmit,
  disabled,
}: {
  onSubmit: (text: string, files: File[]) => Promise<void> | void;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<PendingFile[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const onDrop = useCallback((accepted: File[]) => {
    setFiles((prev) => [...prev, ...accepted.map((file) => ({ file }))]);
  }, []);

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
    maxSize: 20 * 1024 * 1024,
  });

  const openPicker = () => fileInputRef.current?.click();

  const handleNativePick = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    const MAX = 20 * 1024 * 1024;
    const ALLOWED = /^(application\/pdf|image\/(png|jpe?g|webp))$/i;
    const ALLOWED_EXT = /\.(pdf|png|jpe?g|webp)$/i;
    const valid: File[] = [];
    for (const f of picked) {
      if (f.size > MAX) continue;
      if (ALLOWED.test(f.type) || ALLOWED_EXT.test(f.name)) valid.push(f);
    }
    if (valid.length) setFiles((prev) => [...prev, ...valid.map((file) => ({ file }))]);
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
        <div className="flex flex-wrap gap-2 mb-2">
          {files.map((f, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 text-xs bg-muted/70 rounded-full px-3 py-1"
            >
              📎 {f.file.name}
              <button
                type="button"
                onClick={() => setFiles((p) => p.filter((_, idx) => idx !== i))}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
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
