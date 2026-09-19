# Phase 2 spikes — measured answers

Throwaway spikes for moving trex's OIDC provider onto `@better-auth/oauth-provider` 1.7.5. The spike files
themselves are gone; only the answers are worth keeping. The fuller write-up, with the source reading these
measurements confirm or contradict, lives in the phase-1 research notes
(`.superpowers/sdd/2026-09-18-trex-better-auth-phase1/phase2-oauth-provider-facts.md` in the d2e checkout),
which is on an ignored path and so cannot be committed anywhere — hence this copy.

Measured 2026-09-18 against a scratch Postgres carrying `core/schema/V1..V17` plus the plugin's own tables,
created with `getMigrations(auth.options).runMigrations()` from `better-auth/db/migration`.

## The instance the measurements were taken against

`oauthProvider` is not mounted on `auth/better-auth.ts` yet and no client is seeded yet, so each spike stood
up its own Better Auth instance. Anything that ships must copy this block; a drift between it and what ships
invalidates every measurement below.

```ts
const ISSUER = "https://localhost:8443/trex/oidc";  // stands in for
                                                    // https://${CADDY__D2E__PUBLIC_FQDN}:${CADDY_PORT}/trex/oidc
betterAuth({
  database: pool,                       // pg Pool, options: "-c search_path=trexdb,public"
  basePath: "/trex/oidc",
  baseURL: ISSUER,
  secret: "<a secret>",
  emailAndPassword: { enabled: true },  // spike only; the real instance keeps trex's scrypt hooks
  plugins: [
    jwt({
      jwt: { issuer: ISSUER },
      // Never EdDSA: WebAPI is Spring Security and has rejected a non-RS256
      // algorithm in production before.
      jwks: { keyPairConfig: { alg: "RS256", modulusLength: 2048 } },
    }),
    oauthProvider({
      loginPage: "https://localhost:8443/d2e-login/",
      consentPage: "https://localhost:8443/d2e-consent/",
      scopes: ["openid", "profile", "email", "offline_access"],
      resources: [ISSUER],              // the RFC 8707 resource identifier
      codeExpiresIn: 600,
      idTokenExpiresIn: 3600,
    }),
  ],
});
```

`npm:better-auth@1.7.5` and `npm:@better-auth/oauth-provider@1.7.5`, pinned exactly, both resolve and run
under Deno with `nodeModulesDir: "manual"` once `npm install` has populated `core/server/node_modules`, with
`"@better-auth/oauth-provider": "npm:@better-auth/oauth-provider@1.7.5"` in `core/server/deno.json`'s import
map. `jwt({ jwks: { keyPairConfig: { alg: "RS256", modulusLength: 2048 } } })` is confirmed by running it.

Requests were made by calling `auth.handler(new Request(...))` directly — no listener, so the `listen(0)`
hazard does not arise.

## Seeding (three things that are easy to get wrong)

1. `storeClientSecret: "hashed"` is **`base64url(sha256(secret))`, unpadded**, compared constant-time. A
   boot-time seeder writing `oauthClient.clientSecret` through the adapter must write that — not plaintext,
   not bcrypt.
2. The `resources` option **does** seed `oauthResource` at plugin init. There is still no client-seeding
   equivalent; the client row has to go through the adapter, because both create APIs demand a session.
3. `enforcePerClientResources` defaults to `true` and an unlinked client is a **hard failure**: with the
   `oauthClientResource` row deleted, `/oauth2/authorize` redirects to the client's `redirect_uri` with
   `error=invalid_target`, `error_description=client d2e-webapi is not linked to resource(s) <identifier>`,
   and no code at all. So the link row is mandatory. Its shape: `clientId` FKs to `oauthClient."clientId"`,
   **`resourceId` FKs to `oauthResource.identifier`, not to `oauthResource.id`**, and the table has
   `createdAt` but **no** `updatedAt`.

## Spike 1 — the resource audience and the access token

Three configurations, same instance, same client, same session:

