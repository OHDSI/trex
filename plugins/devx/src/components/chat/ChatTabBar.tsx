import { X } from "lucide-react";
import type { Chat } from "@/lib/types";

interface ChatTabBarProps {
  chats: Chat[];
  openChatIds: string[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onCloseTab: (chatId: string) => void;
}

export function ChatTabBar({
  chats,
  openChatIds,
  activeChatId,
  onSelectChat,
  onCloseTab,
}: ChatTabBarProps) {
  if (openChatIds.length === 0) return null;

  const openChats = openChatIds
    .map((id) => chats.find((c) => c.id === id))
    .filter(Boolean) as Chat[];

  return (
    <div className="flex items-center border-b bg-muted/30 overflow-x-auto shrink-0">
      {openChats.map((chat) => (
        <div
          key={chat.id}
          className={`flex items-center gap-1 px-3 py-1.5 text-xs cursor-pointer border-r shrink-0 max-w-40 group ${
            chat.id === activeChatId
              ? "bg-background text-foreground border-b-2 border-b-primary"
              : "text-muted-foreground hover:bg-muted/50"
          }`}
          onClick={() => onSelectChat(chat.id)}
        >
          <span className="truncate">{chat.title || "New Chat"}</span>
          <button
            className="opacity-0 group-hover:opacity-100 hover:text-destructive p-0.5 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onCloseTab(chat.id);
            }}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
