## Objetivo

Hoje o campo "Usuário Final ou Conta" nos logs do Dify mostra apenas o UUID do nutricionista (ex.: `a51c0d8e-10a2-…`). Vamos enriquecer essa identificação para incluir o **nome do nutricionista** e o **nome do paciente**, facilitando localizar conversas no painel do Dify.

## Como o Dify usa esse campo

- O parâmetro `user` enviado em `POST /chat-messages` é o que aparece como "End User / Account" nos Registros do Dify. Ele precisa ser uma string estável por conversa (Dify valida que o `conversation_id` pertence a esse `user`).
- Como cada `patient_chats` é único por (nutri, paciente), podemos compor uma string determinística sem quebrar conversas existentes novas. Conversas antigas (criadas com o UUID puro) continuarão amarradas ao UUID — para essas, mantemos o `user` antigo a fim de não invalidar o `conversation_id`.
- Além do `user`, o Dify também exibe variáveis de `inputs` nos logs/anotações. Vamos enviar `nutritionist_name`, `nutritionist_email` e `patient_name` em `inputs` para ficarem visíveis também no detalhe da execução.

## Mudanças

### 1. `src/hooks/useDifyChat.ts`
- Ao inicializar o chat, além do `patient_chats`, buscar:
  - `profiles` do nutri logado (`full_name`, `email`).
  - `patients.name` do paciente atual.
- Guardar esses dados em `useRef` para reutilizar a cada `sendMessage`.
- No `fetch("/api/dify/chat")`, incluir no body:
  ```ts
  meta: {
    nutritionist_name,
    nutritionist_email,
    patient_name,
    patient_id: patientId,
  }
  ```
- Não compor a string final no client — quem decide o formato do `user` é o servidor (mantém regra única).

### 2. `src/routes/api/dify.chat.tsx`
- Aceitar o novo campo `meta` no body.
- Construir `displayUser` no formato:
  ```
  "<Nome do Nutri> · <Nome do Paciente>"
  ```
  Truncado para no máximo 64 caracteres (limite prático do Dify). Sanitizar quebras de linha.
- Regra de compatibilidade: se `conversation_id` foi enviado (conversa já existente no Dify), manter `user: userId` (UUID) para não quebrar a validação do Dify. Apenas conversas **novas** (`conversation_id` vazio) usarão o `displayUser`.
  - Observação: isso significa que conversas antigas continuarão aparecendo com UUID; novas mensagens em chats novos passam a aparecer com o nome.
- Enviar `inputs` ao Dify mesclando o que já vier do client com:
  ```ts
  {
    nutritionist_name,
    nutritionist_email,
    patient_name,
    patient_id,
  }
  ```
  Para essas variáveis aparecerem nos logs do Dify, é necessário que o app no Dify tenha essas variáveis declaradas em "Variáveis" (caso contrário, o Dify ignora). Vou avisar o usuário para criá-las no Estúdio.

### 3. Sem migration
Nenhuma alteração de schema — `profiles.full_name` e `patients.name` já existem.

## Pontos de atenção / decisões a confirmar

1. **Formato exibido**: sugiro `"Dra. Maria Silva · João Pereira"`. Posso usar outro separador (ex.: ` | `) se preferir.
2. **Conversas antigas**: por segurança não mudo o `user` delas (continuam UUID). Alternativa: resetar `dify_conversation_id` no banco para forçar nova conversa — só faria isso se você confirmar (perde o histórico no lado Dify).
3. **Variáveis no app Dify**: para `nutritionist_name` / `patient_name` aparecerem como colunas/anotações, você precisa adicioná-las como variáveis de entrada no fluxo do Dify. Quer que eu inclua um aviso/toast no admin ou só te informo aqui?

Confirme essas três decisões (ou só diga "pode seguir") e eu implemento.
