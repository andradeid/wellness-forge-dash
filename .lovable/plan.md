# Corte definitivo do worker antigo do Dify

## Objetivo
Parar de depender da rota `/api/dify/chat`, que está atendendo GET e POST de deployments diferentes, e criar um caminho novo e verificável para todo tráfego de chat.

## Implementação
- Criar uma nova rota versionada para o chat do Dify e direcionar todos os quatro emissores atuais para ela: chat do paciente, chat geral, análise rápida e playground administrativo.
- Manter a regra atual: duração somente com anexo efetivamente enviado; calorimetria em 15 segundos; tarefas sem limite próprio não herdam limite.
- Gravar em toda ocorrência nova: versão das regras, versão da rota, host recebido, URL do endpoint, `provider_latency_ms`, `wall_ms`, quantidade de anexos e limite aplicado.
- Fazer o endpoint de diagnóstico informar a mesma versão para GET e POST.
- Publicar e validar o novo endereço diretamente, sem usar a rota antiga como prova.

## Verificação
- Um registro novo válido deverá conter `rules_version`, `route_version`, `request_host`, `provider_latency_ms` e `wall_ms`.
- Nenhum `suspicious_fast` sem anexo poderá ser criado pela rota nova.
- Calorimetria somente poderá gerar `suspicious_fast` com anexo e duração abaixo de 15 segundos.
- Auditar as mudanças recentes e separar: banco já aplicado, navegador verificável e servidor dependente da nova publicação.

## Resultado esperado
O tráfego novo deixa de alcançar o caminho de escrita antigo. A presença de `route_version` no banco passa a provar qual worker processou cada ocorrência, sem depender apenas do status “publicado”.
