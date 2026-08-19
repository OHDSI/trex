// @ts-nocheck — imports resolve inside the staged agent worker (../../auth is
// core's auth dir, copied next to the agent servicePath at worker creation), not
// against the plugin source tree.
//
// claw drives the SAME coder the devx browser UI uses: the Claude Code sidecar,
// reached through the devx-api edge function's POST /chats/:id/stream. The eve
// agents runtime cannot host that sidecar (its hook only yields a ModelSpec and
// core owns the turn), so claw talks to the function mount directly instead.
//
// Transport is a plain loopback fetch, NOT Trex.req: the inter-service channel
// (core/server/plugin/function.ts) buffers the whole response via `.text()` under
// a 30s op_req timeout, which a minutes-long coding turn always exceeds. A direct
// HTTP connection streams the turn with no such cap. The function mount enforces
// verify_jwt, so the fetch carries a minted user token — the same access token
// core issues at login, which grants claw nothing beyond the CLAW_CODE_USER_ID
// identity it already asserts via Trex.req's x-user-id on the eve path.
//
// core's auth/keys.ts is imported dynamically inside mintToken, NOT at the top:
// it only exists next to the agent at worker-creation time (core copies it into
// the servicePath), so a static import breaks module resolution in the plugin
// source tree / CI, where `../../auth/keys.ts` does not exist.

// Loopback base for the control server. Reuse the gateway override so a
// deployment that moves trexas off 33001 stays consistent with claw's Discord
// forwarding, falling back to the same default.
export function apiBase(): string {
  const root = Deno.env.get("DISCORD_GATEWAY_LOOPBACK_URL")?.trim() || "http://127.0.0.1:33001";
  return `${root.replace(/\/+$/, "")}/plugins/trex/devx-api`;
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Mint the same HS256 access token core issues at login (auth/jwt.ts): the
// function mount's verify_jwt only checks the signature and exp, and auth-context
// derives the request's user from `sub`. Signing key is the jwt subkey derived
// from the deployment root key — identical to core's getJwtSecret().
export async function mintToken(userId: string): Promise<string> {
  const { deriveSubkeyBase64, LABELS } = await import("../../auth/keys.ts");
  const secret = await deriveSubkeyBase64(LABELS.jwtHs256);
  const now = Math.floor(Date.now() / 1000);
  const enc = new TextEncoder();
  const header = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = b64url(enc.encode(JSON.stringify({
    sub: userId,
    role: "authenticated",
    aud: "authenticated",
    iat: now,
    exp: now + 3600,
  })));
  const data = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
  return `${data}.${b64url(sig)}`;
}

// Pin the coder user to the claude-code provider so the turn lands on
// streamClaudeCodeChat (the Claude Code sidecar) rather than the API-key ai-sdk
// loop. claude-code needs no api_key (noKeyProviders in index.ts). Done through
// the settings API (with the minted token) rather than direct SQL so it stays
// user-scoped and avoids assuming claw's sql role can write the devx schema.
// Reads current settings first and only writes when the provider differs, to
// avoid clobbering a shared user's other preferences. NOTE: a user with an ACTIVE
// devx.provider_configs row wins over devx.settings (index.ts resolution order);
// the dedicated CLAW_CODE_USER_ID has none, so this suffices.
async function ensureClaudeCodeProvider(token: string): Promise<void> {
  const base = apiBase();
  const auth = { authorization: `Bearer ${token}` };
  let cur: Record<string, unknown> | null = null;
  const got = await fetch(`${base}/settings`, { headers: auth });
  if (got.ok) { try { cur = await got.json(); } catch { /* treat as unset */ } }
  if (cur?.provider === "claude-code") return;
  const res = await fetch(`${base}/settings`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...auth },
    body: JSON.stringify({
      provider: "claude-code",
      model: cur?.model || "claude-sonnet-4-20250514",
      ai_rules: cur?.ai_rules ?? undefined,
      auto_approve: cur?.auto_approve ?? undefined,
      max_steps: cur?.max_steps ?? undefined,
      max_tool_steps: cur?.max_tool_steps ?? undefined,
      auto_fix_problems: cur?.auto_fix_problems ?? undefined,
      loop: cur?.loop ?? undefined,
    }),
  });
  if (!res.ok) throw new Error(`code provider set failed: ${res.status} ${await res.text()}`);
}

