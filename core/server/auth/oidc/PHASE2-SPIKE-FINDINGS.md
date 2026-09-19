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
