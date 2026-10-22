import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  episodeThumb,
  orderedEpisodes,
  useSavePlayProgress,
  type PlayCatalog,
  type PlayEpisode,
} from "@/lib/lumma-play";

// API de iframe do YouTube (carregada uma vez).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type YTPlayer = any;
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}
let ytApi: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (ytApi) return ytApi;
  ytApi = new Promise<void>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    document.head.appendChild(s);
  });
  return ytApi;
}

const SAVE_EVERY_MS = 10_000;
const DONE_AT = 0.92; // a partir de 92% conta como assistido

export function LummaPlayPlayer({
  ep,
  cat,
  onClose,
  onNext,
}: {
  ep: PlayEpisode;
  cat: PlayCatalog;
  onClose: () => void;
  onNext: (e: PlayEpisode) => void;
}) {
  const { user } = useAuth();
  const save = useSavePlayProgress();
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer>(null);
  const lastSave = useRef(0);
  const doneRef = useRef(false);
  const dismissed = useRef(false);
  const [showNext, setShowNext] = useState(false);

  const eps = orderedEpisodes(cat);
  const next = eps[eps.indexOf(eps.find((e) => e.id === ep.id)!) + 1] ?? null;
  const nextPlayable = next && next.video_id ? next : null;
  const track = cat.tracks.find((t) => t.id === ep.track_id);

  const persist = useCallback(
    (force = false) => {
      const p = player.current;
      if (!p || !user || typeof p.getCurrentTime !== "function") return;
      const pos = Number(p.getCurrentTime()) || 0;
      const dur = Number(p.getDuration()) || ep.duration_seconds || 0;
      const completed = doneRef.current || (dur > 0 && pos / dur >= DONE_AT);
      if (completed) doneRef.current = true;
      const now = Date.now();
      if (!force && now - lastSave.current < SAVE_EVERY_MS) return;
      lastSave.current = now;
      save.mutate({ userId: user.id, episodeId: ep.id, position: pos, completed });
    },
    [user, ep.id, ep.duration_seconds, save],
  );

  // Cria o player (só YouTube por enquanto; Cloudflare Stream entra pelo mesmo componente depois).
  useEffect(() => {
    let cancelled = false;
    doneRef.current = !!cat.progress[ep.id]?.completed;
    dismissed.current = false;
    setShowNext(false);
    const startAt = (() => {
      const p = cat.progress[ep.id];
      if (!p || p.completed) return 0;
      return p.position_seconds > 5 && p.position_seconds < ep.duration_seconds - 5
        ? p.position_seconds
        : 0;
    })();
    if (ep.video_provider !== "youtube" || !ep.video_id) return;
    loadYouTubeApi().then(() => {
      if (cancelled || !host.current) return;
      const el = document.createElement("div");
      host.current.innerHTML = "";
      host.current.appendChild(el);
      player.current = new window.YT.Player(el, {
        videoId: ep.video_id,
        playerVars: {
          autoplay: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          start: Math.floor(startAt),
          iv_load_policy: 3,
        },
        events: {
          onStateChange: (e: { data: number }) => {
            const YTS = window.YT.PlayerState;
            if (e.data === YTS.PAUSED) persist(true);
            if (e.data === YTS.ENDED) {
              doneRef.current = true;
              persist(true);
              if (nextPlayable && !dismissed.current) setShowNext(true);
            }
          },
        },
      });
    });
    const tick = window.setInterval(() => {
      const p = player.current;
      if (!p || typeof p.getCurrentTime !== "function") return;
      persist(false);
      const dur = Number(p.getDuration()) || 0;
      if (nextPlayable && !dismissed.current && dur > 0 && dur - Number(p.getCurrentTime()) < 12)
        setShowNext(true);
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(tick);
      persist(true);
      try {
        player.current?.destroy?.();
      } catch {
        /* já destruído */
      }
      player.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ep.id]);

  // Ao fechar o player, sai da tela cheia que foi aberta no clique.
  useEffect(
    () => () => {
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    },
    [],
  );

  // Esc fecha (na tela cheia, o 1º Esc só sai da tela cheia — comportamento do navegador).
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  // Avança sozinho 8 s depois do cartão "Próximo episódio" aparecer no fim do vídeo.
  useEffect(() => {
    if (!showNext || !nextPlayable) return;
    const t = window.setTimeout(() => onNext(nextPlayable), 8000);
    return () => window.clearTimeout(t);
  }, [showNext, nextPlayable, onNext]);

  return (
    <div className="lp-pl" role="dialog" aria-modal aria-label={`Assistindo: ${ep.title}`}>
      <div className="frame" ref={host} />
      {!ep.video_id && (
        <div className="lp-soonbox">
          <h3>Em breve</h3>
          <p>Este episódio ainda está sendo publicado.</p>
        </div>
      )}
      <div className="bar">
        <button type="button" onClick={onClose} aria-label="Voltar">
          ←
        </button>
        <b>
          Ep. {ep.number} · {ep.title}
        </b>
        <small>{track?.title}</small>
      </div>
      {showNext && nextPlayable && (
        <div className="lp-next">
          <div className="tb" style={{ backgroundImage: `url(${episodeThumb(nextPlayable)})` }} />
          <div className="c">
            <small>PRÓXIMO EPISÓDIO</small>
            <b>
              Ep. {nextPlayable.number} · {nextPlayable.title}
            </b>
            <button type="button" className="go" onClick={() => onNext(nextPlayable)}>
              <i />
              <span>▶ Assistir agora</span>
            </button>
            <button
              type="button"
              className="no"
              onClick={() => {
                dismissed.current = true;
                setShowNext(false);
              }}
            >
              Agora não
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
