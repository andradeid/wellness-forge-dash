## Exportar Conversa em PDF

Adicionar botão "Exportar Conversa" no cabeçalho do chat, ao lado de "Gerar Laudo PDF", gerando um PDF fiel à identidade visual da Lumma.

### Arquivos

1. **Novo:** `src/components/chat/ChatConversationPDF.tsx`
   - Componente `@react-pdf/renderer` (já usado em `PatientReportPDF`).
   - Cabeçalho: logo Lumma + nome do paciente, idade, sexo, data da sessão.
   - Corpo: lista de mensagens como balões (usuário à direita verde, Lumma à esquerda branco com borda).
   - Renderiza marcadores estruturados (`structured_data.markers`) como tabela quando presentes.
   - Rodapé com paginação + disclaimer "Análises baseadas nos protocolos da Dra. Ana Paula".

2. **Editar:** `src/routes/app.chat.$patientId.tsx`
   - Importar `PDFDownloadLink` do `@react-pdf/renderer` e o novo componente.
   - Adicionar botão "Exportar Conversa" (variant outline, ícone `Download`) ao lado de "Gerar Laudo PDF".
   - Passar `messages`, dados do paciente e branding.
   - Nome do arquivo: `conversa-{slug-paciente}-{DD-MM-AAAA}.pdf`.

### Detalhes técnicos

- Limpar markdown/JSON das mensagens antes de renderizar (reaproveitar `cleanProse` / `splitJsonBlocks` de `ChatMessageList`).
- Sem mudanças de banco, RLS ou Dify.
- Sem dependências novas (`@react-pdf/renderer` já instalado).
