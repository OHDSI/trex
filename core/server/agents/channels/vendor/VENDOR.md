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

## telegram/ — copied files

Source dir: `dist/src/public/channels/telegram/`.

Telegram is the SIMPLEST auth of the three: not HMAC/Ed25519 but plain
secret-token equality (the value you set on `setWebhook`'s `secret_token`,
echoed by Telegram in `X-Telegram-Bot-Api-Secret-Token`). Most of eve's pure
helpers vendor cleanly; only `hitl.js` is reimplemented (its 64-byte-workaround
design is coupled to eve's durable per-session channel state, which the trex
factory does not expose — the same constraint the Discord/Slack HITL self-encode
around).

| vendored file | eve source | edits |
|---|---|---|
| `shared.ts` | `dist/src/shared/guards.js`, `dist/src/shared/json.js`, plus TYPE shapes from `runtime/input/types.d.ts` + `channel/types.d.ts` (→ `TelegramAuthContext`). | Consolidated so vendored files import only siblings. Added Deno replacements for Node crypto/Buffer: `timingSafeEqual` (string constant-time), `utf8ToBase64Url`/`base64UrlToUtf8`; `getEnv` wraps `Deno.env`. |
| `verify.ts` | `verify.js` | **Vendored (modified).** eve's secret-token check logic is unchanged; only the plumbing is swapped: Node `node:crypto` `timingSafeEqual` + `Buffer` → sibling string `timingSafeEqual`, `#internal/logging` → `console`, `process.env` → `getEnv`. Env fallback key is `TELEGRAM_WEBHOOK_SECRET` (trex naming; eve reads `TELEGRAM_WEBHOOK_SECRET_TOKEN`). Adds `verifyTelegramInbound` (returns null instead of throwing so a route can 401 — fail-closed on a missing secret). |
| `inbound.ts` | `inbound.js` | imports `#shared/guards` → `./shared.ts`; types added from `inbound.d.ts`; de-minified. `parseTelegramUpdate` / `formatTelegramContextBlock` / `parseTelegramChatType` and the full parse chain unchanged. |
| `api.ts` | `api.js` | imports `#shared/json` + `#shared/guards` + `inbound` → siblings; `process.env` → `getEnv`; types from `api.d.ts`. **Only** the helpers the factory uses are kept (YAGNI): `callTelegramApi`, `sendTelegramMessage`, `sendTelegramChatAction`, `answerTelegramCallbackQuery`, `splitTelegramMessageText` (the documented 4096-char splitter). The file-download (`getFile`/`downloadFile`), `editMessageReplyMarkup`, and the composite `telegramContinuationToken` were dropped (the trex factory uses the raw `${chatId}` as its continuation token). REST/split logic unchanged. |
| `hitl.ts` | `hitl.js` | **Reimplemented.** eve's HITL is stateful: Telegram caps `callback_data` at 64 bytes, so eve stores compact ids (`eve:0`, `eve:1`, …) in durable per-session channel state (`hitlCallbacks`/`nextHitlCallbackId`) and remaps them in a runtime `deliver` hook. The trex factory has no cross-request channel-state store (render and callback are two separate HTTP requests), so this self-encodes requestId+optionId into `callback_data` for a STATELESS round-trip. trex approval requestIds are `gen_random_uuid()` UUIDs, so a JSON+base64url framing would overflow the 64-byte cap (a UUID+"approve" = 71 bytes) and silently drop the keyboard — so the wire format is COMPACT: `eve:1.<base64url(16 raw UUID bytes)>.<optionId>` (version tag `1`), with a `0.` base64url(utf8) fallback for non-UUID ids. A UUID+"approve" measures **36 bytes**. A final guard throws only if the assembled value still exceeds 64 bytes (a pathologically long optionId); optionIds must stay short. eve's stateful helpers (`registerTelegramCallback`, `resolveTelegramInputResponses`, `telegramCallbackInputResponse`, `pendingFreeformReplies`) are NOT vendored. |
| `defaults.ts` | `defaults.js` | **Only** the pure `defaultTelegramAuth` is vendored (its `#channel/types` `SessionAuthContext` return → sibling `TelegramAuthContext`); de-minified. eve's `defaultEvents` / `defaultOnMessage` / `shouldDispatchTelegramMessage` were intentionally NOT copied — they are shaped against eve's runtime channel handle (`ctx.telegram.startTyping()`/`.post()`) and durable HITL state. The trex factory supplies its own `events` / message default against `ChannelRouteArgs`. |

### Not vendored (eve runtime — the trex factory replaces it)

