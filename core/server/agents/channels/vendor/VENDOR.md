# Vendored channel helpers

The channel adapters reuse eve's **pure, per-platform** helpers (signature
verify, interaction/payload parse, REST/message formatting, HITL widget
encode/decode) under Apache-2.0. Only pure logic is vendored — eve's runtime
factories (`defineChannel`, `dist/src/channel/*`, `<platform>Channel.js`) are
NOT vendored; the trex factories in `../adapters/*.ts` supply that wiring.

Each vendored file carries an attribution header (source path + version +
Unmodified/Modified). This file records the eve version and the local edits so
re-syncing on an eve upgrade is mechanical: bump the version, re-copy the listed
files, and re-apply the edit categories below.

## eve version

- **eve@0.19.0**, from the installed package at
  `plugins-dev/toy-agent/node_modules/eve/dist/src/`.

## discord/ — copied files

Source dir: `dist/src/public/channels/discord/`.

| vendored file | eve source | edits |
|---|---|---|
| `verify.ts` | `verify.js` | Ed25519 rewritten from Node `node:crypto` (createPublicKey/verify over DER SPKI) to **WebCrypto** (`crypto.subtle.importKey("spki", …, {name:"Ed25519"})` + `crypto.subtle.verify`) for edge/Deno portability — `verifyDiscordSignature` is now **async**; Node Buffer/hex → sibling `hexToBytes`; `#internal/logging` → no-op debug logger; `process.env` → `getEnv` (Deno.env). |
| `inbound.ts` | `inbound.js` | imports `#shared/guards` → `./shared.ts`; types added from `inbound.d.ts`. Parsing logic unchanged. |
| `api.ts` | `api.js` | imports `#shared/json` + `verify` → `./shared.ts` / `./verify.ts`; `process.env` → `getEnv`; types from `api.d.ts`. REST logic (message splitting, followups, allowed-mentions default) unchanged. |
| `hitl.ts` | `hitl.js` | imports `#public/channels/discord/inbound` + `#runtime/input/types` → `./inbound.ts` / `./shared.ts`; Node Buffer base64url → sibling `utf8ToBase64Url`/`base64UrlToUtf8`. Encoding logic unchanged. |
| `responses.ts` | `responses.js` | imports `#shared/*` + `inbound` → siblings. Response shaping unchanged. |
| `verifyInbound.ts` | `verifyInbound.js` | `#internal/logging` → `console.warn`; `verify` import → sibling. Behavior unchanged (returns null instead of throwing so a route can 401). |
| `defaults.ts` | `defaults.js` | **Only** the pure `defaultDiscordAuth` is vendored; eve's `defaultEvents`/`defaultOnCommand` were intentionally NOT copied — they are shaped against eve's runtime channel handle (`ctx.discord.post()`/`.startTyping()`), which is eve runtime code. The trex factory supplies its own `events`/command default against `ChannelRouteArgs`. |
| `shared.ts` | `dist/src/shared/guards.js`, `dist/src/shared/json.js`, plus TYPE shapes from `dist/src/runtime/input/types.d.ts` (`InputOption`/`InputRequest`/`InputResponse`) and `dist/src/channel/types.d.ts` (`SessionAuthContext` → `DiscordAuthContext`). | Consolidated so the vendored Discord files import ONLY siblings in this dir — no eve internal (`#shared`/`#internal`/`#runtime`/`#channel`) import survives. Added Deno replacements for Node Buffer: `hexToBytes`, `utf8ToBase64Url`, `base64UrlToUtf8`; `getEnv` wraps `Deno.env`. |

### Not vendored (eve runtime — the trex factory replaces it)

- `discordChannel.js` — eve's runtime-coupled factory (imports `#public/definitions/defineChannel` + builds a stateful `ctx.discord` handle). trex's `../adapters/discord.ts` is the replacement.
- `index.js` — barrel re-export.
- `defaults.js`'s `defaultEvents` / `defaultOnCommand` — see above.

### Edit categories (re-apply on re-sync)

1. Rewrite `#…` package-subpath imports to relative `./` sibling imports.
2. Replace Node `Buffer`/`node:crypto`/`process.env` with the sibling
   Deno-friendly helpers in `shared.ts` (hex, base64url, WebCrypto Ed25519, env).
3. Replace `#internal/logging` `createLogger` with `console`/no-op.
4. Add types from the paired `.d.ts` where inference needs them for `deno check`.
5. Drop any helper shaped against eve's runtime channel handle; the trex factory
   supplies that behavior.

## slack/ — copied files

Source dir: `dist/src/public/channels/slack/`.