| | `resource=` sent | `access_token` | `id_token` |
|---|---|---|---|
| A | on neither `/oauth2/authorize` nor `/oauth2/token` | **opaque**, one segment, 32 chars | 3-segment JWT |
| B | on both | **3-segment JWT** | 3-segment JWT |
| C | on `/oauth2/authorize` only | **3-segment JWT**, `aud` identical to B | 3-segment JWT |

So the resource is what makes the difference, and (C) the binding happens at authorization time and rides on
the code — a relying party that sends `resource=` only on the authorization request still gets a JWT.
The token response keys are the same either way: `access_token, expires_in, expires_at, token_type, scope,
id_token`.

Access token header: `{"typ":"at+jwt","alg":"RS256","kid":"<32 chars>"}` — `typ` is `at+jwt`, not `JWT`.
Access token payload (one sample, verbatim):

```json
{"sub":"7O8VVBFSzkTLdBcKrVYue6Tci0yrngdS",
 "aud":["https://localhost:8443/trex/oidc","https://localhost:8443/trex/oidc/oauth2/userinfo"],
 "client_id":"d2e-webapi","azp":"d2e-webapi","scope":"openid profile email",
 "sid":"4zE6bwbr6dw4FnYrVydF10FLeysYawrI","iss":"https://localhost:8443/trex/oidc",
 "iat":1789772199,"exp":1789775799,"jti":"8mlevuUVWRFs2bKMn_QLvvCThW1tWfR7"}
```

ID token header `{"alg":"RS256","kid":"<same kid>"}`; payload
`{"auth_time":…,"acr":"0","at_hash":"…","iss":…,"sub":…,"aud":"d2e-webapi","iat":…,"exp":…}` — no `email`,
no `name`, no `roles`.

**`aud` on the access token is not the client id.** It is an array of the resource identifier **and**
`${baseURL}/oauth2/userinfo`. `aud` on the id_token *is* the client id. d2e fills its verifier's audience
from `D2E_IDP_AUDIENCES ?? TREX_OIDC_CLIENT_ID`, so with the default every portal call presenting an access
token 401s on an audience mismatch. `D2E_IDP_AUDIENCES` must carry the **resource identifier**; keeping
`d2e-webapi` alongside is what lets the id_token keep verifying, so set both.

Still open: the access token carries no `roles` and no `trex_role`, so the portal's `tokenMissingRoles`
re-login branch keeps tripping until `customAccessTokenClaims` is wired.

## Spike 2 — the login and consent contract

Same instance and same seeded client; only `oauthClient.skipConsent` was toggled between measurements.

### The login redirect

No session on `GET /oauth2/authorize` → 302, `Location` is `opts.loginPage` **verbatim** with a signed query
appended. In serialization order:

```
response_type, redirect_uri, scope, state, client_id, code_challenge, code_challenge_method,
exp, ba_iat, ba_param (×10), sig
```

- Only what was *sent* appears — no `nonce` and no `prompt` on this request meant neither showed up. The
  sign-in page must treat the query as opaque rather than expecting a fixed list.
- `exp` is unix **seconds** (`now + codeExpiresIn`); `ba_iat` is **milliseconds**. Different units, same query.
- `ba_param` repeats once per signed parameter name and includes `ba_iat` and `ba_param` itself; `sig` is the
  only parameter not covered.
- `sig` is **standard** base64, not base64url — `+`, `/`, `=`, percent-encoded. Do not "fix" that.

### The bounce-back

The whole query handed straight back to `GET /oauth2/authorize` with only a session cookie added → **302 to
the client's `redirect_uri` carrying `code`, `state` and `iss`**. So the page's job really is "bounce what you
were handed", and the unverified `sig` rides along as an inert extra parameter. (`iss` on the callback is new
relative to trex today, which sends only `code` and `state`.)

### Consent

| `oauthClient.skipConsent` | `GET /oauth2/authorize` with a live session |
|---|---|
| `true`  | 302 straight to the redirect URI with a `code` |
| `false` | 302 to the configured `consentPage`, with the same signed-query shape as the login redirect |

So `consentPage` decides only *where* consent goes; the column decides *whether*. The seeder must write
`skipConsent: true`; `consentPage` still has to be given some string because the option is required.

### `prompt=login` loops

