import { Router } from "express";
import express from "express";
// isAPIError, never `instanceof APIError`. Better Auth raises a body-schema
// failure from better-call, which throws better-call's own APIError, and the
// class better-auth exports merely extends it — so an instanceof check on the
// subclass is false for exactly the errors a malformed request produces, and
// they would be re-thrown as 500s. The name-based test also survives two copies
// of @better-auth/core on disk, which an identity check would not.
import { isAPIError } from "better-auth/api";
import { pool } from "../db.ts";
import {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} from "./jwt.ts";
import { hashPassword } from "./password.ts";
import { authLimiter, apiLimiter } from "../middleware/rate-limit.ts";
import { isRefreshTokenExpired } from "./refresh-token-ttl.ts";
import { loadExternalProviders } from "./settings-providers.ts";
import { nativePasswordLoginEnabled } from "./federation/config.ts";
import { requireAdmin } from "./require-admin.ts";
import { IDP_METADATA_KEY } from "./oidc/claims.ts";
import { isEngineAddressable } from "./engine-address.ts";
// Re-exported, not merely imported. V17's twin-of comment and the parity tests
// both name this module as where the predicate lives, and the federation admin
// API needs the same rule without loading this router — so the definition moved
// to engine-address.ts and the name stays exported from here.
export { isEngineAddressable };

const router = Router();
router.use(express.json());

// ── Helpers ──────────────────────────────────────────────────────────────────

interface DbUser {
  id: string;
  name: string;
  // NULL for a federated user whose upstream asserted no address (V14). The
  // key stays in every response that carries it, with a null value: a client
  // reading `user.email` gets "absent", never the string "null".
  email: string | null;
  image: string | null;
  role: string;
  banned: boolean;
  emailVerified: boolean;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  mustChangePassword: boolean;
  user_metadata: Record<string, unknown>;
  app_metadata: Record<string, unknown>;
  password_hash: string | null;
  createdAt: string;
  updatedAt: string;
}

function toGoTrueUser(u: DbUser) {
  return {
    id: u.id,
    aud: "authenticated",
    role: "authenticated",
    email: u.email,
    email_confirmed_at: u.email_confirmed_at || null,
    last_sign_in_at: u.last_sign_in_at || null,
    app_metadata: {
      provider: "email",
      providers: ["email"],
      trex_role: u.role,
      ...(u.app_metadata || {}),
    },
    user_metadata: {
      name: u.name,
      image: u.image,
      must_change_password: u.mustChangePassword,
      ...(u.user_metadata || {}),
    },
    identities: [],
    created_at: u.createdAt,
    updated_at: u.updatedAt,
  };
}

// Exported for the federation callback, which finishes an upstream sign-in by
// issuing the very same session this grant issues.
export async function createTokenResponse(user: DbUser, sessionId?: string, res?: any) {
  const sid = sessionId || crypto.randomUUID();
  const accessToken = await signAccessToken(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      user_metadata: {
        name: user.name,
        image: user.image,
        must_change_password: user.mustChangePassword,
      },
    },
    sid,
  );

  const refreshToken = generateRefreshToken();
  const tokenHash = await hashRefreshToken(refreshToken);

  await pool.query(
    `INSERT INTO trexdb.refresh_token (token_hash, "userId", session_id) VALUES ($1, $2, $3)`,
    [tokenHash, user.id, sid],
  );

  const expiresAt = Math.floor(Date.now() / 1000) + 3600;

  // sb-access-token cookie lets same-origin iframes (Studio) pick up auth.
  // CSRF: SameSite=Lax is the only protection — adding SameSite=None requires an anti-CSRF token first.
  if (res) {
    const forwardedProto = res.req?.headers?.["x-forwarded-proto"];
    const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
    const secure =
      Deno.env.get("TREX_FORCE_SECURE_COOKIES") === "1" ||
      res.req?.protocol === "https" ||
      proto === "https";
    res.cookie("sb-access-token", accessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 3600 * 1000,
    });
  }

  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: refreshToken,
    user: toGoTrueUser(user),
  };
}

/**
 * The engine, resolved on use rather than imported at the top of the file:
 * better-auth.ts derives its secret from TREX_ROOT_KEY while it evaluates, and
 * this module is pulled in by callers that arrange that variable only
 * afterwards.
 */
async function engine() {
  return (await import("./better-auth.ts")).auth;
}

/** The engine's request-independent internals: its data access and its hasher. */
async function engineContext() {
  return await (await engine()).$context;
}

/** Where users and accounts now live. */
async function engineAdapter() {
  return (await engineContext()).internalAdapter;
}

/**
 * The user holding this address, matched the way federation already matches it:
 * case-insensitively, because `Victim@corp.com` and `victim@corp.com` are one
 * mailbox and so one identity.
 *
 * This being case-SENSITIVE was half of an account takeover. /signup uses it as
 * its duplicate check and V1's UNIQUE(email) was case-sensitive too, so with
 * self-registration on an attacker could register a case variant of a victim's
 * address; the victim's next federated sign-in then lower-matched (see
 * findLinkCandidateByEmail) and could link their verified upstream identity
 * onto the attacker's row. V17's unique index on lower(email) is what makes
 * this match at most one user.
 *
 * DELIBERATELY NOT the engine's findUserByEmail, which lower-cases the address
 * it was given and then matches it exactly. That resolves a stored spelling
 * only once canonicaliseLoginAddress has folded it — and canonicalisation runs
 * after this lookup, because it needs the row this lookup finds. Handing the
 * question to the engine would therefore lock out precisely the accounts the
 * fold exists to rescue, and would drop the soft-delete and ban pre-checks that
 * keep a retired row from reaching the engine at all.
 */
async function fetchUserByEmail(email: string): Promise<DbUser | null> {
  const result = await pool.query(
    `SELECT id, name, email, image, role, banned, "emailVerified", email_confirmed_at,
            last_sign_in_at, "mustChangePassword", user_metadata, app_metadata,
            password_hash, "createdAt", "updatedAt"
     FROM trexdb."user" WHERE lower(email) = lower($1) AND "deletedAt" IS NULL`,
    [email],
  );
  return result.rows[0] || null;
}

