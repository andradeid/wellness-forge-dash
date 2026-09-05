# Marcadores aparecendo um a um, durante a análise

Hoje o painel só aparece quando o bloco de dados fecha por completo: a Lumma monta 30 a 60 marcadores e a tela fica parada até o fim. A proposta é preencher o painel enquanto os marcadores chegam.

## O que muda para a usuária

1. Assim que o exame começa a ser lido, aparece uma linha de confirmação na tela ("Exame recebido — iniciando análise"). Isso é feito do nosso lado, sem depender de mudança nas instruções da Lumma.
2. Cada marcador entra no painel assim que fica pronto, um a um, com as seções (Hemograma, Perfil Lipídico etc.) surgindo na mesma ordem clínica de hoje.
3. Ao final, o painel completo é o mesmo de hoje — a versão final substitui a parcial, então nada fica pela metade.
4. Em Composição Corporal o ganho é menor: aquele bloco é um único conjunto de dados, não uma lista. Ali vamos mostrar os campos conforme fecham (distribuição de gordura, faixa estimada, indicadores) e a mesma linha de confirmação inicial.

## Sobre o risco de perder ou trocar marcador

Não há risco de perda: o painel parcial é sempre substituído pelo painel final completo, montado como hoje no encerramento da resposta. O parcial é só visual.

Um cuidado real existe quanto à seção: se um marcador chegar sem a categoria preenchida, ele cairia em "Outros" e depois mudaria de lugar. Para evitar isso, um marcador parcial só entra no painel quando já tem nome, valor e categoria; sem categoria, ele espera o fechamento. Assim nada muda de seção depois de aparecer.

## Medição do ganho

Passamos a registrar o tempo até o primeiro conteúdo visível (primeiro marcador ou primeira linha de texto) junto do tempo total que já é gravado hoje, para comparar antes e depois com número.

## Detalhes técnicos

- `src/hooks/useDifyChat.ts`: novo parser incremental que varre o texto acumulado a partir de `"markers"` e extrai cada objeto `{...}` balanceado já fechado dentro do array, em vez de esperar o array inteiro. Mantém índice do último objeto consumido para não reprocessar. Substitui a emissão única atual controlada por `markersEmittedRef`.
- Filtro de admissão parcial: só emite marcador com `name`, `value` e `category` presentes (usa `normalizeMarker`/`normalizeCategory` de `src/lib/exam-markers.ts`). Os demais entram no fechamento.
- No `message_end` o fluxo atual permanece intacto: `tryExtractMarkers` completo, `processAndPersistMarkers`, débito de créditos e persistência. O array final sobrescreve o parcial.
- `src/components/chat/ExamResultCard.tsx`: aceita `streaming?: boolean`; ordem de categorias já é fixa por `CATEGORY_ORDER`, então basta manter a chave estável e adicionar transição suave de entrada das linhas e um rodapé "carregando mais marcadores…" enquanto o stream corre.
- `src/lib/body-assessment.ts`: `extractBodyAssessmentPartial` tolerante a JSON incompleto (fecha chaves pendentes para leitura parcial); `BodyAssessmentCard` renderiza só os campos presentes.
- Linha de confirmação: renderizada em `ChatMessageList`/`ChatThinking` para a bolha do assistente ainda vazia nas tarefas com anexo de exame — texto local, sem tocar no agente.
- Telemetria: `structured_data.first_content_ms` gravado ao lado de `processing_ms` e exibido no mesmo rodapé de tempo da mensagem.

## Limitações a saber

- O ganho depende do agente: se a Lumma só começar a emitir depois de raciocinar tudo internamente, o painel continuará esperando. A linha de confirmação cobre esse intervalo, mas o tempo até o primeiro marcador é do agente.
- O parser incremental é sensível ao formato do bloco; qualquer mudança futura no formato emitido pela Lumma exige revisão do parser. O fechamento completo continua sendo a fonte da verdade.

## Estimativa

Cerca de 1 a 2 horas de implementação, mais um teste com um exame real de cada tipo para conferir integridade.
