# Relatório de Ajustes e Estabilidade — Lumma 2.0

**Período:** 21 a 23 de julho de 2026  
**Ambientes:** App Lumma (`lumma.ia.br` / VPS `66.94.110.40`) · Dify (VPS `144.126.136.190`) · Supabase (`bidarktpgytizdgmmqrg`)  
**Objetivo:** Documentar diagnósticos, correções, validações e estado da infraestrutura antes/durante o disparo de ativação (~700 e-mails).

---

## 1. Resumo executivo

| Área | Situação final |
|---|---|
| Follow-up de exame horas/dias depois | **Corrigido** (upload híbrido + URL regenerada no legado) |
| Upload Dify (`Invalid upload file`) | **Corrigido** (`user` alinhado entre upload e chat) |
| Envio duplicado / toast “Aguarde a análise…” | **Mitigado** (lock síncrono no front) |
| Erro `Failed to fetch` ao anexar PDF | **Diagnóstico:** rede do cliente → Supabase; mensagem amigável no app |
| Capacidade p/ pico de ativação | **Estável** para volume esperado dos 700 e-mails |

---

## 2. Problema principal: follow-up quebrava após o exame

### Sintoma
- Usuário anexava exame e recebia análise.
- Horas/dias depois, follow-ups falhavam (assistente “mudo”, mensagem do usuário salva, sem crédito).
- Langfuse: erros no workflow ligados a URL assinada expirada do Storage.

### Causa raiz
1. O front gerava **signed URL** do Supabase com TTL curto (~1h) e enviava como `remote_url` ao Dify.
2. O Dify **guardava essa URL** no histórico da conversa.
3. Em follow-ups, tentava reabrir a URL → `InvalidJWT` / `exp claim failed`.

### Correção (plano híbrido)

Arquivos principais: `src/hooks/useDifyChat.ts`, `src/routes/api/dify.chat.tsx`, `src/routes/api/dify.upload.tsx`.

1. **Primário:** upload via `/api/dify/upload` → `transfer_method: local_file` (arquivo fica no storage do Dify).
2. Persistência de `patient_exams.dify_file_id`.
3. **Fallback:** se o upload Dify falhar, signed URL com TTL de **7 dias** (`remote_url`).
4. **Legado:** em conversas antigas sem `dify_file_id`, regenerar signed URL no follow-up.
5. Em falha/stream vazio: persistir mensagem amigável do assistente; **não debitar crédito**.
6. Logs no proxy: `stream_start` / `stream_end` / `event:error`.

### Bug colateral pós-deploy e correção
- Erro **`Invalid upload file`**: o `user` do `/files/upload` ≠ `user` do `/chat-messages`.
- Correção: `composedUser = userId:patientId:agentType` (máx. 64 chars) igual nos dois fluxos.
- Commits relevantes (histórico): `a2de583` (híbrido), `cdef82d` (user no upload).

### Validação (Langfuse + produção)
| Teste | Resultado |
|---|---|
| Novo chat + PDF | Passou (~3 min), assistente salvo |
| Follow-up no chat novo (“me explique melhor”) | Passou; `files: []`; rota **Chat** (sem Extrator PDF); contexto injetado |
| Chat antigo + “blz obrigado” (antes falhava) | Passou; caminho legado com `remote_url` regenerada |

**Conclusão:** no chat novo o follow-up usa **contexto**; no legado regenera URL. Ambos OK.

---

## 3. Toast “Aguarde a análise atual terminar…”

### Sintoma
Usuário (caso: paciente **Leandro Costa**, conta **Vivian Amaral**) via a mensagem ao anexar laudo.

### Causa
Não era trava do Dify Editor nem bloqueio de usuário no banco.

Era o **rate limit do próprio Lumma**:
- Tabela `active_streams` → **1 stream simultâneo por usuário**
- HTTP **429** com mensagem amigável
- Limpeza de órfãos > ~2 min; máx. ~10 envios/minuto (`rate_limit_hits`)

Evidência no caso (~15:42 BRT de 22/07):
- Dois “Analise.” no mesmo segundo + PDF duplicado (clique/Enter duplo)
- Novo chat e terceiro envio enquanto a 1ª análise ainda rodava (~3,5 min)
- A 1ª análise concluiu e debitou crédito; as tentativas extras bateram no slot ocupado

### Correção UX
Lock **síncrono** antes dos `await` (auth/crédito):
- `src/hooks/useDifyChat.ts`
- `src/hooks/useGeneralChat.ts`
- `src/components/chat/ChatInput.tsx`

Commit: **`e12ff93`** — *Evita envio duplicado no chat com lock síncrono antes dos awaits.*

**Nota:** abrir outro chat e reenviar enquanto a análise anterior ainda roda continua bloqueado de propósito (protege Dify no pico).

---

## 4. Erro ao anexar: `Failed to fetch`

### Sintoma (print)
`Falha ao salvar LaudoSabin-09-02-2026.pdf: Failed to fetch`  
Horário reportado: **22/07/2026 ~20:55 BRT**.

