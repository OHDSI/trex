// Data layer for the trex-native OAuth broker (spec §5, §7): the encrypted
// per-principal token store (agents.oauth_tokens) plus the connector registry
// (agents.oauth_connectors). Backed by V5__connections.sql.
//
// Like channels/store.ts and service/store.ts, the query function is injected
// (pg Pool.query-compatible) so unit tests run without Postgres. The DEK is
// injected too — a { encrypt, decrypt } pair over core/server/auth/dek.ts —
// so the store round-trips real AES-GCM ciphertext in tests without reaching
// into module globals. Access/refresh tokens are stored ENCRYPTED; a
// connector's client secret is NEVER stored — client_secret_ref names an env
// var resolved at read time.
// deno-lint-ignore-file no-explicit-any

export type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>;

/** Injected encrypt/decrypt over the DEK (core/server/auth/dek.ts). */
export interface Dek {
  encrypt(plaintext: string): Promise<string>;
  decrypt(ciphertext: string): Promise<string>;
}

/** Env resolver for client_secret_ref (defaults to Deno.env.get). */
export type GetEnv = (name: string) => string | undefined;

export interface OAuthToken {
  access: string;
  refresh: string | null;
  expiresAt: Date;
  scopes: string;
}

export interface OAuthConnector {
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret: string | undefined;
  scopes: string;
  principalScope: string;
}

const defaultEnv: GetEnv = (k) => {
  try {
    return (globalThis as any).Deno?.env?.get(k);
  } catch {
    return undefined;
  }
};

export function createOAuthStore(query: QueryFn, dek: Dek, getEnv: GetEnv = defaultEnv) {
  return {
    // Fetch and decrypt the token a principal holds for a connector. App-scoped
    // tokens use principal_id '__app__'. Returns null when no row exists.
    async getToken(
      principalType: string,
      principalId: string,
      connector: string,
    ): Promise<OAuthToken | null> {
      const r = await query(
        `SELECT access_token_enc, refresh_token_enc, expires_at, scopes
           FROM agents.oauth_tokens
          WHERE principal_type = $1 AND principal_id = $2 AND connector = $3`,
        [principalType, principalId, connector],
      );
      const row = r.rows[0];
      if (!row) return null;
      return {
        access: await dek.decrypt(row.access_token_enc),
        refresh: row.refresh_token_enc == null ? null : await dek.decrypt(row.refresh_token_enc),
        expiresAt: row.expires_at,
        scopes: row.scopes,
      };
    },

    // Encrypt and upsert a principal's token for a connector. The composite PK
    // (principal_type, principal_id, connector) arbitrates ON CONFLICT, so a
    // re-mint/refresh overwrites the prior token in place.
    async putToken(
      principalType: string,
      principalId: string,
      connector: string,
      tokens: OAuthToken,
    ): Promise<void> {
      const accessEnc = await dek.encrypt(tokens.access);
      const refreshEnc = tokens.refresh == null ? null : await dek.encrypt(tokens.refresh);
      await query(
        `INSERT INTO agents.oauth_tokens
             (principal_type, principal_id, connector, access_token_enc, refresh_token_enc, expires_at, scopes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (principal_type, principal_id, connector) DO UPDATE SET
             access_token_enc = EXCLUDED.access_token_enc,
             refresh_token_enc = EXCLUDED.refresh_token_enc,
             expires_at = EXCLUDED.expires_at,
             scopes = EXCLUDED.scopes`,
        [principalType, principalId, connector, accessEnc, refreshEnc, tokens.expiresAt, tokens.scopes],
      );
    },

    // Look up a connector by id and resolve its client secret from the env ref
    // (the secret is never stored in the table). Returns null for an unknown id;
    // clientSecret is undefined if the referenced env var is unset.
    async getConnector(id: string): Promise<OAuthConnector | null> {
      const r = await query(
        `SELECT authorization_url, token_url, client_id, client_secret_ref, scopes, principal_scope
           FROM agents.oauth_connectors
          WHERE id = $1`,
        [id],
      );
      const row = r.rows[0];
      if (!row) return null;
      return {
        authorizationUrl: row.authorization_url,
        tokenUrl: row.token_url,
        clientId: row.client_id,
        clientSecret: getEnv(row.client_secret_ref),
        scopes: row.scopes,
        principalScope: row.principal_scope,
      };
    },
  };
}

export type OAuthStore = ReturnType<typeof createOAuthStore>;
