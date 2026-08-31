// @ts-nocheck — imports resolve inside the staged agent worker (../../auth is
// core's auth dir, copied next to the agent servicePath at worker creation), not
// against the plugin source tree.
//
// claw's LEGACY coder transport: the devx-api edge function's POST
// /chats/:id/stream. No provider selects it any more — eve hosts the sidecar
// too now (code-route.ts) — and it is kept only until the legacy loop is
// deleted. mintToken/apiBase/ensureChat/assertCoderProvider below are still
// live on the eve path (chat-mirror.ts, askCodeAgent's pinned-provider assert).
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

import { type CoderProviderIntent, resolveCoderProviderIntent } from "./coder-provider.ts";

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

// Write the pinned intent onto the coder account (callers reach this through
// assertCoderProvider, which decides whether anything is pinned at all).
// Reads current settings first and only writes when something actually
// differs, to avoid clobbering a shared user's other preferences. NOTE: a user
// with an ACTIVE devx.provider_configs row wins over devx.settings (index.ts
// resolution order); the dedicated CLAW_CODE_USER_ID has none, so this suffices.
async function ensureCoderProvider(token: string, intent: CoderProviderIntent): Promise<void> {
  const base = apiBase();
  const auth = { authorization: `Bearer ${token}` };
  let cur: Record<string, unknown> | null = null;
  const got = await fetch(`${base}/settings`, { headers: auth });
  if (got.ok) { try { cur = await got.json(); } catch { /* treat as unset */ } }
  const modelMatches = !intent.model || cur?.model === intent.model;
  if (cur?.provider === intent.provider && modelMatches) return;
  const model = intent.model || cur?.model;
  if (!model) {
    // Pinning a provider with no model anywhere (no CLAW_CODER_MODEL, and no
    // existing settings row to fall back on) is a misconfiguration — writing
    // a null model would silently brick the account's coder settings, so
    // fail loudly instead.
    throw new Error(
      "CLAW_CODER_PROVIDER is set but no model is available: set CLAW_CODER_MODEL or configure a model in devx Settings first.",
    );
  }
  const res = await fetch(`${base}/settings`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...auth },
    body: JSON.stringify({
      provider: intent.provider,
      model,
      base_url: cur?.base_url ?? undefined,
      ai_rules: cur?.ai_rules ?? undefined,
      auto_approve: cur?.auto_approve ?? undefined,
      max_steps: cur?.max_steps ?? undefined,
      max_tool_steps: cur?.max_tool_steps ?? undefined,
      auto_fix_problems: cur?.auto_fix_problems ?? undefined,
    }),
  });
  if (!res.ok) throw new Error(`code provider set failed: ${res.status} ${await res.text()}`);
}

// mint is injected by the legacy transport (it already holds a token) and by
// tests; env only by tests. Production reads Deno.env and mints for real.
export interface CoderProviderAssertDeps {
  env?: (k: string) => string | undefined;
  mint?: (userId: string) => Promise<string>;
}

// Assert the pinned provider before a turn, on EITHER transport. This used to
// live inline in the legacy runCodeTurn below; nothing selects that transport
// any more (code-route.ts), so the eve path calls this or CLAW_CODER_PROVIDER
// goes silently inert. Nothing pinned means no token minted and no round trip.
export async function assertCoderProvider(userId: string, deps: CoderProviderAssertDeps = {}): Promise<void> {
  const intent = resolveCoderProviderIntent(deps.env ?? ((k: string) => Deno.env.get(k)));
  if (!intent) return;
  await ensureCoderProvider(await (deps.mint ?? mintToken)(userId), intent);
}

