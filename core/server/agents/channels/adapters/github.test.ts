// GitHub adapter tests. NO live GitHub — the REST HTTP is mocked via
// opts.api.fetch, and the X-Hub-Signature-256 gate runs for REAL (a genuine
// HMAC-SHA256 over the raw body, keyed by the webhook secret). The App-JWT mint
// runs for REAL too (WebCrypto RS256 over an ephemeral generated keypair); only
// the installation-token exchange + comment POST are mocked.

import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { defaultGitHubResume, githubChannel } from "./github.ts";
import { signGitHubWebhookBody } from "../vendor/github/verify.ts";
import { clearGitHubInstallationTokenCache, createGitHubAppJwt } from "../vendor/github/auth.ts";
import { deriveGitHubInputResponse, renderGitHubInputRequest } from "../vendor/github/hitl.ts";
import type { ChannelAuth, ChannelRouteArgs } from "eve/channels";

const SECRET = "test-webhook-secret";
const ROUTE_URL = "https://worker.example/base/eve/v1/github";

// ---- request helpers -------------------------------------------------------

async function githubRequest(
  payload: unknown,
  opts: { event?: string; secret?: string; signature?: string; omitSignature?: boolean; delivery?: string } = {},
): Promise<Request> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-github-event": opts.event ?? "issue_comment",
    "x-github-delivery": opts.delivery ?? "delivery-1",
  };
  if (!opts.omitSignature) {
    headers["x-hub-signature-256"] = opts.signature ?? await signGitHubWebhookBody(body, opts.secret ?? SECRET);
  }
  return new Request(ROUTE_URL, { method: "POST", headers, body });
}

function issueCommentPayload(over: {
  body?: string;
  number?: number;
  authorLogin?: string;
  authorType?: string;
  isPr?: boolean;
} = {}): unknown {
  const user = { login: over.authorLogin ?? "alice", id: 7, type: over.authorType ?? "User" };
  return {
    action: "created",
    issue: {
      number: over.number ?? 42,
      title: "an issue",
      ...(over.isPr ? { pull_request: { url: "https://api.github.com/pr/42" } } : {}),
    },
    comment: {
      id: 1001,
      body: over.body ?? "hey what is the weather",
      user,
      html_url: "https://github.com/acme/widgets/issues/42#issuecomment-1001",
      url: "https://api.github.com/repos/acme/widgets/issues/comments/1001",
    },
    repository: { full_name: "acme/widgets", name: "widgets", owner: { login: "acme" }, id: 123, private: false },
    sender: user,
    installation: { id: 555 },
  };
}

interface SendCall {
  message: string;
  opts: { auth: ChannelAuth | null; continuationToken: string; state?: unknown; title?: string };
}

interface ResumeCall {
  continuationToken: string;
  input: { requestId?: string; decision?: string; inputResponses?: Array<{ requestId?: string; optionId?: string }> };
}

// Default resumeResult is {ok:false} — the common case is "no pending approval",
// where a reply-shaped comment must fall through to a normal turn.
function mockArgs(
  resumeResult: { ok: boolean; error?: string } = { ok: false },
): { args: ChannelRouteArgs; sends: SendCall[]; resumes: ResumeCall[]; flush: () => Promise<void> } {
  const sends: SendCall[] = [];
  const resumes: ResumeCall[] = [];
  const pending: Promise<unknown>[] = [];
  const args: ChannelRouteArgs = {
    send(message, opts) {
      sends.push({ message, opts });
      return Promise.resolve({ id: "session-1" });
    },
    getSession: () => null,
    receive: () => Promise.resolve({ id: "session-1" }),
    resume(continuationToken, input) {
      resumes.push({ continuationToken, input });
      return Promise.resolve(resumeResult);
    },
    params: {},
    waitUntil: (p) => {
      pending.push(p);
    },
    // Never called by this adapter (it has no thread-following path), but
    // ChannelRouteArgs requires it — and a fixture that silently omitted a
    // required member is exactly how this file drifted from the interface.
    hasSession: () => Promise.resolve(false),
    requestIp: null,
  };
  return { args, sends, resumes, flush: async () => void (await Promise.allSettled(pending)) };
}

