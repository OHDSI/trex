// Better Auth answers on a public path from here on, because the provider is
// one of its plugins and the discovery document's endpoint URLs are built from
// the base URL. Its own credential and session routes are NOT part of that
// contract — /trex/auth/v1 owns those, with trex's error codes and trex's
// requireAdmin in front — so anything outside the provider's own paths is 404.
import express from "express";
import { BASE_PATH } from "../../config.ts";
import { auth, JWKS_PATH } from "../better-auth.ts";
import {
  userInfoFailureBudget,
  normalizeForwardedFor,
  OIDC_RATE_LIMIT_WINDOW,
  oidcIssuer,
  trustedProxies,
} from "./config.ts";
import { createFailureBudget, isUserInfoRefusal } from "./userinfo-limit.ts";
import { createJwksLocalReadFetch, providerJwksUrl } from "./jwks-local-read.ts";
import {
  annotateLogoutConfirmation,
  type HintVerdict,
  hintFromRequest,
  logoutHintDiagnosis,
  logoutHintWasRejected,
} from "./logout-hint.ts";
import { compactVerify, createLocalJWKSet } from "npm:jose";
// Better Auth's own resolver, re-exported by better-auth/api, so this keys on
// exactly the address its rate limiter would have keyed on — including the
// trusted-proxy walk and the single-token rule.
import { getIP } from "better-auth/api";

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
    // x-forwarded-for is rewritten on the way in rather than anywhere further
    // down, because this is the last place trex holds the request before Better
    // Auth reads the header to key its rate limiter. config.ts's
    // normalizeForwardedFor carries the reasoning and the measurement.
    const norm = name.toLowerCase() === "x-forwarded-for" ? normalizeForwardedFor : (v: string) => v;
    if (Array.isArray(value)) for (const v of value) headers.append(name, norm(v));
    else headers.append(name, norm(value));
  }
  return headers;
}

/**
 * The budget a caller's FAILED /oauth2/userinfo requests draw on, which is not
 * the one a sign-in draws on. See userinfo-limit.ts for why it cannot be
 * expressed as a Better Auth rate-limit rule.
 *
 * Module scope so it survives between requests; built lazily so the environment
 * is read after boot has set it, and so a test can observe a fresh one.
 */
let userInfoFailures: ReturnType<typeof createFailureBudget> | null = null;
function userInfoBudget(): ReturnType<typeof createFailureBudget> {
  userInfoFailures ??= createFailureBudget(
    userInfoFailureBudget(),
    OIDC_RATE_LIMIT_WINDOW * 1000,
  );
  return userInfoFailures;
}

/** Test seam: drops the accumulated windows and re-reads the environment. */
export function _resetUserInfoBudget(): void {
  userInfoFailures = null;
}

/**
 * The key a caller's failures are counted under.
 *
 * Better Auth's own resolver, so this is the same address its rate limiter
 * keys on — and, with the header normalisation above, behind a Caddy that
 * forwards the peer there now IS one. Where there is not, every caller shares
 * one key, and that is the point rather than a shortfall: the shared bucket
 * that an attacker can exhaust is then the FAILURE bucket, and the successful
 * /oauth2/userinfo call every WebAPI sign-in makes never touches it.
 */
function userInfoKey(request: Request): string {
  const ip = getIP(request, { advanced: { ipAddress: { trustedProxies: trustedProxies() } } } as never);
  return `${ip ?? "no-trusted-ip"}|/oauth2/userinfo|failed`;
}

/**
 * Verifies the hint against trex's OWN key set, read locally.
 *
 * This is the whole diagnostic: the same token, the same keys, without the HTTP
 * round trip the provider makes. If it verifies here and not there, the fetch
 * is the only difference between them — which is a one-line reproduction of the
 * bug instead of a guess about certificates.
 *
 * Signature only, deliberately. The provider's own claim checks (iss, aud, sid,
 * sub) run after its verification and are not what fails here; re-implementing
 * them would create a second, drifting definition of a valid hint.
 */
