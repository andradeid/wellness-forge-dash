import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ShieldAlert, UserPlus, UserCog, KeyRound, Lock, Mail, Eye } from "lucide-react";

import {
  listOperationalLogs,
  getOperationalStats,
  type OperationalLog,
} from "@/lib/audit-admin.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 25;

/** Rótulos amigáveis (pt-BR) para cada evento operacional registrado. */
const EVENT_META: Record<string, { label: string; icon: any; className: string }> = {
  manual_user_edit: { label: "Edição de conta", icon: UserCog, className: "border-amber-500 text-amber-700" },
  manual_user_creation: { label: "Criação de acesso", icon: UserPlus, className: "border-emerald-500 text-emerald-700" },
  manual_user_block_toggle: { label: "Bloqueio / Desbloqueio", icon: Lock, className: "border-red-500 text-red-700" },
  manual_password_reset: { label: "Reset de senha", icon: KeyRound, className: "border-blue-500 text-blue-700" },
  email_change: { label: "Troca de e-mail", icon: Mail, className: "border-violet-500 text-violet-700" },
  manual_user_delete: { label: "Exclusão de conta", icon: ShieldAlert, className: "border-red-600 text-red-700" },
  manual_role_change: { label: "Alteração de permissão", icon: ShieldAlert, className: "border-orange-500 text-orange-700" },
  manual_seats_change: { label: "Alteração de assentos", icon: UserCog, className: "border-sky-500 text-sky-700" },
  admin_view_conversation: { label: "Leitura de conversa", icon: Eye, className: "border-slate-400 text-slate-600" },
};

/** Rótulos dos campos alterados em edições manuais. */
const FIELD_LABELS: Record<string, string> = {
  plan_type: "Plano",
  expires_at: "Validade",
  credits_reset: "Créditos",
  is_blocked: "Bloqueado",
  full_name: "Nome",
  email: "E-mail",
  phone: "Telefone",
  seats_override: "Assentos",
  unlimited_credits: "Ilimitado",
};

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "vazio";
  if (typeof v === "boolean") return v ? "sim" : "não";
  const s = String(v);
  // Datas ISO viram DD/MM/AAAA
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return new Date(s).toLocaleDateString("pt-BR");
  return s;
}

export function OperationalAuditSection() {
  const fnList = useServerFn(listOperationalLogs);
  const fnStats = useServerFn(getOperationalStats);

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [event, setEvent] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const statsQuery = useQuery({
    queryKey: ["admin", "op-audit", "stats"],
    queryFn: () => fnStats({ data: { days: 30 } }) as Promise<{ counts: Record<string, number>; total: number }>,
    staleTime: 60_000,
  });

  const logsQuery = useQuery({
    queryKey: ["admin", "op-audit", debouncedQ, event, page],
    queryFn: () =>
      fnList({ data: { q: debouncedQ, event, page, pageSize: PAGE_SIZE } }) as Promise<{
        rows: OperationalLog[];
        total: number;
        filtered: boolean;
      }>,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });

  const rows = logsQuery.data?.rows ?? [];
  const total = logsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const cards = useMemo(() => {
    const counts = statsQuery.data?.counts ?? {};
    return Object.keys(EVENT_META)
      .map((key) => ({ key, count: counts[key] ?? 0, ...EVENT_META[key] }))
      .filter((c) => c.count > 0);
  }, [statsQuery.data]);

  return (
    <div className="space-y-4">
      {cards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {cards.map((c) => {
            const Icon = c.icon;
            const active = event === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => {
                  setEvent(active ? "" : c.key);
                  setPage(1);
                }}
                className={`rounded-lg border bg-card p-4 text-left shadow-sm transition hover:shadow-md ${
                  active ? "ring-2 ring-primary" : ""
                }`}
              >
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <Icon className="h-4 w-4" /> {c.label}
                </div>
                <div className="mt-2 text-2xl font-semibold">{c.count}</div>
                <div className="text-[11px] text-muted-foreground">últimos 30 dias</div>
              </button>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-base">Ações operacionais</CardTitle>
          <div className="flex items-center gap-2">
            {event && (
              <Button variant="ghost" size="sm" onClick={() => { setEvent(""); setPage(1); }}>
                Limpar filtro
              </Button>
            )}
            <Input
              className="w-72"
              placeholder="Buscar por usuário afetado, responsável ou motivo..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {logsQuery.isLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando registros...
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Data/Hora</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Usuário afetado</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Alterações</TableHead>
                    <TableHead>Justificativa</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const meta = EVENT_META[r.event] ?? {
                      label: r.event,
                      icon: ShieldAlert,
                      className: "",
                    };
                    const Icon = meta.icon;
                    const changes = r.changes ? Object.entries(r.changes) : [];
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {new Date(r.created_at).toLocaleString("pt-BR")}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={meta.className}>
                            <Icon className="h-3 w-3 mr-1" /> {meta.label}
                          </Badge>
                          {r.status !== "success" && (
                            <Badge variant="destructive" className="ml-1 text-[10px]">
                              {r.status}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.target ? (
                            <div className="flex flex-col">
                              <span className="font-medium">{r.target.full_name ?? r.target.email}</span>
                              {r.target.full_name && (
                                <span className="text-[10px] text-muted-foreground">{r.target.email}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {r.actor ? (
                            <div className="flex flex-col">
                              <span className="font-medium">{r.actor.full_name ?? r.actor.email}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {r.actor_role ?? r.source}
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">{r.source}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {changes.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              {changes.map(([field, val]: any) => (
                                <span key={field}>
                                  <span className="text-muted-foreground">
                                    {FIELD_LABELS[field] ?? field}:
                                  </span>{" "}
                                  <span className="line-through opacity-60">{formatValue(val?.from)}</span>
                                  {" → "}
                                  <span className="font-medium">{formatValue(val?.to)}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs max-w-xs">
                          {r.reason ? (
                            <span title={r.reason}>{r.reason}</span>
                          ) : (
                            <span className="text-muted-foreground italic">sem justificativa</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-10">
                        Nenhuma ação operacional registrada com esses filtros.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between mt-4 text-sm">
                <span className="text-muted-foreground">
                  Página {page} de {totalPages} — {total} registros
                  {logsQuery.data?.filtered ? " (resultado da busca)" : ""}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={logsQuery.isFetching || page <= 1}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={logsQuery.isFetching || page >= totalPages}
                  >
                    Próximo
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
