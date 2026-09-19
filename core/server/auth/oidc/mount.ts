// Better Auth answers on a public path from here on, because the provider is
// one of its plugins and the discovery document's endpoint URLs are built from
// the base URL. Its own credential and session routes are NOT part of that
// contract — /trex/auth/v1 owns those, with trex's error codes and trex's
// requireAdmin in front — so anything outside the provider's own paths is 404.
import express from "express";
import { BASE_PATH } from "../../config.ts";
import { auth } from "../better-auth.ts";
import { oidcIssuer } from "./config.ts";

const MOUNT_PATH = `${BASE_PATH}/oidc`;

/**
 * The provider's own surface, and nothing else. `/oauth2/` covers the protocol
 * endpoints; `/.well-known/` covers the discovery document and the JWKS. Better
 * Auth's `/sign-in/email`, `/sign-up/email`, `/get-session` and the plugin's
 * `/admin/oauth2/*` client administration all fall outside both.
 */
const PROVIDER_PREFIXES = ["/oauth2/", "/.well-known/"];

/**
 * A token request is a handful of form fields and a client assertion at worst.
 * The cap is here because the mount deliberately sits in front of trex's body
 * middleware — the provider needs the bytes as they arrived, and the March
 * removal of Better Auth recorded body-parsing collisions as the reason — so
 * nothing else is limiting what an anonymous caller may send.
 */
const MAX_BODY_BYTES = 1024 * 1024;

async function readBody(req: express.Request): Promise<Buffer | undefined> {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  // Something upstream may already have consumed the stream; honour what it
  // left rather than hanging on a stream that will never emit.
  const parsed = (req as unknown as { body?: unknown }).body;
  if (Buffer.isBuffer(parsed)) return parsed;
  if (typeof parsed === "string") return Buffer.from(parsed);

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req as unknown as AsyncIterable<Buffer | string>) {
    const c = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += c.length;
    if (total > MAX_BODY_BYTES) throw new Error("body too large");
    chunks.push(c);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

function toHeaders(req: express.Request): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const v of value) headers.append(name, v);
    else headers.append(name, value);
  }
  return headers;
}

export function oidcHandler(): express.RequestHandler {
  return async (req, res) => {
    const path = new URL(req.originalUrl, "http://localhost").pathname.slice(MOUNT_PATH.length);
    if (!PROVIDER_PREFIXES.some((p) => path.startsWith(p))) {
      res.status(404).json({ error: "not_found" });
      return;
    }

    let body: Buffer | undefined;
    try {
      body = await readBody(req);
    } catch {
      res.status(413).json({ error: "invalid_request", error_description: "Body too large" });
      return;
    }

    // The pre-March bridge: build a web Request by hand, because Deno is not an
    // officially listed integration. originalUrl, not url: the discovery
    // document is served from an onRequest hook that reads the pathname
    // (dist/authorize-riRRCSbC.mjs:4227) and better-call routes on the base
    // URL's pathname, while Express has already stripped the mount prefix off
    // req.url.
    const request = new Request(
      new URL(req.originalUrl, `${req.protocol}://${req.get("host")}`),
      { method: req.method, headers: toHeaders(req), body },
    );

    const response = await auth.handler(request);
    res.status(response.status);
    // Set-Cookie is the one header that legitimately repeats, and Headers
    // folds repeats into one comma-joined value — which turns two cookies into
    // one unparseable one. getSetCookie is the only reader that keeps them
    // apart.
    for (const cookie of response.headers.getSetCookie()) res.append("Set-Cookie", cookie);
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") return;
      res.setHeader(key, value);
    });
    res.send(Buffer.from(await response.arrayBuffer()));
  };
}

