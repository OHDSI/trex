import type { AgentConfig } from "./types.ts";

export function defineAgent(config: AgentConfig): AgentConfig {
  return { maxSteps: 25, ...config };
}

export type { AgentConfig } from "./types.ts";