// The chat always runs in devx "agent" mode: it is the only mode that keeps the
// coder's full toolset AND lets the superpowers skills lead (brainstorming →
// writing-plans → subagent-driven-development). devx "plan" mode injects its own
// self-contained planner that sidelines those skills, producing a shallow one-shot
// plan — so claw does NOT use it. Plan-vs-implement gating is enforced by the
// facilitator (relay each step to the channel, wait for approval), not by mode.
// Exported so chat-mirror.ts (the eve transport's devx-UI mirroring) can
// reuse this exact chat-creation/mode-reassert logic instead of a second
// path — behavior here is otherwise unchanged for the legacy transport.
export async function ensureChat(
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

// The last non-empty prose line of the accumulated assistant text, stripped of
// tool markers and trimmed to 140 chars — a short "still alive" summary for the
// heartbeat. Falls back to "still working" before any prose has arrived (a long
// build/test run produces tool markers but no text for minutes).
export function summarizeActivity(accumulated: string): string {
  const line = accumulated
    .split("\n")
    .map((l) => l.replace(/<!--tool:[^>]*-->/g, "").trim())
    .filter((l) => l.length > 0)
    .pop();
  if (!line) return "still working";
  return line.length > 140 ? line.slice(0, 140) : line;
}

// A Discord thread wants a sign of life every few minutes, not every 90s: 37 of
// 263 real turns ended with nothing posted to the channel because claw cannot
// post anything while blocked inside this hand-off. Do not shorten this or make
// it configurable — the interval was chosen deliberately.
const HEARTBEAT_MS = 300_000;

// With per-session turn serialization and a raised channel step floor (200), a
// hung upstream (the devx-api function, or the coder sidecar it drives) could
// previously wedge the WHOLE session — not just this one turn — until the 2h
// reaper eventually ran. A generous but bounded per-turn timeout closes that
// off without needing every hang to wait for the reaper.
const TURN_TIMEOUT_MS = 90 * 60_000;

// Run one coder turn and return its reply text. The SSE carries the turn's whole
// life (chunks, tool calls, subagents, questionnaires); we accumulate assistant
// text and surface a questionnaire inline so claw can relay the coder's question
// back to the channel. The turn is done when the server closes the stream.
// onProgress, when supplied, is invoked once per HEARTBEAT_MS with a short note
// derived from the latest accumulated text — driven by a timer started when the
// stream opens, NOT from the chunk branch, so a long silent build or test run
// (which produces no chunks for minutes) still reports in.
// Exported for testing only (the timer/heartbeat wiring — see
// code-stream.test.ts) — runCodeTurn is the only production caller.
export async function streamTurn(
  token: string,
  chatId: string,
  message: string,
  attachments?: CodeTurnArgs["attachments"],
  onProgress?: (note: string) => void,
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
    // Bounded so a hung upstream cannot wedge this session forever — see
    // TURN_TIMEOUT_MS above. Aborts the fetch/stream; the caller (askCore)
    // sees this as an ordinary turn failure, same as any other stream error.
    signal: AbortSignal.timeout(TURN_TIMEOUT_MS),
  });
  if (!res.ok || !res.body) throw new Error(`code stream failed: ${res.status} ${res.ok ? "(no body)" : await res.text()}`);

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  let text = "";
  // Timer-driven, not chunk-driven: a long build or test run produces no
  // chunks for minutes, which is exactly the stretch the channel needs to
  // hear about — see summarizeActivity's fallback for the "no prose yet" beat.
  const beat = onProgress
    ? setInterval(() => onProgress(summarizeActivity(text)), HEARTBEAT_MS)
    : undefined;
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
    // Cleared on every exit path — including the ev.error throw above — so
    // the timer never outlives the stream it was measuring.
    if (beat !== undefined) clearInterval(beat);
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
  // Invoked once per HEARTBEAT_MS while the turn is streaming, with a short
  // note derived from the latest activity — see streamTurn. Callers with no
  // channel to post to should pass nothing rather than a no-op (a no-op
  // still burns a timer for no reason).
  onProgress?: (note: string) => void;
}

// One hand-off to the coder. Opens the chat on first use, asserts the configured
// provider when this deployment pins one, streams the turn, and returns { chatId, replyText } —
// the chatId is persisted by the caller to continue the same chat across Discord turns.
// The turn's intent (brainstorm / plan / implement) is carried by the message the
// facilitator sends, not by a mode flag.
export async function runCodeTurn(
  args: CodeTurnArgs,
): Promise<{ chatId: string; replyText: string }> {
  const token = await mintToken(args.userId);
  await assertCoderProvider(args.userId, { mint: () => Promise.resolve(token) });
  const chatId = await ensureChat(token, args.appId, args.chatId);
  const replyText = await streamTurn(token, chatId, args.message, args.attachments, args.onProgress);
  return { chatId, replyText };
}