With a live session and `prompt=login`: the first pass redirects to the login page anyway; `prompt=login` is
carried into the signed query (and into `ba_param`); bouncing that query back verbatim with the same live
session redirects to the login page **again**, indefinitely, with nothing to distinguish it from the first
pass. Deleting `prompt` before bouncing yields the code.

The sign-in page therefore needs to **strip `prompt` before bouncing**. Stripping it invalidates `sig`, since
`prompt` is a signed parameter — harmless on `/oauth2/authorize`, which never verifies `sig`, and confirmed by
measurement, but it means such a page can only ever bounce to `/oauth2/authorize`. `skipConsent: true` is what
makes that acceptable, so the two facts are load-bearing together.

Neither WebAPI nor the portal sends `prompt` today; this is a guard against a future relying party.

## The schema this phase owes

Established while standing the spikes up. `getMigrations(auth.options)` from `better-auth/db/migration`,
run with the options block above against a database at `core/schema/V1..V17`, reported:

- **tables to create:** `oauthClient`, `oauthResource`, `oauthClientResource`, `oauthRefreshToken`,
  `oauthAccessToken`, `oauthConsent`, `oauthClientAssertion`;
- **columns to add to the existing `jwks` table:** `expiresAt`, `alg`, `crv`;
- plus `Column "createdAt" on table "jwks" stays nullable while the schema declares the field required`.

So `V1..V17`'s `jwks` table is not the shape better-auth 1.7.5's jwt plugin declares. Since 1.7 a schema
mismatch is a `SchemaMismatchError` at boot and on every request that awaits validation, not a startup
warning — which is what `auth/schema-validate.test.ts` exists to catch — so a migration adding those three
columns, and backfilling and NOT NULL-ing `createdAt`, is a prerequisite for turning the jwt plugin on,
alongside the seven `oauth*` tables. The spikes created them with `runMigrations()` in a scratch database,
which is not how trex migrates.

Foreign keys observed on the created tables, for whoever writes that migration by hand:
`oauthClientResource."clientId" → oauthClient."clientId" ON DELETE CASCADE` and
`oauthClientResource."resourceId" → oauthResource.identifier ON DELETE CASCADE`.

## Measured at the cutover (task 6)

Spikes 1 and 2 called `auth.handler()` directly, with no listener and no Express. These three were
measured against the real mount (`oidc/mount.ts`) on a real `listen(0, "127.0.0.1")`, because they
only exist once a request has been through Express.

### `req.originalUrl`, not `req.url`

Under `app.use("/trex/oidc", handler)`, a request for
`/trex/oidc/.well-known/openid-configuration` arrives as:

```
req.url         = /.well-known/openid-configuration
req.originalUrl = /trex/oidc/.well-known/openid-configuration
```

Express strips the mount prefix, and **both** consumers need it back. better-call routes on
`new URL(ctx.baseURL).pathname` (better-auth@1.7.5 `api/index.ts:154`), which is `/trex/oidc`, and
the discovery document is served by an `onRequest` hook that compares `new URL(request.url).pathname`
against `<jwt.issuer pathname>/.well-known/openid-configuration`
(`dist/authorize-riRRCSbC.mjs:4227`). A `Request` built from `req.url` misses on both: every route
404s and the document is never served. This settles the `[UNVERIFIED]` in facts C.3.

### `sb-access-token` is not a session at `/oauth2/authorize`

Measured with a **genuine** trex access token — three segments, `verifyAccessToken` returns its
claims — presented as the only cookie:

| cookie | `GET /oauth2/authorize` |
|---|---|
| `sb-access-token=<valid trex JWT>` | 302 to `loginPage` with the signed query — identical to sending no cookie at all |
| `better-auth.session_token=<engine session>` | 302 to the client's `redirect_uri` with `code`, `state`, `iss` |

The provider reads Better Auth's own signed session cookie and nothing else. `auth-router.ts`'s
sign-in already forwards the engine's `Set-Cookie` to the browser alongside `sb-access-token`
(phase 1 added that for exactly this), so a browser that signed in through `/auth/v1` carries both —
but a login page that sets only `sb-access-token` (or a caller that replays one) reaches the provider
as anonymous. The cookie name follows the base URL's scheme: `__Secure-better-auth.session_token`
behind an https issuer.