// The chat always runs in devx "agent" mode: it is the only mode that keeps the
// coder's full toolset AND lets the superpowers skills lead (brainstorming →
// writing-plans → subagent-driven-development). devx "plan" mode injects its own
// self-contained planner that sidelines those skills, producing a shallow one-shot
// plan — so claw does NOT use it. Plan-vs-implement gating is enforced by the
// facilitator (relay each step to the channel, wait for approval), not by mode.
async function ensureChat(
  token: string,
  appId: string | null,
  existingChatId: string | null,
): Promise<string> {
  const auth = { "content-type": "application/json", authorization: `Bearer ${token}` };
  if (existingChatId) {
    // Re-assert agent mode: a chat opened by an earlier build may still be in
    // devx "plan" mode; flip it so the superpowers skills drive the turn.
    const res = await fetch(`${apiBase()}/chats/${existingChatId}`, {
      method: "PATCH",
      headers: auth,
      body: JSON.stringify({ mode: "agent" }),
    });
    if (!res.ok) throw new Error(`code chat mode set failed: ${res.status} ${await res.text()}`);
    return existingChatId;
  }
  const res = await fetch(`${apiBase()}/chats`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ title: "Discord (claw)", mode: "agent", app_id: appId }),
  });
  if (!res.ok) throw new Error(`code chat create failed: ${res.status} ${await res.text()}`);
  const chat = await res.json();
  return chat.id as string;
}

// Run one coder turn and return its reply text. The SSE carries the turn's whole
// life (chunks, tool calls, subagents, questionnaires); we accumulate assistant
// text and surface a questionnaire inline so claw can relay the coder's question
// back to the channel. The turn is done when the server closes the stream.
async function streamTurn(
  token: string,
  chatId: string,
  message: string,
  attachments?: CodeTurnArgs["attachments"],
): Promise<string> {
  const res = await fetch(`${apiBase()}/chats/${chatId}/stream`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    // useWorktree pins the coder to a stable per-chat git worktree so feature
    // work stays isolated and survives the cwd reset between turns.
    // remoteChannel tells the coder it is driven from a chat channel whose
    // participants cannot execute anything on this machine (sandbox context) —
    // it must run/verify everything itself instead of handing back commands.
    // attachments (channel files, metadata only) are materialized into the
    // coder's workspace by the devx side before the turn starts.
    body: JSON.stringify({
      prompt: message,
      useWorktree: true,
      remoteChannel: true,
      ...(attachments?.length ? { attachments } : {}),
    }),
  });
  if (!res.ok || !res.body) throw new Error(`code stream failed: ${res.status} ${res.ok ? "(no body)" : await res.text()}`);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  let text = "";
  try {
    // deno-lint-ignore no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trimEnd();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const json = line.slice(5).trim();
        if (!json) continue;
        let ev: { type?: string; content?: string; error?: string; code?: string; raw?: string; questions?: unknown };
        try { ev = JSON.parse(json); } catch { continue; }
        if (ev.type === "chunk") {
          text += ev.content ?? "";
        } else if (ev.type === "done") {
          // Terminal event carries the full assistant text; use it only as a
          // fallback so an emitter that skips incremental chunks still yields a
          // reply, without double-counting the chunks we already accumulated.
          if (!text && typeof ev.content === "string") text = ev.content;
        } else if (ev.type === "error") {
          // devx sends the message on `error` (never on `content`, which carries chunk
          // text) plus a stable `code` and, for remoteChannel callers, the raw message.
          const { describeCoderError } = await import("./code-error.ts");
          throw new Error(describeCoderError(ev.code, ev.raw ?? ev.error));
        } else if (ev.type === "questionnaire" && Array.isArray(ev.questions)) {
          const qs = ev.questions
            .map((q: any, i: number) => `${i + 1}. ${q?.text ?? q?.question ?? q}`)
            .join("\n");
          text += `\n\n[The coder needs input]\n${qs}`;
        }
      }
    }
  } finally {
    try { await reader.cancel(); } catch { /* already closed */ }
  }
  return text.trim();
}

export interface CodeTurnArgs {
  chatId: string | null;
  message: string;
  userId: string;
  appId: string | null;
  // Channel attachments relayed verbatim (metadata only); the devx stream
  // handler downloads them into the coder's workspace before the turn.
  attachments?: Array<{ name: string; url: string; contentType?: string }>;
}

// One hand-off to the Claude Code coder. Opens the chat on first use, forces the
// claude-code provider, streams the turn, and returns { chatId, replyText } — the
// chatId is persisted by the caller to continue the same chat across Discord turns.
// The turn's intent (brainstorm / plan / implement) is carried by the message the
// facilitator sends, not by a mode flag.
export async function runCodeTurn(
  args: CodeTurnArgs,
): Promise<{ chatId: string; replyText: string }> {
  const token = await mintToken(args.userId);
  await ensureClaudeCodeProvider(token);
  const chatId = await ensureChat(token, args.appId, args.chatId);
  const replyText = await streamTurn(token, chatId, args.message, args.attachments);
  return { chatId, replyText };
}
