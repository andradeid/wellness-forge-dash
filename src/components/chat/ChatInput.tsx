import { useCallback, useState, type KeyboardEvent } from "react";
import { useDropzone } from "react-dropzone";
import { Paperclip, SendHorizonal, X } from "lucide-react";
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

  const onDrop = useCallback((accepted: File[]) => {
    setFiles((prev) => [...prev, ...accepted.map((file) => ({ file }))]);
  }, []);

  const { getRootProps, getInputProps, open, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
    accept: {
      "application/pdf": [".pdf"],
      "image/*": [".png", ".jpg", ".jpeg", ".webp"],
    },
    maxSize: 20 * 1024 * 1024,
  });

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

  return (
    <div
      {...getRootProps()}
      className={`border-t bg-white p-3 ${isDragActive ? "ring-2 ring-[#e8a04c]" : ""}`}
    >
      <input {...getInputProps()} />
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {files.map((f, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 text-xs bg-muted rounded-full px-3 py-1"
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
      <div className="flex items-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-full shrink-0"
          onClick={open}
          disabled={disabled}
          aria-label="Anexar exame"
        >
          <Paperclip className="h-5 w-5" />
        </Button>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Pergunte à Lumma sobre o paciente ou anexe um exame…"
          className="min-h-[44px] max-h-40 resize-none rounded-2xl"
          disabled={disabled}
        />
        <Button
          type="button"
          onClick={send}
          disabled={disabled || (!text.trim() && files.length === 0)}
          className="rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white hover:opacity-95 shrink-0"
        >
          <SendHorizonal className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