### The base URL is the issuer, and that is not a free choice

`authServerMetadata` builds `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`,
`end_session_endpoint` and `jwks_uri` from `ctx.context.baseURL`, and only `issuer` from the jwt
plugin's own `jwt.issuer`. `getBaseURL` returns `options.baseURL` unchanged when it already carries a
path, so `options.basePath` never enters into it. The engine therefore moved off phase 1's
`${BASE_PATH}/_auth` and onto `${BASE_PATH}/oidc` wholesale; what keeps Better Auth's own routes off
the public surface is `oidc/mount.ts`'s prefix gate, not the base path.

## Measured at the grant cutover (task 7)

Against the real mount on `listen(0, "127.0.0.1")`, with the seeded client. Each of these was
read in `core/server/node_modules/@better-auth/oauth-provider@1.7.5` first and then run.

### `client_credentials` cannot carry any scope trex already declares

`USER_DELEGATED_SCOPES` is exactly `{openid, profile, email, offline_access}`
(`dist/introspect-njKASm3q.mjs:917-921`). The grant handler rejects a requested scope that is
either absent from the client's `clientCredentialsScopes` **or** user-delegated (`:2075-2084`,
`error: invalid_scope`), and the plugin's own `clientCredentialsScopes` validator additionally
requires the scope to be one the provider advertises in `opts.scopes` (`:939-940`). So
`clientCredentialsScopes: ["openid"]` is a row the plugin would never have written itself, and
one whose only usable call is a token request that sends **no** `scope` at all. trex declares
`trex:service` instead, in `opts.scopes` and in that column and nowhere else — no client's
`scopes` column lists it, so no authorize request can be granted it.

### The grant produces an opaque token unless the token request carries `resource`

`isJwtAccessToken = audienceClaim && !opts.disableJwtPlugin` (`:1800`), `audienceClaim` comes from
`resolveResourcePolicy`, and that returns `undefined` outright when the request named no resource
(`:452-462`). `authorization_code` and `refresh_token` inherit one from the authorize leg or the
stored refresh token; `client_credentials` has neither. So **without a resource on that grant the
access token is opaque and `customAccessTokenClaims` never runs** — seeding
`metadata.clientRoles` alone changes nothing and the grant still answers 200.
`oidc/hooks.ts`'s `defaultServiceResource` supplies the issuer when the caller names none.

With it: header `{"typ":"at+jwt","alg":"RS256"}`, payload `sub` = the **client id**
(`createJwtAccessToken`, `:1353`: `user?.id ?? client.clientId`), `aud` = the resource identifier
alone (no userinfo entry, because the granted scopes do not include `openid`), plus trex's
`trex_role: "service"`, `app_metadata` and `roles`. No `id_token` and no `refresh_token`.

### `customAccessTokenClaims` is handed the client's metadata, and nothing else about the client

`{ user, scopes, resources, referenceId, metadata }` (`:255-261`), with
`metadata = parseClientMetadata(client.metadata)` (`:1802`). There is no client object and no
`clientRoles` column, so the roles a service token authorizes as can only ride in `metadata` —
which the plugin also treats as the bag registration extensions live in
(`stripReservedOAuthClientMetadataExtensions`, `dist/authorize-riRRCSbC.mjs:1161`). A seeder that
assigns the whole column therefore discards them.

### Introspection is a fourth door, and the `internalAdapter` guard does not reach it

`validateJwtAccessToken` (`:2237-2286`) never calls `findUserById` and reads the session through
`ctx.context.adapter.findOne({model:"session"})` rather than the wrapped
`internalAdapter.findSession` — so a retired user's JWT access token introspected `active: true`
with its whole claim set. `validateOpaqueAccessToken` (`:2336`) and `validateRefreshToken`
(`:2410`) do go through the guard, but only to fill `sub`, and answered `active: true` with
`sub: undefined`. Refused in `oidc/hooks.ts` on the answer rather than per validator: an active
response must name a subject, and that subject must still resolve — with `sub === client_id` as
the one legitimate subject-without-a-user.

