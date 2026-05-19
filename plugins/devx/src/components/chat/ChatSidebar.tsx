import { useState } from "react";
import { Plus, Trash2, MessageSquare, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Chat } from "@/lib/types";

interface ChatSidebarProps {
  chats: Chat[];
  activeChatId: string | null;
  onSelectChat: (chatId: string) => void;
  onNewChat: () => void;
  onDeleteChat: (chatId: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function ChatSidebar({
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  collapsed = false,
  onToggleCollapse,
}: ChatSidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col border-r bg-muted/30">
      <div className={cn("flex items-center border-b", collapsed ? "justify-center p-2" : "justify-between p-3")}>
        {!collapsed && <h2 className="text-sm font-semibold">Chats</h2>}
        <div className={cn("flex items-center", !collapsed && "gap-1")}>
          {!collapsed && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onNewChat}>
              <Plus className="h-4 w-4" />
            </Button>
          )}
          {onToggleCollapse && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggleCollapse} title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>

      {collapsed ? (
        <div className="flex-1 overflow-y-auto p-1 space-y-1">
          <Button variant="ghost" size="icon" className="h-8 w-8 mx-auto flex" onClick={onNewChat} title="New chat">
            <Plus className="h-4 w-4" />
          </Button>
          {chats.map((chat) => (
            <Button
              key={chat.id}
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 mx-auto flex",
                activeChatId === chat.id && "bg-accent",
              )}
              onClick={() => onSelectChat(chat.id)}
              title={chat.title || "New Chat"}
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {chats.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">
              No chats yet. Start a new one!
            </p>
          )}
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={cn(
                "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-accent",
                activeChatId === chat.id && "bg-accent",
              )}
              onClick={() => onSelectChat(chat.id)}
              onMouseEnter={() => setHoveredId(chat.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate flex-1">{chat.title || "New Chat"}</span>
              {hoveredId === chat.id && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteChat(chat.id);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