- `telegramChannel.js` — eve's runtime-coupled factory (builds a stateful
  `ctx.telegram` handle, durable channel state, a `deliver` remap hook);
  `../adapters/telegram.ts` is the replacement.
- `attachments.js` — imports `#internal/logging`, `#public/channels/upload-policy`,
  and the runtime file-download path; the trex factory does not ingest Telegram
  file attachments (parity with the Discord/Slack adapters). Not vendored.
- `defaults.js`'s `defaultEvents` / `defaultOnMessage` — see above.
- `index.js` — barrel re-export.

## twilio/ — copied files

Source dir: `dist/src/public/channels/twilio/`.

Twilio is the ODD ONE OUT: eve's "pure" Twilio helpers (`verify.js`, `api.js`,
`inbound.js`, `twiml.js`) are one-line wrappers that re-export their real logic
from `#compiled/@chat-adapter/twilio/{webhook,api,voice}.js`, and those resolve
to BUNDLED, MINIFIED chunks (`dist/src/compiled/_chunks/node/chunk-*.js`) — not
vendorable as readable source. So those four are **Reimplemented** from the
minified chunk (labelled honestly), not vendored. Only `defaults.js`'s pure
`defaultTwilioAuth` is genuinely **Vendored**, and the SMS text HITL
(`hitl.ts`) has NO eve source at all — eve's Twilio channel has no HITL widget
(its widgets live on Discord/Slack/Telegram), so it is **invented for trex**.
SMS-only: the voice-call / transcription / media-stream helpers are DEFERRED.

| vendored file | eve source | edits |
|---|---|---|
| `shared.ts` | `dist/src/shared/guards.js` + the constant-time compare / byte→base64 helpers inside `compiled/_chunks/node/chunk-QZV7YRVM-*.js`, plus TYPE shapes from `runtime/input/types.d.ts` + `channel/types.d.ts` (→ `TwilioAuthContext`). | Consolidated so vendored files import only siblings. `timingSafeEqual` is eve's compiled length-tolerant compare (seeds the diff with the length delta), `bytesToBase64` is its `btoa`-over-byte-string; `getEnv` wraps `Deno.env`. |
| `verify.ts` | `verify.js` → `compiled/@chat-adapter/twilio/webhook.js` (minified chunk). | **Reimplemented.** The pure `verify.js` re-exports `twilioSignatureBase`/`verifyTwilioRequest`/`readTwilioWebhook`/`resolveTwilioWebhookUrl` from a minified `#compiled` chunk, so the algorithm is reimplemented from that chunk. The crypto is byte-for-byte eve's: HMAC-SHA1 via **WebCrypto `crypto.subtle`** (which eve itself uses — NOT `node:crypto`) over the request URL + params sorted by key (values deduped + sorted per key), base64, constant-time compared vs `X-Twilio-Signature`. Adds `resolveTwilioAuthToken` (fail-closed on missing token → the signature check is the ONLY webhook auth), a configurable `webhookUrl` resolver (the URL Twilio signed can differ behind a proxy), `signTwilioRequest` (the sign side, for tests/forwarders), and `verifyTwilioInbound` (returns null instead of throwing so a route can 401). |
| `inbound.ts` | `inbound.js` → `compiled/@chat-adapter/twilio/webhook.js` (`parseTwilioWebhookBody`). | **Reimplemented** from the minified chunk. Only the SMS (text) path + `formatTwilioContextBlock` are kept (voice/transcription parsers DEFERRED). The status-vs-text-vs-unsupported classification + `NumMedia` media handling are eve's, unchanged. |
| `api.ts` | `api.js` → `compiled/@chat-adapter/twilio/api.js` (minified chunk). | **Reimplemented** from the minified chunk. `process.env` → `getEnv`. Only the SMS-send path is kept (YAGNI): `encodeTwilioForm`, `resolveTwilioCredential`/`resolveTwilioAccountSid`/`resolveTwilioAuthToken`, `callTwilioApi`, `sendTwilioMessage` (Basic-auth `POST /2010-04-01/Accounts/{SID}/Messages.json`), `twilioContinuationToken` (`${from}:${to}`), `TwilioApiError`. The media fetch, message get/delete/list, and voice `updateCall` were dropped. `splitTwilioMessageBody` (1600-char per-request cap, newline/space boundaries) is trex-added — eve has no explicit SMS splitter (it relies on carrier segmentation). |
| `twiml.ts` | `twiml.js` → `compiled/@chat-adapter/twilio/voice.js` (`twilioResponse`/`escapeXml`). | **Reimplemented** from the minified chunk. Only `emptyTwilioResponse` (the `<Response/>` ack returned immediately from the webhook — the real SMS reply goes out via REST once the async turn completes) + `messageTwilioResponse` (inline `<Message>`, available for sync single-shot replies) + `escapeXml` are kept. Voice responses (`say`/`gatherSpeech`) DEFERRED. |
| `hitl.ts` | none. | **Reimplemented for trex — no eve source.** eve's Twilio channel has no HITL widget. SMS has no buttons, so `renderTwilioInputRequest` renders a numbered PLAIN-TEXT option list ("Reply with a number …") and `deriveTwilioInputResponse` maps a reply SMS back to an option robustly (bare index `"2"`/`"2."`, then case-insensitive id/label match, then first-word match, then freeform when allowed). Stateless and text-only — unlike Telegram's `callback_data`, SMS carries no length-limited id, so the Telegram 64-byte-overflow class of bug does not apply. |
| `defaults.ts` | `defaults.js` | **Vendored — only** the pure `defaultTwilioAuth` (its `#channel/types` `SessionAuthContext` return → sibling `TwilioAuthContext`); de-minified. eve's `defaultEvents` / `defaultOnText` / `defaultOnVoice*` were NOT copied — they are shaped against eve's runtime channel handle (`ctx.twilio.sendMessage()`) and `#internal/logging`. The trex factory supplies its own `events` + message default against `ChannelRouteArgs`. |

