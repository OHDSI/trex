# Phase 2 cutover rehearsal — what a real stack said

Task 13. Everything here was **run**, not reasoned about. Where a check could
not be run, it says so and says why; nothing is recorded as passing that was not
observed passing.

Ran on: macOS (darwin/arm64), Docker Desktop 4.76.0, engine 29.5.2.

- trex worktree `/Users/ph/code/trex/.worktrees/better-auth-oauth`,
  branch `p-hoffmann/better-auth-oauth-provider`, at `048cefb1`.
- d2e worktree `/Users/ph/code/d2e-wt-logto-fed`,
  branch `p-hoffmann/logto-federation-migration`, at `cbf6c02fc`.

## 0. Getting an image to rehearse with — a finding in its own right

`npm run build -- -s trex` does **not** build trex. It builds d2e's own layer
(`services/trex/Dockerfile.v2`), which is `FROM ghcr.io/ohdsi/trexsql:${TREXSQL_REF}`
and explicitly does **not** vendor the core:

> NOTE: the core (main + event, with D2E_COMPAT) is NOT vendored — it is provided
> by the base trexsql image at /usr/src/core (index.eszip already bundled there).

So the code under test in this phase reaches a d2e stack only through a
**published trexsql image**. The two refs d2e pins today are both ancestors of
this branch and neither contains any of Phase 2:

| where | ref | relation to `p-hoffmann/better-auth-oauth-provider` |
|---|---|---|
| `Dockerfile.v2` default (lean/prod) | `prod-sha-04ec21ad…` (`04ec21ad` "Pre-link federated identities…") | ancestor, **95 commits behind** |
| `docker-compose-local.yml` (devx) | `sha-48a46626…` (`48a46626` "Renumber the federation migrations…") | ancestor, **99 commits behind** |

Verified further that the currently published `ghcr.io/ohdsi/d2e-trex:develop`
is older still — its `/usr/src/core/server/package.json` names **no**
`better-auth` at all and `/usr/src/core/server/auth/oidc/` still holds the
hand-rolled `router.ts`/`clients.ts`/`codes.ts`. Phase 1 is not in it either.

**Consequence for the real cutover, and it is not in any task so far:** the
release cannot be "d2e branch + trex branch". It is "d2e branch + a **published
trexsql image built from the trex branch** + a `TREXSQL_REF` bump in
`services/trex/Dockerfile.v2` **and** in `docker-compose-local.yml`". Task 12's
deployment-ordering note names two things that must ship together; there are
three, and the third is a version-controlled pin in d2e that nothing in Tasks
1–12 touches.

The whole diff from either pinned base to this branch is confined to `core/`
(plus `plugins/docs` and one workflow) — no Rust, no `src/` — which is what
makes the rehearsal possible at all: the base image can be overlaid with this
branch's `core/` and re-bundled in-image with `trex bundle`, exactly as the trex
`Dockerfile` prod stage does.

(Progress log follows; appended as each check completed.)

## 0b. How the rehearsal image was actually made

```
ghcr.io/ohdsi/trexsql:prod-sha-04ec21ad…      (pulled)
  + rm -rf /usr/src/core
  + core/server,core/event package.json + npm install --omit=dev
  + COPY core/                                (this branch, 048cefb1)
  + trex bundle core/server/index.ts core/server/index.eszip
  + trex bundle core/event/index.ts  core/event/index.eszip
  = ghcr.io/ohdsi/trexsql:phase2-local
```

then d2e's own layer, unchanged, on top of it:

```
docker compose -f docker-compose.yml --profile demodb -f docker-compose-local.yml \
  --env-file .env.local build trex     # with TREXSQL_REF=phase2-local
  = d2e-trex:phase2-local              # named by TREX_IMAGE
```

Both new keys go in `.env.local` only; **nothing in the d2e tree was changed to
make this work**, which is itself the evidence for the release-engineering gap
in §0: the only two ways to get this branch into a d2e stack are to publish a
trexsql image or to override `TREXSQL_REF` by hand.

`trex bundle` re-bundled cleanly in-image against the pinned base (core/server
and core/event eszips both produced, the latter 307MB), so the 95-commit core
overlay is self-consistent with that base's extensions and binary.

**Two build facts worth keeping:**