/**
 * Every read of a user by subject in this router, answered by the engine.
 *
 * The columns trex serves are all declared as additionalFields in
 * better-auth.ts, so the row comes back whole rather than as Better Auth's own
 * eight fields — the GoTrue body is pinned to the literal object, and a missing
 * user_metadata or email_confirmed_at would be visible on the wire.
 *
 * The soft-delete filter is trex's and stays trex's: the engine will happily
 * return a row V1's delete_user() retired, so the marker is declared on the
 * user model purely to be tested here. Without it a deleted account answers
 * GET /user, changes its own password and is visible to the admin block.
 */
async function fetchUserById(id: string): Promise<DbUser | null> {
  const user = await (await engineAdapter()).findUserById(id) as
    | (DbUser & { deletedAt: Date | null })
    | null;
  return !user || user.deletedAt ? null : user;
}

/**
 * The account's password, in whichever of its two homes holds one:
 * user.password_hash is the pre-V17 column and account.password is where the
 * engine keeps it. Returning null is what distinguishes an account with no
 * credential from a wrong password, which /change-password is pinned to report
 * as two different sentences — the engine reports both the same way.
 *
 * THE TWO SIDES TRUST DIFFERENT COLUMNS, AND THAT IS DELIBERATE.
 * This resolves user.password_hash first and falls back to account.password.
 * authenticateUser signs in, and a sign-in reads account.password and nothing
 * else. So /change-password judges the current password by the user column
 * while /token judges it by the account column.
 *
 * They can disagree in one direction only: account current, user stale. What
 * produces it is a node that has not restarted into 5a48ab98 serving PUT /user
 * with both a password and an address that collides — that code wrote the
 * credential first and the user row after, so the row update failed and left
 * the new password on account.password alone. Nothing produces the reverse:
 * adoptLegacyCredential fills account.password only while it IS NULL, and every
 * path here writes both columns together.
 *
 * The consequence is not a lockout, it is the opposite, and that is why it is
 * written down: the superseded password goes on authorizing a password change
 * while the working one is refused. A password the account holder believes they
 * replaced can still be presented to /change-password. It heals on the next
 * successful change or admin reset — both go through writePassword, which sets
 * the two columns in one transaction — and the window needs a pre-5a48ab98 node
 * still serving traffic.
 *
 * Preferring account.password here is not the fix: the wire contract pins the
 * user column working beside a stale credential, because that is the state a
 * node not yet restarted into V17 still writes. PHASE 2 MUST REVISIT THIS if
 * Better Auth's own change-password or reset endpoints are ever mounted. Those
 * write account.password alone, so the split stops being a transitional
 * artefact of the rollout and becomes permanent.
 */
async function storedPasswordHash(
  userId: string,
  userPasswordHash: string | null,
): Promise<string | null> {
  if (userPasswordHash) return userPasswordHash;

  const result = await pool.query(
    `SELECT password FROM trexdb.account WHERE "userId" = $1 AND "providerId" = 'credential'`,
    [userId],
  );
  return result.rows[0]?.password || null;
}

// ── The credential, and the engine that verifies it ─────────────────────────

/**
 * Write a password where the engine reads it.
 *
 * Better Auth takes the credential from account.password, so that row is what a
 * password change has to land on. Every route below used to UPDATE it, which
 * silently changed nothing for a user who had no credential row yet — a
 * federated account setting its first password, or a row written by a path that
 * predates V17. The new password went only to user.password_hash, so the moment
 * sign-in moved to the engine the old password kept working and the new one did
 * not. An upsert cannot miss.
 *
 * `db` is the caller's transaction wherever the same request also writes
 * user.password_hash. account.password is the column sign-in reads, so a
 * credential that outlives a failed request is not a stale mirror — it is the
 * password, rotated by a request that answered 500 and told the caller nothing
 * had happened.
 */
// deno-lint-ignore no-explicit-any
async function writeCredential(userId: string, hash: string, db: any = pool) {
  await db.query(
    `INSERT INTO trexdb.account (id, "userId", "accountId", "providerId", password, "createdAt", "updatedAt")
     VALUES ($1, $2, $2, 'credential', $3, NOW(), NOW())
     ON CONFLICT ("providerId", "accountId")
       DO UPDATE SET password = EXCLUDED.password, "updatedAt" = NOW()`,
    [crypto.randomUUID(), userId, hash],
  );
}

/**
 * V17 moved every password it found onto account.password. A row can still
 * carry one only on user.password_hash — written by a node that had not
 * restarted into this code, or by a fixture — and to the engine that account
 * simply has no password, which it reports as a wrong one. Filled in on the way
 * past, never overwritten: a credential that is already there is the current
 * one, and user.password_hash is only a mirror of it.
 *
 * Copied rather than re-hashed. The stored value is trex's own scrypt, which
 * better-auth.ts's hooks verify unchanged, so re-hashing would spend a second
 * scrypt to arrive at an equivalent string.
 *
 * DELIBERATELY BEFORE THE PASSWORD IS CHECKED, so an unauthenticated request
 * can cause this write. It has to be: the engine is what verifies, and it
 * cannot verify a credential it cannot see. The write is bounded and
 * idempotent — one row per user, whose contents are a copy of a column that
 * account already mirrors, carrying no information the requester supplied — and
 * the route is behind authLimiter. It is accepted, not overlooked. Anything
 * added here that is unbounded, or that records what an anonymous caller sent,
 * would be a different question.
 */
async function adoptLegacyCredential(user: DbUser) {
  if (!user.password_hash) return;
  await pool.query(
    `INSERT INTO trexdb.account (id, "userId", "accountId", "providerId", password, "createdAt", "updatedAt")
     VALUES ($1, $2, $2, 'credential', $3, NOW(), NOW())
     ON CONFLICT ("providerId", "accountId")
       DO UPDATE SET password = EXCLUDED.password, "updatedAt" = NOW()
       WHERE account.password IS NULL`,
    [crypto.randomUUID(), user.id, user.password_hash],
  );
}

