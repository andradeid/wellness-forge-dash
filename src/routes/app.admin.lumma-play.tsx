import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clapperboard, ExternalLink, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  episodeThumb,
  fmtClock,
  parseYouTubeId,
  PLAY_KEYS,
  type PlayAccessMode,
  type PlayEpisode,
  type PlaySettings,
  type PlayTrack,
} from "@/lib/lumma-play";

export const Route = createFileRoute("/app/admin/lumma-play")({
  head: () => ({ meta: [{ title: "Lumma Play — conteúdo" }] }),
  component: AdminLummaPlayPage,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const MODES: Record<PlayAccessMode, { label: string; help: string }> = {
  off: { label: "Desligado", help: "Só você (super admin) vê o Lumma Play." },
  allowlist: { label: "Só pessoas escolhidas", help: "Você e as pessoas da lista abaixo." },
  all: { label: "Todos", help: "Todas as nutricionistas logadas veem o item no menu." },
};

interface AccessRow {
  user_id: string;
  created_at: string;
  email: string | null;
  full_name: string | null;
}

function useAdminData(enabled: boolean) {
  return useQuery({
    queryKey: ["lumma-play", "admin"],
    enabled,
    queryFn: async () => {
      const [s, t, e, a] = await Promise.all([
        db.from("lumma_play_settings").select("*").maybeSingle(),
        db.from("lumma_play_tracks").select("*").order("sort_order"),
        db.from("lumma_play_episodes").select("*").order("sort_order"),
        db.from("lumma_play_access").select("user_id, created_at").order("created_at"),
      ]);
      if (t.error || e.error) throw t.error ?? e.error;
      const ids = ((a.data ?? []) as { user_id: string }[]).map((r) => r.user_id);
      const profs = ids.length
        ? ((await db.from("profiles").select("id, email, full_name").in("id", ids)).data ?? [])
        : [];
      const byId = new Map(
        (profs as { id: string; email: string; full_name: string | null }[]).map((p) => [p.id, p]),
      );
      const access: AccessRow[] = ((a.data ?? []) as { user_id: string; created_at: string }[]).map(
        (r) => ({
          ...r,
          email: byId.get(r.user_id)?.email ?? null,
          full_name: byId.get(r.user_id)?.full_name ?? null,
        }),
      );
      return {
        settings: s.data as PlaySettings | null,
        tracks: (t.data ?? []) as PlayTrack[],
        episodes: (e.data ?? []) as PlayEpisode[],
        access,
      };
    },
  });
}

/** Reduz a capa para no máx. 1280 px de largura em JPEG (carrega rápido nas fileiras). */
async function reduzirImagem(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / bmp.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("falha ao gerar a imagem"))),
      "image/jpeg",
      0.85,
    ),
  );
}

