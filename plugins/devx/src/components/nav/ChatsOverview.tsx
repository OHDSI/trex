import { useState } from "react";
import { Plus, Trash2, MessageSquare, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Chat } from "@/lib/types";

interface ChatsOverviewProps {
  chats: Chat[];
  onOpenChat: (chatId: string) => void;
  onNewChat: () => void;
  onDeleteChat: (chatId: string) => void;
}

export function ChatsOverview({ chats, onOpenChat, onNewChat, onDeleteChat }: ChatsOverviewProps) {
  const [query, setQuery] = useState("");
  const filtered = chats.filter((c) => (c.title || "New Chat").toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 p-3 border-b">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 opacity-50" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="w-full rounded-md border bg-transparent pl-7 pr-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
        <Button size="sm" className="gap-1.5" onClick={onNewChat}>
          <Plus className="h-3.5 w-3.5" /> New chat
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">No chats yet. Start a new one!</p>
        )}
        {filtered.map((chat) => (
          <div
            key={chat.id}
            className={cn("group flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer hover:bg-accent")}
            onClick={() => onOpenChat(chat.id)}
          >
            <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate flex-1">{chat.title || "New Chat"}</span>
            <button
              className="opacity-0 group-hover:opacity-100 hover:text-destructive p-1"
              onClick={(e) => { e.stopPropagation(); onDeleteChat(chat.id); }}
              aria-label="Delete chat"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
