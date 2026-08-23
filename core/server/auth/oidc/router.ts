// OIDC provider endpoints.
//
// Authorization-code flow with PKCE, which is what an existing relying party
// (Atlas, a Spring OAuth2 client) already knows how to speak. The native IdP in
// auth-router.ts stays as it is: this sits beside it and reuses its user store
// and its browser session cookie rather than introducing a second one.
//
// trex deliberately hosts no login UI. When /authorize has no session it sends
// the browser to TREX_OIDC_LOGIN_URL with a return_to, so the deployment owns
// the login page and trex owns the protocol.

import { Router } from "express";
import express from "express";
import { pool } from "../../db.ts";
import { verifyAccessToken } from "../jwt.ts";
import { apiLimiter, authLimiter } from "../../middleware/rate-limit.ts";
import {
  getClient,
  grantedScopes,
  isPublicClient,
  isRegisteredPostLogoutUri,
  isRegisteredRedirectUri,
  verifyClientSecret,
} from "./clients.ts";
import { consumeCode, issueCode, verifyPkce } from "./codes.ts";
import {
  DEFAULT_ID_TOKEN_TTL_SECONDS,
  type IdTokenUser,
  signIdToken,
  verifyIdToken,
} from "./id-token.ts";
import { getJwks } from "./keys.ts";
import { issuerUrl, loginUrl, oidcProviderEnabled, readCookie } from "./config.ts";

export { issuerUrl, oidcProviderEnabled, readCookie };

export const router = Router();

interface DbUserRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  emailVerified: boolean | null;
}

async function fetchUser(id: string): Promise<IdTokenUser | null> {
  const result = await pool.query<DbUserRow>(
    `SELECT id, email, name, role, "emailVerified"
       FROM trexdb."user" WHERE id = $1 AND "deletedAt" IS NULL`,
    [id],
  );
  if (!result.rows.length) return null;
  const row = result.rows[0];

  const roles = await pool.query<{ name: string }>(
    `SELECT r.name
       FROM trexdb.user_role ur
       JOIN trexdb.role r ON r.id = ur."roleId"
      WHERE ur."userId" = $1
      ORDER BY r.name`,
    [id],
  );

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    appRoles: roles.rows.map((r) => r.name),
    emailVerified: Boolean(row.emailVerified),
  };
}

/** The session the native IdP sets in sync-cookie; no second session concept. */
async function userIdFromSession(req: express.Request): Promise<string | null> {
  const token = readCookie(req.headers.cookie, "sb-access-token");
  if (!token) return null;
  const claims = await verifyAccessToken(token);
  if (!claims || claims.role === "anon" || claims.role === "service_role") return null;
  return claims.sub ?? null;
}

/** Errors go back to the client via redirect, per spec — never rendered by trex. */
function redirectError(
  res: express.Response,
  redirectUri: string,
  error: string,
  state: string | undefined,
  description?: string,
) {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  if (description) url.searchParams.set("error_description", description);
  if (state) url.searchParams.set("state", state);
  res.redirect(302, url.toString());
}

