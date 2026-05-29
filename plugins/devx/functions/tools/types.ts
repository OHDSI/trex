// @ts-nocheck - Deno edge function
/**
 * Tool definition types for the DevX agent system.
 */

export type ConsentLevel = "always" | "ask" | "never";

export interface ToolDefinition<T = any> {
  readonly name: string;
  readonly description: string;
  /** JSON Schema for the tool's parameters (used by AI SDK) */
  readonly parameters: Record<string, any>;
  readonly defaultConsent: ConsentLevel;
  /** If true, this tool modifies state. Filtered out in read-only/ask mode. */
  readonly modifiesState?: boolean;
  /** Execute the tool with validated args */
  execute: (args: T, ctx: AgentContext) => Promise<string>;
  /** Human-readable preview for consent prompt */
  getConsentPreview?: (args: T) => string;
}

export interface AgentContext {
  chatId: string;
  userId: string;
  /** App ID this chat belongs to (null for non-app chats) */
  appId?: string | null;
  /** Absolute path to the user's workspace directory */
  workspacePath: string;
  /** SSE send function for streaming events to client */
  send: (data: unknown) => void;
  /** SQL query helper */
  sql: (query: string, params?: unknown[]) => Promise<{ rows: any[] }>;
  /** Request consent from user. Returns true if approved, false if denied. */
  requireConsent: (params: {
    toolName: string;
    toolDescription?: string;
    inputPreview?: string;
  }) => Promise<boolean>;
}

export interface AgentTodo {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
}
