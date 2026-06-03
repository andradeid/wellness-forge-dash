import { createFileRoute, useParams, useSearch } from "@tanstack/react-router";
import { ChatMessageList } from "@/components/chat/ChatMessageList";
import { ChatInput } from "@/components/chat/ChatInput";
import { useGeneralChat } from "@/hooks/useGeneralChat";

export const Route = createFileRoute("/app/general/$chatId")({
  validateSearch: (s: Record<string, unknown>) => ({
    module: typeof s.module === "string" ? s.module : "research",
  }),
  component: GeneralChatPage,
});

function GeneralChatPage() {
  const { chatId } = useParams({ from: "/app/general/$chatId" });
  const { module: agentType } = Route.useSearch();
  const { messages, sendMessage, thinking } = useGeneralChat(chatId, agentType);

  return (
    <div className="flex h-full flex-col bg-[#f5f5f0]">
      <header className="px-4 py-3 border-b bg-white">
        <h1 className="font-semibold text-sm">
          {agentType === 'research' ? 'Pesquisa Científica' : 'Pergunta Clínica'}
        </h1>
      </header>
      <div className="flex-1 overflow-y-auto">
        <ChatMessageList messages={messages} thinking={thinking} />
      </div>
      <div className="p-4 bg-white border-t">
        <ChatInput onSend={(text) => sendMessage(text)} disabled={thinking} />
      </div>
    </div>
  );
}
