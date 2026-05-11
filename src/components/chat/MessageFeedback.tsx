import { useState } from "react";
import { ThumbsUp, ThumbsDown, MessageSquare, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

type RatingValue = "positive" | "negative";

export function MessageFeedback({ messageId }: { messageId: string }) {
  const [rating, setRating] = useState<RatingValue | null>(null);
  const [ratingId, setRatingId] = useState<string | null>(null);

  const [suggestionId, setSuggestionId] = useState<string | null>(null);
  const [savedComment, setSavedComment] = useState<string>("");

  const [showSuggestion, setShowSuggestion] = useState(false);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  async function getUid() {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  }

  async function handleRating(next: RatingValue) {
    if (saving) return;
    const uid = await getUid();
    if (!uid) return toast.error("Sessão expirada.");
    setSaving(true);
    if (ratingId) {
      // toggle off if clicking the same; otherwise switch
      if (rating === next) {
        const { error } = await supabase.from("ai_feedback").delete().eq("id", ratingId);
        setSaving(false);
        if (error) return toast.error("Não foi possível atualizar.");
        setRatingId(null);
        setRating(null);
        return;
      }
      const { error } = await supabase
        .from("ai_feedback")
        .update({ rating: next })
        .eq("id", ratingId);
      setSaving(false);
      if (error) return toast.error("Não foi possível atualizar.");
      setRating(next);
      toast.success("Obrigado pelo feedback!");
      return;
    }
    const { data, error } = await supabase
      .from("ai_feedback")
      .insert({ message_id: messageId, rating: next, created_by: uid })
      .select("id")
      .single();
    setSaving(false);
    if (error || !data) return toast.error("Não foi possível registrar o feedback.");
    setRatingId(data.id);
    setRating(next);
    toast.success("Obrigado pelo feedback!");
  }

  async function handleSuggestion() {
    const text = comment.trim();
    if (!text || saving) return;
    const uid = await getUid();
    if (!uid) return toast.error("Sessão expirada.");
    setSaving(true);
    if (suggestionId) {
      const { error } = await supabase
        .from("ai_feedback")
        .update({ comment: text })
        .eq("id", suggestionId);
      setSaving(false);
      if (error) return toast.error("Não foi possível atualizar a sugestão.");
      setSavedComment(text);
      setShowSuggestion(false);
      toast.success("Sugestão atualizada!");
      return;
    }
    const { data, error } = await supabase
      .from("ai_feedback")
      .insert({
        message_id: messageId,
        rating: "suggestion",
        comment: text,
        created_by: uid,
      })
      .select("id")
      .single();
    setSaving(false);
    if (error || !data) return toast.error("Não foi possível enviar a sugestão.");
    setSuggestionId(data.id);
    setSavedComment(text);
    setShowSuggestion(false);
    toast.success("Obrigado pelo feedback!");
  }

  function openSuggestion() {
    setComment(savedComment);
    setShowSuggestion(true);
  }

  const baseBtn =
    "inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors hover:bg-black/5 disabled:opacity-50";
  const iconCls = "h-3.5 w-3.5";

  return (
    <div className="mt-3 pt-2 border-t border-black/5">
      <div className="flex items-center gap-1 text-muted-foreground">
        <button
          type="button"
          disabled={saving}
          onClick={() => handleRating("positive")}
          className={`${baseBtn} ${rating === "positive" ? "text-emerald-600" : ""}`}
          aria-label="Curti"
        >
          <ThumbsUp className={iconCls} />
          <span>Curti</span>
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => handleRating("negative")}
          className={`${baseBtn} ${rating === "negative" ? "text-rose-600" : ""}`}
          aria-label="Não curti"
        >
          <ThumbsDown className={iconCls} />
          <span>Não curti</span>
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={openSuggestion}
          className={`${baseBtn} ${suggestionId ? "text-sky-600" : ""}`}
          aria-label={suggestionId ? "Editar sugestão" : "Sugestão"}
        >
          <MessageSquare className={iconCls} />
          <span>{suggestionId ? "Editar sugestão" : "Sugestão"}</span>
        </button>
        {saving && <Loader2 className="h-3 w-3 animate-spin opacity-60" />}
      </div>

      {showSuggestion && (
        <div className="mt-2 space-y-2">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 1000))}
            placeholder="Conte o que poderia melhorar..."
            className="min-h-[70px] text-xs bg-white/70"
            maxLength={1000}
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
              disabled={saving || !comment.trim() || comment.trim() === savedComment}
              onClick={handleSuggestion}
            >
              {suggestionId ? "Salvar" : "Enviar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