// An ephemeral RSA keypair exported as PKCS8 PEM, for the RS256 App-JWT tests.
async function makeKeyPair(): Promise<{ pem: string; publicKey: CryptoKey }> {
  const kp = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", kp.privateKey));
  let bin = "";
  for (const b of der) bin += String.fromCharCode(b);
  const b64 = btoa(bin).replace(/(.{64})/g, "$1\n");
  return { pem: `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----`, publicKey: kp.publicKey };
}

function decodeB64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return atob(b64);
}

// Reads a DER definite length at `offset`, returning the length + the index just
// past the length octets.
function readDerLength(bytes: Uint8Array, offset: number): { len: number; next: number } {
  const first = bytes[offset];
  if (first < 0x80) return { len: first, next: offset + 1 };
  const n = first & 0x7f;
  let len = 0;
  for (let i = 0; i < n; i++) len = (len << 8) | bytes[offset + 1 + i];
  return { len, next: offset + 1 + n };
}

// Unwraps a PKCS8 `PrivateKeyInfo` DER back to its PKCS1 `RSAPrivateKey` DER and
// re-arms it as an `RSA PRIVATE KEY` PEM — the inverse of the adapter's
// pkcs1→pkcs8 conversion, used to synthesize a GitHub-shaped PKCS1 key for tests.
function pkcs8PemToPkcs1Pem(pkcs8Pem: string): string {
  const b64 = pkcs8Pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
  let o = 0;
  o = readDerLength(der, o + 1).next; // outer SEQUENCE
  o += 3; // version INTEGER (02 01 00)
  const alg = readDerLength(der, o + 1); // algorithm SEQUENCE
  o = alg.next + alg.len;
  const oct = readDerLength(der, o + 1); // privateKey OCTET STRING
  const pkcs1 = der.slice(oct.next, oct.next + oct.len);
  let pkcs1Bin = "";
  for (const b of pkcs1) pkcs1Bin += String.fromCharCode(b);
  const armored = btoa(pkcs1Bin).replace(/(.{64})/g, "$1\n");
  return `-----BEGIN RSA PRIVATE KEY-----\n${armored}\n-----END RSA PRIVATE KEY-----`;
}

// ---- signature gate --------------------------------------------------------

Deno.test("valid X-Hub-Signature-256 passes the gate → reaches send() + 202 ack", async () => {
  const channel = githubChannel({ credentials: { webhookSecret: SECRET } });
  const { args, sends, flush } = mockArgs();
  const res = await channel.routes[0].handler(await githubRequest(issueCommentPayload()), args);
  assertEquals(res.status, 202);
  await flush();
  assertEquals(sends.length, 1);
});

Deno.test("bad signature → 401 and zero send()", async () => {
  const channel = githubChannel({ credentials: { webhookSecret: SECRET } });
  const { args, sends, flush } = mockArgs();
  const res = await channel.routes[0].handler(
    await githubRequest(issueCommentPayload(), { signature: "sha256=deadbeef" }),
    args,
  );
  assertEquals(res.status, 401);
  await flush();
  assertEquals(sends.length, 0);
});

Deno.test("wrong-secret signature → 401 (mismatch) and zero send()", async () => {
  const channel = githubChannel({ credentials: { webhookSecret: SECRET } });
  const { args, sends, flush } = mockArgs();
  const res = await channel.routes[0].handler(
    await githubRequest(issueCommentPayload(), { secret: "other-secret" }),
    args,
  );
  assertEquals(res.status, 401);
  await flush();
  assertEquals(sends.length, 0);
});

