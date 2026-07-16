import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";

import appCss from "../styles.css?url";
import lummaSymbol from "@/assets/lumma-symbol.svg";
import { AuthProvider } from "@/hooks/useAuth";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f5f0] px-4">
      <div className="max-w-lg w-full text-center">
        <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center">
          <img src={lummaSymbol} alt="Lumma" className="h-16 w-16 animate-pulse" />
        </div>
        <h1
          className="text-8xl font-light bg-clip-text text-transparent"
          style={{
            backgroundImage: "linear-gradient(135deg, #e8a04c 0%, #e89bcf 100%)",
          }}
        >
          404
        </h1>
        <h2
          className="mt-4 text-3xl text-[#3d5a4a]"
          
        >
          Página não encontrada
        </h2>
        <p className="mt-3 text-sm text-[#6b7c72] leading-relaxed">
          A página que você procura não existe, foi movida ou o endereço está incorreto.
          <br />
          Vamos te levar de volta para um lugar calmo e organizado.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            to="/app"
            className="inline-flex items-center justify-center rounded-full px-6 py-2.5 text-sm font-medium text-white transition-all hover:opacity-90 shadow-md"
            style={{ backgroundImage: "linear-gradient(135deg, #e8a04c 0%, #e89bcf 100%)" }}
          >
            Voltar ao painel
          </Link>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full border border-[#3d5a4a]/20 bg-white px-6 py-2.5 text-sm font-medium text-[#3d5a4a] transition-colors hover:bg-[#3d5a4a]/5"
          >
            Ir para o início
          </Link>
        </div>
      </div>
    </div>
  );
}

function isRecoverableRouteLoadError(error: Error): boolean {
  const text = `${error?.name ?? ""} ${error?.message ?? ""} ${error?.stack ?? ""}`.toLowerCase();
  return /failed to fetch dynamically imported module|importing a module script failed|failed to load module script|loading chunk|chunkloaderror|fetchmodule|transport was disconnected/.test(text);
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const errorMessage = error?.message?.trim();
  const recoverableRouteLoadError = isRecoverableRouteLoadError(error);

  useEffect(() => {
    if (!recoverableRouteLoadError || typeof window === "undefined") return;
    try {
      const reloadKey = "lumma:route-load-error-reloaded";
      const fingerprint = `${error?.name ?? "Error"}:${error?.message ?? ""}`.slice(0, 300);
      const previous = window.sessionStorage.getItem(reloadKey);
      if (previous === fingerprint) return;
      window.sessionStorage.setItem(reloadKey, fingerprint);
    } catch {
      // Se o storage estiver bloqueado, ainda tentamos recuperar com um reload único.
    }
    window.location.reload();
  }, [recoverableRouteLoadError, error?.name, error?.message]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Não foi possível carregar esta tela
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Algo impediu a abertura desta página. Tente novamente ou volte para o início.
        </p>
        {import.meta.env.DEV && errorMessage ? (
          <p className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-left text-xs text-destructive">
            <span className="font-medium">Detalhe técnico:</span> {errorMessage}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              if (recoverableRouteLoadError && typeof window !== "undefined") {
                try {
                  window.sessionStorage.removeItem("lumma:route-load-error-reloaded");
                } catch {
                  // ignore
                }
                window.location.reload();
                return;
              }
              void router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Ir para o início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Lumma - IA para Nutricionistas" },
      { name: "description", content: "Assistente de IA educacional para nutricionistas especializada em Nutrição Funcional, Modulação Intestinal e Eixo Hormonal Feminino" },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Lumma - IA para Nutricionistas" },
      { property: "og:description", content: "Assistente de IA educacional para nutricionistas especializada em Nutrição Funcional, Modulação Intestinal e Eixo Hormonal Feminino" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Lumma - IA para Nutricionistas" },
      { name: "twitter:description", content: "Assistente de IA educacional para nutricionistas especializada em Nutrição Funcional, Modulação Intestinal e Eixo Hormonal Feminino" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/m4ObaaFhNYdFxoxGPJGgFdEXEzk2/social-images/social-1778369532306-Screenshot_1.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/m4ObaaFhNYdFxoxGPJGgFdEXEzk2/social-images/social-1778369532306-Screenshot_1.webp" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    </QueryClientProvider>
  );
}
