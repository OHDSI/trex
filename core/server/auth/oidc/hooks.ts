// Two request-level corrections to @better-auth/oauth-provider that the plugin
// exposes no option for. Both are wired into better-auth.ts's `hooks`, because
// `options.hooks` is the only place Better Auth runs code around a plugin's own
// endpoints: `runPluginInit` rebuilds `context.internalAdapter` after every
// plugin's init (better-auth@1.7.5 context/helpers.ts), and there is no
// read-side database hook.
import { createAuthMiddleware } from "better-auth/api";
import { oidcIssuer } from "./config.ts";

/**
 * Gives a `client_credentials` token request the RFC 8707 resource it cannot
 * inherit, so the token it mints is a signed JWT rather than an opaque string.
 *
 * The chain, read in the installed package: `createUserTokens` only calls
 * `customAccessTokenClaims` when `isJwtAccessToken`, which is
 * `audienceClaim && !opts.disableJwtPlugin`
 * (dist/introspect-njKASm3q.mjs:1800, 1838); `audienceClaim` comes from
 * `resolveResourcePolicy`, which returns `undefined` outright when the request
 * carried no `resource` (:452-462). The authorization_code and refresh_token
 * grants can inherit one from the authorize leg or from the stored refresh
 * token; `client_credentials` has neither. So without this the service token is
 * opaque, `trex_role` and the client's roles never reach it, and the failure is
 * silent — the grant still answers 200.
 *
 * Defaulted rather than required: trex's own provider asked for no resource at
 * all, and refusing a request that used to work is a harder break than
 * answering it with the audience trex would have used anyway. A caller that
 * names a resource keeps it.
 */
function namesAResource(resource: unknown): boolean {
  if (typeof resource === "string") return resource.length > 0;
  if (Array.isArray(resource)) {
    return resource.some((r) => typeof r === "string" && r.length > 0);
  }
  return false;
}

export const defaultServiceResource = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/oauth2/token") return;
  const body = ctx.body as Record<string, unknown> | undefined;
  if (!body || body.grant_type !== "client_credentials") return;
  // Normalized the way the plugin does before deciding the caller named one:
  // `resource` may arrive repeated, and `normalizeResourceParam` discards an
  // array with no non-empty string in it (dist/introspect-njKASm3q.mjs:394-401).
  // A bare `!== undefined` therefore lets `resource=` or `resource=&resource=`
  // through as if it were a real value, and the token goes out opaque — the
  // exact failure this hook exists to prevent, reached by a caller that tried.
  if (namesAResource(body.resource)) return;
  return { context: { body: { ...body, resource: oidcIssuer() } } };
});

/**
 * Refuses introspection of a token whose subject no longer resolves to a live
 * user.
 *
 * mount.ts's soft-delete guard wraps `internalAdapter.findUserById` and
 * `findSession`, which covers the code exchange, the refresh grant and
 * /userinfo. It does not cover introspection, and the three validators fail
 * three different ways (all verified in
 * dist/introspect-njKASm3q.mjs):
 *
 * - `validateJwtAccessToken` (:2237-2286) never calls `findUserById` at all,
 *   and reads the session through `ctx.context.adapter.findOne({model:"session"})`
 *   rather than the guarded `internalAdapter.findSession` — so a retired user's
 *   JWT introspects as `active: true` with its full claim set. trex declares
 *   `resources`, so this is the shape trex's own access tokens take.
 * - `validateOpaqueAccessToken` (:2336) and `validateRefreshToken` (:2410) do
 *   go through the guard, but only to fill `sub` — a null user leaves them
 *   answering `active: true` with `sub: undefined`.
 *
 * So the check is on the answer rather than on any one validator: an active
 * response must name a subject, and that subject must still resolve.
 *
 * A `client_credentials` token is the one active response with no end user. It
 * is not subject-less — `createJwtAccessToken` sets `sub = user?.id ??
 * client.clientId` (:1353) — so it is told apart by `sub === client_id`, and an
 * active response carrying no subject at all is refused rather than guessed at.
 *
 * This only tightens: every response it changes is one the deleted router.ts
 * could not have produced, because it served no introspection endpoint.
 */
export const refuseRetiredSubject = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/oauth2/introspect") return;
  const payload = ctx.context.returned as Record<string, unknown> | undefined;
  if (!payload || payload.active !== true) return;

  const sub = payload.sub;
  if (typeof sub === "string" && sub.length > 0) {
    // The service token's own subject. No user exists to retire.
    if (sub === payload.client_id) return;
    if (await ctx.context.internalAdapter.findUserById(sub)) return;
  }
  return ctx.json({ active: false });
});
