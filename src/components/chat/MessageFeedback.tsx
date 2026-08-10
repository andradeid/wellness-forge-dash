import { useState, type ReactNode } from "react";
import { ThumbsUp, ThumbsDown, MessageSquare, Loader2, X, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type RatingValue = "positive" | "negative";

const NEGATIVE_REASONS = [
  "Informação clínica incorreta",
  "Faixa de referência errada",
  "Análise incompleta — faltou parte da resposta",
  "Marcador não extraído do laudo",
  "Formatação ruim ou difícil de ler",
  "Não respondeu o que foi pedido",
  "Expôs informação interna do sistema",
  "Outro",
];

export function MessageFeedback({ messageId, rightSlot }: { messageId: string; rightSlot?: ReactNode }) {
  const [rating, setRating] = useState<RatingValue | null>(null);
  const [ratingId, setRatingId] = useState<string | null>(null);

  const [suggestionId, setSuggestionId] = useState<string | null>(null);
  const [savedComment, setSavedComment] = useState<string>("");

  const [showSuggestion, setShowSuggestion] = useState(false);
  const [showNegativeForm, setShowNegativeForm] = useState(false);
  
  const [comment, setComment] = useState("");
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function getUid() {
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  }

  async function trackMetric(eventType: "negative_popup_open" | "negative_popup_close_without_send") {
    const uid = await getUid();
    await supabase.from("ai_feedback_metrics").insert({
      message_id: messageId,
      event_type: eventType,
      created_by: uid,
    });
  }

  async function handleRating(next: RatingValue) {
    if (saving) return;
    const uid = await getUid();
    if (!uid) return toast.error("Sessão expirada.");

    if (next === "negative") {
      if (rating === "negative") {
        // toggle off
        setSaving(true);
        const { error } = await supabase.from("ai_feedback").delete().eq("id", ratingId!);
        setSaving(false);
        if (error) return toast.error("Não foi possível atualizar.");
        setRatingId(null);
        setRating(null);
        return;
      }
      setShowNegativeForm(true);
      setShowSuggestion(false);
      trackMetric("negative_popup_open");
      return;
    }

    setSaving(true);
    if (ratingId) {
      if (rating === "positive") {
        const { error } = await supabase.from("ai_feedback").delete().eq("id", ratingId!);
        setSaving(false);
        if (error) return toast.error("Não foi possível atualizar.");
        setRatingId(null);
        setRating(null);
        return;
      }
      const { error } = await supabase
        .from("ai_feedback")
        .update({ rating: next, reasons: [] })
        .eq("id", ratingId!);
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

  async function submitNegativeFeedback() {
    if (saving || selectedReasons.length === 0) return;
    
    const isOtherSelected = selectedReasons.includes("Outro");
    if (isOtherSelected && !comment.trim()) {
      return toast.error("Por favor, descreva o motivo no campo de comentário.");
    }

    const uid = await getUid();
    if (!uid) return toast.error("Sessão expirada.");
    
    setSaving(true);
    const payload = {
      message_id: messageId,
      rating: "negative" as const,
      reasons: selectedReasons,
      comment: comment.trim() || null,
      created_by: uid,
    };

    let res;
    if (ratingId) {
      res = await supabase
        .from("ai_feedback")
        .update(payload)
        .eq("id", ratingId!)
        .select("id")
        .single();
    } else {
      res = await supabase
        .from("ai_feedback")
        .insert(payload)
        .select("id")
        .single();
    }

    setSaving(false);
    if (res.error || !res.data) {
      return toast.error("Não foi possível registrar o feedback.");
    }

    setRatingId(res.data.id);
    setRating("negative");
    setShowNegativeForm(false);
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
        .eq("id", suggestionId!);
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

  function toggleReason(reason: string) {
    setSelectedReasons(prev => 
      prev.includes(reason) ? prev.filter(r => r !== reason) : [...prev, reason]
    );
  }

  const baseBtn =
    "inline-flex items-center gap-1 sm:gap-1.5 text-xs px-1.5 sm:px-2 py-1 rounded-md transition-colors hover:bg-black/5 disabled:opacity-50";
  const iconCls = "h-3.5 w-3.5";

  const isSubmitDisabled = saving || selectedReasons.length === 0 || (selectedReasons.includes("Outro") && !comment.trim());

  return (
    <div className="mt-3 pt-2 border-t border-black/5">
      <div className="flex items-center gap-1 text-muted-foreground">
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <button
            type="button"
            disabled={saving}
            onClick={() => handleRating("positive")}
            className={cn(baseBtn, rating === "positive" && "text-emerald-600")}
            aria-label="Curti"
          >
            <ThumbsUp className={iconCls} />
            <span className="hidden sm:inline">Curti</span>
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => handleRating("negative")}
            className={cn(baseBtn, rating === "negative" && "text-rose-600")}
            aria-label="Não curti"
          >
            <ThumbsDown className={iconCls} />
            <span className="hidden sm:inline">Não curti</span>
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setComment(savedComment);
              setShowSuggestion(true);
              setShowNegativeForm(false);
            }}
            className={cn(baseBtn, suggestionId && "text-sky-600")}
            aria-label={suggestionId ? "Editar sugestão" : "Sugestão"}
          >
            <MessageSquare className={iconCls} />
            <span className="hidden sm:inline">{suggestionId ? "Editar sugestão" : "Sugestão"}</span>
          </button>
          {saving && <Loader2 className="h-3 w-3 animate-spin opacity-60" />}
        </div>
        {rightSlot}
      </div>

      {showNegativeForm && (
        <div className="mt-4 p-4 rounded-xl border border-rose-100 bg-rose-50/30 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-rose-900">Por que você não curtiu?</h4>
            <button 
              onClick={() => {
                setShowNegativeForm(false);
                trackMetric("negative_popup_close_without_send");
              }}
              className="p-1 hover:bg-rose-100 rounded-full transition-colors"
            >
              <X className="h-4 w-4 text-rose-400" />
            </button>
          </div>
          
          <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2 mb-4">
            {NEGATIVE_REASONS.map((reason) => (
              <div key={reason} className="flex items-center space-x-2">
                <Checkbox 
                  id={`reason-${reason}`} 
                  checked={selectedReasons.includes(reason)}
                  onCheckedChange={() => toggleReason(reason)}
                  className="border-rose-200 data-[state=checked]:bg-rose-600 data-[state=checked]:border-rose-600"
                />
                <Label 
                  htmlFor={`reason-${reason}`}
                  className="text-xs font-normal text-rose-800 cursor-pointer select-none"
                >
                  {reason}
                </Label>
              </div>
            ))}
          </div>

          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value.slice(0, 1000))}
            placeholder={selectedReasons.includes("Outro") ? "Explique o que houve (obrigatório)..." : "Comentário adicional (opcional)..."}
            className={cn(
              "min-h-[80px] text-xs bg-white/70 border-rose-100 focus-visible:ring-rose-200",
              selectedReasons.includes("Outro") && !comment.trim() && "border-rose-300"
            )}
            maxLength={1000}
          />
          
          <div className="mt-3 flex justify-end">
            <Button
              size="sm"
              onClick={submitNegativeFeedback}
              disabled={isSubmitDisabled}
              className="bg-rose-600 hover:bg-rose-700 text-white rounded-full px-6 h-8 text-xs font-medium"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
              Enviar feedback
            </Button>
          </div>
        </div>
      )}

      {showSuggestion && (
        <div className="mt-2 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
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