### `banned` is a retirement the guard has to know about

The provider keeps its refresh tokens in `trexdb."oauthRefreshToken"`; trex's ban procedure
(`auth-router.ts:1449-1471`) revokes `trexdb.refresh_token` and the engine sessions, which is
everything that existed when it was written. So a ban left the OIDC refresh token renewing
indefinitely. `mount.ts`'s guard now treats `deletedAt` and `banned` alike.

### Error codes, where the plan guessed

- Widening the scope on a refresh: **`invalid_scope`**, `unable to issue scope <s>` (`:2138-2143`).
  This settles the plan's `[UNVERIFIED]`.
- A `code_verifier` that does not match the challenge: **`invalid_request`** with status 401
  (`:2007-2010`), not `invalid_grant`.
- `code_challenge_method=plain`: refused by the query schema, which pins `z.enum(["S256"])`
  (`dist/authorize-riRRCSbC.mjs:1048`) — but still answered as a **302 OAuth error redirect** to
  the client's `redirect_uri` with `error=invalid_request`, not as a bare 400.

### Rate limiting

Better Auth's `rateLimit.enabled` defaults to `isProduction`
(`better-auth/dist/context/create-context.mjs:172`) and nothing in the trex tree sets
`NODE_ENV=production`, so the provider's endpoints — mounted ahead of trex's own `apiLimiter` —
were unthrottled. Turned on explicitly.

**The engine's 100 requests / 10 seconds is not the rule that applies.** A plugin's own
`customRules` win over it (`better-auth/dist/api/rate-limiter/index.mjs:251-258`), and the OAuth
provider ships six (`@better-auth/oauth-provider/dist/authorize-riRRCSbC.mjs:5235-5264`):

| path | window | max |
|---|---|---|
| `/oauth2/token` | 60s | **20** |
| `/oauth2/authorize` | 60s | 30 |
| `/oauth2/introspect` | 60s | 100 |
| `/oauth2/revoke` | 60s | 30 |
| `/oauth2/register` | 60s | 5 |
| `/oauth2/userinfo` | 60s | 60 |

Measured: request 21 to `/oauth2/token` inside a minute is a 429. `auth/oidc/revocation.test.ts`
reproduced it by accident — three of its seven tests failed on nothing but exhausted budget.

That caps a deployment at roughly twenty sign-ins a minute, against the deleted `router.ts`'s
`authLimiter` of 600 per 15 minutes (`core/server/middleware/rate-limit.ts:19-28`,
`TREX_AUTH_RATE_LIMIT_MAX`). `provider.ts` now sets all five reachable paths to that same budget,
tuneable through `TREX_OIDC_RATE_LIMIT_MAX`; `/oauth2/register` keeps the plugin's 5, because trex
registers no clients over HTTP.

**Whose budget it is depends on resolving a client IP**, and that is the sharper problem.
`getIP` reads `x-forwarded-for` by default (`@better-auth/core/dist/utils/ip.mjs:196`), which is
what Caddy sends — so naming the header buys nothing. What matters is
`advanced.ipAddress.trustedProxies` (`ip.mjs:177-193`):

- **empty** — a header carrying MORE than one value resolves to `null` (`:190`), and every caller
  then shares one bucket per path (`rate-limiter/index.mjs:241-245`). Caddy *appends* to
  `x-forwarded-for` rather than replacing it, so any caller that sends one of its own makes the
  header two-valued and collapses the whole deployment into that shared bucket at will.
- **set** — the chain is walked from the RIGHT and the first address that is not a configured
  proxy wins (`:180-189`). That is spoof-resistant, because a value the client prepended sits to
  the left of the address Caddy observed.

Wired as `TREX_TRUSTED_PROXIES`, **empty by default**. Seeding it with the RFC 1918 ranges would
be worse than leaving it empty on an on-premise installation, where real clients live in 10/8 and
192.168/16: the right-walk would skip the genuine address as "a proxy" and select whatever the
client prepended. Which ranges are proxies is a property of the deployment.


