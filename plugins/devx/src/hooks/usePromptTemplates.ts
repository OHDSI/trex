import { useState, useEffect, useCallback } from "react";
import type { PromptTemplate } from "@/lib/types";
import { API_BASE } from "@/lib/config";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
    credentials: "include",
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export function usePromptTemplates() {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<PromptTemplate[]>("/prompts");
      setTemplates(data);
    } catch { /* */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const create = useCallback(async (name: string, content: string, category?: string) => {
    const t = await apiFetch<PromptTemplate>("/prompts", {
      method: "POST",
      body: JSON.stringify({ name, content, category }),
    });
    setTemplates((prev) => [...prev, t]);
    return t;
  }, []);

  const remove = useCallback(async (id: string) => {
    await apiFetch(`/prompts/${id}`, { method: "DELETE" });
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { templates, loading, refresh, create, remove };
}