/**
 * The two columns a password lives in, written together or not at all.
 *
 * account.password is what sign-in reads and user.password_hash is its mirror,
 * so a request that writes one and then fails does not leave a stale copy — it
 * leaves the account holding a password nobody was told about. `PUT /user` used
 * to do exactly that: it wrote the credential first, and a duplicate address
 * then violated user_email_lower_key and the route answered 500 with the
 * password already rotated. The mirror's IS NULL guard cannot repair a column
 * that is merely out of date.
 *
 * The scope is the two writes and nothing more. A route can still fail *after*
 * this returns — `PUT /user` re-reads the row afterwards and can answer 404 —
 * so what is guaranteed is that the two columns never disagree, not that a
 * request answering an error changed nothing at all.
 */
async function writePassword(
  userId: string,
  hash: string,
  // The row work that has to land with it: the caller's own UPDATE of
  // trexdb."user", run on the transaction rather than on the pool.
  // deno-lint-ignore no-explicit-any
  alsoInTransaction: (db: any) => Promise<void>,
) {
  const client = await pool.connect();

  // Exactly one release, in the finally, so no path can leak the connection and
  // no path can release it twice. ../db.ts builds the pool with pg's defaults —
  // ten clients, and callers wait forever for the eleventh — so a borrow that
  // returns nothing is not a slow leak: ten successful password changes and
  // every query in this router blocks indefinitely.
  //
  // The argument is what distinguishes the two ways of giving a client back. A
  // ROLLBACK that fails for anything but a dead socket leaves the session inside
  // an aborted transaction, and returning it clean hands the next borrower a
  // connection that answers everything with "current transaction is aborted".
  // Released with the error, pg destroys it instead.
  let destroyWith: Error | undefined;
  try {
    await client.query("BEGIN");
    await alsoInTransaction(client);
    await writeCredential(userId, hash, client);
    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackFailure) {
      destroyWith = rollbackFailure as Error;
    }
    throw err;
  } finally {
    client.release(destroyWith);
  }
}

/**
 * The reverse mirror: user.password_hash is the pre-V17 home of the credential
 * and is still what storedPasswordHash prefers, so a user whose password lives
 * only in account.password gets it copied back on their way through. Both
 * columns therefore hold the same value on every row this router has seen, and
 * the mirror can be dropped with the column rather than before it.
 */
async function mirrorCredentialOntoUser(userId: string) {
  await pool.query(
    `UPDATE trexdb."user" u
        SET password_hash = a.password, "updatedAt" = NOW()
       FROM trexdb.account a
      WHERE u.id = $1
        AND a."userId" = u.id AND a."providerId" = 'credential'
        AND a.password IS NOT NULL AND u.password_hash IS NULL`,
    [userId],
  );
}

/**
 * Better Auth looks a user up by exact equality against the address it has
 * lower-cased, and lower-cases every address it writes itself, so a stored
 * spelling that is not already case-folded is invisible to it — and its holder
 * would be told their password is wrong rather than that nothing can see them.
 *
 * trex's own identity has been lower(email) since V16 and V16's unique index
 * admits at most one row per folded address, so folding the stored spelling
 * here settles no question and can collide with nothing: it is the row catching
 * up with the rule that already governed it. "updatedAt" is deliberately left
 * alone for the same reason — nobody edited this account.
 *
 * V17 folds the same way, and both are needed. V17 settles the population that
 * existed at the deploy, so nobody has to sign in once to become visible and
 * nothing reading user.email sees a mixture. This settles what is written
 * afterwards: PUT /user stores the spelling the account holder typed and is
 * pinned to that by the wire contract, so a row the engine cannot resolve can
 * be re-introduced at any time. Removing either leaves a way for an account to
 * be invisible to the engine.
 *
 * DELIBERATELY BEFORE THE PASSWORD IS CHECKED, so an unauthenticated request
 * can cause this write. It cannot move after verification without defeating
 * itself: the verification is the engine's, and the engine cannot find the row
 * until it is folded. The write is bounded and idempotent — it fires at most
 * once per account, replaces an address with its own case-folding, and records
 * nothing the requester supplied — and the route is behind authLimiter. It is
 * accepted, not overlooked.
 */
async function canonicaliseLoginAddress(user: DbUser): Promise<string> {
  const folded = (user.email || "").toLowerCase();
  if (!user.email || user.email === folded) return folded;

  await pool.query(`UPDATE trexdb."user" SET email = $1 WHERE id = $2`, [folded, user.id]);
  console.log(`[auth] case-folded the login address of user ${user.id} so the engine can resolve it`);
  user.email = folded;
  return folded;
}

/**
 * The one credential check in trex.
 *
 * Better Auth owns users, accounts and credential verification from here on;
 * the callers keep their own response envelopes, because the engine issues no
 * access token and has no refresh-token concept for this path. The session it
 * creates is what the OAuth provider will authenticate against in phase 2,
 * through Better Auth's own cookie and nothing else — which is why the cookie
 * is forwarded to the caller and not only the row written.
 *
 * Returns null only for a failed credential. Anything the engine reports as its
 * own failure is re-thrown, so a scrypt or database failure reaches the route's
 * error handler as a 500 instead of being answered as a wrong password.
 *
 * This is the account.password side of the split documented on
 * storedPasswordHash: a sign-in reads that column and no other, which is why
 * /change-password does not go through here.
 */
async function authenticateUser(
  user: DbUser,
  password: string,
  // deno-lint-ignore no-explicit-any
  res?: any,
): Promise<{ userId: string; sessionToken: string } | null> {
  const email = await canonicaliseLoginAddress(user);
  await adoptLegacyCredential(user);

  const auth = await engine();

  let signedIn;
  try {
    signedIn = await auth.api.signInEmail({ body: { email, password }, returnHeaders: true });
  } catch (err) {
    if (isAPIError(err) && err.statusCode < 500) return null;
    throw err;
  }

  if (res) {
    for (const cookie of signedIn.headers.getSetCookie()) res.append("Set-Cookie", cookie);
  }
  await mirrorCredentialOntoUser(user.id);
  return { userId: user.id, sessionToken: signedIn.response.token };
}

