import { supabaseAdmin } from "../lib/../integrations/supabase/client.server";

async function main() {
  const email = 'curadoria@lumma.ia.br';
  const { data: userList, error: listError } = await supabaseAdmin.auth.admin.listUsers();
  
  if (listError) {
    console.error("Erro ao listar usuários:", listError.message);
    process.exit(1);
  }

  const targetUser = userList?.users.find((u: any) => u.email === email);
  
  if (!targetUser) {
    console.error("Usuário não encontrado:", email);
    process.exit(1);
  }

  const { data, error } = await supabaseAdmin
    .from("curation_requests")
    .insert({
      title: 'Captura de motivo no feedback negativo',
      description: 'Hoje o feedback negativo é registrado com um único clique, sem captura de motivo. O comentário só é possível pelo botão "Sugestão", em fluxo separado, o que faz com que os feedbacks negativos cheguem à curadoria sem indicação do que motivou a avaliação.\n\nNa data do levantamento, dos 23 feedbacks registrados, 6 eram negativos — e 100% deles sem comentário. A curadoria precisa abrir a conversa original e inferir qual foi o problema.\n\nComportamento esperado: ao clicar em "Não curti", apresentar motivos pré-definidos com seleção obrigatória e campo de comentário livre opcional, permitindo que o feedback chegue à curadoria já categorizado. O registro só é gravado após o envio, e não no clique inicial.\n\nMotivos propostos: informação clínica incorreta; faixa de referência errada; análise incompleta; marcador não extraído do laudo; formatação ruim; não respondeu o que foi pedido; expôs informação interna do sistema; outro.',
      curator_classification: 'melhoria',
      curator_dimension: 'comportamento',
      status: 'registrado',
      created_by: targetUser.id
    } as any)
    .select("numero_sequencial")
    .single();

  if (error) {
    console.error("Erro ao inserir report:", error.message);
    process.exit(1);
  }

  console.log("Report registrado com sucesso. Número sequencial:", (data as any).numero_sequencial);
}

main().catch(console.error);