## Measured in fix round 1 (task 7)

### The provider's tokens are outside every revocation path trex owns

The deleted `router.ts:94-102` kept OIDC refresh tokens in `trexdb.refresh_token` precisely so
that "a token issued here is revoked by the same paths that revoke a password-change or a
deletion". The plugin keeps `trexdb."oauthRefreshToken"`, which nothing in trex writes to. Measured
after trex's complete change-password procedure — native refresh rows revoked, engine session
deleted — the OIDC refresh grant still answered 200 and kept rotating. `mount.ts`'s guard cannot
cover it: that reads the user ROW, and a password change leaves the row saying the account is fine.
`auth/oidc/revoke.ts` is called from `/logout`, `PUT /user`, `/change-password` and
`PUT /admin/users/:id`.

Two of the six paths deliberately take nothing. `POST /token`'s rotation revokes the single token
it was handed, which is renewal rather than revocation; reaching into the OIDC tables there would
end the SSO session every few minutes. `POST /revoke-session` scopes on `trexdb.refresh_token`'s
`session_id`, which is trex's own concept with no column anywhere tying it to a `trexdb.session`
row — so there is nothing to scope an OIDC revocation to, and revoking by user would sign the
caller out of every device to honour a request to sign out of one. Both are pinned by test.

### `oauthRefreshToken."sessionId"` is ON DELETE SET NULL

V19 gives it a foreign key to `trexdb.session` with `ON DELETE SET NULL`. So anything that deletes
an engine session — `endEngineSessions`, `auth.api.signOut`, ordinary expiry — first nulls the
column a session-scoped revocation joins on, leaving the refresh chain alive AND no longer
attributable to any session. `/logout` therefore revokes before it signs out. Anything joining on
that column must do the same.

### Rotation rewrites the token, so a second refresh check is not the same check

`createRefreshToken` revokes the presented row and creates a new one (`:1571-1599`). A test that
calls the refresh grant once to show a session live and again with the SAME token to show it dead
proves nothing: the second call fails on rotation whatever the endpoint under test did. The first
draft of `revocation.test.ts` did exactly that and passed against code that revoked nothing.

## Measured in fix round 2 (task 7)

### The complete list of places that end an engine session

Established by search rather than from a brief, because round 1's list was incomplete and the
missing entry was the worst of them. Everything in the tree that removes a `trexdb.session` row,
directly or through the engine:

| site | what it is | needs OIDC revocation? |
|---|---|---|
| `auth-router.ts:413` `endEngineSessions(userId)` | wholesale by user; called from `PUT /user`, `/change-password`, `PUT /admin/users/:id` | already paired at all three call sites with `revokeOidcTokensForUser`, which keys on `userId` and is therefore immune to the `SET NULL` below |
| `auth-router.ts:833` `auth.api.signOut` | `POST /logout`, one session | yes — `revokeOidcTokensForSession`, **before** the sign-out |
| `mcp/tools/sessions.ts:49` `session-revoke` | the MCP tool, one session by id | **yes, and it was the only one missing.** Fixed in this round |
| `V1`'s `soft_delete_user()` | sets `deletedAt`/`banned`; touches no session | no — and `mount.ts`'s guard refuses the user anyway |
| `V1`'s `purge_deleted_users()` | deletes the `user` row | no — `oauthRefreshToken."userId"` is `ON DELETE CASCADE`, so the rows go with it |
| better-auth admin's `revokeUserSession(s)` | plugin endpoints | not reachable: `mount.ts:19`'s `PROVIDER_PREFIXES` 404s them, and nothing calls them server-side |

`auth-router.ts:1225` `POST /revoke-session` is not on this list because it ends no engine session
at all — it revokes by trex's own `session_id`, which nothing joins to `trexdb.session`.

### `ON DELETE SET NULL` does not merely fail to revoke — it destroys the ability to

Round 1 found that deleting an engine session before revoking nulls the column the revocation
joins on. The MCP tool showed the consequence in full:

```
oauthRefreshToken sessionIds before: [{"sessionId":"xLmq…U0yf"},{"sessionId":"xLmq…U0yf"}]
session-revoke deleted: 1
oauthRefreshToken sessionIds AFTER:  [{"sessionId":null},{"sessionId":null}]
>>> OIDC refresh after MCP session-revoke: 200, new access token issued
```

The surviving rows are **permanently orphaned**: no later `/logout` from any device can reach them,
because the only session-scoped revocation there is joins on the column that was just nulled. So
the rule for anything that deletes a session row is not "revoke as well" but "revoke FIRST", and
the two known sites now say so at the call site.

### Revocation leaves no trace, by construction

`revoke.ts` deletes rather than setting `revoked`, because a revoked-but-present refresh token can
still be replayed from `rotationReplayResponse` inside the plugin's reuse interval
(`dist/introspect-njKASm3q.mjs:2147-2155`). The cost is that a deleted row is indistinguishable
from one that never existed: there is no record that a revocation happened, who caused it, or when.

Recorded rather than fixed. Neither `oauthRefreshToken` nor `oauthAccessToken` carries an audit
contract today and nothing reads them for history. Whoever wants one should not add it by flagging
`revoked` instead — that reopens the replay — but by writing an audit row alongside the delete.

## Measured while re-expressing the protocol tests (task 8)

Against the real mount, as everything since task 6.

### RP-initiated logout verifies `id_token_hint` by fetching its own JWKS over HTTP

`verifyLogoutHint` builds a JWKS set from
`jwks.remoteUrl ?? ${ctx.context.baseURL}${jwks.jwksPath ?? "/jwks"}` and fetches it
(`dist/authorize-riRRCSbC.mjs:547` → `@better-auth/core/dist/oauth2/verify.mjs:99`). It does not
read the key it signed the id_token with minutes earlier. With better-auth.ts's
`jwksPath: "/.well-known/jwks.json"` that URL is `<issuer>/.well-known/jwks.json`, which the mount
does serve — but it is the **public** issuer, so the trex process has to be able to reach its own
public FQDN through Caddy, over TLS, with a certificate it trusts. Where it cannot, every hint
verifies as invalid and `/oauth2/end-session` answers 401 to a fetch or an HTML confirmation page to
a browser navigation, which is indistinguishable from a genuine refusal. Not fixed here; recorded
because nothing else would show it and because `auth/oidc/end-session.test.ts` has to bind the
issuer's own port for exactly this reason.

`sid` **is** on the id_token, contrary to the sample payload in spike 1 above, which was taken before
`customIdTokenClaims` and phase 1's real sessions. `verifyLogoutHint` rejects a hint without one.

### An `http:` redirect_uri on a non-loopback host never reaches the registration check

`SafeUrlSchema` requires https except for a loopback host
(`@better-auth/core/dist/utils/redirect-uri.mjs`), so `/oauth2/authorize` answers
`error=invalid_request` at the issuer's error URL rather than the `invalid_redirect` an unregistered
https URI gets. Same property — the browser is not sent to the requested URI — under a different name.

### Registered loopback redirect URIs match on every character but the port

`findRegisteredRedirectUri` strips the port from an `http:` loopback URI on both sides
(`:5386-5446`, RFC 8252 §7.3). So registering `http://127.0.0.1:1234/cb` registers every port on that
host. Stricter than the deleted router.ts, which compared for equality. No trex client registers a
loopback URI today.

### `post_logout_redirect_uri` is matched with `includes`, and gets none of that licence

`getRegisteredLogoutRedirect` (`:558-573`) is plain string equality against
`client.postLogoutRedirectUris` — a different column from `redirectUris`, so a registered callback URI
is not a logout destination. An unregistered one is not an error: the logout still happens, and the
plugin simply does not navigate (empty 200, or an HTML page saying the destination was not registered
for a browser navigation).

### An absent or empty `code_verifier` is refused before the challenge is compared

With `requirePKCE` set — which the seeder sets for every client — the refusal is
`invalid_request` / "PKCE is required for this client" (`dist/introspect-njKASm3q.mjs:1985-1990`),
not the "code_verifier required because PKCE was used in authorization" of the next branch
(`:1997-2000`). A wrong verifier is `invalid_request` / "code verification failed" (`:2007-2010`).
All three share the error code, so only the description distinguishes the branch.