/**
 * The credential path without the token envelope, for callers that want a
 * signed-in session rather than a GoTrue response — the OAuth provider's own
 * sign-in form. Passing `res` also hands them Better Auth's session cookie,
 * which is the only thing /oauth2/authorize will look at.
 *
 * Deliberately one answer for every refusal: the caller cannot tell a banned
 * user from an unknown one from a wrong password, and must not be able to.
 */
export async function signInWithPassword(
  email: string,
  password: string,
  // deno-lint-ignore no-explicit-any
  res?: any,
): Promise<{ userId: string; sessionToken: string } | null> {
  if (!nativePasswordLoginEnabled()) return null;
  const user = await fetchUserByEmail(email);
  if (!user || user.banned) return null;
  return await authenticateUser(user, password, res);
}

// ── POST /signup ─────────────────────────────────────────────────────────────

router.post("/signup", authLimiter, async (req, res) => {
  try {
    // Before the self-registration setting, and before reading the body: a
    // deployment with password sign-in off has no use for an account whose one
    // credential is a password that could never be presented.
    if (!nativePasswordLoginEnabled()) {
      res.status(403).json({ error: "signup_disabled", error_description: "Password sign-in is disabled" });
      return;
    }

    const { email, password, data } = req.body;

    if (!email || !password) {
      res.status(422).json({ error: "signup_invalid", error_description: "Email and password are required" });
      return;
    }

    if (password.length < 8) {
      res.status(422).json({ error: "signup_invalid", error_description: "Password must be at least 8 characters" });
      return;
    }

    // Refused here, before anything is written. The engine runs this same check
    // on the sign-in that completes a registration, so an address it will not
    // accept used to get as far as creating a user and an account and then have
    // them deleted again under a 500. Registering an address nobody could ever
    // sign in with was never right; saying so plainly is the change.
    if (!isEngineAddressable(email)) {
      res.status(422).json({ error: "signup_invalid", error_description: "Email must be a valid address" });
      return;
    }

    // Check self-registration setting
    const settingResult = await pool.query(
      `SELECT value FROM trexdb.setting WHERE key = 'auth.selfRegistration'`,
    );
    const registrationEnabled = settingResult.rows.length > 0 && settingResult.rows[0].value === true;
    if (!registrationEnabled) {
      res.status(403).json({ error: "signup_disabled", error_description: "Registration is currently disabled" });
      return;
    }

    // Check if user already exists
    const existing = await fetchUserByEmail(email);
    if (existing) {
      res.status(422).json({ error: "user_already_exists", error_description: "A user with this email already exists" });
      return;
    }

    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(password);
    const userName = data?.name || email.split("@")[0];

    // Check if this is the first user
    const countResult = await pool.query('SELECT COUNT(*)::int AS count FROM trexdb."user"');
    const isFirstUser = countResult.rows[0].count === 0;
    const adminEmail = Deno.env.get("ADMIN_EMAIL");
    // Compared case-insensitively for the same reason the lookup above is: the
    // operator named a mailbox, not a spelling. A case-sensitive test here let
    // the designated administrator register their own address in another case,
    // land as an ordinary user, and — since the address is then taken — never
    // be able to create the admin account at all.
    const shouldBeAdmin = isFirstUser ||
      (adminEmail && email.toLowerCase() === adminEmail.toLowerCase());
    const userRole = shouldBeAdmin ? "admin" : "user";

    await pool.query(
      `INSERT INTO trexdb."user" (id, name, email, "emailVerified", email_confirmed_at, role, password_hash, user_metadata)
       VALUES ($1, $2, $3, true, NOW(), $4, $5, $6)`,
      [userId, userName, email, userRole, passwordHash, JSON.stringify(data || {})],
    );

    if (shouldBeAdmin) {
      console.log(`[auth] Assigned admin role to ${email} (${isFirstUser ? "first user" : "ADMIN_EMAIL match"})`);
    }

    await writeCredential(userId, passwordHash);

    const user = await fetchUserById(userId);
    if (!user) {
      res.status(500).json({ error: "server_error", error_description: "Failed to create user" });
      return;
    }

    // Sign the new account in through the engine rather than only minting trex's
    // envelope for it. That is what gives the registration a Better Auth session
    // and cookie for the OAuth provider to read, and it is also the only check
    // that the credential just written is one the engine can actually verify. A
    // refusal means the account is unusable, so it is removed rather than left
    // holding an address nobody can sign in with or register again.
    const engineSession = await authenticateUser(user, password, res);
    if (!engineSession) {
      await pool.query(`DELETE FROM trexdb."user" WHERE id = $1`, [userId]);
      res.status(500).json({ error: "server_error", error_description: "Failed to create user" });
      return;
    }

    const response = await createTokenResponse(user, undefined, res);

    // Update last_sign_in_at
    await pool.query(
      `UPDATE trexdb."user" SET last_sign_in_at = NOW() WHERE id = $1`,
      [userId],
    );

    res.status(200).json(response);
  } catch (err) {
    console.error("[auth] signup error:", err);
    res.status(500).json({ error: "server_error", error_description: "Internal server error" });
  }
});

// ── POST /token ──────────────────────────────────────────────────────────────

router.post("/token", authLimiter, async (req, res) => {
  const grantType = req.query.grant_type;

  if (grantType === "password") {
    return handlePasswordGrant(req, res);
  } else if (grantType === "refresh_token") {
    return handleRefreshGrant(req, res);
  }

  res.status(400).json({ error: "unsupported_grant_type", error_description: `Unsupported grant_type: ${grantType}` });
});