1. `WITH_R` is passed as a build arg by `docker-compose-local.yml` with a comment
   saying it "must also bake R or it silently reverts to an R-less image", but
   `services/trex/Dockerfile.v2` **never declares or reads `WITH_R`** (`grep
   WITH_R` over its 164 lines returns nothing). The comment describes a
   Dockerfile that no longer exists; the arg is dead.
2. The `PLUGINS_FROM_REGISTRY` step is the build's whole cost and it is fragile:
   `@data2evidence/d2e-ui` alone is a **273.8 MB** npm tarball (600.7 MB
   unpacked, 12 769 files) and `npm pack` of it inside the build retried and
   failed repeatedly while the host was otherwise busy — `fetch-external-plugins.sh`
   runs under `set -eu`, so after 5 attempts it takes the whole image build with
   it. This rehearsal trimmed `PLUGINS_FROM_REGISTRY` to `@data2evidence/d2e-ui`;
   the flow/fhir/sibyl plugins are not needed to exercise sign-in and are
   recorded here as deliberately absent.

## 1. The stack came up

`d2e-trex:phase2-local` + this branch's core, brought up with
`npm run init` → `docker compose build trex` → `npm run start`, all containers
healthy (`d2e-trex`, `d2e-caddy`, `d2e-minerva-postgres-1`, `d2e-demodb`,
`d2e-dataflow-gen-1`, `d2e-dataflow-gen-worker`, `d2e-supabase-storage-1`,
`d2e-studio`, `d2e-jaeger-1`). Gateway on `https://localhost:41100`
(`npm run local` passes `-p 41100`; the brief's `https://localhost/…` is the
443 form and is wrong for a default local run).

**`TLS__CADDY_DIRECTIVE` for this run: `tls internal`** — what `d2e init` writes
into `.env.local` with no prompt and no alternative. That is the condition
§4 below is about.

### A client tooling trap that cost an hour, recorded so the next person skips it

1. **macOS system `curl` cannot talk to this stack at all.** LibreSSL 3.3.6 fails
   the handshake against Caddy's `tls internal` certificate with
   `error:06FFF064:digital envelope routines:CRYPTO_internal:bad decrypt`, while
   Caddy logs a clean `matched certificate in cache` and then `TLS handshake
   error … EOF`. Every `curl -sk` in the brief returns exit 7 / HTTP 000. Node
   (OpenSSL 3.6.2) is fine. **The brief's Step 2 command cannot be run as
   written on macOS.**
2. **Node's `fetch` silently sends `sec-fetch-mode: cors`,** and the provider
   branches on exactly that: `isBrowserFetchRequest` in
   `@better-auth/core/utils/fetch-metadata` is `headers.get("sec-fetch-mode") === "cors"`,
   and `handleRedirect` (`authorize-riRRCSbC.mjs:5334`) then returns
   **`200 {"redirect":true,"url":…}`** instead of a 302. `Sec-Fetch-Mode` is a
   forbidden header name, so setting it back by hand through `fetch` does
   nothing. Everything below therefore uses `node:https` directly. A harness
   built on `fetch` measures a different code path from the one a browser takes.

## 2. Discovery, and the signing key

`GET /trex/oidc/.well-known/openid-configuration` → 200 at the **unchanged
issuer** `https://localhost:41100/trex/oidc`. The document matches what
`auth/oidc/discovery.test.ts` pins: `issuer`, `jwks_uri` (still
`/.well-known/jwks.json`), `id_token_signing_alg_values_supported: ["RS256"]`,
`response_types_supported: ["code"]`,
`grant_types_supported: ["authorization_code","client_credentials","refresh_token"]`,
`code_challenge_methods_supported: ["S256"]`, and the four moved endpoints all
under `/oauth2` (`authorize`, `token`, `userinfo`, `end-session`).
`scopes_supported` is `openid profile email idp_groups offline_access trex:service`.

**The brief's Step 2 cannot be completed as specified**: it diffs against
`docs/superpowers/golden/trex-oidc-discovery.json`, and **that file does not
exist** anywhere in the d2e checkout, either worktree, or the trex tree. The
document was checked field-by-field against `discovery.test.ts` instead.

Two fields present that no task mentions and that a relying party may act on:
`backchannel_logout_supported: true` and `backchannel_logout_session_supported: true`.
Nothing in trex implements a back-channel logout; the provider advertises the
capability because the plugin does.

