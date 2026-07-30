import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useSystemSettings, useUpdateSystemSettings, type SystemSettings } from "@/hooks/useSystemSettings";

export const Route = createFileRoute("/app/admin/system")({
  head: () => ({ meta: [{ title: "Sistema — Admin" }] }),
  component: AdminSystemPage,
});

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Belem",
  "America/Fortaleza",
  "America/Recife",
  "America/Bahia",
  "America/Cuiaba",
  "America/Rio_Branco",
  "UTC",
  "America/New_York",
  "Europe/London",
  "Europe/Lisbon",
];

function AdminSystemPage() {
  const { role, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading } = useSystemSettings();
  const update = useUpdateSystemSettings();

  const [form, setForm] = useState<SystemSettings | null>(null);

  useEffect(() => {
    if (!authLoading && role && role !== "super_admin") {
      navigate({ to: "/unauthorized", replace: true });
    }
  }, [authLoading, role, navigate]);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (isLoading || !form) {
    return <div className="text-sm text-muted-foreground">Carregando configurações...</div>;
  }

  const patch = (p: Partial<SystemSettings>) => setForm({ ...form, ...p });

  const save = async (fields: Partial<SystemSettings>, msg: string) => {
    try {
      await update.mutateAsync({ id: form.id, ...fields });
      toast.success(msg);
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao salvar");
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Sistema</h1>
        <p className="text-sm text-muted-foreground">
          Configurações globais do LUMMA. Apenas Master Admin.
        </p>
      </header>

      <Tabs defaultValue="seo">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="seo">SEO</TabsTrigger>
          <TabsTrigger value="site">Site</TabsTrigger>
          <TabsTrigger value="timezone">Timezone</TabsTrigger>
          <TabsTrigger value="maintenance">Manutenção</TabsTrigger>
          <TabsTrigger value="mcp">Integrações / MCP</TabsTrigger>
        </TabsList>

        <TabsContent value="seo" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>SEO & Metadados</CardTitle>
              <CardDescription>Tags aplicadas como defaults no site.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Título (meta title)</Label>
                <Input
                  maxLength={120}
                  value={form.seo_title ?? ""}
                  onChange={(e) => patch({ seo_title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Descrição (meta description)</Label>
                <Textarea
                  maxLength={300}
                  rows={3}
                  value={form.seo_description ?? ""}
                  onChange={(e) => patch({ seo_description: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>URL Canonical</Label>
                <Input
                  type="url"
                  placeholder="https://lumma.ia.br"
                  value={form.seo_canonical ?? ""}
                  onChange={(e) => patch({ seo_canonical: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Sitemap (URLs extras, uma por linha)</Label>
                <Textarea
                  rows={5}
                  className="font-mono text-xs"
                  value={form.sitemap_extra ?? ""}
                  onChange={(e) => patch({ sitemap_extra: e.target.value })}
                />
              </div>
              <Button
                onClick={() =>
                  save(
                    {
                      seo_title: form.seo_title,
                      seo_description: form.seo_description,
                      seo_canonical: form.seo_canonical,
                      sitemap_extra: form.sitemap_extra,
                    },
                    "SEO atualizado",
                  )
                }
                disabled={update.isPending}
              >
                {update.isPending ? "Salvando..." : "Salvar SEO"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="site" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Descrição do Site</CardTitle>
              <CardDescription>Texto institucional principal.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                rows={6}
                value={form.site_description ?? ""}
                onChange={(e) => patch({ site_description: e.target.value })}
              />
              <Button
                onClick={() => save({ site_description: form.site_description }, "Descrição salva")}
                disabled={update.isPending}
              >
                {update.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timezone" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Fuso Horário</CardTitle>
              <CardDescription>Aplicado em datas e relatórios.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select value={form.timezone ?? ""} onValueChange={(v) => patch({ timezone: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() => save({ timezone: form.timezone }, "Timezone salvo")}
                disabled={update.isPending}
              >
                {update.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="maintenance" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Página de Manutenção</CardTitle>
              <CardDescription>
                Quando ativada, todos os usuários (exceto Master Admin) são redirecionados para
                /manutencao.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="font-medium">Modo manutenção</p>
                  <p className="text-xs text-muted-foreground">
                    {form.maintenance_enabled ? "Ativo — site bloqueado" : "Inativo — site liberado"}
                  </p>
                </div>
                <Switch
                  checked={form.maintenance_enabled}
                  onCheckedChange={(v) => {
                    patch({ maintenance_enabled: v });
                    void save({ maintenance_enabled: v }, v ? "Manutenção ativada" : "Manutenção desativada");
                  }}
                />
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Badge (topo)</Label>
                  <Input
                    maxLength={80}
                    value={form.maintenance_badge ?? ""}
                    onChange={(e) => patch({ maintenance_badge: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Título principal</Label>
                  <Input
                    maxLength={120}
                    value={form.maintenance_title ?? ""}
                    onChange={(e) => patch({ maintenance_title: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Subtítulo</Label>
                  <Textarea
                    rows={4}
                    maxLength={500}
                    value={form.maintenance_subtitle ?? ""}
                    onChange={(e) => patch({ maintenance_subtitle: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Rodapé (status)</Label>
                  <Input
                    maxLength={160}
                    value={form.maintenance_footer ?? ""}
                    onChange={(e) => patch({ maintenance_footer: e.target.value })}
                  />
                </div>
              </div>

              <Button
                onClick={() =>
                  save(
                    {
                      maintenance_badge: form.maintenance_badge,
                      maintenance_title: form.maintenance_title,
                      maintenance_subtitle: form.maintenance_subtitle,
                      maintenance_footer: form.maintenance_footer,
                    },
                    "Textos salvos",
                  )
                }
                disabled={update.isPending}
              >
                {update.isPending ? "Salvando..." : "Salvar textos"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mcp" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>MCP de Curadoria (somente leitura)</CardTitle>
              <CardDescription>
                Servidor que permite a um cliente de IA (Claude, ChatGPT) ler o sistema de curadoria
                da Lumma: manual de contexto, baseline, relatos com print e as conversas clínicas
                originais. Nenhuma ferramenta cria, altera ou apaga dados.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 text-sm">
              <section className="space-y-2">
                <h3 className="font-medium">O que ele expõe</h3>
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  <li>
                    <code>get_context</code> — manual do sistema de curadoria (comece sempre por ele)
                  </li>
                  <li>
                    <code>get_baseline</code> — os itens da baseline, fonte da verdade
                  </li>
                  <li>
                    <code>list_reports</code> / <code>get_report</code> — relatos, com print em base64
                  </li>
                  <li>
                    <code>get_conversation</code> — a conversa clínica original de um relato
                  </li>
                </ul>
              </section>

              <section className="space-y-2">
                <h3 className="font-medium">URL de conexão</h3>
                <code className="block rounded-lg bg-muted p-3 font-mono text-xs">
                  https://lumma.ia.br/mcp
                </code>
                <p className="text-muted-foreground">
                  Exige o app publicado. Não há chave de API: o cliente descobre o login sozinho e
                  a autenticação é feita por OAuth com uma conta Lumma.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-medium">Conta a usar</h3>
                <p className="text-muted-foreground">
                  <code>mcp@lumma.ia.br</code> — papel <strong>curador</strong>, criada
                  exclusivamente para automação (não é conta de uso humano). A senha fica no cofre
                  de senhas da equipe. Papel curador é o acesso mínimo necessário: a direção técnica
                  interna, exposta apenas a super admins, não sai por essa conta.
                </p>
              </section>

              <section className="space-y-2">
                <h3 className="font-medium">Como conectar, passo a passo</h3>
                <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                  <li>No cliente de IA, adicione um conector personalizado e cole a URL acima.</li>
                  <li>
                    O navegador abre o login da Lumma — entre com <code>mcp@lumma.ia.br</code> e a
                    senha do cofre.
                  </li>
                  <li>Na tela de consentimento, revise o acesso pedido e aprove.</li>
                  <li>
                    Teste chamando <code>get_context</code>: ele deve devolver o manual do sistema.
                  </li>
                </ol>
              </section>

              <section className="space-y-2">
                <h3 className="font-medium">Como revogar o acesso</h3>
                <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                  <li>Troque a senha da conta <code>mcp@lumma.ia.br</code>.</li>
                  <li>
                    No painel do Supabase, em Authentication → OAuth Apps, revogue o aplicativo
                    conectado. Isso invalida também os tokens já emitidos.
                  </li>
                  <li>
                    Em caso de urgência, bloquear ou remover o papel de curador da conta corta o
                    acesso imediatamente.
                  </li>
                </ol>
              </section>

              <Alert variant="destructive">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Cuidados obrigatórios</AlertTitle>
                <AlertDescription className="space-y-1">
                  <p>
                    Mesmo como curador, esta conta enxerga conversas clínicas e imagens de pacientes
                    através do MCP. Trate a credencial com o mesmo cuidado de um acesso a dados de
                    saúde.
                  </p>
                  <p>
                    Nunca cole a senha em prompt de IA, em chamado de suporte ou no repositório, e
                    rotacione-a após qualquer compartilhamento.
                  </p>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
