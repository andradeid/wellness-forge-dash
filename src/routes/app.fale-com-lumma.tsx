import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Paperclip, Mic, ArrowUp, Plus, Search, MessageSquare, ArrowLeft, Loader2, UserPlus, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BirthDatePicker } from "@/components/BirthDatePicker";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import lummaSymbol from "@/assets/lumma-symbol.svg";

export const Route = createFileRoute("/app/fale-com-lumma")({
  component: FaleComLummaPage,
});

interface ChatItem {
  id: string;
  title: string;
  updated_at: string;
  patient_name: string | null;
}

interface PatientItem {
  id: string;
  name: string;
  birth_date: string | null;
  gender: "male" | "female" | "other" | null;
  avatar_url: string | null;
}

type Gender = "male" | "female" | "other";

function calcAge(birth: string | null): number | null {
  if (!birth) return null;
  const d = new Date(birth);
  if (Number.isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

function FaleComLummaPage() {
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoadingChats(true);
      const { data } = await (supabase as any)
        .from("patient_chats")
        .select("id, title, updated_at, patients:patient_id(name)")
        .eq("created_by", user.id)
        .order("updated_at", { ascending: false })
        .limit(50);
      if (cancelled) return;
      const mapped: ChatItem[] = (data ?? []).map((c: any) => ({
        id: c.id,
        title: c.title || c.patients?.name || "Conversa sem título",
        updated_at: c.updated_at,
        patient_name: c.patients?.name ?? null,
      }));
      setChats(mapped);
      setLoadingChats(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const filtered = useMemo(
    () =>
      chats.filter((c) =>
        c.title.toLowerCase().includes(query.toLowerCase())
      ),
    [chats, query]
  );


  return (
    <div className="relative h-full w-full overflow-hidden flex">
      {/* Painel lateral: últimos chats */}
      <aside className="lumma-sidebar hidden md:flex w-72 shrink-0 flex-col border-r border-white/10 text-white">
        <div className="p-4 border-b border-white/10">
          <Link
            to="/app/dashboard"
            className="inline-flex items-center gap-1.5 text-xs text-white/70 hover:text-white transition-colors mb-3"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar ao Dashboard
          </Link>
          <Button
            className="w-full rounded-full text-white shadow-sm hover:shadow-md transition-shadow border-0"
            style={{
              background: "linear-gradient(135deg, #e8a04c 0%, #e89bcf 100%)",
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Nova conversa
          </Button>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/50" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar conversas..."
              className="pl-8 h-9 text-sm rounded-lg bg-white/10 border-white/15 text-white placeholder:text-white/50 focus-visible:ring-white/30"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="px-2 py-3 space-y-1">
            <div className="px-2 pb-1 text-[10px] uppercase tracking-wider text-white/50 font-semibold">
              Recentes
            </div>
            {loadingChats ? (
              <div className="flex items-center justify-center py-8 text-white/60">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-6 text-xs text-white/60 text-center">
                Nenhuma conversa encontrada.
              </div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveId(c.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg flex items-start gap-2.5 transition-colors group ${
                    activeId === c.id
                      ? "bg-white/15"
                      : "hover:bg-white/10"
                  }`}
                >
                  <MessageSquare className="h-4 w-4 mt-0.5 text-white/60 shrink-0 group-hover:text-white" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white truncate">
                      {c.title}
                    </div>
                    <div className="text-[11px] text-white/55 mt-0.5">
                      {formatDistanceToNow(new Date(c.updated_at), { addSuffix: true, locale: ptBR })}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </aside>

      {/* Área principal */}
      <div className="relative flex-1 overflow-hidden">
        {/* Fundo gradiente aurora */}
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(circle at 20% 30%, #ffe5cc 0%, transparent 45%), radial-gradient(circle at 75% 25%, #ffc4e0 0%, transparent 45%), radial-gradient(circle at 80% 70%, #b8e0ff 0%, transparent 50%), radial-gradient(circle at 25% 80%, #ffd6b8 0%, transparent 45%), linear-gradient(135deg, #fff4ea 0%, #f5e6ff 50%, #d6ecff 100%)",
            filter: "blur(0.5px)",
          }}
        />

        <div className="flex h-full flex-col items-center justify-between px-6 py-12">
          <div className="flex flex-1 flex-col items-center justify-center text-center max-w-2xl mx-auto">
            <img
              src={lummaSymbol}
              alt="Lumma"
              className="h-20 w-20 mb-8 drop-shadow-sm"
            />
            <h1 className="text-5xl font-light tracking-tight text-foreground mb-6">
              Bem-vinda
            </h1>
            <p className="text-lg text-foreground/70 leading-relaxed mb-10 max-w-xl">
              Sou sua mentora virtual, inspirada na metodologia da Ana Paula
              Pujol. Estou aqui para apoiar seu raciocínio clínico em Nutrição
              Funcional e Integrativa.
            </p>
            <Button
              size="lg"
              className="rounded-full px-8 h-12 text-white shadow-lg hover:shadow-xl transition-shadow"
              style={{
                background: "linear-gradient(135deg, #e8a04c 0%, #e89bcf 100%)",
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mr-2"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Identificar paciente
            </Button>
          </div>

          {/* Barra de input */}
          <div className="w-full max-w-3xl">
            <div className="bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.06)] border border-white/60 p-4">
              <div className="flex items-center gap-3">
                <img src={lummaSymbol} alt="" className="h-6 w-6 shrink-0" />
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Escreva sua mensagem..."
                  className="flex-1 bg-transparent outline-none text-foreground placeholder:text-muted-foreground text-base"
                />
              </div>
              <div className="flex items-center justify-between mt-3">
                <button
                  type="button"
                  className="h-9 w-9 rounded-full flex items-center justify-center text-white shadow-sm transition-opacity hover:opacity-90"
                  style={{
                    background:
                      "linear-gradient(135deg, #e8a04c 0%, #e89bcf 100%)",
                  }}
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="h-9 w-9 rounded-full flex items-center justify-center text-white shadow-sm transition-opacity hover:opacity-90"
                    style={{
                      background:
                        "linear-gradient(135deg, #e8a04c 0%, #e89bcf 100%)",
                    }}
                  >
                    <Mic className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="h-9 w-9 rounded-full flex items-center justify-center text-white/90 shadow-sm transition-opacity hover:opacity-90"
                    style={{ background: "#f5c7d8" }}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
            <p className="text-center text-xs text-muted-foreground mt-3">
              Máximo de 10 arquivos de 20MB
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
