import { useState, useEffect, useCallback } from "react";
import type { Chat } from "@/lib/types";
import * as api from "@/lib/api";

export function useChats(appId?: string | null) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.listChats(appId);
      setChats(data);
    } catch (err) {
      console.error("Failed to load chats:", err);
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(async (title: string, mode: string, appId?: string | null) => {
    const chat = await api.createChat(title, mode, appId);
    setChats((prev) => [chat, ...prev]);
    return chat;
  }, []);

  const remove = useCallback(async (chatId: string) => {
    await api.deleteChat(chatId);
    setChats((prev) => prev.filter((c) => c.id !== chatId));
  }, []);

  const rename = useCallback(async (chatId: string, title: string) => {
    const updated = await api.updateChat(chatId, title);
    setChats((prev) => prev.map((c) => (c.id === chatId ? updated : c)));
  }, []);

  const updateMode = useCallback(async (chatId: string, mode: string) => {
    const updated = await api.updateChatMode(chatId, mode);
    setChats((prev) => prev.map((c) => (c.id === chatId ? updated : c)));
  }, []);

  return { chats, loading, refresh, create, remove, rename, updateMode };
}
