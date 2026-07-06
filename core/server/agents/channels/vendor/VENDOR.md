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
