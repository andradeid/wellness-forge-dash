# Plano — Conformidade às 4 atualizações Dify

Diff vs. estado atual do código (já há base implementada das correções anteriores).

## Atualização 1 — Payload `inputs` do Dify

**Status:** parcialmente conforme. Hoje `patient_profile` envia `"adulto"` ou `"gestante"`. A spec pede valores compostos: `"adulto_feminino" | "adulto_masculino" | "gestante"`.

**Ação em `src/routes/app.chat.$patientId.tsx`** (no `useEffect` que chama `setContext`):
- Derivar `patient_profile`:
  - `publico === "gestante"` → `"gestante"`
  - `publico === "adulto" && sexo === "feminino"` → `"adulto_feminino"`
  - `publico === "adulto" && sexo === "masculino"` → `"adulto_masculino"`
  - caso contrário → `""`
- Manter `patient_sex` em minúsculas, sem acento (`"feminino" | "masculino" | ""`) — já está correto.
- `fase_ciclo` continua enviado só quando `patient_profile === "adulto_feminino"` (já garantido por `faseCicloToInput`).
- Nada muda em `dify.chat.tsx` (já repassa todos os campos com `sanitize`, nunca `null`/`undefined`).

## Atualização 2 — Seletor de Fase do Ciclo

**Status:** parcialmente conforme. O bloco já aparece somente para `adulto + feminino`, com 4 opções. Falta: opção padrão `"Não informada"` e rótulos com faixa de dias.

**Ação em `src/components/chat/ChatIntentPanel.tsx`:**
- Adicionar Pill `"Não informada"` (ativa quando `faseCiclo === null`) que limpa o valor.
- Atualizar rótulos das Pills:
  - `Folicular (dias 1–13)`
  - `Ovulatória (dias 14–16)`
  - `Lútea (dias 17–28)`
  - `Menopausa`
- `FASE_CICLO_LABEL` (usado no contexto e em `faseCicloToInput`) **permanece** `"Fase Folicular"`, `"Fase Ovulatória"`, `"Fase Lútea"`, `"Menopausa"` — exatamente os strings que a API espera.

## Atualização 3 — Ocultar `[DESCONHECIDO]` e "Não indexado na BC IAPP"

**Status:** ✅ já implementado em `ExamResultCard.tsx` (`showBadge` oculta quando estado `desconhecido`; `showRef` oculta quando `reference` casa `/n[ãa]o\s+indexado/i`). Sem mudança.

## Atualização 4 — Persistência de `birth_date`

**Status:** ✅ já implementado. `BirthDatePicker` retorna string `YYYY-MM-DD`, `handleCreate` valida e bloqueia submit vazio com toast, e o Supabase recebe a string no formato correto (coluna `date`). Sem mudança.

---

## Resumo dos arquivos a tocar
- `src/routes/app.chat.$patientId.tsx` — mapear `patient_profile` composto no `setContext`.
- `src/components/chat/ChatIntentPanel.tsx` — Pill "Não informada" + rótulos com dias.

Nenhuma mudança em sidebar, histórico, RLS, ou demais conexões de API.
