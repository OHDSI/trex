// Relying-party registrations.
//
// Clients are rows rather than config so a deployment can add one without a
// restart, and so the secret is stored hashed the way every other credential in
// trex is. The rules applied to a client live in policy.ts.

import { pool } from "../../db.ts";
import { verifyPassword } from "../password.ts";
import { isPublicClient, type OidcClient } from "./policy.ts";

export type { OidcClient };
export {
  grantedScopes,
  isPublicClient,
  isRegisteredPostLogoutUri,
  isRegisteredRedirectUri,
} from "./policy.ts";

interface ClientRow {
  client_id: string;
  client_secret_hash: string | null;
  name: string;
  redirect_uris: string[];
  post_logout_redirect_uris: string[];
  allowed_scopes: string[];
  require_pkce: boolean;
  client_roles: string[];
}

const toClient = (r: ClientRow): OidcClient => ({
  clientId: r.client_id,
  clientSecretHash: r.client_secret_hash,
  name: r.name,
  redirectUris: r.redirect_uris ?? [],
  postLogoutRedirectUris: r.post_logout_redirect_uris ?? [],
  allowedScopes: r.allowed_scopes ?? [],
  requirePkce: r.require_pkce,
  clientRoles: r.client_roles ?? [],
});

export async function getClient(clientId: string): Promise<OidcClient | null> {
  if (!clientId) return null;
  const result = await pool.query<ClientRow>(
    `SELECT client_id, client_secret_hash, name, redirect_uris,
            post_logout_redirect_uris, allowed_scopes, require_pkce, client_roles
       FROM trexdb.oidc_client WHERE client_id = $1`,
    [clientId],
  );
  return result.rows.length ? toClient(result.rows[0]) : null;
}

export async function verifyClientSecret(
  client: OidcClient,
  presentedSecret: string | undefined,
): Promise<boolean> {
  // A public client has no secret to present; accepting one would let a caller
  // choose which authentication method to be judged by.
  if (isPublicClient(client)) return false;
  if (!presentedSecret) return false;
  return await verifyPassword(presentedSecret, client.clientSecretHash as string);
}
