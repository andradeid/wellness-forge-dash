import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { PlayCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Aviso de novidade do Lumma Play. Abre uma vez por sessão do navegador
 * (sessionStorage), para que todos vejam ao entrar sem repetir a cada página.
 */
const KEY = "lumma-play-announcement-seen";

export function LummaPlayAnnouncement() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    try {
      if (sessionStorage.getItem(KEY) !== "1") setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  const close = () => {
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {
      /* navegador sem storage: apenas fecha */
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
      <DialogContent className="sm:max-w-md overflow-hidden p-0">
        <div
          className="h-36 bg-cover bg-center"
          style={{ backgroundImage: "url(/lumma-play/hero-1.jpg)" }}
          aria-hidden
        />
        <div className="space-y-4 px-6 pb-6">
          <DialogHeader>
            <span className="w-fit rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] px-3 py-1 text-xs font-semibold text-primary-foreground">
              Novidade
            </span>
            <DialogTitle className="text-xl">Conheça o Lumma Play</DialogTitle>
            <DialogDescription className="text-sm leading-relaxed">
              Nossa nova área de treinamento, com tudo explicado passo a passo: como enviar
              exames, conversar com os agentes e tirar o melhor da Lumma no seu dia a dia de
              consultório.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" className="rounded-full" onClick={close}>
              Ver depois
            </Button>
            <Button
              className="rounded-full bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-primary-foreground hover:opacity-90"
              onClick={() => {
                close();
                void navigate({ to: "/app/play" });
              }}
            >
              <PlayCircle className="mr-2 h-4 w-4" />
              Acessar treinamento
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