**Step 3 (key imported, not minted) could not be exercised.**
`trexdb.oidc_signing_key` has **0 rows** on a fresh install, so there was nothing
to import: `trexdb.jwks` holds one minted RS256 key (`kid kD4gt7Pzhm1Son7q6mcJ6jkqe6Y9VLFA`)
and it is the key `/.well-known/jwks.json` serves. The import path can only be
rehearsed against a database that already ran the old provider.

## 3. One client, not two

`trexdb."oauthClient"` has exactly **one** row after boot — `d2e-webapi` — and
it is what WebAPI, Atlas and the portal all use; its `redirectUris` carry all
three callbacks (`/WebAPI/user/oauth/callback/openid`,
`/d2e/portal/login-callback`, `/atlas-login/`), each in a `:41100` and a bare
`localhost` form. The dispatch's "both clients are seeded `client_secret_post`"
describes two clients that do not exist. Seeded values, read from the row:

| column | value |
|---|---|
| `tokenEndpointAuthMethod` | `client_secret_post` |
| `requirePKCE` | `true` |
| `skipConsent` | `true` |
| `scopes` | `openid profile email idp_groups offline_access` |
| `grantTypes` | `authorization_code refresh_token client_credentials` |
| `disabled` | null |

`oauthResource` holds the issuer and `oauthClientResource` links `d2e-webapi` to
it, so the `invalid_target` trap the spike found is not armed here.

## 4. The whole authorization-code flow, as a browser does it

Run against `https://localhost:41100`, every header controlled, session from a
native password sign-in as `admin@d2e.local`.

| step | observed |
|---|---|
| anonymous `GET /oauth2/authorize` (browser Accept) | **302** → `https://localhost:41100/d2e-login/?…&exp=…&ba_iat=…&ba_param=…&sig=…` — the signed query Task 11's page needs |
| `GET /d2e-login/` | **200**, 4 925 bytes, `<title>Sign in · D2E</title>` |
| `POST /trex/auth/v1/token?grant_type=password` | **200**, sets **`__Secure-better-auth.session_token`** (Max-Age 604800) **and** `sb-access-token` (Max-Age 3600) |
| `GET /oauth2/authorize` with that cookie | **302 straight to the client's `redirect_uri`** with `code`, `state`, `iss` — **one hop, no consent stop** |
| `POST /oauth2/token` (`client_secret_post`, `code_verifier`, `resource`) | **200** |

