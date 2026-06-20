import { createFileRoute } from "@tanstack/react-router";
import DOMPurify from "dompurify";
import { useSystemSettings } from "@/hooks/useSystemSettings";

export const Route = createFileRoute("/manutencao")({
  head: () => ({
    meta: [
      { title: "Em atualização — LUMMA" },
      { name: "description", content: "O sistema está temporariamente em manutenção." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: MaintenancePage,
});

function MaintenancePage() {
  const { data, isLoading } = useSystemSettings();

  if (isLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background text-muted-foreground text-sm">
        Carregando...
      </div>
    );
  }

  const html = data?.maintenance_html ?? "";
  const safe = typeof window !== "undefined" ? DOMPurify.sanitize(html) : "";

  return (
    <div className="min-h-screen bg-background">
      <div dangerouslySetInnerHTML={{ __html: safe }} />
    </div>
  );
}