/**
 * Refuses a soft-deleted account everywhere Better Auth resolves one.
 *
 * The provider reaches `internalAdapter.findUserById` from all three token
 * paths — the code exchange (dist/introspect-njKASm3q.mjs:2017), the refresh
 * grant (:2166) and /userinfo (:1227) — and carries no `deletedAt` predicate of
 * its own, where the router this replaces selected `... AND "deletedAt" IS
 * NULL`. `findSession` is the fourth door: /oauth2/authorize authenticates on
 * the engine session and never reads the user by id, so without it a retired
 * account still gets an authorization code (which would then fail to exchange).
 *
 * Wrapped here rather than anywhere tidier for two reasons that are both
 * structural:
 *
 * - A Better Auth plugin cannot do it. `runPluginInit` rebuilds
 *   `context.internalAdapter` *after* every plugin's `init` has run
 *   (better-auth@1.7.5 context/helpers.ts), so anything a plugin puts there is
 *   discarded. There is no read-side database hook either — `databaseHooks`
 *   covers create/update/delete only.
 * - Revoking at soft-delete time is not available to trex. The soft delete is
 *   `trexdb.soft_delete_user()`, a SQL function V1 installs and nothing in this
 *   codebase calls; the caller is d2e. Phase 1's `endEngineSessions` covers the
 *   paths trex does own, and even there it cannot reach an
 *   `oauthRefreshToken` row that has already been issued.
 *
 * `deletedAt` is read off the row Better Auth already returned rather than
 * re-queried: better-auth.ts declares it as a user additional field precisely
 * so the adapter selects it.
 *
 * Idempotent, because the mount and the tests both install it.
 */
const GUARD_INSTALLED = Symbol.for("trex.oidc.softDeleteGuard");

export async function installSoftDeleteGuard(): Promise<void> {
  const ctx = await auth.$context;
  const adapter = ctx.internalAdapter as unknown as Record<string | symbol, unknown>;
  if (adapter[GUARD_INSTALLED]) return;

  const isRetired = (user: unknown) =>
    Boolean(user && (user as { deletedAt?: unknown }).deletedAt);

  const findUserById = ctx.internalAdapter.findUserById.bind(ctx.internalAdapter);
  const findSession = ctx.internalAdapter.findSession.bind(ctx.internalAdapter);

  adapter.findUserById = async (...args: Parameters<typeof findUserById>) => {
    const user = await findUserById(...args);
    return isRetired(user) ? null : user;
  };
  adapter.findSession = async (...args: Parameters<typeof findSession>) => {
    const found = await findSession(...args);
    return found && isRetired(found.user) ? null : found;
  };
  adapter[GUARD_INSTALLED] = true;
}

/**
 * Registers the provider on an Express app. Awaited by index.ts rather than
 * fired and forgotten: the guard above has to be in place before the first
 * request, and a request cannot arrive before `server.listen`.
 */
export async function mountOidcProvider(app: express.Application): Promise<void> {
  await installSoftDeleteGuard();
  // Mounted BEFORE the global body buffering, which is the most likely cause of
  // the body-parsing issues recorded when Better Auth was removed in March.
  app.use(MOUNT_PATH, oidcHandler());
}

export interface OidcTestServer {
  /** The mount's public prefix, equal to the issuer in path but not in origin. */
  url: string;
  /** What the discovery document must call itself. */
  issuer: string;
  close(): Promise<void>;
}

/**
 * Stands the mount up on a real listener, because the two things this phase
 * most needs to assert — the pathname the discovery hook matches on, and what
 * Express leaves in `req.url` — only exist once a request has been through
 * Express. Tasks 1 and 2 called `auth.handler()` directly and could see
 * neither.
 *
 * 127.0.0.1 rather than the wildcard: the ephemeral range contains Postgres's
 * port, and a wildcard bind can take it while Postgres keeps the traffic.
 */
export async function startOidcServer(): Promise<OidcTestServer> {
  const app = express();
  await mountOidcProvider(app);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const { port } = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${port}${MOUNT_PATH}`,
    issuer: oidcIssuer(),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
