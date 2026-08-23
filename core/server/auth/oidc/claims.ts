// id_token claim construction.
//
// Split from the signing code so the claim rules — what each scope adds, what
// the role looks like, how long a token lives — can be tested without a signing
// key or a database.

export interface IdTokenUser {
  id: string;
  email: string;
  name?: string | null;
  role: string;
  emailVerified?: boolean;
}

export interface IdTokenOptions {
  issuer: string;
  audience: string;
  nonce?: string | null;
  scopes: string[];
  ttlSeconds?: number;
  authTime?: number;
}

export const DEFAULT_ID_TOKEN_TTL_SECONDS = 3600;

export interface IdTokenClaims {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat: number;
  auth_time: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  trex_role: string;
  app_metadata: { trex_role: string };
}

/**
 * Claims are scope-gated: `profile` and `email` add nothing unless requested.
 * The role is not gated — it is the reason a relying party asks for a token at
 * all — and is emitted both top-level and under app_metadata so a consumer
 * reads it the same way it reads the native access token.
 */
export function buildIdTokenClaims(user: IdTokenUser, opts: IdTokenOptions): IdTokenClaims {
  const now = Math.floor(Date.now() / 1000);
  const claims: IdTokenClaims = {
    iss: opts.issuer,
    sub: user.id,
    aud: opts.audience,
    iat: now,
    exp: now + (opts.ttlSeconds ?? DEFAULT_ID_TOKEN_TTL_SECONDS),
    auth_time: opts.authTime ?? now,
    trex_role: user.role,
    app_metadata: { trex_role: user.role },
  };

  if (opts.nonce) claims.nonce = opts.nonce;
  if (opts.scopes.includes("email")) {
    claims.email = user.email;
    claims.email_verified = Boolean(user.emailVerified);
  }
  if (opts.scopes.includes("profile") && user.name) {
    claims.name = user.name;
  }

  return claims;
}
