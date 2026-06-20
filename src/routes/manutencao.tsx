import { createFileRoute, Link } from "@tanstack/react-router";
import DOMPurify from "dompurify";
import { useEffect } from "react";
import { LogIn } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { Button } from "@/components/ui/button";

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

  // Garante que o usuário não fica preso em uma sessão durante a manutenção.
  useEffect(() => {
    void supabase.auth.signOut();
  }, []);

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
    <div className="relative min-h-screen bg-background">
      <div dangerouslySetInnerHTML={{ __html: safe }} />

      <div className="fixed bottom-6 right-6 z-50">
        <Button
          asChild
          size="lg"
          className="rounded-full shadow-lg bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white hover:opacity-90 border-0"
        >
          <Link to="/login">
            <LogIn className="mr-2 h-4 w-4" />
            Voltar ao login
          </Link>
        </Button>
      </div>
    </div>
  );
}