Deno.test("missing signature header → 401 and zero send()", async () => {
  const channel = githubChannel({ credentials: { webhookSecret: SECRET } });
  const { args, sends, flush } = mockArgs();
  const res = await channel.routes[0].handler(await githubRequest(issueCommentPayload(), { omitSignature: true }), args);
  assertEquals(res.status, 401);
  await flush();
  assertEquals(sends.length, 0);
});

Deno.test("missing configured webhook secret (fail closed) → 401", async () => {
  const channel = githubChannel({}); // no secret, no env
  const { args, sends, flush } = mockArgs();
  const res = await channel.routes[0].handler(await githubRequest(issueCommentPayload(), { signature: "sha256=x" }), args);
  assertEquals(res.status, 401);
  await flush();
  assertEquals(sends.length, 0);
});

// ---- inbound message -------------------------------------------------------

Deno.test("issue_comment.created → send() with body + owner/repo#number token + github auth", async () => {
  const channel = githubChannel({ credentials: { webhookSecret: SECRET } });
  const { args, sends, flush } = mockArgs();
  await channel.routes[0].handler(await githubRequest(issueCommentPayload()), args);
  await flush();

  assertEquals(sends.length, 1);
  const call = sends[0];
  assertStringIncludes(call.message, "hey what is the weather");
  assertStringIncludes(call.message, "<github_context>");
  assertEquals(call.opts.continuationToken, "acme/widgets#42");
  assertEquals(call.opts.auth?.authenticator, "github-webhook");
  assertEquals(call.opts.auth?.principalId, "github:7");
  const state = call.opts.state as { owner?: string; repo?: string; number?: number };
  assertEquals(state.owner, "acme");
  assertEquals(state.repo, "widgets");
  assertEquals(state.number, 42);
});

Deno.test("LOOP GUARD: a comment authored by a Bot → no send()", async () => {
  const channel = githubChannel({ credentials: { webhookSecret: SECRET } });
  const { args, sends, flush } = mockArgs();
  const res = await channel.routes[0].handler(
    await githubRequest(issueCommentPayload({ authorType: "Bot", authorLogin: "my-app[bot]" })),
    args,
  );
  assertEquals(res.status, 202);
  await flush();
  assertEquals(sends.length, 0);
});

Deno.test("LOOP GUARD: the app's own ${botName}[bot] comment → no send()", async () => {
  const channel = githubChannel({ credentials: { webhookSecret: SECRET }, botName: "my-app" });
  const { args, sends, flush } = mockArgs();
  // Author type "User" but login is the app's bot account — still ignored.
  await channel.routes[0].handler(
    await githubRequest(issueCommentPayload({ authorType: "User", authorLogin: "my-app[bot]" })),
    args,
  );
  await flush();
  assertEquals(sends.length, 0);
});

Deno.test("a non-created action (edited) is ignored → no send()", async () => {
  const channel = githubChannel({ credentials: { webhookSecret: SECRET } });
  const { args, sends, flush } = mockArgs();
  const payload = { ...(issueCommentPayload() as Record<string, unknown>), action: "edited" };
  const res = await channel.routes[0].handler(await githubRequest(payload), args);
  assertEquals(res.status, 202);
  await flush();
  assertEquals(sends.length, 0);
});

Deno.test("a ping delivery is acked without a send()", async () => {
  const channel = githubChannel({ credentials: { webhookSecret: SECRET } });
  const { args, sends, flush } = mockArgs();
  const ping = { zen: "Non-blocking is better.", hook: { id: 1 }, hook_id: 1, repository: { full_name: "acme/widgets", name: "widgets", owner: { login: "acme" }, id: 123 }, sender: { login: "acme", id: 1, type: "User" } };
  const res = await channel.routes[0].handler(await githubRequest(ping, { event: "ping" }), args);
  assertEquals(res.status, 202);
  await flush();
  assertEquals(sends.length, 0);
});

