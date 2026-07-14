// Inbound allow-list enforcement shared by every channel adapter. An adapter
// resolves its ChannelAllowList (explicit option, else `<PREFIX>_ALLOWED_USERS`
// / `<PREFIX>_ALLOWED_CHANNELS` env) and checks the platform identity of each
// interaction before any send()/resume().
import type { ChannelAllowList } from "./types.ts";

export function channelAllows(
  allow: ChannelAllowList | undefined,
  id: { userId?: string; conversationId?: string },
): boolean {
  if (!allow) return true;
  if (allow.users?.length && (!id.userId || !allow.users.includes(id.userId))) {
    return false;
  }
  if (
    allow.conversations?.length &&
    (!id.conversationId || !allow.conversations.includes(id.conversationId))
  ) {
    return false;
  }
  return true;
}

const splitIds = (v: string | undefined): string[] =>
  (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

// Env fallback so an agent needs no code — just config. Returns undefined
// when neither var is set (= unrestricted).
export function envAllowList(prefix: string): ChannelAllowList | undefined {
  const users = splitIds(Deno.env.get(`${prefix}_ALLOWED_USERS`));
  const conversations = splitIds(Deno.env.get(`${prefix}_ALLOWED_CHANNELS`));
  if (!users.length && !conversations.length) return undefined;
  return {
    ...(users.length ? { users } : {}),
    ...(conversations.length ? { conversations } : {}),
  };
}