### Diagnóstico
- Mensagem gerada no passo **1a**: upload **browser → Supabase Storage** (`exams`), **antes** de Dify/API Lumma.
- Arquivo **nunca** apareceu em `patient_exams` (busca por `LaudoSabin*` = 0).
- Logs da VPS Lumma no horário: sem tráfego de upload (esperado — não passa pelo app server).
- No mesmo período, outros uploads funcionaram (ex.: **Alice Nunes da Silva** ~21:01 BRT).

### Conclusão
Falha de **rede do dispositivo** (4G/Wi‑Fi), não queda do Dify/Lumma.

### Ajuste feito
Mensagem amigável no lugar do texto técnico em inglês.

Commit: **`42f19f0`** — *Melhora mensagem de erro no upload de exame quando a conexão falha.*  
Deploy VPS: confirmado em `42f19f0`.

Texto exibido ao usuário (resumo):
> Não consegui enviar "arquivo.pdf". Verifique sua conexão com a internet e tente anexar o exame novamente.

**Decisão de produto:** sem retry automático (evita fila desnecessária).

---

## 5. Infraestrutura e capacidade (checagem 23/07/2026)

### Lumma (`lumma.ia.br`)
| Item | Valor |
|---|---|
| Réplicas app | **3** (healthy) |
| Host | ~11 GB RAM, 6 vCPU, load baixo |
| Commit em produção (ref.) | `42f19f0` |
| Proteção | 1 stream/usuário · 10 envios/min |

### Dify
| Item | Valor |
|---|---|
| `SERVER_WORKER_AMOUNT` | **4** (gevent) |
| `SERVER_WORKER_CONNECTIONS` | **200** |
| `CELERY_WORKER_AMOUNT` | **6** |
| Pool SQLAlchemy | size 30, pre-ping, recycle 300 |
| Host | ~23 GB RAM, 8 vCPU, folga de memória |
| API Swarm | ainda **1 réplica** do serviço `dify_api` |

### Veredito para disparo de ~700 e-mails
- **OK para o pico esperado** (ativação ≠ 700 análises simultâneas).
- Gargalos mais comuns sob pico extremo: **fila Celery / LLM provider**, depois Postgres do Dify (limite de mem ~1 GB no container), não o front Lumma.
- Erros `socket.io` no Dify afetam editor/websocket; **não** o fluxo SSE do chat Lumma.

### Monitorar nas primeiras horas pós-disparo
1. CPU/RAM das 3 apps Lumma e `dify_api` / `dify_worker`
2. Taxa de 429 / “Lumma sobrecarregada” / 504
3. Tempo de análise de exame (baseline ~2–4 min)
4. Uploads falhando com mensagem de conexão (esperado pontual em mobile)

---

## 6. Operação: sync local e deploys

### Repositório
- GitHub: `https://github.com/andradeid/wellness-forge-dash`
- Pasta local de trabalho sincronizada com `origin/main` após pulls

### Fluxo de deploy VPS (padrão usado)
```bash
cd /root/app-deploy
cp -a .env /root/app-deploy.env.backup
git fetch origin main
git checkout -f origin/main
cp -a /root/app-deploy.env.backup .env
docker compose build && docker compose up -d
```

### Deploys relevantes nesta janela
| Quando | Commit | Notas |
|---|---|---|
| 22/07 | híbrido + user upload | Estabilização exame/follow-up |
| 22/07 | `e12ff93` | Lock anti-duplicidade |
| 22/07–23/07 | `661d93d`, `8a25511`, etc. | Features (e-mails/campanhas etc.) + sync |
| 23/07 | `42f19f0` | Mensagem amigável de upload |

---

## 7. O que NÃO foi feito / fora de escopo nesta rodada

- Retry automático de upload (descartado de propósito)
- Escala da réplica Swarm do `dify_api` para 2 (opcional se saturar)
- Aumento de memória do Postgres do Dify (opcional sob pressão)
- Rotação de chaves Langfuse compartilhadas em chat operacional (recomendado depois)
- Autenticação MCP Supabase “mostralo” (projeto diferente; diagnósticos via `.env` da VPS)

---

## 8. Mensagens úteis (suporte)

### Para o usuário que viu `Failed to fetch`
> Oi! Esse aviso foi falha de conexão no envio do PDF, não na análise. Tenta anexar de novo com internet estável que deve funcionar.

### Para o grupo interno (resumo)
> Investigamos: não foi queda da Lumma/Dify. O PDF não chegou ao storage (rede do celular). No mesmo horário outros usuários enviaram exames com sucesso (ex.: Alice Nunes ~21:01). Orientar reenvio com Wi‑Fi/4G estável. Mensagem na tela já foi humanizada.

---

## 9. Checklist rápido “estamos ok?”

- [x] Follow-up de exame (novo + legado) validado  
- [x] Upload `local_file` + `user` alinhado  
- [x] Anti clique-duplo no envio  
- [x] Mensagem amigável em falha de rede no upload  
- [x] Lumma 3× healthy  
- [x] Dify workers/API com parâmetros elevados  
- [ ] Observar pico pós-700 e-mails (2–4 h)  
- [ ] Se saturar: avaliar 2ª réplica `dify_api` e mem do Postgres  

---

*Documento gerado como registro operacional dos ajustes de estabilidade da Lumma 2.0 (jul/2026).*