Token shapes (this settles Task 1's reason for the whole phase):

- `access_token`: **3-segment JWT**, `aud: ["https://localhost:41100/trex/oidc", "…/oauth2/userinfo"]`,
  `client_id`/`azp` = `d2e-webapi`, `scope: openid profile email offline_access`,
  `sid`, `jti`, and the trex claims `trex_role`, `roles`, `app_metadata`.
- `id_token`: 3-segment JWT, `aud: "d2e-webapi"`, `nonce` echoed, `sid`, `acr: "0"`, `auth_time`.
- `refresh_token` issued (so `offline_access` really is reaching all three places).

**`/oauth2/userinfo` does NOT emit `roles`.** It returns exactly
`{sub, name, email, email_verified, trex_role}`. The id_token and the access
token both carry `roles`. So if WebAPI resolves `SECURITY_AUTH_OIDC_ROLESCLAIM`
from `/userinfo` rather than from the id_token, it will see no roles at all —
and `customUserInfoClaims` would have to emit `roles` too. Measured, not
inferred: the response body is quoted above.

**`email_verified` is `false`** in all three places (access token, id_token,
userinfo) for `admin@d2e.local` — the placeholder-domain case, reproduced on a
real stack. What the relying parties do with it is §7.

## 5. WebAPI does not sign in. Two independent refusals, both measured

This is the finding the rehearsal existed to produce. Both `[UNVERIFIED]`s in
question 1 are now settled, and **both answers are the bad one**.

### 5a. Spring Security sends no PKCE, and `requirePKCE: true` refuses it

`GET /WebAPI/user/login/openid` (browser navigation, through Caddy) answers 302
to the new endpoint — the endpoint move itself is fine — with **exactly** these
parameters:

```
response_type=code
client_id=d2e-webapi
scope=openid profile email
state=…
redirect_uri=https://localhost:41100/WebAPI/user/oauth/callback/openid
nonce=…
```

**No `code_challenge`. No `code_challenge_method`. No `resource`.**

Following that redirect with a valid engine session:

```
302 https://localhost:41100/WebAPI/user/oauth/callback/openid
      ?error=invalid_request
      &error_description=pkce+is+required+for+this+client
      &state=…&iss=https%3A%2F%2Flocalhost%3A41100%2Ftrex%2Foidc
```

So **every WebAPI login fails at `/authorize`**, exactly as the dispatch
predicted. `seed-client.ts:138-142` sets `requirePKCE` to `true` for every
client with the comment that it is "the only thing that stops a stolen
authorization code being redeemed"; that is true, and it is also what makes
WebAPI unable to log in at all.

### 5b. Spring uses `client_secret_basic`, and the row says `client_secret_post`

With `requirePKCE` set to false in `trexdb."oauthClient"` and nothing else
changed, the code comes back and the exchange then fails:

```
WebAPI log:
  o.o.webapi.security.authc.OidcAuthConfig - OIDC: Authentication failed:
  [invalid_token_response] An error occurred while attempting to retrieve the
  OAuth 2.0 Access Token Response: 401 Unauthorized: [no body]
browser:
  https://localhost:41100/atlas/#/welcome?error=oidc_failed
```

Setting `tokenEndpointAuthMethod` to `client_secret_basic` on the same row, and
changing nothing else, makes WebAPI sign in:

```
o.o.webapi.security.authc.OidcAuthConfig - OIDC: Authenticated user sub=casuqjzdgzw9abykasofshhnfeupp2rg
o.o.webapi.security.authc.LoginService  - LoginService: onSuccess: casuqjzdgzw9abykasofshhnfeupp2rg (origin: OIDC)
browser: https://localhost:41100/atlas/#/welcome?code=2aab128e-…   (Atlas3 loads)
```

**So Spring's method is `client_secret_basic`.** This resolves the `[UNVERIFIED]`
in Task 5 and contradicts `seed-client.ts:143-149`, whose comment says both
clients are seeded `client_secret_post` "precisely because this proxy posts the
secret".

### 5c. The two are mutually exclusive on one client row — and there is only one row

With the row on `client_secret_basic`, the portal's own exchange, which posts
the secret in the body (`d2e-compat/routes.ts:384-399` deliberately sends **no**
Basic header), is refused:

```
POST /oauth2/token   (client_secret_post)
400 {"error":"invalid_client",
     "error_description":"client registered for client_secret_basic cannot use client_secret_post"}
```

Measured both ways on the same stack:

| `tokenEndpointAuthMethod` | WebAPI sign-in | portal / `/d2e/oauth/token` |
|---|---|---|
| `client_secret_post` (as seeded) | **fails** — 401 at token, `error=oidc_failed` | works |
| `client_secret_basic` | **works** | **fails** — `invalid_client` |

Together with 5a this is a **release blocker**, not a tuning question. The
release needs one of:

1. **Two client rows** — `d2e-webapi` registered `client_secret_basic` with
   `requirePKCE: false`, and a separate public/confidential client for the
   portal and the Atlas login bridge keeping PKCE. This is the only option that
   does not weaken the portal, and `seed-client.ts` already takes a spec per
   client.
2. Send Basic **as well** from `d2e-compat/routes.ts` and register the single
   row `client_secret_basic` — cheap, but `extractClientCredentials` makes Basic
   win outright, so the body secret becomes dead weight, and the comment there
   records that Logto refuses a request presenting client auth twice, which
   matters while `D2E_IDP_MODE=logto-federated` is still a supported mode.
3. Make Spring send PKCE and post the secret. Nothing in d2e or trex can do
   that; it is a WebAPI change.

Whichever is chosen, **`requirePKCE` cannot stay true for the row WebAPI uses.**

### 5d. WebAPI lowercases the subject

`sub=casuqjzdgzw9abykasofshhnfeupp2rg` in the WebAPI log, against
`cAsuqJZDGzw9aBykaSOFSHHnFeUPp2rG` in the token. Better Auth ids are
case-sensitive and mixed-case by construction. Anything that joins WebAPI's
recorded login to a trex user id, or to usermgmt, has to know that.
