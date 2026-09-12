# Roadmap

## Registro de erros da IA (Dify)
- [x] Tabela `dify_error_logs` + RLS/GRANT (leitura super_admin)
- [x] Gravação no servidor (`api/dify.chat`) e nos hooks de chat
- [x] Registrar também sucesso rápido demais (< limiar por tarefa)
- [x] Server functions de leitura (lista + estatísticas)
- [x] Aba "Erros da IA" na tela de Auditoria, só super admin
- [x] Painel de padrão: hora, perfil, tarefa, tipo de arquivo e duração

## Proteção de anexos do Dify
- [x] Não enviar anexos para tarefas que não consomem arquivos
- [x] Conferir o objeto e executar HEAD na URL assinada antes do envio
- [ ] Validar no preview e confirmar o build
- [ ] Concluir diagnóstico dos logs do Storage em 11/09, 18:39–18:42 UTC
