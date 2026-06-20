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
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="seo">SEO</TabsTrigger>
          <TabsTrigger value="site">Site</TabsTrigger>
          <TabsTrigger value="timezone">Timezone</TabsTrigger>
          <TabsTrigger value="maintenance">Manutenção</TabsTrigger>
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
              <Select value={form.timezone} onValueChange={(v) => patch({ timezone: v })}>
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
      </Tabs>
    </div>
  );
}