async function handlePasswordGrant(req: any, res: any) {
  try {
    // The switch has to bite here, not only on the sign-in page: hiding the
    // form leaves the grant one POST away, and a deployment that turned
    // password sign-in off did so to close it, not to decorate.
    // unsupported_grant_type rather than a credential error: the grant itself is
    // unavailable, and "invalid credentials" would send people hunting for a
    // password that could never work.
    if (!nativePasswordLoginEnabled()) {
      res.status(400).json({
        error: "unsupported_grant_type",
        error_description: "Password sign-in is disabled",
      });
      return;
    }

    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: "invalid_grant", error_description: "Email and password are required" });
      return;
    }

    const user = await fetchUserByEmail(email);
    if (!user) {
      res.status(400).json({ error: "invalid_grant", error_description: "Invalid login credentials" });
      return;
    }

    if (user.banned) {
      res.status(400).json({ error: "user_banned", error_description: "User is banned" });
      return;
    }

    // Deliberately not distinguishing an account with no password from a wrong
    // one, and deliberately not Better Auth's 401 INVALID_EMAIL_OR_PASSWORD:
    // the wire contract here is GoTrue's 400 invalid_grant.
    if (!await authenticateUser(user, password, res)) {
      res.status(400).json({ error: "invalid_grant", error_description: "Invalid login credentials" });
      return;
    }

    // This session is a native one, so any federation block left by an earlier
    // federated sign-in stops describing it. Dropped rather than left to age:
    // the OIDC provider reads that block to decide whether to emit
    // idp_provider/idp_groups, and a stale one would have trex assert that a
    // password session came from an upstream. Also stamps last_sign_in_at,
    // which this grant already owed the row.
    await pool.query(
      `UPDATE trexdb."user"
          SET last_sign_in_at = NOW(),
              app_metadata = COALESCE(app_metadata, '{}'::jsonb) - $2::text
        WHERE id = $1`,
      [user.id, IDP_METADATA_KEY],
    );
    // The row was read before that UPDATE, so the response body would still
    // carry the block that no longer exists.
    if (user.app_metadata) delete user.app_metadata[IDP_METADATA_KEY];

    res.json(await createTokenResponse(user, undefined, res));
  } catch (err) {
    console.error("[auth] password grant error:", err);
    res.status(500).json({ error: "server_error", error_description: "Internal server error" });
  }
}

async function handleRefreshGrant(req: any, res: any) {
  try {
    const { refresh_token: refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({ error: "invalid_grant", error_description: "refresh_token is required" });
      return;
    }

    const tokenHash = await hashRefreshToken(refreshToken);

    // Find and revoke the old refresh token
    const result = await pool.query(
      `UPDATE trexdb.refresh_token SET revoked = true, "updatedAt" = NOW()
       WHERE token_hash = $1 AND revoked = false
       RETURNING "userId", session_id, "createdAt"`,
      [tokenHash],
    );

    if (result.rows.length === 0) {
      res.status(400).json({ error: "invalid_grant", error_description: "Invalid or revoked refresh token" });
      return;
    }

    const { userId, session_id: sessionId, createdAt } = result.rows[0];

    // Enforce an absolute lifetime: rotation alone lets a leaked-but-unused
    // token be redeemed indefinitely. The row was just revoked above, so an
    // expired token is consumed and rejected in one shot.
    if (isRefreshTokenExpired(createdAt)) {
      res.status(400).json({ error: "invalid_grant", error_description: "Refresh token expired" });
      return;
    }
    const user = await fetchUserById(userId);

    if (!user || user.banned) {
      res.status(400).json({ error: "invalid_grant", error_description: "User not found or banned" });
      return;
    }

    const response = await createTokenResponse(user, sessionId, res);
    res.json(response);
  } catch (err) {
    console.error("[auth] refresh grant error:", err);
    res.status(500).json({ error: "server_error", error_description: "Internal server error" });
  }
}

// ── POST /logout ─────────────────────────────────────────────────────────────

// Trade a Bearer access token for an sb-access-token cookie so same-origin
// iframes (which can't read the parent's localStorage) can authenticate.
router.post("/sync-cookie", apiLimiter, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "not_authenticated" });
      return;
    }
    const token = authHeader.slice(7);
    const claims = await verifyAccessToken(token);
    if (!claims || claims.role === "service_role" || claims.role === "anon") {
      res.status(401).json({ error: "not_authenticated" });
      return;
    }
    const forwardedProto = req.headers?.["x-forwarded-proto"];
    const proto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
    const secure =
      Deno.env.get("TREX_FORCE_SECURE_COOKIES") === "1" ||
      req.protocol === "https" ||
      proto === "https";
    res.cookie("sb-access-token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: Math.max(0, (claims.exp || 0) * 1000 - Date.now()),
    });
    res.status(204).end();
  } catch (err) {
    console.error("[auth] sync-cookie error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

router.post("/logout", apiLimiter, async (req, res) => {
  res.clearCookie("sb-access-token", { path: "/" });
  try {
    // The sign-in that issued this session also issued a Better Auth one, and
    // from phase 2 on that is the session /oauth2/authorize reads. Ending only
    // trex's half would leave someone who has logged out still signed in to the
    // OAuth provider. The engine is handed the request's own cookies because it
    // is the only thing that knows which of its sessions they name.
    //
    // Behind the same switch as every other engine call, and not only because
    // a deployment with password sign-in off has no engine session to end:
    // better-auth.ts reads that switch once, while it evaluates, so whichever
    // request imports it first decides emailAndPassword.enabled for the life of
    // the process. An ungated logout could be that request.
    const engineCookies = req.headers.cookie;
    if (nativePasswordLoginEnabled() && engineCookies) {
      const { auth } = await import("./better-auth.ts");
      const signedOut = await auth.api.signOut({
        headers: new Headers({ cookie: engineCookies }),
        returnHeaders: true,
      }).catch(() => null);
      for (const cookie of signedOut?.headers.getSetCookie() ?? []) {
        res.append("Set-Cookie", cookie);
      }
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(204).end();
      return;
    }

    const token = authHeader.slice(7);
    const claims = await verifyAccessToken(token);
    if (claims?.session_id) {
      // Revoke all refresh tokens for this session
      await pool.query(
        `UPDATE trexdb.refresh_token SET revoked = true, "updatedAt" = NOW()
         WHERE session_id = $1 AND revoked = false`,
        [claims.session_id],
      );
    }

    res.status(204).end();
  } catch (err) {
    console.error("[auth] logout error:", err);
    res.status(204).end();
  }
});

// ── GET /user ────────────────────────────────────────────────────────────────

router.get("/user", apiLimiter, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "not_authenticated", error_description: "Missing or invalid authorization header" });
      return;
    }

    const token = authHeader.slice(7);
    const claims = await verifyAccessToken(token);
    if (!claims) {
      res.status(401).json({ error: "not_authenticated", error_description: "Invalid or expired token" });
      return;
    }

    const user = await fetchUserById(claims.sub);
    if (!user) {
      res.status(404).json({ error: "user_not_found", error_description: "User not found" });
      return;
    }

    res.json(toGoTrueUser(user));
  } catch (err) {
    console.error("[auth] get user error:", err);
    res.status(500).json({ error: "server_error", error_description: "Internal server error" });
  }
});