### Not vendored (eve runtime — the trex factory replaces it)

- `twilioChannel.js` — eve's runtime-coupled factory (builds a stateful
  `ctx.twilio` handle, `allowFrom` gating, voice/transcription routes, a
  `receive`/`context`/`metadata` surface); `../adapters/twilio.ts` is the
  replacement. Its `waitUntil`-dispatch + empty-TwiML-ack + REST-reply split is
  the shape the trex factory reproduces.
- `routing.js` — imports `#internal/logging` + builds the voice/transcription
  route set; the trex factory needs only the single SMS `POST` route, so the URL
  resolution is folded into `verify.ts`'s `webhookUrl` resolver instead.
- `defaults.js`'s `defaultEvents` / `defaultOnText` / `defaultOnVoice*` — see above.
- `index.js` — barrel re-export.
- Voice (`onVoice`/`onVoiceTranscription`, `parseTwilioVoiceCall`, the `say`/
  `gatherSpeech` TwiML) + WebSocket media-streams — DEFERRED (out of v1 SMS scope).

## github/ — copied files

Source dir: `dist/src/public/channels/github/`.

GitHub is the CLEANEST split so far: most of eve's GitHub helpers are genuinely
PURE (imports are only `#shared/guards`/`#shared/json` + the sibling `auth.js`),
so `inbound.js`, `api.js`, `limits.js`, and `defaultGitHubAuth` are **Vendored**
(de-minified). Only the two helpers that use `node:crypto` primitives absent in
the Deno worker are **Reimplemented** on WebCrypto: `verify.js` (webhook
HMAC-SHA256) and `auth.js` (the RS256 App-JWT mint). The comment HITL
(`hitl.ts`) has NO eve source — eve's GitHub channel has no HITL widget — so it
is **invented for trex** (like Twilio's SMS HITL). The git-checkout / repo-binding
features (`checkout.js`, `binding.js`) are OUT of v1 and NOT vendored.

| vendored file | eve source | edits |
|---|---|---|
| `shared.ts` | `dist/src/shared/guards.js` (isObject) + `dist/src/shared/json.js` (parseJsonObject), plus TYPE shapes from `runtime/input/types.d.ts` + `channel/types.d.ts` (→ `GitHubAuthContext`, `InputRequest`/`InputResponse`). | Consolidated so the vendored GitHub files import only siblings — no eve import survives. `parseJsonObject` de-minified verbatim; `getEnv` wraps `Deno.env`; `bytesToHex` mirrors Node's `.digest("hex")`; `timingSafeEqual` is a length-tolerant constant-time string compare (GitHub sigs are fixed-width hex). |
| `inbound-types.ts` | `inbound-types.d.ts` | **Vendored** (type-only). `JsonObject` → sibling alias. The CI event shapes (`check_suite`/`check_run`/`workflow_run`) are DROPPED — the factory handles only issue/PR/comment events (YAGNI). |
| `inbound.ts` | `inbound.js` | **Vendored**, de-minified. PURE in eve. Modified: (1) CI parsers dropped (those deliveries → null); (2) `isIgnoredGitHubComment` EXPORTED as the factory's loop guard (eve kept it private); (3) `githubContinuationToken` trex-shaped to `${owner}/${repo}#${number}` (human-readable thread key) instead of eve's numeric `repo:{id}:issue:{n}`. The webhook classification, payload normalization, mention-trigger extraction, and bot/self ignore rules are eve's, unchanged. |
| `verify.ts` | `verify.js` | **Reimplemented.** eve computes the HMAC with `node:crypto` `createHmac("sha256")` + `timingSafeEqual` (Node built-ins), so the HMAC is redone on **WebCrypto** (`crypto.subtle`, HMAC + SHA-256). The algorithm is byte-for-byte eve's: `sha256=` + lowercase-hex HMAC-SHA256 over the RAW body, keyed by `GITHUB_WEBHOOK_SECRET`, constant-time compared vs `X-Hub-Signature-256`. Fails CLOSED on a missing secret (the signature is the ONLY webhook auth). Adds `verifyGitHubInbound` (returns null instead of throwing so a route can 401) + a `webhookVerifier` seam. |
| `auth.ts` | `auth.js` | **Reimplemented (flagged).** eve mints the App JWT with `node:crypto` `createSign("RSA-SHA256")`, so the RS256 signing is redone on **WebCrypto** RSASSA-PKCS1-v1_5 + SHA-256 (importing the PKCS8 key via `importKey("pkcs8", …)`). This is the ONE place the crypto backend differs from eve — exercised by github.test.ts (JWT header/claims shape + a full mock mint→exchange→public-key-verify round-trip). Everything else — the header/claims (`{alg:"RS256",typ:"JWT"}` / `{iss, iat:now-60, exp:now+600}`), the `/app/installations/{id}/access_tokens` exchange, the 60s-skew installation-token cache, and the `GITHUB_APP_ID`/`GITHUB_APP_PRIVATE_KEY`/`GITHUB_APP_INSTALLATION_ID` resolvers — is eve's, unchanged. `process.env` → `getEnv`. |
| `api.ts` | `api.js` | **Vendored**, de-minified. PURE in eve. Only the delivery path the factory needs is kept (YAGNI): `callGitHubApi` (Bearer installation token, `accept`/`2022-11-28` headers), `createGitHubIssueComment` (`POST /repos/{owner}/{repo}/issues/{n}/comments`), `GitHubApiError`. The PR-review / review-comment / reaction / repository / files helpers are DROPPED. |
| `limits.ts` | `limits.js` | **Vendored**, de-minified. PURE. `splitGitHubCommentBody` (65536-char cap, newline-then-space boundary past the halfway mark) unchanged. |
| `hitl.ts` | none. | **Reimplemented for trex — no eve source.** eve's GitHub channel has no HITL widget. GitHub comments have no buttons, so `renderGitHubInputRequest` renders a Markdown checklist + `/slash` reply-instructions comment, and `deriveGitHubInputResponse` maps a reply comment back to an option (`/slash`, then bare index, then id/label, then first-word, then freeform). Stateless + text-only, mirroring `twilio/hitl.ts`. |
| `defaults.ts` | `defaults.js` | **Vendored — only** the pure `defaultGitHubAuth` (input shape narrowed to `GitHubAuthInput`; `#channel/types` return → sibling `GitHubAuthContext`); de-minified. eve's `defaultOnComment` / `createDefaultEvents` / `checkoutRepositoryForTurn` were NOT copied — they are shaped against eve's runtime handle (`ctx.thread`, `getSandbox()`) + `#internal/logging` + the git-checkout module (out of v1). The trex factory supplies its own `events` + dispatch against `ChannelRouteArgs`. |

### Not vendored (eve runtime / out of v1 — the trex factory replaces it)

- `githubChannel.js` — eve's runtime-coupled factory (stateful `ctx.thread`
  handle, checkout wiring, CI-event hooks, `receive`/`context`/`metadata`
  surface); `../adapters/github.ts` is the replacement. Its verify-first →
  parse → loop-guard → `waitUntil`-dispatch → async-REST-reply shape is what the
  trex factory reproduces.
- `dispatch.js` / `state.js` / `pr-context.js` — eve runtime session/state
  plumbing (imports `#internal/*`); the trex factory threads its own
  `{owner, repo, number}` delivery state instead.
- `checkout.js` / `binding.js` — git-checkout + repo-binding; OUT of v1 (skipped).
- `constants.js` — eve's default route (`/eve/v1/github`); the factory defaults
  its own route to `/` (the channel root), like the prior adapters.
- `index.js` — barrel re-export.
- CI events (`check_suite`/`check_run`/`workflow_run`) parsing + their types —
  DROPPED (the factory dispatches only issue/PR/comment events).
