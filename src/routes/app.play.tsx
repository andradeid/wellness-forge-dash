import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLummaPlayAccess } from "@/lib/lumma-play";
import { LummaPlay } from "@/components/lumma-play/LummaPlay";
import playCss from "@/components/lumma-play/lumma-play.css?url";

export const Route = createFileRoute("/app/play")({
  head: () => ({
    meta: [{ title: "Lumma Play" }],
    links: [{ rel: "stylesheet", href: playCss }],
  }),
  component: LummaPlayPage,
});

/** Lumma Play: só abre para quem o banco liberar (lumma_play_can_view). */
function LummaPlayPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const access = useLummaPlayAccess(!!session);

  useEffect(() => {
    if (!loading && access.isFetched && access.data === false) {
      void navigate({ to: "/unauthorized", replace: true });
    }
  }, [loading, access.isFetched, access.data, navigate]);

  if (loading || !access.isFetched || access.data !== true) {
    return <div style={{ height: "100%", background: "#0d0712" }} />;
  }
  return <LummaPlay />;
}