Slack couples harder to eve's runtime than Discord: eve's `verify.js`, `api.js`,
and `mrkdwn.js` all import `#compiled/@chat-adapter/slack/*` compiled runtime
primitives (a bundled chat-SDK), and `interactions.js` / `defaults.js` /
`attachments.js` additionally import `#internal/logging` and the runtime
`buildSlackBinding` — none of which are vendorable. So only the genuinely-pure
helpers are copied line-for-line; `verify.ts` and `api.ts` are **reimplemented**
(the signing algorithm / REST calls are standard and trex-owned), and the
runtime-coupled files are NOT vendored (the trex factory `adapters/slack.ts`
supplies that wiring).

| vendored file | eve source | edits |
|---|---|---|
| `shared.ts` | `dist/src/shared/guards.js`, `dist/src/shared/json.js`, plus TYPE shapes from `runtime/input/types.d.ts` + `channel/types.d.ts` (→ `SlackAuthContext`), plus `slackContinuationToken` from `api.js`. | Consolidated so vendored files import only siblings. Added Deno replacements for Node crypto/Buffer: `bytesToHex`, `timingSafeEqual`, `hmacSha256Hex` (WebCrypto HMAC-SHA256); `getEnv` wraps `Deno.env`. |
| `verify.ts` | `verify.js` | **Reimplemented.** eve's `verifySlackRequest` is a thin wrapper over `#compiled/@chat-adapter/slack/webhook.js#verifySlackRequest` (a Node runtime primitive — NOT vendorable). Rewritten against WebCrypto to Slack's documented v0 scheme: HMAC-SHA256 over `v0:{ts}:{raw body}` keyed by the signing secret, constant-time hex compare vs. `X-Slack-Signature`, 5-min replay window on `X-Slack-Request-Timestamp`, fail-closed on a missing secret. Adds `verifySlackInbound` (returns null instead of throwing so a route can 401). |
| `api.ts` | `api.js` | **Reimplemented.** eve's `api.js` builds every call on `#compiled/@chat-adapter/slack/api.js` runtime primitives + `#internal/logging` (NOT vendorable). Rewritten as a minimal trex web-API client over the vendored `encodeSlackApiBody`: `chat.postMessage` (thread reply / HITL card), `views.open` (freeform modal), `chat.update` (answered card), `assistant.threads.setStatus` (typing). Keeps the pure `slackContinuationToken` and adds `splitSlackMessageText` (40k limit splitter). |
| `api-encoding.ts` | `api-encoding.js` | De-minified only; pure. Form-encode outbound bodies + decode the inbound `payload=` interactivity field. |
| `inbound.ts` | `inbound.js` | The `markdown` field is a passthrough of the raw Slack `text` — eve's `slackMrkdwnToGfm` wraps `#compiled/@chat-adapter/slack/format.js` (NOT vendorable) and the trex factory prompts on `text` regardless. Dropped the chat-SDK-shaped `slackMessageFromWebhookPayload`; kept the raw-envelope `parseAppMentionEvent` / `parseDirectMessageEvent`. Types from `inbound.d.ts`. |
| `interactions.ts` | `interactions.js` | **Only** the PURE payload parsers are vendored: the raw-Slack branch of `parseBlockActionsPayload` + a new `parseViewSubmission`. eve's `handleInteractionPost` (imports logging, compiled webhook, runtime `buildSlackBinding`/`resolveSlackBotToken`/`buildSlackAuthContext`, issues its own `fetch`) and the shared-chat-SDK `block_actions` branch are dropped — the trex factory supplies that wiring. |
| `hitl.ts` | `hitl.js` | De-minified; `#public/channels/slack/limits` → `./limits.ts`; `InputRequest` type from `./shared.ts`. Block Kit render/decode logic unchanged **except** one defensive add: `isApprovalRequest` also requires `action != null` (this vendor widened `action` to optional). |
| `limits.ts` | `limits.js` | De-minified only; pure string-length guards. |
| `auth.ts` | `auth.js` | De-minified; `#channel/types` `SessionAuthContext` → sibling `SlackAuthContext`. Auth-context derivation unchanged. |

### Not vendored (eve runtime — the trex factory replaces it)

- `verify.js` / `api.js` / `mrkdwn.js` — wrap `#compiled/@chat-adapter/slack/*`
  compiled runtime primitives (webhook verify, REST client, mrkdwn↔GFM format);
  reimplemented (verify, api) or passthrough (mrkdwn) as noted above.
- `interactions.js`'s `handleInteractionPost`, `defaults.js`, `attachments.js`,
  `connections.js`, `model-context.js`, `thread.js` — shaped against eve's
  runtime channel handle / import `#internal/logging` / `#compiled/*`.
- `slackChannel.js` — eve's runtime-coupled factory; `../adapters/slack.ts` is
  the replacement. `index.js` — barrel. `constants.js`/`utils.js` — unused (the
  factory defaults `route` to `/` like discord, and event-dedup is deferred).