function EpisodeRow({ ep, onSaved }: { ep: PlayEpisode; onSaved: () => void }) {
  const [title, setTitle] = useState(ep.title);
  const [description, setDescription] = useState(ep.description);
  const [link, setLink] = useState(ep.video_id ? `https://youtu.be/${ep.video_id}` : "");
  const [duration, setDuration] = useState(String(ep.duration_seconds));
  const [active, setActive] = useState(ep.is_active);
  const [thumb, setThumb] = useState<string | null>(ep.thumbnail_url);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const parsed = parseYouTubeId(link);
  const dirty =
    title !== ep.title ||
    description !== ep.description ||
    (parsed ?? null) !== (ep.video_id ?? null) ||
    Number(duration) !== ep.duration_seconds ||
    active !== ep.is_active ||
    (thumb ?? null) !== (ep.thumbnail_url ?? null);

  const salvar = async () => {
    if (link.trim() && !parsed) {
      toast.error("Link do YouTube inválido");
      return;
    }
    setSaving(true);
    const { error } = await db
      .from("lumma_play_episodes")
      .update({
        title: title.trim() || ep.title,
        description: description.trim(),
        video_provider: "youtube",
        video_id: parsed,
        duration_seconds: Math.max(0, Math.round(Number(duration) || 0)),
        is_active: active,
        thumbnail_url: thumb,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ep.id);
    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar", { description: error.message });
      return;
    }
    toast.success(`Ep. ${ep.number} salvo`);
    onSaved();
  };

  const enviarCapa = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      toast.error("Use uma imagem JPG, PNG ou WEBP");
      return;
    }
    setUploading(true);
    try {
      const blob = await reduzirImagem(file);
      const path = `capas/ep${String(ep.number).padStart(2, "0")}-${Date.now()}.jpg`;
      const { error } = await supabase.storage
        .from("lumma-play")
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from("lumma-play").getPublicUrl(path);
      setThumb(data.publicUrl);
      toast.success("Capa enviada. Clique em Salvar para aplicar.");
    } catch (e) {
      toast.error("Não foi possível enviar a capa", { description: (e as Error).message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-3 border-b py-4 last:border-0 md:grid-cols-[180px_1fr_260px]">
      <div className="space-y-1.5">
        <div
          className="relative aspect-video overflow-hidden rounded-md bg-muted bg-cover bg-center"
          style={{
            backgroundImage: `url(${episodeThumb({ ...ep, video_id: parsed, thumbnail_url: thumb })})`,
          }}
        >
          <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-white">
            EP. {ep.number}
          </span>
        </div>
        <label className="block cursor-pointer rounded-md border border-dashed px-2 py-1.5 text-center text-xs text-muted-foreground hover:bg-muted">
          {uploading ? "Enviando…" : "Trocar capa"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              void enviarCapa(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        {thumb && parsed && (
          <button
            type="button"
            className="w-full text-[11px] text-muted-foreground underline"
            onClick={() => setThumb(null)}
          >
            Usar a capa do YouTube
          </button>
        )}
      </div>
      <div className="space-y-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="font-medium" />
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="text-sm"
        />
      </div>
      <div className="space-y-2">
        <Input
          placeholder="Link do YouTube (não listado)"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {parsed ? (
            <a
              className="inline-flex items-center gap-1 text-emerald-700"
              href={`https://youtu.be/${parsed}`}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="h-3 w-3" /> vídeo {parsed}
            </a>
          ) : link.trim() ? (
            <span className="text-destructive">link não reconhecido</span>
          ) : (
            <Badge variant="outline">Em breve</Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Input
            className="w-24"
            inputMode="numeric"
            value={duration}
            onChange={(e) => setDuration(e.target.value.replace(/\D/g, ""))}
          />
          <span className="text-xs text-muted-foreground">
            seg ({fmtClock(Number(duration) || 0)})
          </span>
          <label className="ml-auto flex items-center gap-2 text-xs">
            Ativo <Switch checked={active} onCheckedChange={setActive} />
          </label>
        </div>
        <Button size="sm" className="w-full" disabled={!dirty || saving} onClick={salvar}>
          {saving ? "Salvando…" : dirty ? "Salvar" : "Salvo"}
        </Button>
      </div>
    </div>
  );
}

function AdminLummaPlayPage() {
  const { role, loading, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isSuper = role === "super_admin";
  const { data, isLoading, refetch } = useAdminData(isSuper);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && role && !isSuper) void navigate({ to: "/unauthorized", replace: true });
  }, [loading, role, isSuper, navigate]);

  const reload = () => {
    void refetch();
    void qc.invalidateQueries({ queryKey: PLAY_KEYS.catalog });
    void qc.invalidateQueries({ queryKey: PLAY_KEYS.access });
  };
  const withVideo = useMemo(() => (data?.episodes ?? []).filter((e) => e.video_id).length, [data]);

  const setMode = async (mode: PlayAccessMode) => {
    const { error } = await db
      .from("lumma_play_settings")
      .update({
        access_mode: mode,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      })
      .eq("id", 1);
    if (error) {
      toast.error("Não foi possível alterar", { description: error.message });
      return;
    }
    toast.success(`Acesso: ${MODES[mode].label}`);
    reload();
  };

  const addAccess = async () => {
    const e = email.trim().toLowerCase();
    if (!e) return;
    setBusy(true);
    const { data: prof } = await db
      .from("profiles")
      .select("id, email")
      .ilike("email", e)
      .maybeSingle();
    if (!prof?.id) {
      setBusy(false);
      toast.error("Nenhuma conta com esse e-mail");
      return;
    }
    const { error } = await db
      .from("lumma_play_access")
      .upsert({ user_id: prof.id, created_by: user?.id ?? null }, { onConflict: "user_id" });
    setBusy(false);
    if (error) {
      toast.error("Não foi possível liberar", { description: error.message });
      return;
    }
    setEmail("");
    toast.success(`${prof.email} liberado`);
    reload();
  };

  const removeAccess = async (row: AccessRow) => {
    const { error } = await db.from("lumma_play_access").delete().eq("user_id", row.user_id);
    if (error) {
      toast.error("Não foi possível remover", { description: error.message });
      return;
    }
    toast.success(`${row.email ?? "Usuário"} removido`);
    reload();
  };

  if (!isSuper) return null;
  if (isLoading || !data) return <div className="text-sm text-muted-foreground">Carregando…</div>;

  const mode = data.settings?.access_mode ?? "allowlist";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Clapperboard className="h-6 w-6" /> Lumma Play · conteúdo
          </h1>
          <p className="text-sm text-muted-foreground">
            {data.episodes.length} episódios em {data.tracks.length} trilhas · {withVideo} com vídeo
            · os sem vídeo aparecem como "Em breve".
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/app/play">Abrir o Lumma Play</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quem pode ver</CardTitle>
          <CardDescription>{MODES[mode].help}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={mode} onValueChange={(v) => setMode(v as PlayAccessMode)}>
            <SelectTrigger className="max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(MODES) as PlayAccessMode[]).map((m) => (
                <SelectItem key={m} value={m}>
                  {MODES[m].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="space-y-2">
            <div className="text-sm font-medium">
              Pessoas liberadas{" "}
              {mode !== "allowlist" && (
                <span className="font-normal text-muted-foreground">
                  (a lista vale no modo "Só pessoas escolhidas")
                </span>
              )}
            </div>
            <div className="flex max-w-md gap-2">
              <Input
                placeholder="e-mail da conta"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addAccess();
                }}
              />
              <Button onClick={addAccess} disabled={busy || !email.trim()}>
                <UserPlus className="mr-1 h-4 w-4" /> Liberar
              </Button>
            </div>
            <ul className="divide-y rounded-md border">
              {data.access.length === 0 && (
                <li className="p-3 text-sm text-muted-foreground">Ninguém na lista.</li>
              )}
              {data.access.map((r) => (
                <li key={r.user_id} className="flex items-center gap-3 p-3 text-sm">
                  <span className="flex-1">
                    <b className="font-medium">{r.full_name || "—"}</b>{" "}
                    <span className="text-muted-foreground">{r.email ?? r.user_id}</span>
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => removeAccess(r)}
                    aria-label="Remover"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      {data.tracks.map((t) => (
        <Card key={t.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">{t.title}</CardTitle>
            <CardDescription>
              Cole o link do YouTube (não listado) de cada episódio. A capa pode ser trocada por uma
              imagem sua (16:9, ex. 1280×720); sem capa própria, usa a do YouTube.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.episodes
              .filter((e) => e.track_id === t.id)
              .map((e) => (
                <EpisodeRow key={e.id} ep={e} onSaved={reload} />
              ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
