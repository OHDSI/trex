// Ports src/PostgREST/Auth.hs (PostgREST v12.2.3): Bearer token extraction,
// JWT verification and role resolution.
//
// Semantics ported 1:1:
//  - no/empty token → empty claims → role falls back to db-anon-role, or
//    PGRST302 when no anon role is configured (Auth.hs parseClaims)
//  - token present but no jwt-secret configured → PGRST300
//  - invalid/expired token → PGRST301, message matching AuthSpec.hs where
//    feasible ("JWT expired", "JWSError (CompactDecodeError ...)")
//  - exp/nbf validated with 30s leeway (Auth.hs: allowedSkew 30); iat in the
//    future is rejected like Haskell jose does (npm jose omits that check)
//  - audience: only checked when jwt-aud is configured (string-or-array
//    membership, which npm jose implements identically)
//  - the resolved role is inserted into the claims ("role" key), so
//    request.jwt.claims always carries it

import {
  decodeProtectedHeader,
  errors as joseErrors,
  importJWK,
  type JSONWebKeySet,
  type JWK,
  type JWTPayload,
  jwtVerify,
  type JWTVerifyOptions,
} from "jose";
import type { AppConfig, JSPath } from "../config.ts";
import { jwtTokenInvalid, jwtTokenMissing, jwtTokenRequired, PgrstError } from "../errors.ts";

/** AppState.hs AuthResult + App.hs's derived `authenticated` flag. */
export interface AuthResult {
  /** Full JWT payload with the resolved "role" inserted (Auth.hs parseClaims). */
  claims: Record<string, unknown>;
  role: string;
  /** App.hs: `Just authRole /= configDbAnonRole`. */
  authed: boolean;
}

const SYMMETRIC_ALGS = ["HS256", "HS384", "HS512"];
const ALLOWED_SKEW_SECONDS = 30; // Auth.hs: set JWT.allowedSkew 30

export type ParsedSecret =
  | { kind: "symmetric"; key: Uint8Array }
  | { kind: "jwk"; jwk: JWK }
  | { kind: "jwks"; jwks: JSONWebKeySet };

/**
 * Ports Config.hs decodeSecret's base64 handling: accepts standard and
 * URL-safe alphabets (replaces -_. with +/=) and strips surrounding
 * whitespace. Throws on invalid base64, like PostgREST fails at startup.
 */