async function verifyHintLocally(hint: string): Promise<HintVerdict> {
  try {
    const jwks = await auth.api.getJwks();
    await compactVerify(hint, createLocalJWKSet(jwks as Parameters<typeof createLocalJWKSet>[0]));
    return "signature-valid";
  } catch (e) {
    // Distinguish "the token is bad" from "trex could not look", because the
    // two point at completely different people.
    const name = (e as Error)?.name ?? "";
    if (name.startsWith("JWS") || name.startsWith("JWK") || name === "JOSEError") {
      return "signature-invalid";
    }
    return "unverifiable";
  }
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

    // The check is ahead of Better Auth so a refused caller never reaches its
    // rate limiter, which is the whole point: one WebAPI sign-in costs one
    // /oauth2/userinfo call, and that call must not be competing for budget
    // with somebody else's failures.
    const isUserInfo = path.startsWith("/oauth2/userinfo");
    const budgetKey = isUserInfo ? userInfoKey(request) : "";
    if (isUserInfo && userInfoBudget().overBudget(budgetKey)) {
      const retryAfter = userInfoBudget().retryAfter(budgetKey);
      if (retryAfter > 0) res.setHeader("Retry-After", String(retryAfter));
      // Counted, so a caller that keeps hammering stays refused for the whole
      // window instead of being forgiven by the refusal itself.
      userInfoBudget().record(budgetKey);
      // The endpoint's own OAuth error shape rather than Better Auth's
      // `{"message":…}`, so a relying party can tell throttling from a bad
      // token.
      res.status(429).json({
        error: "invalid_request",
        error_description:
          "Too many failed userinfo requests from this client. Retry later.",
      });
      return;
    }

    let rejectedHintVerdict: HintVerdict | null = null;
    const response = await auth.handler(request);

    // Charged only on a refusal. A successful sign-in's call is a 200 and costs
    // nothing, so no amount of real traffic can throttle real traffic.
    if (isUserInfo && isUserInfoRefusal(response.status)) userInfoBudget().record(budgetKey);

    // RP-initiated logout clears trex's own cookie as well. The deleted
    // router.ts did this unconditionally on its end-session route
    // (router.ts:448-457), and the plugin cannot: sb-access-token is trex's,
    // not Better Auth's, and /auth/v1/logout — the only other place it is
    // cleared — is not on this path. Without it a browser that logs out through
    // the relying party keeps a bearer that same-origin iframes still read.
    const isEndSession = path.startsWith("/oauth2/end-session");
    if (isEndSession) {
      res.clearCookie("sb-access-token", { path: "/" });
    }

    // A hint the provider could not verify is otherwise SILENT: to a browser it
    // produces the same "Confirm logout" page as no hint at all, so a user who
    // should have been returned to their application just sees a button, and an
    // operator sees nothing. logout-hint.ts carries the cause and why no
    // configuration fixes it.
    const hint = isEndSession ? hintFromRequest(req.originalUrl, body) : null;
    if (hint && logoutHintWasRejected(response.status, response.headers.getSetCookie())) {
      const verdict = await verifyHintLocally(hint);
      console.error(`[oidc] end-session: id_token_hint rejected — ${logoutHintDiagnosis(verdict)}`);
      // For a programmatic caller, which never sees the page.
      res.setHeader("X-Trex-Logout-Hint", `rejected; local-verification=${verdict}`);
      rejectedHintVerdict = verdict;
    }

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
    const payload = Buffer.from(await response.arrayBuffer());
    if (
      rejectedHintVerdict &&
      (response.headers.get("content-type") ?? "").includes("text/html")
    ) {
      const annotated = annotateLogoutConfirmation(payload.toString("utf8"), rejectedHintVerdict);
      // Content-Length was set from the original body by the header copy above.
      res.setHeader("Content-Length", String(Buffer.byteLength(annotated)));
      res.send(annotated);
      return;
    }
    res.send(payload);
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

/**
 * Where the guard publishes the adapter's original `findUserById`.
 *
 * `Symbol.for` so both sides name the same symbol without sharing an import.
 */
export const UNGUARDED_FIND_USER_BY_ID = Symbol.for("trex.auth.unguardedFindUserById");

export async function installSoftDeleteGuard(): Promise<void> {
  const ctx = await auth.$context;
  const adapter = ctx.internalAdapter as unknown as Record<string | symbol, unknown>;
  if (adapter[GUARD_INSTALLED]) return;

  // Banned as well as soft-deleted. They are two ways trex retires an account
  // and the provider has never distinguished them: the deleted router.ts
  // refused a banned user at /authorize outright (router.ts:104-110, 225-233),
  // and trex's ban procedure revoked the OIDC refresh tokens because they lived
  // in trexdb.refresh_token, which auth-router.ts's ban handler deletes. The
  // provider's refresh tokens live in trexdb."oauthRefreshToken" instead, and
  // nothing revokes those — so without this a ban leaves the OIDC session
  // renewing itself forever, after every other door has been shut.
  //
  // `banned` is on the row already: the admin() plugin declares it, so the
  // adapter selects it, exactly as better-auth.ts's additionalFields do for
  // deletedAt.
  const isRetired = (user: unknown) => {
    const u = user as { deletedAt?: unknown; banned?: unknown } | null;
    return Boolean(u && (u.deletedAt || u.banned));
  };

  const findUserById = ctx.internalAdapter.findUserById.bind(ctx.internalAdapter);
  const findSession = ctx.internalAdapter.findSession.bind(ctx.internalAdapter);

  // The unguarded lookup, kept reachable for the one caller that must still see
  // a banned account: the admin API that UNBANS it. Without this the guard is a
  // one-way door — `PUT /admin/users/:id {banned:false}` answers 404 for
  // precisely the users it exists to reinstate. Published under a global symbol
  // rather than exported, so auth-router.ts can reach it without importing this
  // module and closing an import cycle.
  adapter[UNGUARDED_FIND_USER_BY_ID] = findUserById;

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
/**
 * Answers the provider's own key-set request without letting it reach the
 * network. jwks-local-read.ts carries the upstream inconsistency this works
 * around and why `jwks.remoteUrl` cannot be used instead.
 *
 * Installed once, at mount time rather than per request: the provider issues
 * this request from inside its own handler, so installing and removing a
 * wrapper around each call would race between two concurrent logouts. Mount
 * time also keeps it out of unit tests that merely import this module.
 */
function installJwksLocalRead(): void {
  const realFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = createJwksLocalReadFetch({
    jwksUrl: providerJwksUrl(oidcIssuer(), JWKS_PATH),
    readJwks: () => auth.api.getJwks(),
    realFetch,
    onError: (error) =>
      console.error(
        "[oidc] reading the key set locally failed; falling back to the network " +
          "request the provider would have made:",
        error,
      ),
  });
}

export async function mountOidcProvider(app: express.Application): Promise<void> {
  installJwksLocalRead();
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
