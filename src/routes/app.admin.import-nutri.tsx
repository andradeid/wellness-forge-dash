import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { runNutriImport } from "@/lib/import-nutri.functions";

export const Route = createFileRoute("/app/admin/import-nutri")({
  component: ImportNutriPage,
});

function ImportNutriPage() {
  const fn = useServerFn(runNutriImport);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function handleRun() {
    if (!confirm("Executar importação dos 710 nutricionistas da staging? Isso cria os novos e atualiza os existentes.")) return;
    setLoading(true);
    try {
      const r = await fn();
      setResult(r);
      toast.success(`Importação concluída: ${r.createdCount} novos, ${r.subsUpserts} assinaturas.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na importação");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <h1 className="text-2xl font-semibold">Importação de nutricionistas (staging)</h1>
      <p className="text-sm text-muted-foreground">
        Cria contas silenciosas (sem email de boas-vindas) para novos, atualiza nome/telefone dos existentes,
        aplica status active + unlimited_credits + expires_at, e adiciona as tags ILIMITADO e migrado-lumma-1.
      </p>
      <Button
        onClick={handleRun}
        disabled={loading}
        className="bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white"
      >
        {loading ? "Executando..." : "Executar importação"}
      </Button>
      {result && (
        <pre className="mt-4 rounded-lg border bg-muted/30 p-4 text-xs overflow-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