export function registerOidcRoutes(basePath: string) {
  const issuer = issuerUrl(undefined, basePath);

  router.get("/.well-known/openid-configuration", (_req, res) => {
    res.json({
      issuer,
      authorization_endpoint: `${issuer}/oidc/authorize`,
      token_endpoint: `${issuer}/oidc/token`,
      userinfo_endpoint: `${issuer}/oidc/userinfo`,
      jwks_uri: `${issuer}/oidc/.well-known/jwks.json`,
      end_session_endpoint: `${issuer}/oidc/session/end`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
      scopes_supported: ["openid", "profile", "email"],
      token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic", "none"],
      code_challenge_methods_supported: ["S256"],
      claims_supported: [
        "iss", "sub", "aud", "exp", "iat", "auth_time", "nonce",
        "email", "email_verified", "name", "trex_role",
      ],
    });
  });

  router.get("/.well-known/jwks.json", async (_req, res) => {
    try {
      res.json(await getJwks());
    } catch (err) {
      console.error("[oidc] jwks error:", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  router.get("/authorize", authLimiter, async (req, res) => {
    try {
      const { client_id, redirect_uri, response_type, scope, state, nonce } = req.query as Record<
        string,
        string | undefined
      >;

      const client = await getClient(client_id ?? "");
      // Nothing is redirected until the client and its redirect_uri are known
      // to be registered: bouncing an error to an unverified URI would make
      // trex an open redirector.
      if (!client) {
        res.status(400).json({ error: "invalid_client" });
        return;
      }
      if (!redirect_uri || !isRegisteredRedirectUri(client, redirect_uri)) {
        res.status(400).json({ error: "invalid_request", error_description: "unregistered redirect_uri" });
        return;
      }

      if (response_type !== "code") {
        redirectError(res, redirect_uri, "unsupported_response_type", state);
        return;
      }

      const scopes = grantedScopes(client, scope ?? "openid");
      if (!scopes.includes("openid")) {
        redirectError(res, redirect_uri, "invalid_scope", state, "openid scope is required");
        return;
      }

      const challenge = (req.query.code_challenge as string | undefined) ?? null;
      const challengeMethod = (req.query.code_challenge_method as string | undefined) ?? null;
      if (client.requirePkce && !challenge) {
        redirectError(res, redirect_uri, "invalid_request", state, "code_challenge is required");
        return;
      }
      if (challenge && challengeMethod !== "S256") {
        redirectError(res, redirect_uri, "invalid_request", state, "only S256 is supported");
        return;
      }

      const userId = await userIdFromSession(req);
      if (!userId) {
        const login = loginUrl();
        if (!login) {
          redirectError(res, redirect_uri, "login_required", state);
          return;
        }
        const target = new URL(login);
        target.searchParams.set("return_to", `${issuer}${req.originalUrl}`);
        res.redirect(302, target.toString());
        return;
      }

      const { code } = await issueCode({
        clientId: client.clientId,
        userId,
        redirectUri: redirect_uri,
        scope: scopes.join(" "),
        nonce: nonce ?? null,
        codeChallenge: challenge,
        codeChallengeMethod: challengeMethod,
      });

      const back = new URL(redirect_uri);
      back.searchParams.set("code", code);
      if (state) back.searchParams.set("state", state);
      res.redirect(302, back.toString());
    } catch (err) {
      console.error("[oidc] authorize error:", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  router.post("/token", authLimiter, express.urlencoded({ extended: false }), async (req, res) => {
    try {
      const body = req.body ?? {};
      if (body.grant_type !== "authorization_code") {
        res.status(400).json({ error: "unsupported_grant_type" });
        return;
      }

      // Basic auth is the spec's preferred client authentication; the form
      // fields are the common alternative. Both are accepted.
      let clientId: string | undefined = body.client_id;
      let clientSecret: string | undefined = body.client_secret;
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Basic ")) {
        const [id, secret] = atob(authHeader.slice(6)).split(":");
        clientId = clientId ?? id;
        clientSecret = clientSecret ?? secret;
      }

      const client = await getClient(clientId ?? "");
      if (!client) {
        res.status(401).json({ error: "invalid_client" });
        return;
      }
      if (!isPublicClient(client) && !(await verifyClientSecret(client, clientSecret))) {
        res.status(401).json({ error: "invalid_client" });
        return;
      }

      const consumed = await consumeCode(body.code ?? "");
      if (!consumed.ok) {
        res.status(400).json({ error: "invalid_grant", error_description: consumed.reason });
        return;
      }
      const record = consumed.record;

      // The code is bound to the client and redirect_uri it was issued for.
      if (record.clientId !== client.clientId || record.redirectUri !== body.redirect_uri) {
        res.status(400).json({ error: "invalid_grant" });
        return;
      }
      if (!(await verifyPkce(record, body.code_verifier))) {
        res.status(400).json({ error: "invalid_grant", error_description: "pkce verification failed" });
        return;
      }

      const user = await fetchUser(record.userId);
      if (!user) {
        res.status(400).json({ error: "invalid_grant", error_description: "user no longer exists" });
        return;
      }

      const scopes = record.scope.split(/\s+/).filter(Boolean);
      const idToken = await signIdToken(user, {
        issuer,
        audience: client.clientId,
        nonce: record.nonce,
        scopes,
      });

      res.json({
        // The id_token is the assertion of identity; it doubles as the access
        // token here because trex exposes no separate OIDC-scoped resource API.
        access_token: idToken,
        id_token: idToken,
        token_type: "Bearer",
        expires_in: DEFAULT_ID_TOKEN_TTL_SECONDS,
        scope: record.scope,
      });
    } catch (err) {
      console.error("[oidc] token error:", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  // RP-initiated logout. trex owns the session cookie the flow depends on, so it
  // is cleared here; the relying party clears its own and sends the browser on.
  router.get("/session/end", apiLimiter, async (req, res) => {
    try {
      const requested = req.query.post_logout_redirect_uri as string | undefined;
      const clientId = req.query.client_id as string | undefined;
      const state = req.query.state as string | undefined;

      // Cleared unconditionally: logging out must not depend on the caller
      // getting its redirect parameters right.
      res.clearCookie("sb-access-token", { path: "/" });

      if (!requested) {
        res.status(204).end();
        return;
      }

      // Only a URI the client registered is honoured — the same reasoning as
      // redirect_uri at /authorize, since this one also takes a browser
      // somewhere on trex's say-so.
      const client = clientId ? await getClient(clientId) : null;
      if (!client || !isRegisteredPostLogoutUri(client, requested)) {
        res.status(400).json({
          error: "invalid_request",
          error_description: "unregistered post_logout_redirect_uri",
        });
        return;
      }

      const target = new URL(requested);
      if (state) target.searchParams.set("state", state);
      res.redirect(302, target.toString());
    } catch (err) {
      console.error("[oidc] end session error:", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  router.get("/userinfo", apiLimiter, async (req, res) => {
    try {
      const header = req.headers.authorization;
      if (!header?.startsWith("Bearer ")) {
        res.status(401).json({ error: "invalid_token" });
        return;
      }
      // Verified, not merely decoded: the signature is what makes the subject
      // trustworthy. The user is then read back from the store so a token that
      // outlived its account returns nothing.
      const claims = await verifyIdToken(header.slice(7), issuer);
      if (!claims) {
        res.status(401).json({ error: "invalid_token" });
        return;
      }

      const user = await fetchUser(claims.sub);
      if (!user) {
        res.status(401).json({ error: "invalid_token" });
        return;
      }

      res.json({
        sub: user.id,
        email: user.email,
        email_verified: Boolean(user.emailVerified),
        name: user.name ?? undefined,
        trex_role: user.role,
      });
    } catch (err) {
      console.error("[oidc] userinfo error:", err);
      res.status(500).json({ error: "server_error" });
    }
  });

  return router;
}
