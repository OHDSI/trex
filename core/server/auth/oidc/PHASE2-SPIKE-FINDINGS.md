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
