// Lumma Play — área de treinamento estilo streaming.
// Tabelas lumma_play_* (migração 20261022180000_lumma_play.sql). Quem vê é decidido no banco
// (função lumma_play_can_view + RLS): aqui só lemos o que o banco liberar.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// As tabelas ainda não estão nos tipos gerados do Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type PlayAccessMode = "off" | "allowlist" | "all";

export interface PlaySettings {
  id: number;
  access_mode: PlayAccessMode;
  series_title: string;
  series_description: string;
}

export interface PlayTrack {
  id: string;
  title: string;
  sort_order: number;
  is_active: boolean;
}

export interface PlayEpisode {
  id: string;
  track_id: string;
  number: number;
  title: string;
  description: string;
  duration_seconds: number;
  video_provider: "youtube" | "cloudflare";
  video_id: string | null;
  thumbnail_url: string | null;
  sort_order: number;
  is_featured: boolean;
  is_active: boolean;
}

export interface PlayProgress {
  episode_id: string;
  position_seconds: number;
  completed: boolean;
  updated_at: string;
}

export interface PlayCatalog {
  settings: PlaySettings | null;
  tracks: PlayTrack[];
  episodes: PlayEpisode[];
  progress: Record<string, PlayProgress>;
}

export const PLAY_KEYS = {
  access: ["lumma-play", "access"] as const,
  catalog: ["lumma-play", "catalog"] as const,
};

/** O usuário logado pode ver o Lumma Play? (só o banco decide) */
export function useLummaPlayAccess(enabled = true) {
  return useQuery({
    queryKey: PLAY_KEYS.access,
    enabled,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await db.rpc("lumma_play_can_view");
      if (error) return false; // tabela/função ausente (ex.: rollback) = área escondida
      return data === true;
    },
  });
}

export function useLummaPlayCatalog(enabled = true) {
  return useQuery({
    queryKey: PLAY_KEYS.catalog,
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<PlayCatalog> => {
      const [s, t, e, p] = await Promise.all([
        db
          .from("lumma_play_settings")
          .select("id, access_mode, series_title, series_description")
          .maybeSingle(),
        db.from("lumma_play_tracks").select("id, title, sort_order, is_active").order("sort_order"),
        db
          .from("lumma_play_episodes")
          .select(
            "id, track_id, number, title, description, duration_seconds, video_provider, video_id, thumbnail_url, sort_order, is_featured, is_active",
          )
          .order("sort_order"),
        db
          .from("lumma_play_progress")
          .select("episode_id, position_seconds, completed, updated_at"),
      ]);
      if (t.error) throw t.error;
      if (e.error) throw e.error;
      const progress: Record<string, PlayProgress> = {};
      for (const row of (p.data ?? []) as PlayProgress[]) progress[row.episode_id] = row;
      return {
        settings: (s.data as PlaySettings | null) ?? null,
        tracks: ((t.data ?? []) as PlayTrack[]).filter((x) => x.is_active),
        episodes: ((e.data ?? []) as PlayEpisode[]).filter((x) => x.is_active),
        progress,
      };
    },
  });
}

/** Salva a posição do vídeo (chamado a cada ~10 s e ao sair). */
export function useSavePlayProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      userId: string;
      episodeId: string;
      position: number;
      completed: boolean;
    }) => {
      const { error } = await db.from("lumma_play_progress").upsert(
        {
          user_id: p.userId,
          episode_id: p.episodeId,
          position_seconds: Math.max(0, Math.floor(p.position)),
          completed: p.completed,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,episode_id" },
      );
      if (error) throw error;
    },
    onSuccess: (_d, p) => {
      qc.setQueryData<PlayCatalog | undefined>(PLAY_KEYS.catalog, (old) =>
        old
          ? {
              ...old,
              progress: {
                ...old.progress,
                [p.episodeId]: {
                  episode_id: p.episodeId,
                  position_seconds: Math.floor(p.position),
                  completed: p.completed || !!old.progress[p.episodeId]?.completed,
                  updated_at: new Date().toISOString(),
                },
              },
            }
          : old,
      );
    },
  });
}

// ---------- utilidades ----------

/** Aceita link do YouTube (watch, youtu.be, shorts, embed) ou o id puro; devolve o id de 11 caracteres. */
export function parseYouTubeId(input: string | null | undefined): string | null {
  const v = String(input ?? "").trim();
  if (!v) return null;
  if (/^[A-Za-z0-9_-]{11}$/.test(v)) return v;
  try {
    const u = new URL(v);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1, 12) || null;
    const q = u.searchParams.get("v");
    if (q && /^[A-Za-z0-9_-]{11}$/.test(q)) return q;
    const m = u.pathname.match(/\/(embed|shorts|live)\/([A-Za-z0-9_-]{11})/);
    return m ? m[2] : null;
  } catch {
    return null;
  }
}

export function episodeThumb(ep: PlayEpisode): string {
  if (ep.thumbnail_url) return ep.thumbnail_url;
  if (ep.video_provider === "youtube" && ep.video_id)
    return `https://i.ytimg.com/vi/${ep.video_id}/maxresdefault.jpg`;
  return "/lumma-play/hero-2.jpg";
}

export const fmtClock = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
export const fmtMin = (s: number) => `${Math.max(1, Math.round(s / 60))} min`;

/** Percentual assistido (0–100). Concluído = 100. */
export function progressPct(ep: PlayEpisode, p?: PlayProgress): number {
  if (!p) return 0;
  if (p.completed) return 100;
  if (!ep.duration_seconds) return 0;
  return Math.min(99, Math.round((p.position_seconds / ep.duration_seconds) * 100));
}

/** Episódio para "continuar": o último mexido e não concluído; senão o próximo não concluído. */
export function nextToWatch(cat: PlayCatalog): PlayEpisode | null {
  const eps = orderedEpisodes(cat);
  const started = Object.values(cat.progress)
    .filter((p) => !p.completed && p.position_seconds > 5)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const cur = started.map((p) => eps.find((e) => e.id === p.episode_id)).find(Boolean);
  if (cur) return cur;
  return eps.find((e) => !cat.progress[e.id]?.completed) ?? null;
}

/** Episódios na ordem das trilhas. */
export function orderedEpisodes(cat: PlayCatalog): PlayEpisode[] {
  const order = new Map(cat.tracks.map((t, i) => [t.id, i]));
  return cat.episodes
    .filter((e) => order.has(e.track_id))
    .sort((a, b) => order.get(a.track_id)! - order.get(b.track_id)! || a.sort_order - b.sort_order);
}