// ── PUT /user ────────────────────────────────────────────────────────────────
//
// The row read comes from the engine; the write deliberately does not.
// auth.api.updateUser accepts only the additionalFields declared for input —
// user_metadata is declared `input: false` and would be refused outright — it
// answers `{status}` rather than the user this route returns, and it routes an
// address change through a confirmation flow that GoTrue has no step for. The
// shallow `user_metadata || $n::jsonb` merge below is the whole point of the
// route and there is nothing in the engine that expresses it.

router.put("/user", apiLimiter, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "not_authenticated", error_description: "Missing or invalid authorization header" });
      return;
    }

    const token = authHeader.slice(7);
    const claims = await verifyAccessToken(token);
    if (!claims) {
      res.status(401).json({ error: "not_authenticated", error_description: "Invalid or expired token" });
      return;
    }

    const { email, password, data } = req.body;
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (data?.name !== undefined) {
      updates.push(`name = $${paramIdx++}`);
      values.push(data.name);
    }

    if (data?.image !== undefined) {
      updates.push(`image = $${paramIdx++}`);
      values.push(data.image);
    }

    if (data) {
      updates.push(`user_metadata = user_metadata || $${paramIdx++}::jsonb`);
      values.push(JSON.stringify(data));
    }

    if (email) {
      // Refused for the same reason /signup refuses it and V17 refuses to
      // migrate one: the engine validates the address before it looks anybody
      // up, so an account that took this one would be locked out of its own
      // sign-in permanently, with nothing back but "invalid credentials". The
      // route's own vocabulary for a body it will not take is validation_failed,
      // which is what it already answers for a password that is too short.
      if (!isEngineAddressable(email)) {
        res.status(422).json({
          error: "validation_failed",
          error_description: "Email must be a valid address",
        });
        return;
      }
      updates.push(`email = $${paramIdx++}`);
      values.push(email);
      // The flag means "this address is synthesised, not one anybody gave"
      // (V17's column comment), and this is the one route that writes an
      // address the account holder chose. It has to come off with the old
      // value: findLinkCandidateByEmail excludes flagged rows, so a federated
      // user who sets a real address here and stayed flagged could never be
      // linked by a provider asserting it — refused as no_account, or, under
      // auto-provision, a UNIQUE violation on user_email_key.
      updates.push(`is_placeholder_email = false`);
    }

    let newHash: string | null = null;
    if (password) {
      if (password.length < 8) {
        res.status(422).json({ error: "validation_failed", error_description: "Password must be at least 8 characters" });
        return;
      }
      newHash = await hashPassword(password);
      updates.push(`password_hash = $${paramIdx++}`);
      values.push(newHash);
    }

    if (updates.length > 0) {
      updates.push(`"updatedAt" = NOW()`);
      values.push(claims.sub);
      const update = `UPDATE trexdb."user" SET ${updates.join(", ")} WHERE id = $${paramIdx}`;

      // The credential is written inside the same transaction as the row, and
      // only ever after it. This route can fail on the row — a duplicate
      // address violates user_email_lower_key and the catch below answers 500 —
      // and a credential that survived that would have silently changed the
      // password of a request the caller was told had done nothing.
      if (newHash) {
        await writePassword(claims.sub, newHash, (db) => db.query(update, values));

        // Outside the transaction: revoking is idempotent, and a revocation
        // that outlives a rolled-back password change costs a re-login rather
        // than leaving a stolen token alive.
        await pool.query(
          `UPDATE trexdb.refresh_token SET revoked = true, "updatedAt" = NOW()
           WHERE "userId" = $1 AND revoked = false`,
          [claims.sub],
        );
      } else {
        await pool.query(update, values);
      }
    }

    const user = await fetchUserById(claims.sub);
    if (!user) {
      res.status(404).json({ error: "user_not_found" });
      return;
    }

    res.json(toGoTrueUser(user));
  } catch (err) {
    console.error("[auth] update user error:", err);
    res.status(500).json({ error: "server_error", error_description: "Internal server error" });
  }
});

// ── POST /recover ────────────────────────────────────────────────────────────

router.post("/recover", async (req, res) => {
  const { email } = req.body;
  if (email) {
    console.log(`[auth] Password recovery requested for ${email}`);
  }
  // Always return success to avoid email enumeration
  res.json({});
});

// ── Custom: POST /password-changed ──────────────────────────────────────────

