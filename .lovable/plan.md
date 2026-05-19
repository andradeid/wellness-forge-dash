# Plano — 3 correções LUMMA 2.0

## Correção 1 — Ocultar UI técnica de marcadores não indexados

**Arquivo:** `src/components/chat/ExamResultCard.tsx`

- Se `reference` contiver `"Não indexado na BC IAPP"` → ocultar totalmente a linha `Ref. BC: …` (não mostrar nem "—").
- Se `classification` resultar em estado visual `desconhecido` → não renderizar o `<Badge>` de classificação.
- Manter intactos: nome, valor, unidade, análise expansível, e toda a lógica de `classificationVisualState`.

---

## Correção 2 — Persistência de `birth_date`

**Arquivos:** `src/routes/app.patients.tsx`, `src/components/BirthDatePicker.tsx`, `src/components/EditPatientSheet.tsx`.

Diagnóstico: o `BirthDatePicker` só emite a data quando **dia + mês + ano** estão preenchidos — se o usuário deixa qualquer um vazio, `birthDate` fica `""` e salva como `null`. Isso explica o sintoma de "data sumiu".

Ações:
1. Adicionar validação visível no submit: se `birthDate` estiver vazio, mostrar `toast.error("Selecione dia, mês e ano de nascimento")` e bloquear o insert.
2. Marcar os 3 selects do `BirthDatePicker` com indicação visual de obrigatoriedade (asterisco no label "Data de nascimento *").
3. Verificar `EditPatientSheet.tsx` (usa `<input type="date">` nativo, que já emite `YYYY-MM-DD` correto) — apenas confirmar que o `birth_date` é exibido na ficha após edição.
4. Garantir que o `load()` após criar paciente recarrega a lista com o campo populado (já está correto no código atual).

---

## Correção 3 — Variável `fase_ciclo` + envio do contexto inicial como `inputs` ao Dify

**Arquivos:** `src/components/chat/ChatIntentPanel.tsx`, `src/hooks/useDifyChat.ts`, `src/routes/api/dify.chat.tsx`, `src/routes/app.chat.$patientId.tsx`.

Hoje o contexto clínico vai apenas concatenado na `query` via `filtersToContext()`. Vamos **também** enviá-lo como `inputs` estruturados ao Dify (mantendo a concatenação na query para não quebrar prompts existentes).

1. **`ChatIntentPanel.tsx`**
   - Estender `ExamFilters` com `faseCiclo: "folicular" | "ovulatoria" | "lutea" | "menopausa" | null`.
   - Renderizar nova `FilterRow "Fase do Ciclo"` com 4 Pills, **somente** quando `publico === "adulto" && sexo === "feminino"` (oculto para gestante, masculino ou perfil indefinido).
   - Incluir a fase em `filtersToContext()` para o prompt continuar coerente.

2. **`useDifyChat.ts`**
   - Expor `setContext(filters)` que atualiza `metaRef` com:
     - `patient_sex`: `"masculino" | "feminino" | ""`
     - `patient_profile`: `"adulto" | "gestante" | ""`
     - `gestante_tipo`, `gestante_periodo`: string (vazio se não aplicável)
     - `fase_ciclo`: `"Fase Folicular" | "Fase Ovulatória" | "Fase Lútea" | "Menopausa" | ""`
   - Todos como string (nunca `null`/`undefined`).

3. **`src/routes/app.chat.$patientId.tsx`**
   - Chamar `setContext(filters)` sempre que o `ChatIntentPanel` mudar, garantindo que o payload da **primeira mensagem com exame** já leve sexo/público/fase corretos.

4. **`src/routes/api/dify.chat.tsx`**
   - Em `mergedInputs`, repassar `patient_sex`, `patient_profile`, `gestante_tipo`, `gestante_periodo`, `fase_ciclo` vindos de `meta`, sempre como string sanitizada (`sanitize(...)`), mantendo os campos já existentes (`nutritionist_name`, `nutritionist_email`, `patient_name`, `patient_id`).

---

## Garantias

- Sidebar, histórico de chats, upload de arquivos e conexões de API existentes **não** são alterados.
- As 3 correções são independentes — aplico em sequência (1 → 2 → 3) e confirmo cada uma antes da próxima.
