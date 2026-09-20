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

## 6. WebAPI reads `/oauth2/userinfo`, and userinfo has no `roles`

Settled by taking the endpoint away. With `/oauth2/userinfo`'s rate-limit bucket
exhausted (§7) and nothing else changed, a WebAPI login that had just succeeded
fails:

```
o.o.webapi.security.authc.OidcAuthConfig - OIDC: Authentication failed:
  [invalid_user_info_response] An error occurred while attempting to retrieve
  the UserInfo Resource: 429 Too Many Requests
browser: https://localhost:41100/atlas/#/welcome?error=oidc_failed
```

So **`/oauth2/userinfo` is on the critical path of every WebAPI sign-in**, not
an optional enrichment: one WebAPI login costs **three** provider requests —
`/oauth2/authorize`, `/oauth2/token`, `/oauth2/userinfo` — and a failure at the
third fails the login outright. This resolves the `[UNVERIFIED]` in Task 1 /
facts C.3 on the side that costs something: `SECURITY_AUTH_OIDC_ROLESCLAIM=roles`
(confirmed in the container's environment) is resolved against a claim set that
userinfo does not contain. Spring merges id_token and userinfo claims into one
`OidcUser`, so `roles` is still reachable — but **`customUserInfoClaims` should
emit `roles` as well**, and until it does, anything that reads the userinfo
document alone sees none.

Measured alongside: after a successful OIDC login, `GET /WebAPI/user/me`
(against the engine directly, with the OTC-redeemed WebAPI JWT) returns
`{"user":{"id":1000,"login":"casuqjzdgzw9abykasofshhnfeupp2rg","name":"admin"},"authz":{"permissions":[],…}}`
— a real WebAPI account, created from the trex subject, with the lower-cased
login of §5d and no permissions (the trex role granted for this test,
`ALP_SYSTEM_ADMIN`, is not a WebAPI role name).

The sign-in path, for the record, is: `/WebAPI/user/login/openid` → provider →
`/WebAPI/user/oauth/callback/openid` → `…/atlas/#/welcome?code=<uuid>` →
`GET /WebAPI/user/login/otc?code=…` → `{login, jwt, roles, message:"OTC redeemed successfully."}`.
Atlas3 then uses that `jwt` as its bearer. **Atlas3 does not talk to the OIDC
provider at all** — it signs in *through* WebAPI, so §5's blockers are Atlas3's
blockers too, and the Atlas3 SPA did load at `/atlas/#/welcome` once WebAPI
could sign in.

## 7. Rate limits: the ceiling holds, and one caller can take it from everyone

Enforced, and measured rather than read off the config: hammering
`/oauth2/userinfo` from one host with an invalid bearer, the **594th** request
in the window answered
`429 {"message":"Too many requests. Please try again later."}` — 600 minus the
~6 the earlier sign-ins had already spent. So `TREX_OIDC_RATE_LIMIT_MAX`'s
default of 600 per 900 s is real and per-path.

**It took 2.4 seconds.** That is the finding. With `TREX_TRUSTED_PROXIES` empty
the bucket is shared by everyone behind the gateway, so a single client — no
credentials needed, the requests 401 — can close `/oauth2/userinfo` for the
whole installation for up to fifteen minutes, and §6 makes that a **total
WebAPI sign-in outage**, not a slowdown. That is not a theoretical widening: the
WebAPI login quoted in §6 is exactly this happening.

Cost of one sign-in, counted:

| flow | `/oauth2/authorize` | `/oauth2/token` | `/oauth2/userinfo` |
|---|---|---|---|
| WebAPI / Atlas3 | 1 | 1 | 1 |
| portal (authorization code) | 1 | 1 | 0 observed |
| portal, per silent renewal | 0 | 1 | 0 |

600/900 s is therefore comfortable for **sign-in volume** on any plausible
installation (600 WebAPI sign-ins every 15 minutes) and **not comfortable at all
as an availability property**, because the budget is not per client. Either set
`TREX_TRUSTED_PROXIES` to the gateway's real range so the bucket is per client
IP, or accept that any anonymous caller can deny sign-in to everyone.

## 8. RP-initiated logout with an `id_token_hint` does NOT complete

Ran with **`TLS__CADDY_DIRECTIVE=tls internal`** — which is what `d2e init`
writes and the only value a local stack gets. A freshly minted `id_token`
carrying a `sid` (`sid: UMlI8eAB4cfd2dtzF2IQ8oOUTLziQr0l`), presented as
`id_token_hint` together with a registered `post_logout_redirect_uri`
(`https://localhost:41100/atlas/`, which **is** in the client's
`postLogoutRedirectUris`):

| request style | result |
|---|---|
| browser navigation | **200, an HTML "Confirm logout" page**, no `Location` |
| `Accept: application/json` | **401 `{"error":"invalid_token","error_description":"The id_token_hint is invalid"}`** |
| **no hint at all**, browser | **the same HTML "Confirm logout" page** |

So the prediction holds: on a local stack, logout-with-hint answers 401, and to
a browser it is **indistinguishable from a genuine refusal** — byte-identical to
the no-hint page.

**The brief's Step 4 draws the wrong conclusion from that page.** It says "A
confirmation page means the client's `id_token_hint` is not reaching the
endpoint, and the fix is on the WebAPI side, not in trex." The JSON variant
proves the hint *did* reach the endpoint and was *judged invalid*. The fix is
not on the WebAPI side.

### Why, and it is not the certificate first

`verifyLogoutHint` fetches `<issuer>/.well-known/jwks.json` — here
`https://localhost:41100/trex/oidc/.well-known/jwks.json` — **from inside the
trex container**, and that request never gets as far as a certificate:

```
# inside d2e-trex
curl https://localhost:41100/trex/oidc/.well-known/jwks.json
*   Trying [::1]:41100...      connect to ::1 port 41100: Connection refused
*   Trying 127.0.0.1:41100...  connect to 127.0.0.1 port 41100: Connection refused
```

**`extra_hosts: "${CADDY__D2E__PUBLIC_FQDN:-localhost}:host-gateway"` cannot
work when the FQDN is `localhost`.** The entry is injected — `/etc/hosts` really
does gain `192.168.65.254 localhost` — but `127.0.0.1 localhost` is already
there above it, and even after rewriting `/etc/hosts` so that the gateway entry
is the **only** `localhost` line, glibc still resolved it to `::1`/`127.0.0.1`:
`localhost` is special-cased in `getaddrinfo` (RFC 6761) and cannot be pointed
anywhere else. So on every default local install the host-gateway route is a
no-op for the one name it exists to serve.

## 9. Question 4, both halves, measured

**(a) The trex image's OS trust store does carry the public root set.** Verified
with full certificate validation from inside `d2e-trex`:
`https://www.google.com` → 200, `https://community.letsencrypt.org` → 200 (a
Let's Encrypt chain, which is the case that matters for the blank
`TLS__CADDY_DIRECTIVE` deployment), `https://deno.land` → 301.
`/etc/ssl/certs/ca-certificates.crt` is 3 715 lines, and
`/usr/local/share/ca-certificates/` holds exactly one added file,
`d2e-internal-ca.crt` — Caddy's local root is **not** there, as Task 12 said.

**(b) The `extra_hosts` host-gateway route does reach Caddy on `CADDY_PORT` —
by address, never by the name.** From inside `d2e-trex`:

```
curl --resolve localhost:41100:192.168.65.254 https://localhost:41100/trex/oidc/.well-known/jwks.json
  before installing Caddy's root: 000  [SSL certificate problem: unable to get local issuer certificate]
  after  installing Caddy's root: 200  []
curl https://localhost:41100/trex/oidc/.well-known/jwks.json     (by name)
  000  [Failed to connect … Connection refused]
```

That is both halves of the operational fix in one measurement:

- **The CA half works.** Copying `/data/caddy/pki/authorities/local/root.crt`
  out of `d2e-caddy` into `/usr/local/share/ca-certificates/` and running
  `update-ca-certificates` turns "unable to get local issuer certificate" into a
  200. So `TLS__EXTRA__CA_CRTS` is the right channel and it does what Task 12
  says it does.
- **The CA half is not sufficient on a local stack**, because the name never
  resolves to the gateway. Re-running the logout test after installing the root
  produced the identical 401 / confirmation page.

Where the public FQDN is a real name (`develop.d2e.sg`), `extra_hosts` does
apply and the certificate becomes the only question — so there the
`TLS__EXTRA__CA_CRTS` fix is expected to be sufficient. That case was **not
rehearsed**; only the local one was, and locally it is unfixable by configuration.

**A trex-side fix exists and is not wired:** `better-auth.ts:165-169` sets
`jwt({ jwks: { jwksPath: "/.well-known/jwks.json" } })` and no `jwks.remoteUrl`.
The jwt plugin's `remoteUrl` is precisely what `verifyLogoutHint` prefers
(`jwks.remoteUrl ?? ${baseURL}${jwksPath}`), so pointing it at the container-local
address (`http://${PROJECT_NAME}-trex:33001/trex/oidc/.well-known/jwks.json`)
would make the hint verifiable without any certificate or DNS at all. Worth
checking whether it also rewrites the advertised `jwks_uri` before adopting it.

## 10. The retirement guards work end to end

Against the real stack, same user, same live engine session, flipping only the
column and then restoring it:

| | `/oauth2/authorize` (live session cookie) | refresh grant | native `/auth/v1/token` |
|---|---|---|---|
| **`banned = true`** | 302 back to `/d2e-login/` — **no code** | `400 {"error":"invalid_request","error_description":"user not found"}` | `400 {"error":"user_banned","error_description":"User is banned"}` |
| **`deletedAt` set** | 302 back to `/d2e-login/` — **no code** | `400 … "user not found"` | `400 {"error":"invalid_grant","error_description":"Invalid login credentials"}` |

Both retirements are genuinely refused at every door, including the one the
spike warned about: the *already-issued* refresh token stops working
immediately, which is what `mount.ts`'s `findUserById` wrapper is for. The three
Criticals Tasks 6/7 closed are closed in a real stack, not only in the harness.
(`/oauth2/userinfo` answered 429 in this run because §7 had just exhausted its
bucket — the other three columns are the measurement.)

## 11. The three sign-in paths, and the one that could not be run

| path | issues `better-auth.session_token`? |
|---|---|
| **native password** (`POST /trex/auth/v1/token?grant_type=password`) | **yes** — `__Secure-better-auth.session_token`, Max-Age 604800, alongside `sb-access-token` (Max-Age 3600) |
| **`POST /trex/auth/v1/sync-cookie`** | **yes** — 204 with both cookies, *when the token arrives as `Authorization: Bearer`*. With the same token presented only as the `sb-access-token` cookie it answers `401 {"error":"not_authenticated"}`, which is the route's documented contract (`auth-router.ts:869-872`), not a defect |
| **federated through Logto** | **NOT RUN.** `d2e init` writes `D2E_IDP_MODE=trex` and the local stack brings up no Logto service, so there is no upstream to federate with. Standing one up needs `docker-compose-logto-federation.yml`, a Logto application and its secret; out of reach here. **This confirmation is still owed.** |

## 12. The stale return (question 6) — the Minor is real, and the SPA does not heal it

Contrived by backdating **every** engine session row for the user by 8 days
(`expiresAt` in the past, `createdAt`/`updatedAt` 8 days old), so both the
7-day cookie and the row are stale:

```
/oauth2/authorize with the stale engine cookie          -> login page
/oauth2/authorize with only sb-access-token             -> login page
refresh grant, NO Cookie header    -> 200, Set-Cookie: sb-access-token         (only)
   then /oauth2/authorize with that new token           -> login page          <- the loop
refresh grant, WITH a Cookie header ("irrelevant=1")    -> 200, Set-Cookie: sb-access-token, __Secure-better-auth.session_token
   then /oauth2/authorize                               -> CODE ISSUED
POST /sync-cookie with the Bearer -> 204, both cookies
   then /oauth2/authorize                               -> CODE ISSUED
```

So the guard at `auth-router.ts:855` (`if (req.headers?.cookie) await attachEngineSessionCookie(...)`)
behaves exactly as Task 9 described, and **any** cookie at all — the value is
never read — is enough to arm it.

**Does the SPA's own flow self-heal via `/sync-cookie`? No.** `grep -rl sync-cookie`
over the whole image finds it in exactly one client:
`plugins/atlas/d2e-login/login.js:168`, the **sign-in page**, which calls it
after a successful password sign-in. The portal bundle
(`/usr/src/bundled-plugins/d2e-ui`) does not contain the string at all.

What saves it is that the failure is not actually a loop. Measured:

```
GET /oauth2/authorize?prompt=none   (no session)
302 …/d2e/portal/login-callback?error=login_required
      &error_description=authentication+required&state=s&iss=…
```

A silent renewal gets a clean `login_required`, and a foreground navigation gets
the sign-in page — which then calls `/sync-cookie` itself and resumes the
original request through `return_to`. **So the Minor costs a stale returner one
interactive sign-in, not an infinite loop.** Downgrade it to that rather than
closing it: nothing re-arms the engine session without a password, and the
portal has no code path that would.

Incidental, worth someone's attention: `trexdb.session` had **21 rows** for the
single test user after a morning of sign-ins. Every sign-in inserts a row and
nothing in this rehearsal removed one.

## 13. The portal cannot reach the provider at all — `TREX_OIDC_INTERNAL_BASE`

Step 5's checks, run in order. The token side is perfect:

- access token is a **3-segment JWT**, header `{"typ":"at+jwt","alg":"RS256","kid":"kD4gt7…"}`
- `accessTokenPayload.roles` is **populated** once the user has any:
  `["ALP_SYSTEM_ADMIN"]`, so `OidcLoginSilent.tsx:48`'s re-login guard does not trip
- **silent renewal works**: `grant_type=refresh_token` → 200, a fresh 3-segment
  access token with `roles` intact, **the refresh token is rotated**, and
  replaying the old one answers
  `400 {"error":"invalid_grant","error_description":"invalid refresh token"}`.
  `expires_in` is 3600, so the portal's 180 s-before-expiry renewal fires ~57
  minutes in.

And then every portal API call fails:

```
GET /d2e/usermgmt/api/user      Authorization: Bearer <that RS256 JWT>
  -> 401 "Authentication Token not valid"
GET /d2e/system-portal/dataset/list -> 401   GET /d2e/gateway/api/db -> 401
trex log: [d2e-compat] verifyIdpToken: invalid token: TypeError: fetch failed
```

and so does the portal's own code exchange, repeatedly, from boot:

```
[d2e-compat] /oauth/token: exchange code
[d2e-compat] /oauth/token: secret_present=true len=30 keys=grant_type,client_id,client_secret,resource
[d2e-compat] /oauth/token: IdP unreachable, retrying in 500ms: fetch failed
[d2e-compat] /oauth/token: IdP unreachable, retrying in 1000ms: fetch failed   … 2000 … 4000 …
```

**Cause.** `d2e-compat/idp.ts:77-79`:

```ts
const internalBase = env.TREX_OIDC_INTERNAL_BASE
  ? issuerUrl(env.TREX_OIDC_INTERNAL_BASE, `${basePath}/oidc`)
  : issuer;
```

`TREX_OIDC_INTERNAL_BASE` is **unset**, so `internalBase` falls back to the
**public issuer** — and it is what both `jwksUri` (`:99`) and `tokenUrl`
(`:130`) are built from. Both are therefore
`https://localhost:41100/trex/oidc/…`, fetched **from inside the container**,
where `localhost` is the container's own loopback (§8): `fetch failed`, every
time, for every portal request.

**This contradicts Task 12 head-on.** Its checklist says
`TREX_OIDC_INTERNAL_BASE` is one of the variables that "have correct defaults
for this deployment" and must NOT be set. The default is correct only where the
container can reach the public FQDN — never on a local stack, and not on any
install whose gateway address is not resolvable from inside the network.
`docker-compose.yml` already computes exactly the right value for WebAPI one
line away: `SECURITY_AUTH_OIDC_INTERNALURL: http://${PROJECT_NAME}-trex:33001/trex/oidc`.

Note this is a **different** failure from the earlier `JOSEAlgNotAllowed` line
in the same log, which came from an HS256 `sb-access-token` presented to the
same middleware; the RS256 provider token never gets as far as an algorithm
check, because the key set cannot be fetched.

### 13a. The fix, verified

`docker-compose.yml`'s own comment at `TREX_OIDC_ISSUER` already names the
problem and the cure:

> The public origin: `iss` must name where the discovery document is served, and
> a deployment's FQDN resolves inside the network too. Where it does not —
> **local and CI**, whose FQDN is `localhost` and therefore points back at this
> container — **docker-compose-ci.yml** sets `TREX_OIDC_INTERNAL_BASE` so
> server-side fetches take a reachable route while `iss` stays put.

`docker-compose-ci.yml:10` does set it. **`docker-compose-local.yml` did not** —
so the comment names local and the code covers only CI.

Setting `TREX_OIDC_INTERNAL_BASE: "http://${PROJECT_NAME:-d2e}-trex:33001"` in
`docker-compose-local.yml` and recreating only the `trex` service turns every
failure above into a success, with nothing else changed:

```
POST /d2e/oauth/token  (the portal's own proxy)  -> 200, 3-segment RS256 access token,
                                                    roles ["ALP_SYSTEM_ADMIN"],
                                                    aud [issuer, issuer/oauth2/userinfo]
GET  /d2e/usermgmt/api/user                      -> 200  [{"username":"admin","idpUserId":"cAsuqJZDGzw9aBykaSOFSHHnFeUPp2rG",…}]
GET  /d2e/system-portal/dataset/list             -> 200  []
GET  /d2e/gateway/api/db                         -> 403  {"error":"Forbidden: no authorization policy for route"}
```

The last one is an authorization answer, not a token answer — the token verified.

**This is the one change this rehearsal made to the d2e tree**, on
`p-hoffmann/logto-federation-migration`. It does not affect `iss`, the discovery
document, or anything a browser sees. It does **not** fix §8: `verifyLogoutHint`
reads the *jwt plugin's* JWKS configuration in `better-auth.ts`, not
`d2e-compat`'s, so the logout hint still 401s.

Two things this establishes about the deployed environments as well:

- Any installation whose gateway FQDN is not resolvable from inside the
  container network needs `TREX_OIDC_INTERNAL_BASE`, and Task 12's checklist
  currently tells the operator to **remove** it.
- `TREX_OIDC_CLIENT_SECRET` is visible in the container environment as the same
  value as `SECURITY_AUTH_OIDC_APISECRET`; the portal proxy logs
  `secret_present=true len=30` on every exchange, which is fine, but the
  retry loop logs it once per attempt during an outage.

## 14. `email_verified` — neither relying party cares

The claim tracks `trexdb."user"."emailVerified"` faithfully in all three
places. Toggled on the running stack and read back from `/oauth2/userinfo`:

```
emailVerified = false -> {"sub":"cAsuq…","name":"admin","email":"admin@d2e.local","email_verified":false,"trex_role":"user"}
emailVerified = true  -> {…,"email_verified":true,…}   (id_token agrees)
```

**WebAPI signs in with `email_verified: false`.** Every successful WebAPI login
recorded in §5b and §6 was made by `admin@d2e.local`, a placeholder-domain
account whose `emailVerified` was `false` throughout —
`OIDC: Authenticated user sub=casuqjzdgzw9abykasofshhnfeupp2rg` and
`LoginService: onSuccess`. **Atlas3 reaches the provider only through WebAPI**
(§6), so it inherits that answer; the Atlas3 SPA loaded and redeemed its OTC
with the same account. The portal's own API calls (§13a) also answered 200 with
`email_verified: false` in the bearer.

So the Phase-1 observation that 66 of 69 users flip to `email_verified: false`
is, for these relying parties, **cosmetic**. Nothing observed here reads the
claim. Recorded as measured, not as a guarantee about relying parties not in
this stack.

## 15. The old endpoints really are gone

```
GET  /trex/oidc/authorize    -> 404 {"error":"not_found"}
POST /trex/oidc/token        -> 404 {"error":"not_found"}
GET  /trex/oidc/session/end  -> 404 {"error":"not_found"}
```

`mount.ts`'s prefix gate answers these, so Task 12's deployment-ordering note is
confirmed from the other side: anything still calling the old paths breaks the
moment this image starts. `scripts/lib/idp-login.cjs` was one of them and is
fixed in this rehearsal's d2e commit — **and the path was not the whole fix**;
see that commit for the `handleRedirect`/`sec-fetch-mode` half, which would have
made the script report "authorize returned no code" even with the path
corrected.

## 16. Disposition of the brief's seven steps

| step | disposition |
|---|---|
| **1 — bring up a local stack on the new image** | **Done**, but not by the brief's commands: `npm run build -- -s trex` builds no trex code at all (§0). The stack runs `d2e-trex:phase2-local`, built on a `trexsql:phase2-local` overlay of this branch's `core/`. |
| **2 — diff the discovery document** | **Partly.** Served and checked field by field against `discovery.test.ts` (§2). The diff *as written* is impossible: `docs/superpowers/golden/trex-oidc-discovery.json` does not exist, and macOS `curl` cannot complete a TLS handshake with this gateway at all. |
| **3 — signing key imported, not minted** | **NOT RUN.** `trexdb.oidc_signing_key` is empty on a fresh install, so there is nothing to import (§2). Needs a database that ran the old provider. |
| **4 — sign in through WebAPI end to end** | **Done, and it fails.** Two independent blockers (§5), the client authentication method settled (`client_secret_basic`), the roles question settled (`/userinfo` is on the critical path and carries no `roles`, §6), and the logout question settled — and the brief's reading of the confirmation page is wrong (§8). |
| **5 — sign in through the portal end to end** | **Done.** JWT access token, `roles` populated, silent renewal with refresh rotation and replay refusal — and every portal API call 401ing until `TREX_OIDC_INTERNAL_BASE` was set (§13, §13a). |
| **6 — run the d2e setup script** | **Done.** `scripts/lib/idp-login.cjs` fixed and `trexBearerToken` verified against the stack; `GET /d2e/usermgmt/api/user` with the bearer answers 200 (§15). |
| **7 — write it down and commit** | This file, committed as the rehearsal ran. |

## 17. What the stack was left in

- `trexdb."oauthClient"` is back at its **seeded** values (`requirePKCE=true`,
  `tokenEndpointAuthMethod=client_secret_post`) — the boot seeder upserts them,
  so recreating the container after §13a restored them. **WebAPI therefore
  cannot sign in on the stack as it now stands**, which is the honest resting
  state until §5's blocker is fixed.
- `banned`, `deletedAt` and `emailVerified` all restored to their original
  values (verified by re-reading the row).
- One leftover: `admin@d2e.local` still holds the `ALP_SYSTEM_ADMIN` role row
  granted in §6 to make `roles` non-empty.

---

# Closing the blocker — measurements from the fix

Appended after §17. Same stack, same gateway. The stack was brought onto this
branch's core by `docker cp`-ing the changed files into `/usr/src/core/server`
and re-bundling in place with the image's own
`trex bundle ./core/server/index.ts ./core/server/index.eszip` (`Dockerfile:326`),
then restarting the container — so boot, the seeder and the eszip are all the
real ones. §0's release-engineering gap is unchanged and still owed.

## 18. `requirePKCE: false` still honours a PKCE that is supplied

This is the premise the whole of §5's fix rests on, so it was measured before
anything was built, on the running stack, with the row set to
`requirePKCE=false` / `client_secret_basic`:

| probe | observed |
|---|---|
| authorize, **WebAPI's exact shape** (no `code_challenge`, `nonce` present) | **302, code issued** |
| token, `client_secret_basic`, no `code_verifier` | **200** |
| authorize, **portal shape** (`code_challenge` + `S256`) | 302, code issued |
| token, **correct** `code_verifier` | 200 |
| token, **wrong** `code_verifier` | **401** `{"error_description":"code verification failed","error":"invalid_request"}` |
| token, `code_verifier` **omitted** | **401** `{"error_description":"code_verifier required because PKCE was used in authorization","error":"invalid_request"}` |
| token, `client_secret_post` against the basic row | **400** `client registered for client_secret_basic cannot use client_secret_post` |

The package says the same thing, and says it in one place. The column is read
only by `isPKCERequired` (`dist/utils-CWjOhEQb.mjs:836-844`), which decides
whether a challenge is **demanded**. Whether a supplied one is **honoured** is
decided twice, by branches that never read it:

- `/oauth2/authorize`: `if (query.code_challenge || query.code_challenge_method)`
  — both required, `S256` only (`dist/authorize-riRRCSbC.mjs:5594-5596`) — and
  the challenge is stored on the code.
- `/oauth2/token`: `pkceUsedInAuth = !!verificationValue.query?.code_challenge`,
  then a missing verifier is refused and a wrong one is S256-compared
  (`dist/introspect-njKASm3q.mjs:1996-2009`).

So §5's blocker is resolvable on **one** row, and the portal loses nothing.

Note also what `isPKCERequired` still demands regardless of the column: PKCE for
any **public** client (`tokenEndpointAuthMethod === "none"`, `:837`), and PKCE
**or** an OIDC nonce for any request carrying `offline_access` (`:842`). WebAPI
sends a nonce, so it clears the second; the row above is the whole reason the
first is not weakened.

## 19. Both relying parties sign in, at once, on one client row

The seeder now writes `requirePKCE=false` / `client_secret_basic`, and the d2e
`/oauth/token` proxy sends Basic when `D2E_IDP=trex` (only then — Logto refuses
a request presenting client auth twice). One run, the row read either side of
it:

```
CLIENT ROW BEFORE:  d2e-webapi | f | client_secret_basic

/WebAPI/user/login/openid            302 -> /trex/oidc/oauth2/authorize?…   (no code_challenge)
/trex/oidc/oauth2/authorize          302 -> /WebAPI/user/oauth/callback/openid?code=…&state=…&iss=…
/WebAPI/user/oauth/callback/openid   302 -> /atlas/#/welcome?code=…
GET /WebAPI/user/login/otc           200 {"login":"casuqjzdgzw9abykasofshhnfeupp2rg","message":"OTC redeemed successfully.","jwt":"eyJhbGciOiJI…"}
  WebAPI log: OIDC: Authenticated user sub=casuqjzdgzw9abykasofshhnfeupp2rg
              LoginService: onSuccess: … (origin: OIDC)

portal /oauth2/authorize (PKCE)      302, code
portal POST /d2e/oauth/token         200, 3-segment access token, refresh token, roles ["ALP_SYSTEM_ADMIN"]
GET /d2e/usermgmt/api/user           200
GET /d2e/system-portal/dataset/list  200
portal silent renewal                200, rotated refresh token

CLIENT ROW AFTER:   d2e-webapi | f | client_secret_basic
```

§5c's table can be closed: there is now a third row in it, and it is the one
that ships.

| `tokenEndpointAuthMethod` | `requirePKCE` | WebAPI sign-in | portal |
|---|---|---|---|
| `client_secret_post` (as seeded before) | true | fails at /authorize | works |
| `client_secret_basic` | true | fails at /authorize | fails at /token |
| **`client_secret_basic`** | **false** | **works** | **works** |

The proxy's own log line shows the secret has left the body:

```
[d2e-compat] /oauth/token: auth=client_secret_basic secret_present=true len=30 keys=grant_type,client_id,redirect_uri,code,code_verifier,resource
```

## 20. The rate limit: what Caddy actually sends, and what it cost

§7 said the bucket was shared and named `TREX_TRUSTED_PROXIES` as the lever.
Measured now, that lever could never have worked, and the reason is a spelling.

**What Caddy sends.** `d2e-caddy`'s Caddyfile has
`header_up X-Forwarded-For {remote}` in both `proxy_headers_default` and
`proxy_headers_codespaces`, and Caddy's `{remote}` is the peer's **`host:port`**,
not its host. Read off `trexdb.session."ipAddress"` on the running stack:

```
 ipAddress          | count
--------------------+-------
 192.168.65.1:57097 |     2
```

**What the container makes of it.** Better Auth resolves the client IP from
headers only — there is no peer-address path in `getIP` at all. Run against the
pinned package:

```
isValidIP("192.168.65.1:57097")                  -> false
getIPFromHeader("192.168.65.1:57097")            -> null
getIP({x-forwarded-for: "192.168.65.1:57097"})   -> 127.0.0.1   (NODE_ENV=development)
                                                 -> null         (otherwise)
getIP({x-forwarded-for: "192.168.65.1"})         -> 192.168.65.1
getIP(no header at all)                          -> 127.0.0.1 / null
```

and `d2e-trex`'s environment carries **`NODE_ENV=development`**, so the fallback
is `127.0.0.1` here and `no-trusted-ip` on a deployment that sets it properly.
Either way `createRateLimitKey(ip, path)` gives every caller the same key.

**`TREX_TRUSTED_PROXIES` cannot fix it.** The trusted-proxy branch of
`getIPFromHeader` parses the same malformed token with the same `ipToBytes` and
gives up on the same value. §7's advice — "set `TREX_TRUSTED_PROXIES` to the
gateway's real range" — would have changed nothing, and the refusal to guess a
CIDR was right for a second reason nobody had yet.

**Fixed by normalising the header in trex's mount**, which is the last place
trex holds the request before Better Auth reads it. `[v6]:port` and a `v4:port`
with exactly one colon are stripped; a bare IPv6 address is left alone, because
`2001:db8::1` and `2001:db8::1:443` cannot be told apart. It adds no spoofing
surface: a single-token header from an untrusted peer was already honoured, and
a multi-token one still resolves to null without `TREX_TRUSTED_PROXIES`.

**And the failure mode is now safe even where no IP can be resolved**, which is
the case §7 actually demonstrated. Better Auth's limiter keys on `<ip>|<path>`
with no hook to change the key, so a tighter `customRules` entry for
`/oauth2/userinfo` would still share ONE counter with the authenticated
requests — the attacker fills it and the sign-in reads it as full. So the mount
keeps a second, independent budget **in front of** Better Auth, and a request it
refuses never reaches Better Auth's counter at all.

Keyed on **failure**, not on whether a credential was presented: §7's flood
carried an invalid bearer, so "does it present a token" is a test an attacker
passes by typing one more word. A `/oauth2/userinfo` request answered 401 has no
legitimate volume; the call a real sign-in makes answers 200 and is never
counted. 5xx is not charged either — charging a caller for trex's own outage
would lock everyone out on top of it.
`TREX_OIDC_USERINFO_FAILURE_MAX`, default 60.

### Measured on the stack, after the fix

```
request #1  : 401 {"error_description":"Invalid access token","error":"invalid_token"}
request #60 : 401 …
request #61 : 429 retry-after=900 {"error":"invalid_request","error_description":"Too many failed userinfo requests from this client. Retry later."}
first 429 at request #61, 0.5s
```

and then, **seconds later, with that budget still spent**:

```
/WebAPI/user/login/openid → … → /atlas/#/welcome?code=…
GET /WebAPI/user/login/otc  200 {"login":"casuqjzdgzw9abykasofshhnfeupp2rg","message":"OTC redeemed successfully."}
WebAPI log: OIDC: Authenticated user … / LoginService: onSuccess
```

That is the whole difference: in §7 this same flood produced
`[invalid_user_info_response] … 429` and a failed login.

Buckets, checked from inside the container with the header under control:

| request | answer |
|---|---|
| the flooder's peer in Caddy's `host:PORT` spelling (`192.168.65.1:41999`) | **429** |
| the flooder's peer in its bare spelling (`192.168.65.1`) | **429** — the same bucket, which is only possible because the port was stripped |
| a different peer (`203.0.113.5:33333`) | **401**, the provider's own answer |
| no `X-Forwarded-For` at all — the route WebAPI's own userinfo call takes | **401** |

The second row is the proof that the normalisation is live: without it the
flood would have been counted under `127.0.0.1` and a bare `192.168.65.1` would
have been a fresh bucket.

**The trade-off, stated.** The budget is per client address, so a caller behind
the same NAT as an attacker shares its fate once 60 failures have accrued. In
d2e that address is a gateway peer and the endpoint's real consumer — WebAPI —
calls it server-side over `TREX_OIDC_INTERNAL_BASE` with no `X-Forwarded-For` at
all, so it is in a bucket of its own. A deployment that fronts trex with
something that does not forward a usable client address gets one shared FAILURE
bucket, which is still strictly better than one shared bucket for everything.

## 21. Logout with an `id_token_hint`: the cause is a bug in the plugin

§8 established that the hint arrives and is judged invalid, and that the
`localhost` name is why the JWKS fetch fails. What it did not say is why there
is a fetch at all.

`verifyLogoutHint` resolves the key set over HTTP from the provider's own public
issuer:

```js
jwksFetch: jwtPluginOptions?.jwks?.remoteUrl
  ?? `${ctx.context.baseURL}${jwtPluginOptions?.jwks?.jwksPath ?? "/jwks"}`
   // dist/authorize-riRRCSbC.mjs:547
```

while the two sibling call sites needing the same key set — the JWT access-token
validator (`:2245`) and `revokeJwtAccessToken` (`:3436`) — pass a **function**
that reads it locally (`jwtPlugin.endpoints.getJwks(ctx)`) and never leaves the
process. `:547` is the odd one out. The round trip it makes is the whole
failure; on a `localhost` issuer it cannot succeed, and it should not exist.

### §9's proposed fix is a trap, and this is what it costs

§9 suggested setting `jwks.remoteUrl` and flagged "worth checking whether it
also rewrites the advertised `jwks_uri`". It does, and it does something worse
as well. Built both ways against the pinned packages:

```
remoteUrl=(unset)
  discovery jwks_uri         : https://issuer.test/trex/oidc/.well-known/jwks.json
  GET /.well-known/jwks.json : HTTP 200
remoteUrl=http://d2e-trex:33001/trex/oidc/.well-known/jwks.json
  discovery jwks_uri         : http://d2e-trex:33001/trex/oidc/.well-known/jwks.json
  GET /.well-known/jwks.json : HTTP 404
```

- `jwks_uri: opts?.jwks?.remoteUrl ?? …` (`dist/authorize-riRRCSbC.mjs:695`)
  publishes the internal plaintext address to every relying party.
- the jwt plugin's own JWKS route answers `NOT_FOUND` whenever `remoteUrl` is
  set (`better-auth@1.7.5 dist/plugins/jwt/index.mjs:116`), so trex stops
  serving its key set at all.

That would break WebAPI's **sign-in** to fix its logout. **Do not set it.**

### Does it affect a real FQDN deployment? No — only a `localhost` one

Measured from inside `d2e-trex`, which is the measurement §9 could not complete:

```
getent hosts localhost          -> ::1, fdc4:f303:9324::254      (loopback FIRST)
curl https://localhost:41100/…  -> curl exit 7   (connection refused — never connects)

echo "192.168.65.254 develop.d2e.test" >> /etc/hosts
getent hosts develop.d2e.test   -> 192.168.65.254                (the gateway)
curl https://develop.d2e.test:41100/… -> curl exit 35  (TLS handshake — it CONNECTED)
```

Exit 35 against exit 7 is the whole answer. A name that is not `localhost` is
redirected by `extra_hosts` normally and **reaches Caddy**; it then fails only on
the certificate, which is the half §9b already measured turning into a `200`
once the gateway's root is installed. So:

- **a deployment on a real FQDN**: works today with a publicly-trusted
  certificate, and works with an internal one once `TLS__EXTRA__CA_CRTS` carries
  the gateway's root. Task 12's channel is the right one.
- **every stack whose FQDN is `localhost`** — the default local install and CI —
  cannot be fixed by any configuration, because glibc special-cases the name.

### So the failure is made visible instead

The mount verifies the hint against trex's **own** key set — the same token, the
same keys, without the round trip — and when the provider refused a hint trex
can prove is genuine, it says so. Measured on the stack with a freshly minted
hint:

```
JSON caller         401  X-Trex-Logout-Hint: rejected; local-verification=signature-valid
browser navigation  200  X-Trex-Logout-Hint: rejected; local-verification=signature-valid
                         banner present: "The sign-out request from the application
                         could not be completed automatically…"
browser, NO hint    200  no header, no banner
pages differ?            true
```

and in the log:

```
[oidc] end-session: id_token_hint rejected — the id_token_hint is genuine — trex verified it
against its own key set — so the provider's refusal is its own JWKS fetch failing, not a bad
token. @better-auth/oauth-provider resolves the key set over HTTP from the public issuer
(dist/authorize-riRRCSbC.mjs:547) instead of reading it locally as its two sibling call sites do…
```

§8's finding — "byte-identical to the no-hint page" — is closed. The Confirm
button is left working, because taking it away to make the point would stop the
user logging out at all.