router.post("/password-changed", apiLimiter, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const token = authHeader.slice(7);
    const claims = await verifyAccessToken(token);
    if (!claims) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    await pool.query(
      'UPDATE trexdb."user" SET "mustChangePassword" = false, "updatedAt" = NOW() WHERE id = $1',
      [claims.sub],
    );
    res.json({ success: true });
  } catch (err) {
    console.error("[auth] password-changed error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Custom: POST /change-password ───────────────────────────────────────────

router.post("/change-password", apiLimiter, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "not_authenticated" });
      return;
    }

    const token = authHeader.slice(7);
    const claims = await verifyAccessToken(token);
    if (!claims) {
      res.status(401).json({ error: "not_authenticated" });
      return;
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: "Current password and new password are required" });
      return;
    }

    if (newPassword.length < 8) {
      res.status(422).json({ error: "Password must be at least 8 characters" });
      return;
    }

    const user = await fetchUserById(claims.sub);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const storedHash = await storedPasswordHash(user.id, user.password_hash);
    if (!storedHash) {
      res.status(400).json({ error: "No password set for this account" });
      return;
    }

    // The last credential check in this router, now the engine's. The verifier
    // is whichever one better-auth.ts wired — trex's scrypt today — so a change
    // of hashing algorithm reaches this route by construction instead of
    // leaving it verifying against the old one and answering "Current password
    // is incorrect" to everybody.
    //
    // NOT authenticateUser, deliberately. That signs in, and a sign-in reads
    // account.password alone, so it would refuse an account whose password
    // reached only user.password_hash — the state a node that has not restarted
    // into the V17 code still writes, and the one the wire contract pins this
    // route to accept. The resolution order above is trex's answer to which of
    // the two columns holds the password; the engine's answer is what verifies
    // it.
    const { password: credential } = await engineContext();
    if (!(await credential.verify({ hash: storedHash, password: currentPassword }))) {
      res.status(400).json({ error: "Current password is incorrect" });
      return;
    }

    const newHash = await hashPassword(newPassword);
    await writePassword(user.id, newHash, (db) =>
      db.query(
        `UPDATE trexdb."user" SET password_hash = $1, "updatedAt" = NOW() WHERE id = $2`,
        [newHash, user.id],
      ));

    // Revoke all outstanding refresh tokens so a stolen token doesn't survive
    // a password change.
    await pool.query(
      `UPDATE trexdb.refresh_token SET revoked = true, "updatedAt" = NOW()
       WHERE "userId" = $1 AND revoked = false`,
      [user.id],
    );

    res.json({ success: true });
  } catch (err) {
    console.error("[auth] change-password error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Custom: GET /sessions ───────────────────────────────────────────────────

router.get("/sessions", apiLimiter, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "not_authenticated" });
      return;
    }

    const token = authHeader.slice(7);
    const claims = await verifyAccessToken(token);
    if (!claims) {
      res.status(401).json({ error: "not_authenticated" });
      return;
    }

    // Return active refresh token sessions grouped by session_id
    const result = await pool.query(
      `SELECT DISTINCT ON (session_id)
         id, session_id, "createdAt", "updatedAt"
       FROM trexdb.refresh_token
       WHERE "userId" = $1 AND revoked = false
       ORDER BY session_id, "createdAt" DESC`,
      [claims.sub],
    );

    const sessions = result.rows.map((row: any) => ({
      id: row.id,
      token: row.session_id, // Use session_id as the session identifier
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      // These aren't stored in refresh tokens, but kept for UI compat
      ipAddress: null,
      userAgent: null,
      expiresAt: null,
    }));

    res.json(sessions);
  } catch (err) {
    console.error("[auth] sessions error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Custom: POST /revoke-session ────────────────────────────────────────────

router.post("/revoke-session", apiLimiter, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "not_authenticated" });
      return;
    }

    const token = authHeader.slice(7);
    const claims = await verifyAccessToken(token);
    if (!claims) {
      res.status(401).json({ error: "not_authenticated" });
      return;
    }

    const { session_id: targetSessionId } = req.body;
    if (!targetSessionId) {
      res.status(400).json({ error: "session_id is required" });
      return;
    }

    await pool.query(
      `UPDATE trexdb.refresh_token SET revoked = true, "updatedAt" = NOW()
       WHERE "userId" = $1 AND session_id = $2 AND revoked = false`,
      [claims.sub, targetSessionId],
    );

    res.json({ success: true });
  } catch (err) {
    console.error("[auth] revoke-session error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Custom: GET /accounts (linked accounts) ─────────────────────────────────
//
// Four columns, named, rather than the engine's findAccounts: that returns the
// account row whole, and the account row is where the credential lives. The
// engine strips the password only inside its own endpoint, which needs the
// session cookie this route does not have — so listing through it would put a
// projection between the hash and the wire and pin nothing to keep it there.

router.get("/accounts", apiLimiter, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "not_authenticated" });
      return;
    }

    const token = authHeader.slice(7);
    const claims = await verifyAccessToken(token);
    if (!claims) {
      res.status(401).json({ error: "not_authenticated" });
      return;
    }

    const result = await pool.query(
      `SELECT id, "providerId", "accountId", "createdAt"
       FROM trexdb.account WHERE "userId" = $1`,
      [claims.sub],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("[auth] accounts error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /settings ────────────────────────────────────────────────────────────

router.get("/settings", apiLimiter, async (_req, res) => {
  try {
    // Check self-registration
    let disableSignup = true;
    try {
      const result = await pool.query(
        `SELECT value FROM trexdb.setting WHERE key = 'auth.selfRegistration'`,
      );
      disableSignup = !(result.rows.length > 0 && result.rows[0].value === true);
    } catch {
      // Default: disabled
    }

    // Providers come from sso_provider so a client can discover what is
    // actually configured, rather than a fixed list that is wrong either way.
    // Failure (missing table, DB hiccup) falls back to email-only inside
    // loadExternalProviders rather than 500ing this endpoint.
    const external = await loadExternalProviders(pool);

    res.json({
      external,
      disable_signup: disableSignup,
      mailer_autoconfirm: true,
      phone_autoconfirm: false,
      sms_provider: "",
    });
  } catch (err) {
    console.error("[auth] settings error:", err);
    res.status(500).json({ error: "server_error" });
  }
});

// ── GET /health ──────────────────────────────────────────────────────────────

router.get("/health", (_req, res) => {
  res.json({ version: "trex-gotrue-1.0.0", name: "GoTrue", description: "Trex GoTrue-compatible auth" });
});

// ── The admin block ─────────────────────────────────────────────────────────
//
// requireAdmin stays in front of every route here and is not handed to Better
// Auth's admin plugin. The plugin authorizes one way only — a session cookie
// whose user passes a permission check — and has no service-role path at all;
// `adminUserIds` names users, it does not bypass the session. d2e's usermgmt
// calls these routes with the service-role key and never with a cookie, so
// authorization is trex's and the engine is only asked for the data access
// underneath it. The plugin's own endpoints are reached here through
// auth.api.*, which skips the session check precisely because nothing is
// forwarded to it: no headers, no request, no caller identity.

// /admin/users is the GoTrue-compatible alias supabase-js POSTs to.
router.post(["/admin/create-user", "/admin/users"], apiLimiter, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { email, password, data } = req.body;

    if (!email || !password) {
      res.status(422).json({ error: "validation_failed", error_description: "Email and password are required" });
      return;
    }

    // Asked before anything is written, for the reason /signup and V17 ask it:
    // createUser runs zod's z.email() itself and would refuse the address after
    // the fact, and an administrator who got one past it would have created an
    // account that can never sign in.
    if (!isEngineAddressable(email)) {
      res.status(422).json({ error: "validation_failed", error_description: "Email must be a valid address" });
      return;
    }

    // Kept ahead of the engine's own duplicate check, which reports a taken
    // address as a 400 in Better Auth's vocabulary rather than the 422
    // user_already_exists this route is pinned to.
    const existing = await fetchUserByEmail(email);
    if (existing) {
      res.status(422).json({ error: "user_already_exists", error_description: "A user with this email already exists" });
      return;
    }

    // The engine creates the user and links the credential, hashing with trex's
    // own scrypt through better-auth.ts's hook. `data` carries the columns
    // GoTrue's admin create is expected to set outright — an address an
    // administrator typed is confirmed, with no verification round-trip — and
    // the whole `data` object is kept as user_metadata, which is what the wire
    // contract returns. app_metadata is left to V1's column default so the
    // provider keys stay what every other row has.
    const created = await (await engine()).api.createUser({
      body: {
        email,
        password,
        name: data?.name || email.split("@")[0],
        role: data?.role || "user",
        data: {
          emailVerified: true,
          email_confirmed_at: new Date(),
          user_metadata: data || {},
        },
      },
    });

    // account.password is now the credential; this fills the pre-V17 mirror so
    // the two columns agree from the first moment, as they do on every other
    // path that writes a password.
    await mirrorCredentialOntoUser(created.user.id);

    const user = await fetchUserById(created.user.id);
    if (!user) {
      res.status(500).json({ error: "server_error", error_description: "Failed to create user" });
      return;
    }

    res.status(200).json(toGoTrueUser(user));
  } catch (err) {
    console.error("[auth] admin create-user error:", err);
    res.status(500).json({ error: "server_error", error_description: "Internal server error" });
  }
});