export function decodeBase64Secret(secret: string): Uint8Array {
  const normalized = secret.replaceAll("_", "/").replaceAll("-", "+").replaceAll(".", "=").trim();
  const binary = atob(normalized);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/**
 * Ports Config.hs parseSecret: JSON with "keys" → JWKS, JSON with "kty" →
 * single JWK, anything else → symmetric octets. Returns null when no secret
 * is configured (Auth.hs then throws JwtTokenMissing for non-empty tokens).
 */
export function parseSecret(config: AppConfig): ParsedSecret | null {
  if (config.jwtSecret === null) return null;
  const raw = config.jwtSecretIsBase64 ? decodeBase64Secret(config.jwtSecret) : new TextEncoder().encode(config.jwtSecret);
  try {
    const parsed = JSON.parse(new TextDecoder().decode(raw));
    if (parsed !== null && typeof parsed === "object") {
      if (Array.isArray((parsed as JSONWebKeySet).keys)) return { kind: "jwks", jwks: parsed as JSONWebKeySet };
      if (typeof (parsed as JWK).kty === "string") return { kind: "jwk", jwk: parsed as JWK };
    }
  } catch {
    // not JSON — plain symmetric secret
  }
  return { kind: "symmetric", key: raw };
}

/** Key-type-appropriate algorithms, like Haskell jose derives from the JWK. */
function jwkAlgs(jwk: JWK): string[] {
  if (jwk.alg) return [jwk.alg];
  switch (jwk.kty) {
    case "oct":
      return SYMMETRIC_ALGS;
    case "RSA":
      return ["RS256", "RS384", "RS512", "PS256", "PS384", "PS512"];
    case "EC":
      switch (jwk.crv) {
        case "P-256":
          return ["ES256"];
        case "P-384":
          return ["ES384"];
        case "P-521":
          return ["ES512"];
        case "secp256k1":
          return ["ES256K"];
        default:
          return [];
      }
    case "OKP":
      return ["EdDSA"];
    default:
      return [];
  }
}

/** Maps npm jose errors onto the messages Haskell jose's `show` produces. */
function joseErrorMessage(err: unknown, token: string): string {
  if (err instanceof joseErrors.JWTExpired) return "JWT expired";
  if (err instanceof joseErrors.JWTClaimValidationFailed) {
    if (err.claim === "aud") return "JWTNotInAudience";
    if (err.claim === "nbf") return "JWTNotYetValid";
    if (err.claim === "iat") return "JWTIssuedAtFuture";
    return err.message;
  }
  if (err instanceof joseErrors.JWSSignatureVerificationFailed) return "JWSError JWSInvalidSignature";
  if (err instanceof joseErrors.JWKSNoMatchingKey || err instanceof joseErrors.JWKSMultipleMatchingKeys) {
    return "JWSError JWSInvalidSignature";
  }
  if (err instanceof joseErrors.JWSInvalid || err instanceof joseErrors.JWTInvalid) {
    const parts = token.split(".").length;
    if (parts !== 3) {
      return `JWSError (CompactDecodeError Invalid number of parts: Expected 3 parts; got ${parts})`;
    }
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

async function verifyWithJwk(token: string, jwk: JWK, options: JWTVerifyOptions): Promise<JWTPayload> {
  const algs = jwkAlgs(jwk);
  const header = decodeProtectedHeader(token);
  if (typeof header.alg !== "string" || !algs.includes(header.alg)) {
    throw jwtTokenInvalid("JWSError JWSInvalidSignature");
  }
  const key = jwk.kty === "oct" && typeof jwk.k === "string" ? decodeBase64Secret(jwk.k) : await importJWK(jwk, header.alg);
  const { payload } = await jwtVerify(token, key, { ...options, algorithms: algs });
  return payload;
}

/**
 * Haskell jose tries every key in a JWKSet (including symmetric ones, which
 * npm jose's createLocalJWKSet rejects), so key selection is done here: keys
 * are filtered by kid/alg compatibility and tried until a signature matches.
 */
async function verifyWithJwks(token: string, jwks: JSONWebKeySet, options: JWTVerifyOptions): Promise<JWTPayload> {
  const header = decodeProtectedHeader(token);
  if (typeof header.alg !== "string") throw jwtTokenInvalid("JWSError JWSInvalidSignature");
  const alg = header.alg;
  const candidates = jwks.keys.filter(
    (k) =>
      jwkAlgs(k).includes(alg) &&
      (k.use === undefined || k.use === "sig") &&
      (k.kid === undefined || header.kid === undefined || k.kid === header.kid),
  );
  for (const jwk of candidates) {
    try {
      const key = jwk.kty === "oct" && typeof jwk.k === "string" ? decodeBase64Secret(jwk.k) : await importJWK(jwk, alg);
      const { payload } = await jwtVerify(token, key, { ...options, algorithms: [alg] });
      return payload;
    } catch (err) {
      // signature mismatch → try the next key; claim failures are final
      if (err instanceof joseErrors.JWSSignatureVerificationFailed) continue;
      throw err;
    }
  }
  throw jwtTokenInvalid("JWSError JWSInvalidSignature");
}

/** Ports Auth.hs parseToken's verification (validation settings + skew). */
async function verifyClaims(
  token: string,
  secret: ParsedSecret,
  config: AppConfig,
  currentDate?: Date,
): Promise<Record<string, unknown>> {
  const options: JWTVerifyOptions = {
    clockTolerance: ALLOWED_SKEW_SECONDS,
    ...(config.jwtAud !== null ? { audience: config.jwtAud } : {}),
    ...(currentDate !== undefined ? { currentDate } : {}),
  };
  let payload: JWTPayload;
  try {
    if (secret.kind === "symmetric") {
      ({ payload } = await jwtVerify(token, secret.key, { ...options, algorithms: SYMMETRIC_ALGS }));
    } else if (secret.kind === "jwk") {
      payload = await verifyWithJwk(token, secret.jwk, options);
    } else {
      payload = await verifyWithJwks(token, secret.jwks, options);
    }
  } catch (err) {
    if (err instanceof PgrstError) throw err;
    throw jwtTokenInvalid(joseErrorMessage(err, token));
  }
  // Haskell jose rejects iat in the future; npm jose does not check it.
  const nowSecs = (currentDate ?? new Date()).getTime() / 1000;
  if (typeof payload.iat === "number" && payload.iat > nowSecs + ALLOWED_SKEW_SECONDS) {
    throw jwtTokenInvalid("JWTIssuedAtFuture");
  }
  return payload as Record<string, unknown>;
}

/** Ports wai-extra extractBearerAuth: case-insensitive scheme, "" fallback. */
export function extractBearerAuth(header: string | null): string {
  if (header === null) return "";
  const match = header.match(/^(\S+)(\s*)(.*)$/s);
  if (!match) return "";
  const [, scheme, , rest] = match;
  if (scheme.toLowerCase() !== "bearer") return "";
  return rest;
}

/** Ports Auth.hs walkJSPath: object keys and array indexes only. */
export function walkJSPath(value: unknown, path: JSPath): unknown {
  let cur: unknown = value;
  for (const exp of path) {
    if (exp.kind === "key") {
      if (cur !== null && typeof cur === "object" && !Array.isArray(cur)) {
        cur = (cur as Record<string, unknown>)[exp.key];
      } else {
        return undefined;
      }
    } else {
      cur = Array.isArray(cur) ? cur[exp.idx] : undefined;
    }
    if (cur === undefined) return undefined;
  }
  return cur;
}

/** Ports Auth.hs parseClaims's `unquoted`: strings raw, other JSON encoded. */
function unquoted(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * Ports Auth.hs middleware + parseToken + parseClaims for one request.
 * `currentDate` is a test hook for clock-dependent validation.
 */
export async function authenticate(
  authHeader: string | null,
  config: AppConfig,
  currentDate?: Date,
): Promise<AuthResult> {
  const token = extractBearerAuth(authHeader);
  let claims: Record<string, unknown> = {};
  if (token !== "") {
    const secret = parseSecret(config);
    if (secret === null) throw jwtTokenMissing();
    claims = await verifyClaims(token, secret, config, currentDate);
  }
  const roleValue = walkJSPath(claims, config.jwtRoleClaimKey);
  const role = roleValue !== undefined ? unquoted(roleValue) : config.dbAnonRole ?? undefined;
  if (role === undefined) throw jwtTokenRequired();
  return {
    claims: { ...claims, role },
    role,
    authed: config.dbAnonRole === null || role !== config.dbAnonRole,
  };
}
