import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/app/politicas")({
  component: PoliciesPage,
});

function PoliciesPage() {
  const { user } = useAuth();
  const [acceptedAt, setAcceptedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("policy_accepted_at")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.policy_accepted_at) setAcceptedAt(data.policy_accepted_at);
      });
  }, [user]);

  const handleAccept = async () => {
    if (!user) return;
    setSaving(true);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("profiles")
      .update({ policy_accepted_at: now })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast.error("Não foi possível registrar o aceite. Tente novamente.");
      return;
    }
    setAcceptedAt(now);
    toast.success("Aceite registrado. Obrigado!");
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-white">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <Link
          to="/app/dashboard"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar ao Dashboard
        </Link>

        <div className="flex items-center gap-3 mb-2">
          <div className="rounded-xl p-2.5 bg-emerald-50 text-emerald-700">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight" style={{ fontFamily: "Inter, sans-serif" }}>
            Políticas e Termos de Uso
          </h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Leia com atenção. Estes termos definem o uso responsável da plataforma LUMMA 2.0.
        </p>

        <Card className="shadow-md">
          <ScrollArea className="h-[60vh] p-8">
            <article
              className="prose prose-slate max-w-none prose-h2:mt-8 prose-h2:mb-3 prose-h3:mt-5 prose-p:leading-relaxed"
              style={{ fontFamily: "Inter, sans-serif" }}
            >
              <h2 className="text-xl font-semibold">1. Finalidade do Sistema</h2>
              <p>
                A <strong>LUMMA 2.0</strong> é uma ferramenta de <em>suporte à decisão clínica</em>{" "}
                baseada nos protocolos de inteligência integrativa da Dra. Ana Paula. Seu objetivo é
                auxiliar nutricionistas na leitura, organização e interpretação preliminar de exames
                laboratoriais, acelerando o raciocínio clínico e a entrega de relatórios ao paciente.
              </p>
              <p>
                Ao utilizar a LUMMA 2.0, você reconhece que esta é uma ferramenta assistiva. A
                precisão da leitura depende da qualidade dos documentos enviados. Recomendamos que
                todo dado extraído seja conferido com o laudo original antes da geração do relatório
                final para o paciente.
              </p>

              <h2 className="text-xl font-semibold">2. Responsabilidade Técnica</h2>
              <p>
                O software <strong>não substitui</strong> o diagnóstico, a avaliação clínica ou a
                prescrição do nutricionista. Todas as condutas, interpretações finais e
                recomendações ao paciente são de responsabilidade exclusiva do profissional
                habilitado, conforme as normas do <strong>Conselho Regional de Nutricionistas (CRN)</strong>{" "}
                e do Conselho Federal de Nutricionistas (CFN).
              </p>
              <h3 className="text-base font-semibold">2.1 Validação obrigatória</h3>
              <p>
                Os outputs gerados pela inteligência artificial devem ser <strong>auditados</strong>{" "}
                pelo nutricionista antes de qualquer compartilhamento com o paciente ou terceiros.
              </p>

              <h2 className="text-xl font-semibold">3. Processamento de Dados (IA)</h2>
              <p>
                Os documentos enviados (PDF, imagens e laudos digitais) são processados via APIs de
                inteligência artificial para extração de dados estruturados, classificação de
                marcadores e sugestão de análise integrativa. O processamento ocorre em ambiente
                seguro, com criptografia em trânsito e em repouso.
              </p>
              <h3 className="text-base font-semibold">3.1 Conformidade com a LGPD</h3>
              <p>
                A LUMMA 2.0 está em conformidade com a <strong>Lei Geral de Proteção de Dados
                (Lei 13.709/2018)</strong>. Os dados sensíveis dos pacientes são vinculados ao
                nutricionista responsável (controlador), que detém a base legal para o tratamento.
                A LUMMA atua como operadora, processando os dados estritamente para a finalidade
                contratada.
              </p>
              <h3 className="text-base font-semibold">3.2 Direitos do titular</h3>
              <p>
                O paciente, como titular dos dados, tem direito a solicitar acesso, correção,
                portabilidade e exclusão de seus dados, mediante solicitação ao nutricionista
                responsável.
              </p>

              <h2 className="text-xl font-semibold">4. Propriedade Intelectual</h2>
              <p>
                A metodologia de inteligência integrativa aplicada na análise dos exames é de
                autoria da <strong>Dra. Ana Paula</strong>, sendo protegida por direitos autorais.
                O software <strong>LUMMA 2.0</strong>, sua interface, código-fonte, marca e
                identidade visual são de propriedade de seus desenvolvedores e licenciados, sendo
                vedada a reprodução, redistribuição ou engenharia reversa sem autorização expressa.
              </p>

              <h2 className="text-xl font-semibold">5. Uso Adequado</h2>
              <p>
                O usuário compromete-se a utilizar a plataforma apenas para os fins profissionais
                descritos, mantendo o sigilo das credenciais de acesso e respeitando o segredo
                profissional sobre os dados dos pacientes. O compartilhamento de acesso entre
                profissionais distintos é proibido.
              </p>

              <h2 className="text-xl font-semibold">6. Limitação de Responsabilidade</h2>
              <p>
                A LUMMA 2.0 não se responsabiliza por decisões clínicas tomadas com base
                exclusivamente nos outputs gerados sem a devida validação profissional. O uso da
                ferramenta implica na aceitação integral destes termos.
              </p>

              <p className="text-xs text-muted-foreground mt-8">
                Última atualização: {format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}.
              </p>
            </article>
          </ScrollArea>
        </Card>

        <div className="mt-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {acceptedAt ? (
            <p className="text-sm text-emerald-700 inline-flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Aceite registrado em{" "}
              {format(new Date(acceptedAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Ao clicar abaixo, você confirma que leu e concorda com os termos acima.
            </p>
          )}
          <Button
            onClick={handleAccept}
            disabled={saving || !user}
            className="rounded-full px-6 bg-gradient-to-r from-[#e8a04c] to-[#e89bcf] text-white hover:opacity-90"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando...
              </>
            ) : acceptedAt ? (
              "Reconfirmar aceite"
            ) : (
              "Li e estou de acordo"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