// PUT /admin/users/:id is the GoTrue-compatible admin update. Only the password
// is settable: an administrator resetting a password for someone who has lost
// it cannot supply the current one, so this is the counterpart to
// /change-password rather than a duplicate of it.
router.put("/admin/users/:id", apiLimiter, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const { password, banned } = req.body ?? {};
    if (password === undefined && banned === undefined) {
      res.status(422).json({
        error: "validation_failed",
        error_description: "One of 'password' or 'banned' is required",
      });
      return;
    }

    if (password !== undefined && password.length < 8) {
      res.status(422).json({ error: "Password must be at least 8 characters" });
      return;
    }

    if (banned !== undefined && typeof banned !== "boolean") {
      res.status(422).json({ error: "validation_failed", error_description: "'banned' must be a boolean" });
      return;
    }

    const user = await fetchUserById(req.params.id);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (password !== undefined) {
      const newHash = await hashPassword(password);
      await writePassword(user.id, newHash, (db) =>
        db.query(
          `UPDATE trexdb."user" SET password_hash = $1, "updatedAt" = NOW() WHERE id = $2`,
          [newHash, user.id],
        ));
    }

    if (banned !== undefined) {
      await pool.query(
        `UPDATE trexdb."user" SET banned = $1, "updatedAt" = NOW() WHERE id = $2`,
        [banned, user.id],
      );
    }

    // Revoke all outstanding refresh tokens. A password reset is what an
    // administrator does when an account may be compromised, and a ban is
    // pointless if the sessions it was issued before it outlive it.
    if (password !== undefined || banned === true) {
      await pool.query(
        `UPDATE trexdb.refresh_token SET revoked = true, "updatedAt" = NOW()
         WHERE "userId" = $1 AND revoked = false`,
        [user.id],
      );
    }

    const updated = await fetchUserById(user.id);
    res.json(toGoTrueUser(updated ?? user));
  } catch (err) {
    console.error("[auth] admin set-password error:", err);
    res.status(500).json({ error: "server_error", error_description: "Internal server error" });
  }
});

// GET /admin/users/:id is the GoTrue-compatible admin read. Without it a caller
// holding only a subject has no way to resolve the account behind it.
router.get("/admin/users/:id", apiLimiter, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const user = await fetchUserById(req.params.id);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json(toGoTrueUser(user));
  } catch (err) {
    console.error("[auth] admin get-user error:", err);
    res.status(500).json({ error: "server_error", error_description: "Internal server error" });
  }
});

// DELETE /admin/users/:id is the GoTrue-compatible admin delete. Removing the
// account is what lets the same address be registered again afterwards, so a
// caller that deletes a user and recreates it under the same name succeeds
// rather than colliding with the account left behind.
router.delete("/admin/users/:id", apiLimiter, async (req, res) => {
  try {
    if (!(await requireAdmin(req, res))) return;

    const user = await fetchUserById(req.params.id);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // The engine removes the sessions and the credential explicitly and the
    // user row last. trex's refresh tokens are not a Better Auth model, but
    // they are ON DELETE CASCADE from the user row, so none survives able to
    // mint access tokens for a user that no longer exists.
    await (await engineAdapter()).deleteUser(user.id);

    res.status(200).json({});
  } catch (err) {
    console.error("[auth] admin delete-user error:", err);
    res.status(500).json({ error: "server_error", error_description: "Internal server error" });
  }
});

export { router as authRouter };
