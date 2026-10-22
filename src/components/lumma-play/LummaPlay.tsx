import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import {
  episodeThumb,
  fmtClock,
  fmtMin,
  nextToWatch,
  orderedEpisodes,
  progressPct,
  useLummaPlayCatalog,
  type PlayCatalog,
  type PlayEpisode,
} from "@/lib/lumma-play";
import { LummaPlayPlayer } from "./LummaPlayPlayer";

const INTRO_KEY = "lumma-play:intro-visto";

function firstName(full?: string | null) {
  return (
    String(full ?? "")
      .trim()
      .split(/\s+/)[0] || ""
  );
}

function Mini() {
  return (
    <span className="lp-mini" aria-hidden>
      <i style={{ left: 6, top: 0, background: "#f6a7d6" }} />
      <i style={{ left: 12, top: 6, background: "#9fd0f7" }} />
      <i style={{ left: 0, top: 6, background: "#ffd58a" }} />
      <i style={{ left: 6, top: 12, background: "#f8b4c8" }} />
    </span>
  );
}

function EpisodeCard({
  ep,
  cat,
  onOpen,
  onPlay,
  trackTitle,
}: {
  ep: PlayEpisode;
  cat: PlayCatalog;
  onOpen: (e: PlayEpisode) => void;
  onPlay: (e: PlayEpisode) => void;
  trackTitle: string;
}) {
  const pct = progressPct(ep, cat.progress[ep.id]);
  const soon = !ep.video_id;
  return (
    <button
      type="button"
      className="lp-card"
      onClick={() => onOpen(ep)}
      aria-label={`Episódio ${ep.number}: ${ep.title}`}
    >
      <div className="lp-thumb" style={{ backgroundImage: `url(${episodeThumb(ep)})` }}>
        <span className="ep">EP. {ep.number}</span>
        {soon && <span className="soon">EM BREVE</span>}
        <span className="t">{ep.title}</span>
        {pct > 0 && pct < 100 && (
          <span className="lp-pg">
            <i style={{ width: `${pct}%` }} />
          </span>
        )}
      </div>
      <div className="lp-pop">
        <div className="ic">
          <span
            className="w"
            role="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!soon) onPlay(ep);
            }}
          >
            ▶
          </span>
          <span>{pct === 100 ? "✓" : "+"}</span>
          <span>⌄</span>
        </div>
        <b>{ep.title}</b>
        <small>
          {pct === 100 && <span className="lp-ok">✓ Assistido · </span>}
          {soon ? "Em breve" : fmtClock(ep.duration_seconds)} · {trackTitle}
        </small>
      </div>
    </button>
  );
}

