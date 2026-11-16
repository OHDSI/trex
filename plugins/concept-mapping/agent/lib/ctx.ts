// Shared tool-context helpers. Tools return { error } instead of throwing so
// the model sees a recoverable message rather than a failed turn.
import type { QueryFn } from "./runs.ts";

export interface Ctx {
  sessionId?: string;
  userId?: string;
  sql?: QueryFn;
  emit?: (name: string, data: unknown) => void;
}

export class ToolError extends Error {}

export function requireSql(ctx: Ctx | undefined): QueryFn {
  if (!ctx?.sql) throw new ToolError("no database available to this agent (DATABASE_URL not configured)");
  return ctx.sql;
}

export async function guarded<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export const envGet = (k: string): string | undefined => Deno.env.get(k);

export function requireSession(ctx: Ctx | undefined): string {
  if (!ctx?.sessionId) throw new ToolError("no session id available");
  return ctx.sessionId;
}
