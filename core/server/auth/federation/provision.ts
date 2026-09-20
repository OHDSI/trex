// Step 6 of the flow, and the sign-in stamp, after the session exists.
//
// provisionUser runs outside the transaction the account and session rows were
// written in (@better-auth/sso/dist/index.mjs:4021 closes runWithTransaction,
// :4030 is here), and only on registration unless provisionUserOnEveryLogin is
// set — which it is, because the groups an upstream asserts change between
// sign-ins and the block has to describe the most recent one.
//
// The old hand-written router wrote this inside the sign-in transaction, with
// the account row it describes. The move out is deliberate rather than
// incidental: the alternative under the plugin is writing it from inside
// resolveUser, on the identity-resolution path, where a metadata failure would
// abort the sign-in itself. `deferNonDatabaseWrites` (turned on by mounting a
// resolver) gives resolveUser no write hook in any case.
//
// Nothing here interprets what it reads: the values are opaque identifiers as
// the upstream states them, and any meaning they carry belongs to d2e. That
// seam is why trex resolves group membership and d2e maps groups to roles.
import { IDP_METADATA_KEY } from "../oidc/claims.ts";
import { resolveGroups } from "./groups.ts";

/** The narrowest client this needs: injectable so the unit tests need no database. */
interface QueryClient {
  query(sql: string, params: unknown[]): unknown;
}

/**
 * The claims of an id_token, decoded and NOT verified.
 *
 * Safe here, and only here, because the plugin has already verified this exact
 * token against the provider's jwksEndpoint with `audience: config.clientId`
 * and `issuer: provider.issuer` before the callback reached this far
 * (@better-auth/sso/dist/index.mjs:3891-3907, and :3908 refuses the whole flow
 * when a resolver is mounted and no id_token arrived). The only value ever
 * passed in is `tokenResponse.idToken`, the token that verification returned
 * on. Re-verifying would be a second JWKS fetch on a path that has no way to
 * fail safely — the session is already committed.
 *
 * Never throws. A token that is not a JWT, a payload that is not base64url,
 * and a payload that is not a JSON object all yield no claims, which yields no
 * groups. That is the same non-fatal empty list resolveGroups gives for a
 * misconfigured provider.
 */
function decodeIdTokenClaims(idToken: string | undefined): Record<string, unknown> {
  if (typeof idToken !== "string") return {};
  const parts = idToken.split(".");
  if (parts.length !== 3) return {};
  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(padded + "=".repeat((4 - padded.length % 4) % 4)), (c) => c.charCodeAt(0)),
    );
    const claims = JSON.parse(json);
    // `typeof null === "object"`, and an array would index as claims["0"].
    if (claims === null || typeof claims !== "object" || Array.isArray(claims)) return {};
    return claims as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Two things at once, and both belong to this sign-in.
 *
 * `last_sign_in_at` is parity with the native grants, which stamp it on every
 * successful login; without it a federated user never records a sign-in.
 *
 * The `idp` block is how the OIDC provider learns, later and on a different
 * request, that this user's current session came from an upstream and which
 * groups it asserted. fetchUser() there is handed nothing but a user id — no
 * session row, no code record — so the fact has to be durable and keyed by the
 * user. A native password sign-in drops the block again (auth-router.ts:788),
 * so it always describes the most recent sign-in rather than accumulating.
 *
 * The write merges into app_metadata rather than replacing it: the rest of
 * that column is trex's and d2e's, and a SET would drop it on every sign-in.
 *
 * Failures are NOT swallowed. A database error here propagates before
 * setSessionCookie is reached (:4047), so the session row exists but no cookie
 * is issued and the browser gets no usable session — a loud, closed failure
 * rather than a session whose group membership silently says nothing. Group
 * resolution itself cannot fail; only the statement can.
 */
export async function provisionSsoUser(
  data: {
    user: { id: string };
    provider: Record<string, unknown>;
    token?: { idToken?: string };
  },
  // Injectable so the unit tests need no database. The default is imported
  // dynamically rather than at module scope because db.ts throws on import
  // when DATABASE_URL is unset, and a unit test that never reaches a statement
  // should not have to stand up a connection string to say so. In the process
  // that matters this resolves from the module cache: better-auth.ts, which
  // mounts this, imports the same pool.
  client?: QueryClient,
): Promise<void> {
  // Off the verified id_token, so the claim is one this provider signed. The
  // plugin hands provisionUser the raw token rather than the claims, so it is
  // decoded here.
  //
  // The id_token rather than `userInfo`, and that is a real choice: when the
  // upstream's discovery document advertises a userinfo_endpoint,
  // ensureRuntimeDiscovery hydrates it and the plugin builds `userInfo` from
  // UserInfo instead of from the id_token (:3909 is checked before :3926). But
  // `userInfo` is the MAPPED shape — id, email, emailVerified, name, image and
  // whatever mapping.extraFields names — so a groups claim is not in it either
  // way. The id_token is the one document that is always present (a resolver
  // makes it mandatory), always verified, and carries its claims whole. It is
  // also exactly what the hand-written router read, so no provider's groups
  // change meaning at the cutover.
  const claims = decodeIdTokenClaims(data.token?.idToken);
  const groups = resolveGroups(claims, {
    groupsSource: data.provider.groups_source as "claim" | "graph" | "none",
    groupsClaim: (data.provider.groups_claim as string | null) ?? null,
  });
  const db = client ?? (await import("../../db.ts")).pool;
  await db.query(
    `UPDATE trexdb."user"
        SET last_sign_in_at = NOW(),
            app_metadata = COALESCE(app_metadata, '{}'::jsonb)
                           || jsonb_build_object($2::text, $3::jsonb),
            "updatedAt" = NOW()
      WHERE id = $1`,
    [
      data.user.id,
      IDP_METADATA_KEY,
      JSON.stringify({ provider: data.provider.providerId, groups }),
    ],
  );
}