function DetailDialog({
  ep,
  cat,
  onClose,
  onPlay,
}: {
  ep: PlayEpisode;
  cat: PlayCatalog;
  onClose: () => void;
  onPlay: (e: PlayEpisode) => void;
}) {
  const track = cat.tracks.find((t) => t.id === ep.track_id);
  const eps = orderedEpisodes(cat).filter((e) => e.track_id === ep.track_id);
  const done = eps.filter((e) => cat.progress[e.id]?.completed).length;
  const pct = progressPct(ep, cat.progress[ep.id]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div
      className="lp-ov"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal
      aria-label={ep.title}
    >
      <div className="lp-det">
        <div className="lp-dh" style={{ backgroundImage: `url(${episodeThumb(ep)})` }}>
          <button type="button" className="lp-x" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
          <div className="c">
            <h3>{ep.title}</h3>
            <div className="lp-btns">
              <button
                type="button"
                className="lp-play"
                disabled={!ep.video_id}
                onClick={() => onPlay(ep)}
              >
                ▶{" "}
                {!ep.video_id
                  ? "Em breve"
                  : pct > 0 && pct < 100
                    ? "Continuar"
                    : pct === 100
                      ? "Assistir de novo"
                      : "Assistir"}
              </button>
            </div>
          </div>
        </div>
        <div className="lp-db">
          <div>
            <div className="lp-meta">
              <span className="m">{pct === 100 ? "✓ Assistido" : "Novo para você"}</span>
              <span>Ep. {ep.number}</span>
              <span>{fmtClock(ep.duration_seconds)}</span>
              <span className="hd">HD</span>
            </div>
            <p>{ep.description}</p>
          </div>
          <div className="side">
            <b>Trilha:</b> {track?.title}
            <br />
            <b>Progresso:</b> {done} de {eps.length} episódios
            <br />
            <b>Série:</b> {cat.settings?.series_title ?? "Lumma Play"}
          </div>
        </div>
        <div className="lp-eps">
          <h4>
            {track?.title} <small>{eps.length} episódios</small>
          </h4>
          {eps.map((e) => {
            const p = progressPct(e, cat.progress[e.id]);
            return (
              <button
                type="button"
                key={e.id}
                className={`lp-er ${e.id === ep.id ? "cur" : ""}`}
                onClick={() => (e.video_id ? onPlay(e) : undefined)}
              >
                <span className="n">{e.number}</span>
                <div className="tb" style={{ backgroundImage: `url(${episodeThumb(e)})` }}>
                  {p > 0 && (
                    <span className="lp-pg">
                      <i style={{ width: `${p}%` }} />
                    </span>
                  )}
                </div>
                <div>
                  <b>{e.title}</b>
                  <p>{e.video_id ? e.description : "Em breve"}</p>
                </div>
                <span className="d">{fmtMin(e.duration_seconds)}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function LummaPlay() {
  const { profile, user } = useAuth();
  const navigate = useNavigate();
  const { data: cat, isLoading, error } = useLummaPlayCatalog();
  const scroller = useRef<HTMLDivElement>(null);
  const [solid, setSolid] = useState(false);
  const [intro, setIntro] = useState<"show" | "hide" | "off">(() => {
    try {
      return typeof window !== "undefined" && window.sessionStorage.getItem(INTRO_KEY)
        ? "off"
        : "show";
    } catch {
      return "off";
    }
  });
  const [detail, setDetail] = useState<PlayEpisode | null>(null);
  const [playing, setPlaying] = useState<PlayEpisode | null>(null);

  useEffect(() => {
    if (intro !== "show") return;
    const a = window.setTimeout(() => setIntro("hide"), 2700);
    const b = window.setTimeout(() => {
      setIntro("off");
      try {
        window.sessionStorage.setItem(INTRO_KEY, "1");
      } catch {
        /* sem storage */
      }
    }, 3500);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [intro]);

  const eps = useMemo(() => (cat ? orderedEpisodes(cat) : []), [cat]);
  const cont = cat ? nextToWatch(cat) : null;
  const started = cat
    ? eps.filter((e) => {
        const p = cat.progress[e.id];
        return p && !p.completed && p.position_seconds > 5;
      })
    : [];
  const continueRow = cont ? eps.slice(eps.indexOf(cont), eps.indexOf(cont) + 4) : [];
  const totalMin = Math.round(eps.reduce((s, e) => s + e.duration_seconds, 0) / 60);
  const nome = firstName(profile?.full_name);
  const trackTitle = (id: string) => cat?.tracks.find((t) => t.id === id)?.title ?? "";
  const initials = (profile?.full_name || user?.email || "?")
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const play = (ep: PlayEpisode) => {
    setDetail(null);
    if (!ep.video_id) return;
    // Abre em tela cheia já no clique (o navegador só permite dentro do clique do usuário).
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) void el.requestFullscreen().catch(() => {});
    } catch {
      /* iPhone não tem fullscreen de página: segue na tela normal */
    }
    setPlaying(ep);
  };
  const scrollTo = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const [title1, title2] = (
    cat?.settings?.series_title ?? "Domine a Lumma, do início ao laudo"
  ).split(",");

  return (
    <div
      className="lp"
      ref={scroller}
      onScroll={(e) => setSolid((e.currentTarget.scrollTop ?? 0) > 60)}
    >
      {intro !== "off" && (
        <div className={`lp-intro ${intro === "hide" ? "hide" : ""}`} aria-hidden>
          <div className="lp-orb">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="lp-word">
            Lumma<small>PLAY</small>
          </div>
        </div>
      )}

      <nav className={`lp-nav ${solid ? "solid" : ""}`}>
        <div className="lp-logo">
          Lumma<b>PLAY</b>
        </div>
        <a
          className="on"
          onClick={() => scroller.current?.scrollTo({ top: 0, behavior: "smooth" })}
        >
          Início
        </a>
        <a onClick={() => scrollTo("lp-trilhas")}>Trilhas</a>
        {started.length > 0 && <a onClick={() => scrollTo("lp-cont")}>Continuar assistindo</a>}
        <div className="lp-right">
          {cat?.settings?.access_mode !== "all" && (
            <span className="lp-pill">Prévia · só para quem foi liberado</span>
          )}
          <button type="button" className="lp-back" onClick={() => navigate({ to: "/app" })}>
            ← <span className="full">Voltar para a Lumma</span>
            <span className="short">Voltar</span>
          </button>
          <span className="lp-av" title={profile?.full_name ?? user?.email ?? ""}>
            {initials}
          </span>
        </div>
      </nav>

      {isLoading && <div className="lp-empty">Carregando…</div>}
      {error && (
        <div className="lp-empty">
          Não foi possível carregar o Lumma Play agora. Tente de novo em instantes.
        </div>
      )}

      {cat && (
        <>
          <section className="lp-bill">
            <div className="lp-glow" />
            <div
              className="lp-shot lp-s2"
              style={{ backgroundImage: "url(/lumma-play/hero-2.jpg)" }}
            />
            <div
              className="lp-shot lp-s1"
              style={{ backgroundImage: "url(/lumma-play/hero-1.jpg)" }}
            />
            <div className="lp-bc">
              <div className="lp-orig">
                <Mini />
                SÉRIE ORIGINAL LUMMA
              </div>
              <h1>
                {title1.replace(/Lumma/, "")}
                {title1.includes("Lumma") && <em>Lumma</em>}
                {title2 && (
                  <>
                    ,<br />
                    {title2.trim()}
                  </>
                )}
              </h1>
              <div className="lp-meta">
                <span className="m">Novo</span>
                <span>2026</span>
                <span>{eps.length} episódios</span>
                <span>{totalMin} min</span>
                <span className="hd">HD</span>
              </div>
              <p>{cat.settings?.series_description}</p>
              <div className="lp-btns">
                {cont && (
                  <button
                    type="button"
                    className="lp-play"
                    disabled={!cont.video_id}
                    onClick={() => play(cont)}
                  >
                    ▶{" "}
                    {!cont.video_id
                      ? "Em breve"
                      : started.some((s) => s.id === cont.id)
                        ? `Continuar · Ep. ${cont.number}`
                        : cont.number === 1
                          ? "Assistir"
                          : `Assistir · Ep. ${cont.number}`}
                  </button>
                )}
                {eps[0] && (
                  <button
                    type="button"
                    className="lp-more"
                    onClick={() => setDetail(cont ?? eps[0])}
                  >
                    ⓘ Mais informações
                  </button>
                )}
              </div>
            </div>
          </section>

          <div className="lp-rows">
            {started.length > 0 && continueRow.length > 0 && (
              <div className="lp-row" id="lp-cont">
                <h2>
                  Continuar assistindo{nome ? `, ${nome}` : ""}{" "}
                  <small>você parou no episódio {cont?.number}</small>
                </h2>
                <div className="lp-track">
                  {continueRow.map((e) => (
                    <EpisodeCard
                      key={e.id}
                      ep={e}
                      cat={cat}
                      onOpen={setDetail}
                      onPlay={play}
                      trackTitle={trackTitle(e.track_id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {eps.length >= 3 && (
              <div className="lp-row lp-top3">
                <h2>
                  Comece por aqui <small>os 3 primeiros passos</small>
                </h2>
                <div className="lp-track">
                  {eps.slice(0, 3).map((e, i) => (
                    <button
                      type="button"
                      key={e.id}
                      className="lp-card"
                      onClick={() => setDetail(e)}
                    >
                      <span className="lp-big" aria-hidden>
                        {i + 1}
                      </span>
                      <div
                        className="lp-thumb"
                        style={{ backgroundImage: `url(${episodeThumb(e)})` }}
                      >
                        <span className="ep">EP. {e.number}</span>
                        <span className="t">{e.title}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div id="lp-trilhas">
              {cat.tracks.map((t) => {
                const list = eps.filter((e) => e.track_id === t.id);
                if (!list.length) return null;
                const done = list.filter((e) => cat.progress[e.id]?.completed).length;
                return (
                  <div className="lp-row" key={t.id}>
                    <h2>
                      {t.title}{" "}
                      <small>
                        {done}/{list.length} assistidos
                      </small>
                    </h2>
                    <div className="lp-track">
                      {list.map((e) => (
                        <EpisodeCard
                          key={e.id}
                          ep={e}
                          cat={cat}
                          onOpen={setDetail}
                          onPlay={play}
                          trackTitle={t.title}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            {eps.length === 0 && (
              <div className="lp-empty">Os episódios estão chegando. Volte em breve.</div>
            )}
          </div>
        </>
      )}

      {detail && cat && (
        <DetailDialog ep={detail} cat={cat} onClose={() => setDetail(null)} onPlay={play} />
      )}
      {playing && cat && (
        <LummaPlayPlayer
          ep={playing}
          cat={cat}
          onClose={() => setPlaying(null)}
          onNext={(n) => setPlaying(n)}
        />
      )}
    </div>
  );
}
