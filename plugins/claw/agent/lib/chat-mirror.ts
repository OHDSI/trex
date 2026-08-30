// plugins/claw/agent/lib/chat-mirror.ts
//
// Mirrors an eve-transport coder turn into devx.chats/devx.messages, which
// the eve session API (code-session.ts) never writes to itself. This is the
// same client-side persistence devx's own browser UI does — see
// plugins/devx/functions/index.ts's POST /chats/:id/messages comment ("the
// eve/agents runtime's stateless /chat endpoint never writes to
// devx.messages itself ... this is the client-side persistence call") and
// plugins/devx/src/hooks/useAgentsChat.ts's api.createMessage() calls after
// every turn. The legacy transport needs none of this: code-stream.ts's
// ensureChat already opens the chat and its /stream route writes both
// messages server-side.
//
// Reuses code-stream.ts's ensureChat (exported for this) instead of a second
// chat-creation path, and its mintToken/apiBase for the same loopback
// devx-api call the legacy transport already makes.
import { apiBase, ensureChat, mintToken } from "./code-stream.ts";
import { setDevxChatId, type QueryFn } from "./state.ts";

export interface MirrorDeps {
  mintToken?: (userId: string) => Promise<string>;
  ensureChat?: (token: string, appId: string | null, existingChatId: string | null) => Promise<string>;
  fetch?: typeof fetch;
}

export interface MirrorTurnArgs {
  sessionId: string; // claw session id — keys the orchestrations row
  userId: string;
  appId: string | null;
  existingDevxChatId: string | null;
  userMessage: string;
  replyText: string;
}

async function postMessage(
  f: typeof fetch,
  token: string,
  devxChatId: string,
  role: "user" | "assistant",
  content: string,
): Promise<void> {
  const res = await f(`${apiBase()}/chats/${devxChatId}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ role, content }),
  });
  if (!res.ok) throw new Error(`devx message POST failed: ${res.status} ${await res.text()}`);
}

// Never throws — this is UI visibility only, not the coder's actual work, so
// a failed chat creation or message POST must never fail the turn that
// produced it (same posture as awaitApprovalCore's decision-ledger write).
// Logged with a distinct "devx chat mirror" prefix, not folded into any other
// error path, so "why is the devx UI empty" is greppable on its own.
export async function mirrorEveTurn(sql: QueryFn, args: MirrorTurnArgs, deps: MirrorDeps = {}): Promise<void> {
  try {
    const mint = deps.mintToken ?? mintToken;
    const ensure = deps.ensureChat ?? ensureChat;
    const f = deps.fetch ?? fetch;
    const token = await mint(args.userId);
    const devxChatId = await ensure(token, args.appId, args.existingDevxChatId);
    if (devxChatId !== args.existingDevxChatId) await setDevxChatId(sql, args.sessionId, devxChatId);
    await postMessage(f, token, devxChatId, "user", args.userMessage);
    await postMessage(f, token, devxChatId, "assistant", args.replyText);
  } catch (e) {
    console.error(`claw: devx chat mirror failed for session ${args.sessionId} — the devx UI will show nothing for this turn:`, e);
  }
}
