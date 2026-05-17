import { useState, useEffect } from "react";
import type { Message } from "@/lib/types";

// Rough estimate: ~4 chars per token
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface TokenCounts {
  history: number;
  input: number;
  system: number;
  total: number;
  limit: number;
  promptTokens?: number;
  completionTokens?: number;
}

export function useTokenCount(
  messages: Message[],
  inputText: string,
  serverUsage?: { promptTokens?: number; completionTokens?: number },
) {
  const [counts, setCounts] = useState<TokenCounts>({
    history: 0,
    input: 0,
    system: 2000, // rough estimate for system prompt
    total: 0,
    limit: 200000, // default context window
  });

  useEffect(() => {
    const history = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    const input = estimateTokens(inputText);
    setCounts({
      history,
      input,
      system: 2000,
      total: history + input + 2000,
      limit: 200000,
      promptTokens: serverUsage?.promptTokens,
      completionTokens: serverUsage?.completionTokens,
    });
  }, [messages, inputText, serverUsage?.promptTokens, serverUsage?.completionTokens]);

  return counts;
}