Deno.test("onCommand returning explicit { auth: null } sends with null auth", async () => {
  const channel = githubChannel({ credentials: { webhookSecret: SECRET }, onCommand: () => ({ auth: null }) });
  const { args, sends, flush } = mockArgs();
  await channel.routes[0].handler(await githubRequest(issueCommentPayload()), args);
  await flush();
  assertEquals(sends.length, 1);
  assertEquals(sends[0].opts.auth, null);
});

Deno.test("requireMention gates non-mentions and strips the mention", async () => {
  const channel = githubChannel({ credentials: { webhookSecret: SECRET }, botName: "my-app", requireMention: true });
  const { args, sends, flush } = mockArgs();

  // No mention → dropped.
  await channel.routes[0].handler(await githubRequest(issueCommentPayload({ body: "just chatting" })), args);
  // Mention → dispatched, mention stripped from the model-facing body.
  await channel.routes[0].handler(
    await githubRequest(issueCommentPayload({ body: "@my-app please summarize" }), { delivery: "d2" }),
    args,
  );
  await flush();

  assertEquals(sends.length, 1);
  assertStringIncludes(sends[0].message, "please summarize");
  assertEquals(sends[0].message.includes("@my-app"), false);
});

// ---- App JWT (RS256, reimplemented) ---------------------------------------

Deno.test("createGitHubAppJwt mints an RS256 JWT with the right header + claims, verifiable by the public key", async () => {
  const { pem, publicKey } = await makeKeyPair();
  const now = new Date(1_700_000_000_000);
  const jwt = await createGitHubAppJwt({ appId: "12345", privateKey: pem, now });
  const [h, p, s] = jwt.split(".");

  const header = JSON.parse(decodeB64Url(h));
  assertEquals(header.alg, "RS256");
  assertEquals(header.typ, "JWT");

  const claims = JSON.parse(decodeB64Url(p));
  assertEquals(claims.iss, "12345");
  assertEquals(claims.iat, 1_700_000_000 - 60);
  assertEquals(claims.exp, 1_700_000_000 + 600);

  // The signature verifies against the public key (proves the RS256 sign is real).
  const sigBin = decodeB64Url(s);
  const sig = new Uint8Array(sigBin.length);
  for (let i = 0; i < sigBin.length; i++) sig[i] = sigBin.charCodeAt(i);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, sig, new TextEncoder().encode(`${h}.${p}`));
  assertEquals(ok, true);
});

Deno.test("createGitHubAppJwt accepts a PKCS1 (GitHub App) private key by converting it to PKCS8", async () => {
  const { pem, publicKey } = await makeKeyPair();
  const pkcs1Pem = pkcs8PemToPkcs1Pem(pem); // GitHub hands you this armor
  const now = new Date(1_700_000_000_000);
  const jwt = await createGitHubAppJwt({ appId: "999", privateKey: pkcs1Pem, now });
  const [h, p, s] = jwt.split(".");

  assertEquals(JSON.parse(decodeB64Url(h)).alg, "RS256");
  assertEquals(JSON.parse(decodeB64Url(p)).iss, "999");
  // The converted-key signature verifies against the ORIGINAL public key —
  // proving the pkcs1→pkcs8 ASN.1 wrapping is byte-correct.
  const sigBin = decodeB64Url(s);
  const sig = new Uint8Array(sigBin.length);
  for (let i = 0; i < sigBin.length; i++) sig[i] = sigBin.charCodeAt(i);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, sig, new TextEncoder().encode(`${h}.${p}`));
  assertEquals(ok, true);
});

// ---- delivery: message.completed → REST comment (App-token auth) -----------

