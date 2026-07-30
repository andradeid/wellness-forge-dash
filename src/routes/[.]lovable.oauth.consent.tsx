import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ShieldCheck } from "lucide-react";
import lummaSymbol from "@/assets/lumma-symbol.svg";

/**
 * Tela de consentimento OAuth 2.1 do Supabase.
 *
 * O Supabase redireciona o usuário para cá com `authorization_id` quando um
 * cliente MCP (Claude, ChatGPT, etc.) pede acesso ao servidor MCP da Lumma.
 * A aprovação é sempre humana e explícita.
 */

interface AuthorizationDetails {
  client?: { name?: string | null; client_id?: string | null } | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
  scope?: string | null;
}

interface OAuthResult {
  data: AuthorizationDetails | null;
  error: { message: string } | null;
}

/** `supabase.auth.oauth` ainda é beta e pode não estar nos tipos publicados. */
function oauthApi() {
  const api = (supabase.auth as unknown as { oauth?: Record<string, unknown> }).oauth;
  if (!api) throw new Error("Servidor OAuth do Supabase indisponível neste projeto.");
  return api as {
    getAuthorizationDetails: (id: string) => Promise<OAuthResult>;
    approveAuthorization: (id: string) => Promise<OAuthResult>;
    denyAuthorization: (id: string) => Promise<OAuthResult>;
  };
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // Somente browser: a sessão do Supabase vive no localStorage.
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    authorization_id: typeof search.authorization_id === "string" ? search.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Requisição de autorização inválida.");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/login", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauthApi().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: ConsentPage,
  pendingComponent: () => (
    <Shell>
      <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando pedido de autorização...
      </div>
    </Shell>
  ),
  errorComponent: ({ error }) => (
    <Shell>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Não foi possível carregar este pedido de autorização. Ele pode ter expirado — feche esta
          janela e tente conectar novamente pelo seu aplicativo.
        </p>
        <p className="text-xs text-muted-foreground/80">
          Detalhe: {String((error as Error)?.message ?? error)}
        </p>
      </CardContent>
    </Shell>
  ),
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen w-full flex items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-md shadow-md rounded-lg">
        <CardHeader className="items-center text-center space-y-3">
          <div className="h-14 w-14 rounded-2xl bg-card shadow-sm flex items-center justify-center">
            <img src={lummaSymbol} alt="LUMMA" className="h-10 w-10" />
          </div>
          <CardTitle className="text-xl">Autorizar acesso</CardTitle>
          <CardDescription>Conexão externa com sua conta LUMMA</CardDescription>
        </CardHeader>
        {children}
      </Card>
    </main>
  );
}

function ConsentPage() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientName = details?.client?.name ?? "um aplicativo externo";

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = oauthApi();
    const { data, error: decisionError } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);

    if (decisionError) {
      setBusy(false);
      setError(decisionError.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("O servidor de autorização não retornou um destino de retorno.");
      return;
    }
    window.location.href = target;
  }

  return (
    <Shell>
      <CardContent className="space-y-5">
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <p className="text-sm text-foreground">
            <span className="font-medium">{clientName}</span> quer acessar a Lumma em seu nome.
          </p>
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            O acesso é somente leitura aos dados de curadoria e respeita exatamente as suas
            permissões. Nada pode ser criado, alterado ou apagado.
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" disabled={busy} onClick={() => decide(false)}>
            Recusar
          </Button>
          <Button
            className="flex-1 text-white border-0 shadow-md"
            style={{ backgroundImage: "var(--gradient-brand)" }}
            disabled={busy}
            onClick={() => decide(true)}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Autorizar"}
          </Button>
        </div>
      </CardContent>
    </Shell>
  );
}
