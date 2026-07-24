import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  Copy,
  FlaskConical,
  Gift,
  KeyRound,
  LogIn,
  MessageSquare,
  ShieldAlert,
  Users,
  Coins,
  Info,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { getOperationalAnalytics } from "@/lib/analytics-admin.functions";

function Kpi({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-2xl font-semibold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{hint}</div>
    </Card>
  );
}

export function OperationalAnalyticsSection({ hours }: { hours: number }) {
  const fetchOps = useServerFn(getOperationalAnalytics);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["operational-analytics", hours],
    queryFn: () => fetchOps({ data: { hours } }),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Carregando resumo operacional…
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="p-6 text-sm text-rose-700">
        Falha ao carregar resumo operacional: {(error as Error)?.message ?? "erro"}
      </Card>
    );
  }

  const op = data?.operational;
  const lf = data?.langfuse;
  if (!op) return null;

  const examOkPct =
    op.examsTotal > 0 ? Math.round((op.examsWithDifyFileId / op.examsTotal) * 100) : 100;

  const copyWhatsapp = () => {
    if (!op) return;
    const nowStr = format(new Date(), "dd/MM/yyyy", { locale: ptBR });
    const periodo =
      hours <= 24 ? "últimas 24h" : hours <= 24 * 7 ? "últimos 7 dias" : hours <= 24 * 30 ? "últimos 30 dias" : `últimos ${Math.round(hours / 24)} dias`;
    const top = op.topDebitUsers
      .slice(0, 5)
      .map((u, i) => `${i + 1}. ${u.fullName || u.email || "—"} (${u.debits})`)
      .join("\n");
    // Veredito dinâmico
    const peakHour = op.concurrencyPeakAt ? new Date(op.concurrencyPeakAt).getHours() : null;
    const periodoDia =
      peakHour === null ? "" :
      peakHour < 6 ? "de madrugada" :
      peakHour < 12 ? "pela manhã" :
      peakHour < 18 ? "à tarde" : "à noite";
    const saude =
      op.assistantErrorMessages === 0 && examOkPct >= 95
        ? "sem falha operacional no fluxo de exame/chat"
        : op.assistantErrorMessages <= 2
        ? "estabilidade ok, poucas falhas no chat"
        : `atenção: ${op.assistantErrorMessages} falhas no chat`;
    const adocao =
      op.mustChangePasswordStill > 100
        ? `adoção (${op.mustChangePasswordStill.toLocaleString("pt-BR")} com senha pendente)`
        : op.realActiveUsers < op.loginsUnique / 2
        ? "engajamento (muitos logam e não usam)"
        : "conversão de novos débitos";
    const clima =
      op.debitsCount > 50 && op.realActiveUsers > 20
        ? "Dia saudável"
        : op.debitsCount > 10
        ? "Dia morno"
        : "Dia fraco";
    const veredito = `\n\n📌 *Veredito:* ${clima} — ativação com ${op.loginsUnique} logins, uso real concentrado ${periodoDia || "ao longo do dia"}, ${saude}. O gargalo agora é ${adocao}, não estabilidade.`;

    const msg =
`📊 *LUMMA — Resumo operacional (${nowStr})*
Período: ${periodo}

👤 *Logins únicos:* ${op.loginsUnique} (${op.loginEvents} sessões)
✅ *Usuários ativos reais:* ${op.realActiveUsers} (login ∪ chat ∪ exame ∪ débito)
💬 *Mensagens de usuário:* ${op.userMessages.toLocaleString("pt-BR")} · ${op.chatUsers} pessoas
🧪 *Exames enviados:* ${op.examsTotal} (${op.examUploaders} pessoas) · ${examOkPct}% com dify_file_id
🪙 *Débitos (uso):* ${op.debitsCount.toLocaleString("pt-BR")} · ${op.debitsAmountSum.toLocaleString("pt-BR")} créditos · ${op.debitUsers} pessoas
🎁 *Grants/cortesia:* ${op.grantsCount.toLocaleString("pt-BR")} · ${op.grantsAmountSum.toLocaleString("pt-BR")} créditos · ${op.grantUsers} pessoas
👥 *Pacientes novos:* ${op.patientsCreated} · *Chats novos:* ${op.chatsCreated}
⚡ *Pico de concorrência ≈* ${op.concurrencyPeakUsers} usuários${op.concurrencyPeakAt ? ` (${format(new Date(op.concurrencyPeakAt), "dd/MM 'às' HH:mm", { locale: ptBR })})` : ""} — janela ${op.concurrencyWindowMinutes} min
🔐 *Senha:* ${op.mustChangePasswordStill} ainda pendentes · ${op.passwordClearedProxy} liberaram no período
⚠️ *Falhas no chat:* ${op.assistantErrorMessages}${top ? `\n\n🏆 *Top consumo:*\n${top}` : ""}${veredito}`;



    navigator.clipboard.writeText(msg).then(
      () => toast.success("Resumo copiado — cole no WhatsApp"),
      () => toast.error("Não consegui copiar"),
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Resumo operacional</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Histórico sob demanda (sem Realtime). Grant/cortesia separado de uso real.
            Concorrência = usuários distintos com débito ou exame na mesma janela de{" "}
            {op.concurrencyWindowMinutes} min (aproximação).
          </p>
        </div>
        <Button
          size="sm"
          onClick={copyWhatsapp}
          className="bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white border-0 hover:opacity-90"
        >
          <Copy className="h-4 w-4 mr-2" />
          Copiar para WhatsApp
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          icon={<LogIn className="h-4 w-4" />}
          label="Logins únicos"
          value={String(op.loginsUnique)}
          hint={`${op.loginEvents} eventos de sessão`}
        />
        <Kpi
          icon={<Users className="h-4 w-4" />}
          label="Usuários ativos reais"
          value={String(op.realActiveUsers)}
          hint="Login ∪ chat ∪ exame ∪ débito"
        />
        <Kpi
          icon={<FlaskConical className="h-4 w-4" />}
          label="Exames enviados"
          value={String(op.examsTotal)}
          hint={`${examOkPct}% com dify_file_id · ${op.examUploaders} pessoas`}
        />
        <Kpi
          icon={<Activity className="h-4 w-4" />}
          label="Pico concorrência ≈"
          value={String(op.concurrencyPeakUsers)}
          hint={
            op.concurrencyPeakAt
              ? format(new Date(op.concurrencyPeakAt), "dd/MM 'às' HH:mm", { locale: ptBR })
              : "Sem eventos no período"
          }
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          icon={<Coins className="h-4 w-4" />}
          label="Débitos (uso)"
          value={op.debitsCount.toLocaleString("pt-BR")}
          hint={`${op.debitsAmountSum.toLocaleString("pt-BR")} créditos · ${op.debitUsers} pessoas`}
        />
        <Kpi
          icon={<Gift className="h-4 w-4" />}
          label="Grants / cortesia"
          value={op.grantsCount.toLocaleString("pt-BR")}
          hint={`${op.grantsAmountSum.toLocaleString("pt-BR")} créditos · ${op.grantUsers} pessoas`}
        />
        <Kpi
          icon={<MessageSquare className="h-4 w-4" />}
          label="Msgs de usuário"
          value={op.userMessages.toLocaleString("pt-BR")}
          hint={`${op.chatUsers} pessoas · ${op.totalMessages} msgs total`}
        />
        <Kpi
          icon={<KeyRound className="h-4 w-4" />}
          label="Senha"
          value={String(op.passwordClearedProxy)}
          hint={`liberaram no período (proxy) · ${op.mustChangePasswordStill} ainda pendente`}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          icon={<Users className="h-4 w-4" />}
          label="Pacientes criados"
          value={String(op.patientsCreated)}
          hint={`${op.chatsCreated} chats novos`}
        />
        <Kpi
          icon={<ShieldAlert className="h-4 w-4" />}
          label="Falhas no chat"
          value={String(op.assistantErrorMessages)}
          hint="assistant com structured_data.error"
        />
      </div>

      {/* Langfuse */}
      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Saúde IA (Langfuse)
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Traces e erros do período — sob demanda, não tempo real.
            </p>
          </div>
          {lf && (
            <div className="text-xs text-muted-foreground">
              {lf.configured ? "conectado" : "não configurado"}
            </div>
          )}
        </div>

        {!lf?.configured ? (
          <p className="text-sm text-amber-800 bg-amber-50 rounded-md px-3 py-2">
            {lf?.warning ?? "Configure LANGFUSE_PUBLIC_KEY e LANGFUSE_SECRET_KEY no servidor."}
          </p>
        ) : lf.warning ? (
          <p className="text-sm text-amber-800 bg-amber-50 rounded-md px-3 py-2">{lf.warning}</p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-muted-foreground">Traces no período</div>
              <div className="text-xl font-semibold">{(lf.tracesTotal ?? 0).toLocaleString("pt-BR")}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Observations ERROR</div>
              <div className={`text-xl font-semibold ${(lf.errorObservations ?? 0) > 0 ? "text-rose-700" : ""}`}>
                {(lf.errorObservations ?? 0).toLocaleString("pt-BR")}
              </div>
            </div>
          </div>
        )}

        {lf?.errorSample && lf.errorSample.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-3 font-normal">Quando</th>
                  <th className="py-2 pr-3 font-normal">Nó</th>
                  <th className="py-2 font-normal">Mensagem</th>
                </tr>
              </thead>
              <tbody>
                {lf.errorSample.map((e, i) => (
                  <tr key={`${e.traceId}-${i}`} className="border-b last:border-0">
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {e.at ? format(new Date(e.at), "dd/MM HH:mm", { locale: ptBR }) : "—"}
                    </td>
                    <td className="py-2 pr-3">{e.name}</td>
                    <td className="py-2 text-muted-foreground">{e.message || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {op.topDebitUsers.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-medium text-foreground">Top consumo (débitos) no período</h3>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="O que é isso?">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs leading-relaxed">
                Conta <strong>débitos financeiros</strong> do usuário: cada linha de débito no ledger de créditos (quantas vezes gastou crédito). Diferente do <em>Ranking de uso</em>, que conta ações clínicas (feedbacks + resultados de exames).
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-4 font-normal">#</th>
                  <th className="py-2 pr-4 font-normal">Usuário</th>
                  <th className="py-2 font-normal text-right">Débitos</th>
                </tr>
              </thead>
              <tbody>
                {op.topDebitUsers.map((u, i) => (
                  <tr key={u.userId} className="border-b last:border-0">
                    <td className="py-2 pr-4 text-muted-foreground">{i + 1}</td>
                    <td className="py-2 pr-4">
                      <div className="font-medium">{u.fullName || "—"}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </td>
                    <td className="py-2 text-right font-medium">{u.debits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
