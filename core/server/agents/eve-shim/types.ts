// Minimal structural type surface matching eve's public authoring API,
// plus trex-only extensions (clientOnly, idempotent, JSON Schema inputs).
// Keep this file dependency-free: agent tool files import it transitively
// and must stay portable to real eve.

export interface AgentConfig {
  model?: string; // eve/AI-Gateway format: "provider/model-id"
  maxSteps?: number;
}

export interface ToolContext {
  bearerToken?: string;
  sessionId: string;
  metadata?: unknown;
}

// deno-lint-ignore no-explicit-any
export type JsonSchemaObject = Record<string, any>;

export interface ToolDef {
  description: string;
  inputSchema: unknown; // zod schema or JSON Schema object
  execute?: (input: unknown, ctx?: ToolContext) => Promise<unknown>;
  needsApproval?: boolean;
  clientOnly?: boolean;
  idempotent?: boolean;
}

// zod v3/v4 schemas expose safeParse; JSON Schema objects don't.
export function isZodSchema(s: unknown): boolean {
  return !!s && typeof (s as { safeParse?: unknown }).safeParse === "function";
}