### `code_challenge_method=plain` is refused twice

The query schema pins `z.enum(["S256"])` (`introspect-njKASm3q.mjs:1048`) and the authorize handler
checks the method again (`authorize-riRRCSbC.mjs:5596`). Removing either alone leaves `plain` refused;
`auth/oidc/grants.test.ts`'s assertion changes only when both go.

## Measured while giving the browser a session cookie (task 9)

### The cookie, literally

`(await auth.$context).authCookies.sessionToken`, against trex's own config with an http issuer:

```json
{"name":"better-auth.session_token",
 "attributes":{"secure":false,"sameSite":"lax","path":"/","httpOnly":true,"maxAge":604800}}
```

`path` is already `/`, so nothing needed widening: `/trex/oidc` and `/trex/auth/v1` are both reached.
The name and `secure` follow the issuer's scheme through `createCookieGetter`
(`better-auth/dist/cookies/index.mjs:20-46`) — an https issuer gives `__Secure-better-auth.session_token`
with `secure: true`, which is why nothing writes the name or the attributes out by hand.

**`maxAge` is seconds; express's `res.cookie` counts milliseconds.** A cookie set from these attributes
without the conversion expires in ten minutes over a session row that lives a week.

There is no cookie cache (`session.cookieCache` is undefined), so the signed cookie against `trexdb.session`
is the whole of the session — which is also what makes `endEngineSessions`' bare DELETE authoritative.

### The engine mints no session without a password

`auth.api.signInEmail` is the only thing in better-auth 1.7.5 that trex can reach which creates a session,
and it needs the password. `admin.impersonateUser` wants an admin session and writes `impersonatedBy`.
So a route holding nothing but a verified trex access token — `/sync-cookie` — has to go through
`internalAdapter.createSession(userId, dontRememberMe, override)` and sign the cookie itself.

`createSession` outside an endpoint is fine: it reads headers through `tryGetCurrentAuthEndpointContext()`
(`dist/db/internal-adapter.mjs:247-251`), which returns undefined there, and `override` supplies
`ipAddress`/`userAgent` instead.

The cookie value is `encodeURIComponent(`${token}.${base64(hmac-sha256(token, secret))}`)` —
better-call's `signCookieValue` (`better-call/dist/crypto.mjs:20-30`), standard base64, not base64url.
better-call is a transitive dependency with no import-map entry, so `auth-router.ts` reproduces those six
lines over `crypto.subtle` rather than pinning a second copy of it; the contract test hands the resulting
cookie back to `auth.api.getSession` so a divergence fails instead of signing people in as nobody.

### Two of the three routes the plan named were already done

Phase 1's `authenticateUser` already forwards `signInEmail`'s `Set-Cookie`, so the password grant and
`/signup` were never the gap — `auth-engine-cutover.test.ts` had been pinning the session and the cookie
since the cutover. `/logout` already forwarded `signOut`'s clearing cookie too. The gap was `/sync-cookie`,
which set `sb-access-token` alone.

### Federated sign-in still reaches the provider as anonymous

Searched rather than assumed, the way task 7's round 2 was: `auth.api.signInEmail` in `authenticateUser`
is the **only** call in the tree that creates a `trexdb.session` row. `auth/federation/router.ts:324`
finishes the upstream callback with `createTokenResponse(sessionUser, undefined, res)`, which sets
`sb-access-token` and nothing else, and then redirects — so a user who signed in through an upstream IdP
arrives at `/oauth2/authorize` with the one cookie measured above to be no session at all, and bounces
back to the login page. The router's own header comment ("issue exactly the session the native password
grant issues — so from the moment /callback finishes the request is indistinguishable from a native
login") is false as it stands.

**Not fixed in task 9**, and deliberately: the call is one line, but nothing in `auth/federation/` drives
`/callback` over HTTP — there is no stub upstream with a token endpoint and a JWKS — so the change could
not be pinned, and an unpinned change to that route is worse than a recorded gap. It is worth a task of
its own, together with the harness.
