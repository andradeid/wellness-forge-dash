import { useState } from "react";
import { ThumbsUp, ThumbsDown, MessageSquare, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

type Rating = "positive" | "negative" | "suggestion";

export function MessageFeedback({ messageId }: { messageId: string }) {
  const [active, setActive] = useState<Rating | null>(null);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(rating: Rating, commentValue?: string) {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      toast.error("Sessão expirada.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("ai_feedback").insert({
      message_id: messageId,
      rating,
      comment: commentValue ?? null,
      created_by: uid,
    });
    setSaving(false);
    if (error) {
      toast.error("Não foi possível registrar o feedback.");
      return;
    }
    setActive(rating);
    toast.success("Obrigado pelo feedback!");
  }

  async function handleSuggestion() {
    const text = comment.trim();
    if (!text) return;
    await save("suggestion", text);
    setShowSuggestion(false);
    setComment("");
  }

  const baseBtn =
    "inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors hover:bg-black/5";
  const iconCls = "h-3.5 w-3.5";

  return (
    <div className="mt-3 pt-2 border-t border-black/5">
      <div className="flex items-center gap-1 text-muted-foreground">
        <button
          type="button"
          disabled={saving}
          onClick={() => save("positive")}
          className={`${baseBtn} ${active === "positive" ? "text-emerald-600" : ""}`}
          aria-label="Curti"
        >
          <ThumbsUp className={iconCls} />
          <span>Curti</span>
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => save("negative")}
          className={`${baseBtn} ${active === "negative" ? "text-rose-600" : ""}`}
          aria-label="Não curti"
        >
          <ThumbsDown className={iconCls} />
          <span>Não curti</span>
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => setShowSuggestion((v) => !v)}
          className={`${baseBtn} ${active === "suggestion" ? "text-sky-600" : ""}`}
          aria-label="Sugestão"
        >
          <MessageSquare className={iconCls} />
          <span>Sugestão</span>
        </button>
        {saving && <Loader2 className="h-3 w-3 animate-spin opacity-60" />}
      </div>

      {showSuggestion && (
        <div className="mt-2 space-y-2">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Conte o que poderia melhorar..."
            className="min-h-[70px] text-xs bg-white/70"
          />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => {
                setShowSuggestion(false);
                setComment("");
              }}
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={saving || !comment.trim()}
              onClick={handleSuggestion}
            >
              Enviar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
