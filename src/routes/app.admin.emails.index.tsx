import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mail, Save, Send, Copy, Check, Eye } from "lucide-react";
import { toast } from "sonner";

import {
  listEmailTemplates,
  updateEmailTemplate,
  sendTestEmail,
} from "@/lib/email-templates.functions";
import { useAuth } from "@/hooks/useAuth";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/app/admin/emails/")({
  component: EmailsAdminPage,
});

type Template = {
  id: string;
  key: string;
  category: string;
  name: string;
  description: string | null;
  subject: string;
  html: string;
  variables: string[];
  is_active: boolean;
  updated_at: string;
};

function EmailsAdminPage() {
  const { role, loading: authLoading } = useAuth();
  const list = useServerFn(listEmailTemplates);
  const update = useServerFn(updateEmailTemplate);
  const sendTest = useServerFn(sendTestEmail);
  const qc = useQueryClient();

  const isSuperAdmin = role === "super_admin";

  const query = useQuery({
    queryKey: ["admin-email-templates"],
    queryFn: () => list(),
    enabled: isSuperAdmin,
  });

  const templates = ((query.data ?? []) as unknown) as Template[];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [copied, setCopied] = useState(false);

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  );

  useEffect(() => {
    if (!selectedId && templates.length > 0) setSelectedId(templates[0].id);
  }, [templates, selectedId]);

  useEffect(() => {
    if (selected) {
      setSubject(selected.subject);
      setHtml(selected.html);
    }
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      await update({ data: { id: selected.id, subject, html } });
    },
    onSuccess: () => {
      toast.success("Template salvo");
      qc.invalidateQueries({ queryKey: ["admin-email-templates"] });
    },
    onError: (err: any) => toast.error(err?.message ?? "Erro ao salvar"),
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      await sendTest({ data: { templateId: selected.id, to: testEmail.trim() } });
    },
    onSuccess: () => toast.success(`E-mail de teste enviado para ${testEmail}`),
    onError: (err: any) => toast.error(err?.message ?? "Falha ao enviar"),
  });

  const copyHtml = async () => {
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Acesso restrito a super administradores.
      </div>
    );
  }

  const grouped = templates.reduce<Record<string, Template[]>>((acc, t) => {
    (acc[t.category] ||= []).push(t);
    return acc;
  }, {});

  const categoryLabel = (c: string) =>
    c === "transactional"
      ? "Transacionais (Stripe)"
      : c === "auth_reference"
        ? "Autenticação (Supabase)"
        : c;

  const isReference = selected?.category === "auth_reference";

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-[#e8a04c] to-[#e89bcf] text-white">
          <Mail className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Templates de e-mail</h1>
          <p className="text-sm text-muted-foreground">
            Edite o conteúdo dos e-mails enviados pelo sistema e faça envios de teste.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* Lista */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Templates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {query.isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {Object.entries(grouped).map(([cat, items]) => (
              <div key={cat} className="space-y-2">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {categoryLabel(cat)}
                </div>
                <div className="space-y-1">
                  {items.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedId(t.id)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition ${
                        selectedId === t.id
                          ? "bg-primary/10 text-primary font-medium"
                          : "hover:bg-muted"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="truncate">{t.name}</span>
                        {!t.is_active && (
                          <Badge variant="outline" className="text-[10px]">
                            off
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">{t.key}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Editor + Preview */}
        {selected && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{selected.name}</CardTitle>
                    {selected.description && (
                      <p className="text-xs text-muted-foreground mt-1">{selected.description}</p>
                    )}
                  </div>
                  <Badge variant={isReference ? "outline" : "default"}>
                    {isReference ? "Referência" : "Editável e ativo"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {isReference && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    Este e-mail é enviado pelo Supabase Auth. Edite aqui, copie o HTML e cole em{" "}
                    <strong>Supabase → Authentication → Email Templates</strong>. As variáveis usam
                    a sintaxe do Supabase (ex.: <code>{"{{ .ConfirmationURL }}"}</code>).
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-xs">Assunto</Label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">HTML</Label>
                    <Button variant="ghost" size="sm" onClick={copyHtml}>
                      {copied ? (
                        <Check className="h-3.5 w-3.5 mr-1" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 mr-1" />
                      )}
                      Copiar HTML
                    </Button>
                  </div>
                  <Textarea
                    value={html}
                    onChange={(e) => setHtml(e.target.value)}
                    className="font-mono text-xs min-h-[280px]"
                  />
                </div>

                {selected.variables?.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-xs">Variáveis disponíveis</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {selected.variables.map((v) => (
                        <code
                          key={v}
                          className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono"
                        >
                          {`{{${v}}}`}
                        </code>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-end gap-3 pt-2 border-t">
                  <div className="flex-1 min-w-[220px] space-y-1">
                    <Label className="text-xs">Enviar teste para</Label>
                    <Input
                      type="email"
                      placeholder="email@exemplo.com"
                      value={testEmail}
                      onChange={(e) => setTestEmail(e.target.value)}
                    />
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => sendMutation.mutate()}
                    disabled={
                      !testEmail.trim() || sendMutation.isPending || isReference
                    }
                    title={
                      isReference
                        ? "E-mails de autenticação são enviados pelo Supabase, não pelo Resend"
                        : ""
                    }
                  >
                    {sendMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Enviar teste
                  </Button>
                  <Button
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                    className="bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white hover:opacity-90"
                  >
                    {saveMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Salvar
                  </Button>
                </div>
                {isReference && (
                  <p className="text-[11px] text-muted-foreground">
                    O envio de teste está desabilitado para templates de autenticação — o disparo
                    real acontece pelo Supabase quando um usuário se cadastra, redefine senha, etc.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Eye className="h-4 w-4" /> Pré-visualização
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border overflow-hidden bg-white">
                  <iframe
                    title="Preview"
                    srcDoc={html}
                    sandbox=""
                    className="w-full h-[600px] bg-white"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