Deno.test("message.completed → mints an App JWT, exchanges an installation token, POSTs a comment with Bearer", async () => {
  clearGitHubInstallationTokenCache();
  const { pem } = await makeKeyPair();
  const calls: Array<{ url: string; method?: string; auth?: string; body?: unknown }> = [];
  const fetchMock: typeof fetch = (input, init) => {
    const url = String(input);
    const auth = new Headers(init?.headers).get("authorization") ?? undefined;
    calls.push({ url, method: init?.method, auth, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.includes("/access_tokens")) {
      return Promise.resolve(
        new Response(JSON.stringify({ token: "ghs_install_token", expires_at: "2999-01-01T00:00:00Z" }), { status: 201 }),
      );
    }
    return Promise.resolve(new Response(JSON.stringify({ id: 1, html_url: "https://github.com/c/1" }), { status: 201 }));
  };
  const channel = githubChannel({
    credentials: { webhookSecret: SECRET, appId: "42", privateKey: pem, installationId: 999 },
    api: { fetch: fetchMock },
  });
  const channelCtx = { state: { owner: "acme", repo: "widgets", number: 42 } };
  await channel.events!["message.completed"]({ turnId: "t1", message: "the weather is sunny", finishReason: "stop" }, channelCtx);

  const tokenCall = calls.find((c) => c.url.includes("/app/installations/999/access_tokens"));
  const commentCall = calls.find((c) => c.url.includes("/repos/acme/widgets/issues/42/comments"));
  assertEquals(tokenCall !== undefined, true);
  assertStringIncludes(tokenCall!.auth ?? "", "Bearer "); // App JWT bearer on the exchange
  assertEquals(commentCall !== undefined, true);
  assertEquals(commentCall!.method, "POST");
  assertEquals(commentCall!.auth, "Bearer ghs_install_token"); // installation token bearer on the comment
  assertEquals((commentCall!.body as { body: string }).body, "the weather is sunny");
});

Deno.test("message.completed splits a >65536-char reply into multiple comment POSTs", async () => {
  clearGitHubInstallationTokenCache();
  const { pem } = await makeKeyPair();
  const comments: string[] = [];
  const fetchMock: typeof fetch = (input, init) => {
    const url = String(input);
    if (url.includes("/access_tokens")) {
      return Promise.resolve(new Response(JSON.stringify({ token: "ghs_x", expires_at: "2999-01-01T00:00:00Z" }), { status: 201 }));
    }
    comments.push((JSON.parse(String(init?.body)) as { body: string }).body);
    return Promise.resolve(new Response(JSON.stringify({ id: 1 }), { status: 201 }));
  };
  const channel = githubChannel({
    credentials: { webhookSecret: SECRET, appId: "42", privateKey: pem, installationId: 1000 },
    api: { fetch: fetchMock },
  });
  const long = "A".repeat(65000) + "\n" + "B".repeat(2000); // > 65536 → 2 chunks
  await channel.events!["message.completed"]({ turnId: "t1", message: long, finishReason: "stop" }, { state: { owner: "acme", repo: "widgets", number: 7 } });

  assertEquals(comments.length, 2);
  assertEquals(comments[0].startsWith("A"), true);
  assertEquals(comments[1].startsWith("B"), true);
  assertEquals(comments[0].length <= 65536, true);
});

Deno.test("message.completed with tool-calls finishReason posts nothing", async () => {
  let called = 0;
  const fetchMock: typeof fetch = () => {
    called++;
    return Promise.resolve(new Response("{}", { status: 200 }));
  };
  const channel = githubChannel({ credentials: { webhookSecret: SECRET, appId: "42", installationId: 1 }, api: { fetch: fetchMock } });
  await channel.events!["message.completed"]({ turnId: "t1", message: "partial", finishReason: "tool-calls" }, { state: { owner: "acme", repo: "widgets", number: 1 } });
  assertEquals(called, 0);
});

// ---- delivery: input.requested → reply-instructions comment ----------------

Deno.test("input.requested renders a reply-instructions comment via REST", async () => {
  clearGitHubInstallationTokenCache();
  const { pem } = await makeKeyPair();
  const comments: string[] = [];
  const fetchMock: typeof fetch = (input, init) => {
    const url = String(input);
    if (url.includes("/access_tokens")) {
      return Promise.resolve(new Response(JSON.stringify({ token: "ghs_y", expires_at: "2999-01-01T00:00:00Z" }), { status: 201 }));
    }
    comments.push((JSON.parse(String(init?.body)) as { body: string }).body);
    return Promise.resolve(new Response(JSON.stringify({ id: 1 }), { status: 201 }));
  };
  const channel = githubChannel({
    credentials: { webhookSecret: SECRET, appId: "42", privateKey: pem, installationId: 1001 },
    api: { fetch: fetchMock },
  });
  const requestId = crypto.randomUUID();
  await channel.events!["input.requested"](
    { turnId: "t1", requests: [{ requestId, action: { kind: "tool-call", toolName: "delete_file", input: {} } }] },
    { state: { owner: "acme", repo: "widgets", number: 42 } },
  );

  assertEquals(comments.length, 1);
  assertStringIncludes(comments[0], "delete_file");
  assertStringIncludes(comments[0], "/approve");
  assertStringIncludes(comments[0], "/deny");
});

// ---- HITL text mapping (helpers) ------------------------------------------

Deno.test("deriveGitHubInputResponse maps a slash / number / keyword reply back to its option", () => {
  const requestId = crypto.randomUUID();
  const request = {
    requestId,
    prompt: "Approve delete_file?",
    display: "confirmation" as const,
    options: [{ id: "approve", label: "Approve" }, { id: "deny", label: "Deny" }],
  };
  assertStringIncludes(renderGitHubInputRequest(request), "/approve");
  assertEquals(deriveGitHubInputResponse("/approve", request), { requestId, optionId: "approve" });
  assertEquals(deriveGitHubInputResponse("2", request), { requestId, optionId: "deny" });
  assertEquals(deriveGitHubInputResponse("deny", request), { requestId, optionId: "deny" });
  assertEquals(deriveGitHubInputResponse("9", request), null);
});

// ---- HITL resume ----------------------------------------------------------

Deno.test("reply-shaped comment + opts.resume → override called, args.resume NOT used, no send()", async () => {
  const resumeCalls: Array<{ continuationToken: string; body: string }> = [];
  const channel = githubChannel({
    credentials: { webhookSecret: SECRET },
    resume: (ctx) => {
      resumeCalls.push({ continuationToken: ctx.continuationToken, body: ctx.body });
    },
  });
  const { args, sends, resumes, flush } = mockArgs();
  await channel.routes[0].handler(await githubRequest(issueCommentPayload({ body: "/approve" })), args);
  await flush();

  assertEquals(sends.length, 0); // routed to the override, not a fresh turn
  assertEquals(resumeCalls.length, 1);
  assertEquals(resumeCalls[0].continuationToken, "acme/widgets#42");
  assertEquals(resumeCalls[0].body, "/approve");
  assertEquals(resumes.length, 0); // override wins → layer primitive untouched
});

// MODE B: exactly one pending approval → the comment is consumed as the decision.
Deno.test("reply-shaped comment, single pending approval → resolved via args.resume, no send()", async () => {
  const channel = githubChannel({ credentials: { webhookSecret: SECRET } });
  const { args, sends, resumes, flush } = mockArgs({ ok: true });
  await channel.routes[0].handler(await githubRequest(issueCommentPayload({ body: "/approve" })), args);
  await flush();

  assertEquals(sends.length, 0); // consumed as an approval, not a fresh turn
  assertEquals(resumes.length, 1);
  assertEquals(resumes[0].continuationToken, "acme/widgets#42");
  assertEquals(resumes[0].input.decision, "approve"); // "/approve" → approve verb
});

// MODE B: no single pending approval → the comment falls through to a normal
// turn (nothing dropped) — preserving the pre-wiring behavior.
Deno.test("reply-shaped comment, no pending approval → falls through to a normal turn", async () => {
  const channel = githubChannel({ credentials: { webhookSecret: SECRET } });
  const { args, sends, resumes, flush } = mockArgs({ ok: false });
  await channel.routes[0].handler(await githubRequest(issueCommentPayload({ body: "/approve" })), args);
  await flush();

  assertEquals(resumes.length, 1); // attempted resume first
  assertEquals(sends.length, 1); // then fell through to a normal turn
  assertStringIncludes(sends[0].message, "/approve");
});

Deno.test("defaultGitHubResume forwards the decoded decision to args.resume; returns its ok", async () => {
  const { args, resumes } = mockArgs({ ok: true });
  const applied = await defaultGitHubResume({
    req: new Request(ROUTE_URL),
    args,
    continuationToken: "acme/widgets#42",
    owner: "acme",
    repo: "widgets",
    number: 42,
    body: "/deny",
  });
  assertEquals(applied, true);
  assertEquals(resumes.length, 1);
  assertEquals(resumes[0].continuationToken, "acme/widgets#42");
  assertEquals(resumes[0].input.decision, "deny"); // "/deny" → deny
});

// ---- delivery: message.queued ---------------------------------------------

// A message that arrives while a turn is running is queued, not started; the
// ack is what stops it looking like the message vanished. GitHub's primitive is
// an issue/PR comment; the app's own comment comes back authored by a Bot, which
// the inbound loop guard already drops.
Deno.test("message.queued posts a one-line acknowledgement comment on the thread", async () => {
  clearGitHubInstallationTokenCache();
  const calls: Array<{ url: string; method?: string; body?: unknown }> = [];
  const fetchMock: typeof fetch = (input, init) => {
    calls.push({ url: String(input), method: init?.method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return Promise.resolve(new Response(JSON.stringify({ id: 1 }), { status: 201 }));
  };
  const channel = githubChannel({
    credentials: { webhookSecret: SECRET, installationToken: "ghs_direct" },
    api: { fetch: fetchMock },
  });

  await channel.events!["message.queued"]({ text: "also rename the tests" }, { state: { owner: "acme", repo: "widgets", number: 42 } });

  assertEquals(calls.length, 1);
  assertStringIncludes(calls[0].url, "/repos/acme/widgets/issues/42/comments");
  assertEquals(calls[0].method, "POST");
  assertStringIncludes((calls[0].body as { body: string }).body, "queued");
});

Deno.test("message.queued names the closed gate when deniedPendingGate is set", async () => {
  clearGitHubInstallationTokenCache();
  const comments: string[] = [];
  const fetchMock: typeof fetch = (_input, init) => {
    comments.push((JSON.parse(String(init?.body)) as { body: string }).body);
    return Promise.resolve(new Response(JSON.stringify({ id: 1 }), { status: 201 }));
  };
  const channel = githubChannel({
    credentials: { webhookSecret: SECRET, installationToken: "ghs_direct" },
    api: { fetch: fetchMock },
  });

  await channel.events!["message.queued"](
    { text: "yes but explain the chunk count first", deniedPendingGate: true },
    { state: { owner: "acme", repo: "widgets", number: 42 } },
  );

  assertEquals(comments.length, 1);
  assertEquals(/closed the pending approval|feedback/i.test(comments[0]), true, `expected the deny-ack wording, got: ${comments[0]}`);
});

Deno.test("message.queued is a no-op without an owner, and swallows a delivery failure", async () => {
  clearGitHubInstallationTokenCache();
  let called = 0;
  const fetchMock: typeof fetch = () => {
    called++;
    return Promise.resolve(new Response("boom", { status: 500 }));
  };
  const channel = githubChannel({
    credentials: { webhookSecret: SECRET, installationToken: "ghs_direct" },
    api: { fetch: fetchMock },
  });

  await channel.events!["message.queued"]({ text: "hi" }, { state: {} });
  assertEquals(called, 0);

  const logged: string[] = [];
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => logged.push(args.map(String).join(" "));
  try {
    await channel.events!["message.queued"]({ text: "hi" }, { state: { owner: "acme", repo: "widgets", number: 42 } });
  } finally {
    console.warn = origWarn;
  }
  assertEquals(called, 1);
  assertEquals(logged.some((l) => l.includes("message.queued")), true);
});
