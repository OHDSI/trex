// The 18 routes of /auth/v1 are what supabase-js, d2e's TrexIdpAPI, the d2e
// sign-in page and the shell test helpers call. Nothing pinned their responses
// before this file, so a change of auth engine underneath them had no way to
// prove it changed nothing. Each test asserts the literal envelope — the exact
// object, the exact status, the exact error/error_description strings — rather
// than a shape the response happens to satisfy, because a shape assertion is
// satisfied by a replacement that quietly renames a field.
//
// These tests need a real Postgres carrying the trexdb schema: auth-router.ts
// imports ../db.ts, which opens a pool at import time, and the router's error
// envelopes are produced by real query results. A mocked pool would pin the
// mock rather than the wire format, so the whole file is gated on DATABASE_URL
// and skips without one.
import { assertEquals, assertNotEquals } from "jsr:@std/assert";
import express from "express";
import { _resetRootKeyCache } from "./keys.ts";
import {
  _resetJwtSecretCache,
  generateAnonKey,
  generateServiceRoleKey,
  getJwtSecret,
  hashRefreshToken,
  signAccessToken,
} from "./jwt.ts";
import { hashPassword } from "./password.ts";
import { nativeIdpEnabled } from "./native-idp.ts";

// ── Harness ─────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
type PgPool = any;
// deno-lint-ignore no-explicit-any
type Json = any;

const DATABASE_URL = Deno.env.get("DATABASE_URL");

/** Matches the other auth suites so the derived signing key is the same one. */
const VALID_ROOT = btoa(String.fromCharCode(...new Uint8Array(32).map((_, i) => i)));

/**
 * keys.test.ts deletes TREX_ROOT_KEY and both caches are module-level, so every
 * test re-pins the root key rather than trusting whatever ran before it.
 */
function pinRootKey() {
  _resetRootKeyCache();
  _resetJwtSecretCache();
  Deno.env.set("TREX_ROOT_KEY", VALID_ROOT);
}

/**
 * Boots the real authRouter on an ephemeral port against the test database.
 *
 * auth-router.ts is imported dynamically: ../db.ts throws at module evaluation
 * when DATABASE_URL is unset, which would take the whole file down even though
 * every test in it is skipped in that case.
 *
 * Only the router's own express.json() (auth-router.ts:18) parses bodies here,
 * matching index.ts, where no body parser is mounted ahead of this prefix.
 */
export async function startContractServer(): Promise<
  { url: string; close: () => Promise<void> }
> {
  const { authRouter } = await import("./auth-router.ts");
  const app = express();
  app.use("/trex/auth/v1", authRouter);
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${port}/trex/auth/v1`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

/**
 * Reproduces index.ts:180-192, the only place nativeIdpEnabled() is read. The
 * switch is a property of the mount, not of the router, so it can only be
 * characterised by mounting the router the way the server does.
 */
export async function startMountedContractServer(): Promise<
  { url: string; close: () => Promise<void> }
> {
  const { authRouter } = await import("./auth-router.ts");
  const app = express();
  if (nativeIdpEnabled()) {
    app.use("/trex/auth/v1", authRouter);
  } else {
    app.use("/trex/auth/v1", (_req: Json, res: Json) => {
      res.status(403).json({
        error: "idp_disabled",
        error_description:
          "Native login is disabled. Set TREX_IDP_ENABLED=true to enable it.",
      });
    });
  }
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const { port } = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${port}/trex/auth/v1`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

async function getPool(): Promise<PgPool> {
  return (await import("../db.ts")).pool;
}

/** Every fixture user carries this domain so a crashed test cannot leak rows. */
const TEST_DOMAIN = "@contract.test";

async function purgeFixtures(pool: PgPool) {
  await pool.query(`DELETE FROM trexdb."user" WHERE email LIKE $1`, [`%${TEST_DOMAIN}`]);
}

interface Ctx {
  url: string;
  pool: PgPool;
}

/**
 * The pg pool is a singleton owned by ../db.ts and deliberately outlives every
 * test, so the resource and op sanitizers would report it as a leak.
 */
function contractTest(name: string, fn: (c: Ctx) => Promise<void>) {
  Deno.test({
    name,
    ignore: !DATABASE_URL,
    sanitizeOps: false,
    sanitizeResources: false,
    fn: async () => {
      pinRootKey();
      const pool = await getPool();
      await purgeFixtures(pool);
      const server = await startContractServer();
      try {
        await fn({ url: server.url, pool });
      } finally {
        await server.close();
        await purgeFixtures(pool);
      }
    },
  });
}

/** Same gating, but the caller boots its own server (the mount-switch tests). */
function mountTest(name: string, fn: (pool: PgPool) => Promise<void>) {
  Deno.test({
    name,
    ignore: !DATABASE_URL,
    sanitizeOps: false,
    sanitizeResources: false,
    fn: async () => {
      pinRootKey();
      const pool = await getPool();
      await fn(pool);
    },
  });
}

// ── Environment and settings helpers ────────────────────────────────────────

function setEnv(key: string, value: string | undefined) {
  if (value === undefined) Deno.env.delete(key);
  else Deno.env.set(key, value);
}

async function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => Promise<void>,
) {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) previous[key] = Deno.env.get(key);
  try {
    for (const [key, value] of Object.entries(vars)) setEnv(key, value);
    await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) setEnv(key, value);
  }
}

/** Pins trexdb.setting[key] for the duration of fn and restores it afterwards. */
async function withSetting(
  pool: PgPool,
  key: string,
  value: unknown | undefined,
  fn: () => Promise<void>,
) {
  const before = await pool.query(`SELECT value FROM trexdb.setting WHERE key = $1`, [key]);
  const existed = before.rows.length > 0;
  const previous = existed ? before.rows[0].value : null;
  try {
    if (value === undefined) {
      await pool.query(`DELETE FROM trexdb.setting WHERE key = $1`, [key]);
    } else {
      await pool.query(
        `INSERT INTO trexdb.setting (key, value) VALUES ($1, $2::jsonb)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, JSON.stringify(value)],
      );
    }
    await fn();
  } finally {
    if (existed) {
      await pool.query(
        `INSERT INTO trexdb.setting (key, value) VALUES ($1, $2::jsonb)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, JSON.stringify(previous)],
      );
    } else {
      await pool.query(`DELETE FROM trexdb.setting WHERE key = $1`, [key]);
    }
  }
}

// ── Fixture helpers ─────────────────────────────────────────────────────────

let fixtureSeq = 0;
function uniqueEmail(label: string): string {
  fixtureSeq += 1;
  return `contract-${label}-${fixtureSeq}-${crypto.randomUUID().slice(0, 8)}${TEST_DOMAIN}`;
}

interface UserSpec {
  email?: string;
  name?: string;
  password?: string | null;
  /** Written to trexdb.account only, leaving user.password_hash NULL. */
  accountOnlyPassword?: string;
  role?: string;
  banned?: boolean;
  image?: string | null;
  mustChangePassword?: boolean;
  userMetadata?: Record<string, unknown>;
  appMetadata?: Record<string, unknown>;
  softDeleted?: boolean;
}

interface Fixture {
  id: string;
  email: string;
  name: string;
  password: string;
  /** signAccessToken copies this into app_metadata.trex_role. */
  role: string;
}

async function createUser(pool: PgPool, spec: UserSpec = {}): Promise<Fixture> {
  const id = crypto.randomUUID();
  const email = spec.email ?? uniqueEmail("user");
  const name = spec.name ?? "Contract User";
  const role = spec.role ?? "user";
  const password = spec.password === null ? "" : (spec.password ?? "correct-horse");
  const hash = spec.password === null ? null : await hashPassword(password);

  await pool.query(
    `INSERT INTO trexdb."user"
       (id, name, email, "emailVerified", email_confirmed_at, role, banned, image,
        password_hash, "mustChangePassword", user_metadata, app_metadata, "deletedAt")
     VALUES ($1, $2, $3, true, NOW(), $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb,
             CASE WHEN $11 THEN NOW() ELSE NULL END)`,
    [
      id,
      name,
      email,
      role,
      spec.banned ?? false,
      spec.image ?? null,
      hash,
      spec.mustChangePassword ?? false,
      JSON.stringify(spec.userMetadata ?? {}),
      JSON.stringify(spec.appMetadata ?? { provider: "email", providers: ["email"] }),
      spec.softDeleted ?? false,
    ],
  );

  if (spec.accountOnlyPassword !== undefined) {
    await pool.query(
      `INSERT INTO trexdb.account (id, "userId", "accountId", "providerId", password)
       VALUES ($1, $2, $2, 'credential', $3)`,
      [crypto.randomUUID(), id, await hashPassword(spec.accountOnlyPassword)],
    );
  }

  return { id, email, name, password, role };
}

async function readUser(pool: PgPool, id: string): Promise<Json> {
  const result = await pool.query(`SELECT * FROM trexdb."user" WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

async function insertRefreshToken(
  pool: PgPool,
  userId: string,
  sessionId: string,
  token = crypto.randomUUID(),
): Promise<{ token: string; id: string }> {
  const result = await pool.query(
    `INSERT INTO trexdb.refresh_token (token_hash, "userId", session_id)
     VALUES ($1, $2, $3) RETURNING id`,
    [await hashRefreshToken(token), userId, sessionId],
  );
  return { token, id: result.rows[0].id };
}

async function refreshTokenRow(pool: PgPool, token: string): Promise<Json> {
  const result = await pool.query(
    `SELECT * FROM trexdb.refresh_token WHERE token_hash = $1`,
    [await hashRefreshToken(token)],
  );
  return result.rows[0] ?? null;
}

async function tokenFor(
  user: { id: string; email?: string | null; role?: string },
  sessionId = crypto.randomUUID(),
): Promise<string> {
  return await signAccessToken(
    { id: user.id, email: user.email ?? null, role: user.role ?? "user" },
    sessionId,
  );
}

// ── JWT helpers ─────────────────────────────────────────────────────────────

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Mints an HS256 token with an arbitrary payload against the same derived
 * secret verifyAccessToken uses. signAccessToken hard-codes exp = now + 3600,
 * so the expiry-dependent branches (an expired token, /sync-cookie's cookie
 * lifetime) cannot be reached through it.
 */
async function mintToken(payload: Record<string, unknown>): Promise<string> {
  const secret = await getJwtSecret();
  const head = base64url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = base64url(encoder.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(`${head}.${body}`)),
  );
  return `${head}.${body}.${base64url(sig)}`;
}

function decodeJwt(token: string): Json {
  let s = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return JSON.parse(
    new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))),
  );
}

// ── Assertion helpers ───────────────────────────────────────────────────────

const iso = (value: unknown): string | null =>
  value === null || value === undefined ? null : new Date(value as string).toISOString();

function setCookie(res: Response, name: string): string | undefined {
  return res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
}

function cookieAttr(cookie: string, attr: string): string | undefined {
  const part = cookie.split(";").map((p) => p.trim())
    .find((p) => p.toLowerCase().startsWith(`${attr.toLowerCase()}=`));
  return part?.slice(attr.length + 1);
}

function post(url: string, body?: unknown, token?: string): Promise<Response> {
  return request("POST", url, body, token);
}

function request(
  method: string,
  url: string,
  body?: unknown,
  token?: string,
): Promise<Response> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token !== undefined) headers["Authorization"] = `Bearer ${token}`;
  return fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Reads the body so the connection is released even when it is empty. */
async function drain(res: Response): Promise<string> {
  return await res.text();
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. POST /signup
// ═══════════════════════════════════════════════════════════════════════════

contractTest(
  "POST /signup is 403 signup_disabled when native password login is off",
  async ({ url }) => {
    await withEnv({ TREX_NATIVE_PASSWORD_LOGIN_ENABLED: "false" }, async () => {
      const res = await post(`${url}/signup`, {
        email: uniqueEmail("off"),
        password: "long-enough-password",
      });
      assertEquals(res.status, 403);
      assertEquals(await res.json(), {
        error: "signup_disabled",
        error_description: "Password sign-in is disabled",
      });
    });
  },
);

contractTest("POST /signup is 422 signup_invalid without email or password", async ({ url }) => {
  await withEnv({ TREX_NATIVE_PASSWORD_LOGIN_ENABLED: undefined }, async () => {
    const noEmail = await post(`${url}/signup`, { password: "long-enough-password" });
    assertEquals(noEmail.status, 422);
    assertEquals(await noEmail.json(), {
      error: "signup_invalid",
      error_description: "Email and password are required",
    });

    const noPassword = await post(`${url}/signup`, { email: uniqueEmail("nopw") });
    assertEquals(noPassword.status, 422);
    assertEquals(await noPassword.json(), {
      error: "signup_invalid",
      error_description: "Email and password are required",
    });
  });
});

contractTest("POST /signup is 422 signup_invalid for a password under 8 characters", async ({ url }) => {
  await withEnv({ TREX_NATIVE_PASSWORD_LOGIN_ENABLED: undefined }, async () => {
    const res = await post(`${url}/signup`, { email: uniqueEmail("short"), password: "1234567" });
    assertEquals(res.status, 422);
    assertEquals(await res.json(), {
      error: "signup_invalid",
      error_description: "Password must be at least 8 characters",
    });
  });
});

contractTest(
  "POST /signup is 403 signup_disabled while auth.selfRegistration is not true",
  async ({ url, pool }) => {
    await withEnv({ TREX_NATIVE_PASSWORD_LOGIN_ENABLED: undefined }, async () => {
      await withSetting(pool, "auth.selfRegistration", undefined, async () => {
        const absent = await post(`${url}/signup`, {
          email: uniqueEmail("noreg"),
          password: "long-enough-password",
        });
        assertEquals(absent.status, 403);
        assertEquals(await absent.json(), {
          error: "signup_disabled",
          error_description: "Registration is currently disabled",
        });
      });

      await withSetting(pool, "auth.selfRegistration", false, async () => {
        const off = await post(`${url}/signup`, {
          email: uniqueEmail("regoff"),
          password: "long-enough-password",
        });
        assertEquals(off.status, 403);
        assertEquals(await off.json(), {
          error: "signup_disabled",
          error_description: "Registration is currently disabled",
        });
      });
    });
  },
);

contractTest("POST /signup is 422 user_already_exists for a taken address", async ({ url, pool }) => {
  const existing = await createUser(pool);
  await withEnv({ TREX_NATIVE_PASSWORD_LOGIN_ENABLED: undefined }, async () => {
    await withSetting(pool, "auth.selfRegistration", true, async () => {
      const res = await post(`${url}/signup`, {
        email: existing.email,
        password: "long-enough-password",
      });
      assertEquals(res.status, 422);
      assertEquals(await res.json(), {
        error: "user_already_exists",
        error_description: "A user with this email already exists",
      });
    });
  });
});

contractTest("POST /signup returns 200 and the literal token envelope", async ({ url, pool }) => {
  // A user already exists, so this signup is not the first-user-becomes-admin
  // case, and ADMIN_EMAIL is cleared so the environment cannot promote it.
  await createUser(pool);
  const email = uniqueEmail("signup");

  await withEnv(
    { TREX_NATIVE_PASSWORD_LOGIN_ENABLED: undefined, ADMIN_EMAIL: undefined },
    async () => {
      await withSetting(pool, "auth.selfRegistration", true, async () => {
        const before = Math.floor(Date.now() / 1000);
        const res = await post(`${url}/signup`, {
          email,
          password: "long-enough-password",
          data: { name: "Contract Person", nickname: "cp" },
        });
        const after = Math.floor(Date.now() / 1000);

        assertEquals(res.status, 200);
        const body = await res.json();
        const { access_token, refresh_token, expires_at, ...rest } = body;

        const row = await pool.query(
          `SELECT * FROM trexdb."user" WHERE email = $1`,
          [email],
        );
        const user = row.rows[0];

        assertEquals(rest, {
          token_type: "bearer",
          expires_in: 3600,
          user: {
            id: user.id,
            aud: "authenticated",
            role: "authenticated",
            email,
            email_confirmed_at: iso(user.email_confirmed_at),
            // The row is read before the last_sign_in_at stamp, so the very
            // response that logs the user in still reports null.
            last_sign_in_at: null,
            app_metadata: {
              provider: "email",
              providers: ["email"],
              trex_role: "user",
            },
            user_metadata: {
              name: "Contract Person",
              image: null,
              must_change_password: false,
              nickname: "cp",
            },
            identities: [],
            created_at: iso(user.createdAt),
            updated_at: iso(user.updatedAt),
          },
        });

        assertEquals(typeof access_token, "string");
        assertEquals(expires_at >= before + 3600 && expires_at <= after + 3600, true);
        assertEquals(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(refresh_token),
          true,
        );

        // The row is stamped after the envelope is built.
        assertNotEquals(user.last_sign_in_at, null);

        const stored = await refreshTokenRow(pool, refresh_token);
        assertEquals(stored.userId, user.id);
        assertEquals(stored.revoked, false);

        const cookie = setCookie(res, "sb-access-token");
        assertEquals(cookie?.startsWith(`sb-access-token=${access_token};`), true);
        assertEquals(cookieAttr(cookie!, "Max-Age"), "3600");
        assertEquals(cookieAttr(cookie!, "Path"), "/");
        assertEquals(cookie!.includes("HttpOnly"), true);
        assertEquals(cookieAttr(cookie!, "SameSite"), "Lax");
        assertEquals(cookie!.includes("Secure"), false);

        const claims = decodeJwt(access_token);
        assertEquals(claims.sub, user.id);
        assertEquals(claims.role, "authenticated");
        assertEquals(claims.aud, "authenticated");
        assertEquals(claims.email, email);
        assertEquals(claims.app_metadata, {
          provider: "email",
          providers: ["email"],
          trex_role: "user",
        });
        assertEquals(claims.user_metadata, {
          name: "Contract Person",
          image: null,
          must_change_password: false,
        });
        assertEquals(claims.session_id, stored.session_id);
        assertEquals(claims.exp - claims.iat, 3600);
      });
    },
  );
});

contractTest("POST /signup promotes the ADMIN_EMAIL address to admin", async ({ url, pool }) => {
  await createUser(pool);
  const email = uniqueEmail("adminenv");

  await withEnv(
    { TREX_NATIVE_PASSWORD_LOGIN_ENABLED: undefined, ADMIN_EMAIL: email },
    async () => {
      await withSetting(pool, "auth.selfRegistration", true, async () => {
        const res = await post(`${url}/signup`, { email, password: "long-enough-password" });
        assertEquals(res.status, 200);
        const body = await res.json();
        assertEquals(body.user.app_metadata.trex_role, "admin");
        assertEquals(body.user.role, "authenticated");
      });
    },
  );
});

contractTest("POST /signup mirrors the credential into trexdb.account", async ({ url, pool }) => {
  await createUser(pool);
  const email = uniqueEmail("mirror");

  await withEnv(
    { TREX_NATIVE_PASSWORD_LOGIN_ENABLED: undefined, ADMIN_EMAIL: undefined },
    async () => {
      await withSetting(pool, "auth.selfRegistration", true, async () => {
        const res = await post(`${url}/signup`, { email, password: "long-enough-password" });
        assertEquals(res.status, 200);
        const body = await res.json();
        const accounts = await pool.query(
          `SELECT "providerId", "accountId" FROM trexdb.account WHERE "userId" = $1`,
          [body.user.id],
        );
        assertEquals(accounts.rows, [
          { providerId: "credential", accountId: body.user.id },
        ]);
      });
    },
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. POST /token
// ═══════════════════════════════════════════════════════════════════════════

contractTest("POST /token with an unknown grant_type is 400 unsupported_grant_type", async ({ url }) => {
  const res = await post(`${url}/token?grant_type=carrier_pigeon`, {});
  assertEquals(res.status, 400);
  assertEquals(await res.json(), {
    error: "unsupported_grant_type",
    error_description: "Unsupported grant_type: carrier_pigeon",
  });
});

contractTest("POST /token without a grant_type interpolates undefined", async ({ url }) => {
  const res = await post(`${url}/token`, {});
  assertEquals(res.status, 400);
  assertEquals(await res.json(), {
    error: "unsupported_grant_type",
    error_description: "Unsupported grant_type: undefined",
  });
});

contractTest(
  "POST /token password grant is 400 unsupported_grant_type when the switch is off",
  async ({ url, pool }) => {
    const user = await createUser(pool);
    await withEnv({ TREX_NATIVE_PASSWORD_LOGIN_ENABLED: "false" }, async () => {
      const res = await post(`${url}/token?grant_type=password`, {
        email: user.email,
        password: user.password,
      });
      assertEquals(res.status, 400);
      assertEquals(await res.json(), {
        error: "unsupported_grant_type",
        error_description: "Password sign-in is disabled",
      });
    });

    await withEnv({ TREX_NATIVE_PASSWORD_LOGIN_ENABLED: "0" }, async () => {
      const res = await post(`${url}/token?grant_type=password`, {
        email: user.email,
        password: user.password,
      });
      assertEquals(res.status, 400);
      assertEquals(await res.json(), {
        error: "unsupported_grant_type",
        error_description: "Password sign-in is disabled",
      });
    });
  },
);

contractTest("POST /token password grant is 400 invalid_grant without credentials", async ({ url }) => {
  await withEnv({ TREX_NATIVE_PASSWORD_LOGIN_ENABLED: undefined }, async () => {
    const res = await post(`${url}/token?grant_type=password`, {});
    assertEquals(res.status, 400);
    assertEquals(await res.json(), {
      error: "invalid_grant",
      error_description: "Email and password are required",
    });
  });
});

contractTest(
  "POST /token password grant hides unknown users, missing hashes and wrong passwords behind one message",
  async ({ url, pool }) => {
    const noHash = await createUser(pool, { password: null });
    const wrong = await createUser(pool, { password: "correct-horse" });

    await withEnv({ TREX_NATIVE_PASSWORD_LOGIN_ENABLED: undefined }, async () => {
      const unknown = await post(`${url}/token?grant_type=password`, {
        email: `nobody${TEST_DOMAIN}`,
        password: "long-enough-password",
      });
      assertEquals(unknown.status, 400);
      assertEquals(await unknown.json(), {
        error: "invalid_grant",
        error_description: "Invalid login credentials",
      });

      const missing = await post(`${url}/token?grant_type=password`, {
        email: noHash.email,
        password: "long-enough-password",
      });
      assertEquals(missing.status, 400);
      assertEquals(await missing.json(), {
        error: "invalid_grant",
        error_description: "Invalid login credentials",
      });

      const bad = await post(`${url}/token?grant_type=password`, {
        email: wrong.email,
        password: "not-the-password",
      });
      assertEquals(bad.status, 400);
      assertEquals(await bad.json(), {
        error: "invalid_grant",
        error_description: "Invalid login credentials",
      });
    });
  },
);

contractTest("POST /token password grant is 400 user_banned for a banned user", async ({ url, pool }) => {
  const user = await createUser(pool, { banned: true });
  await withEnv({ TREX_NATIVE_PASSWORD_LOGIN_ENABLED: undefined }, async () => {
    const res = await post(`${url}/token?grant_type=password`, {
      email: user.email,
      password: user.password,
    });
    assertEquals(res.status, 400);
    assertEquals(await res.json(), {
      error: "user_banned",
      error_description: "User is banned",
    });
  });
});

contractTest("POST /token password grant cannot see a soft-deleted user", async ({ url, pool }) => {
  const user = await createUser(pool, { softDeleted: true });
  await withEnv({ TREX_NATIVE_PASSWORD_LOGIN_ENABLED: undefined }, async () => {
    const res = await post(`${url}/token?grant_type=password`, {
      email: user.email,
      password: user.password,
    });
    assertEquals(res.status, 400);
    assertEquals(await res.json(), {
      error: "invalid_grant",
      error_description: "Invalid login credentials",
    });
  });
});

contractTest("POST /token password grant returns the literal token envelope", async ({ url, pool }) => {
  const user = await createUser(pool, {
    name: "Grant User",
    image: "https://example.test/a.png",
    userMetadata: { department: "clinical" },
  });

  await withEnv({ TREX_NATIVE_PASSWORD_LOGIN_ENABLED: undefined }, async () => {
    const before = Math.floor(Date.now() / 1000);
    const res = await post(`${url}/token?grant_type=password`, {
      email: user.email,
      password: user.password,
    });
    const after = Math.floor(Date.now() / 1000);

    assertEquals(res.status, 200);
    const body = await res.json();
    const { access_token, refresh_token, expires_at, ...rest } = body;
    const row = await readUser(pool, user.id);

    assertEquals(rest, {
      token_type: "bearer",
      expires_in: 3600,
      user: {
        id: user.id,
        aud: "authenticated",
        role: "authenticated",
        email: user.email,
        email_confirmed_at: iso(row.email_confirmed_at),
        last_sign_in_at: null,
        app_metadata: {
          provider: "email",
          providers: ["email"],
          trex_role: "user",
        },
        user_metadata: {
          name: "Grant User",
          image: "https://example.test/a.png",
          must_change_password: false,
          department: "clinical",
        },
        identities: [],
        created_at: iso(row.createdAt),
        updated_at: iso(row.updatedAt),
      },
    });

    assertEquals(expires_at >= before + 3600 && expires_at <= after + 3600, true);
    const stored = await refreshTokenRow(pool, refresh_token);
    assertEquals(stored.userId, user.id);
    assertEquals(stored.revoked, false);
    assertEquals(decodeJwt(access_token).session_id, stored.session_id);
    assertEquals(cookieAttr(setCookie(res, "sb-access-token")!, "Max-Age"), "3600");
  });
});

contractTest(
  "POST /token password grant strips the federation block from app_metadata",
  async ({ url, pool }) => {
    const user = await createUser(pool, {
      appMetadata: {
        provider: "email",
        providers: ["email"],
        idp: { provider: "logto", groups: ["a"] },
      },
    });

    await withEnv({ TREX_NATIVE_PASSWORD_LOGIN_ENABLED: undefined }, async () => {
      const res = await post(`${url}/token?grant_type=password`, {
        email: user.email,
        password: user.password,
      });
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.user.app_metadata, {
        provider: "email",
        providers: ["email"],
        trex_role: "user",
      });
      const row = await readUser(pool, user.id);
      assertEquals(row.app_metadata, { provider: "email", providers: ["email"] });
    });
  },
);

contractTest(
  "POST /token password grant migrates an account-only hash onto the user row",
  async ({ url, pool }) => {
    const user = await createUser(pool, {
      password: null,
      accountOnlyPassword: "legacy-password",
    });
    assertEquals((await readUser(pool, user.id)).password_hash, null);

    await withEnv({ TREX_NATIVE_PASSWORD_LOGIN_ENABLED: undefined }, async () => {
      const res = await post(`${url}/token?grant_type=password`, {
        email: user.email,
        password: "legacy-password",
      });
      assertEquals(res.status, 200);
      await drain(res);
      assertNotEquals((await readUser(pool, user.id)).password_hash, null);
    });
  },
);

contractTest("POST /token refresh grant is 400 invalid_grant without a token", async ({ url }) => {
  const res = await post(`${url}/token?grant_type=refresh_token`, {});
  assertEquals(res.status, 400);
  assertEquals(await res.json(), {
    error: "invalid_grant",
    error_description: "refresh_token is required",
  });
});

contractTest("POST /token refresh grant keeps the session_id and rotates the token", async ({ url, pool }) => {
  const user = await createUser(pool);
  const sessionId = crypto.randomUUID();
  const { token } = await insertRefreshToken(pool, user.id, sessionId);

  const res = await post(`${url}/token?grant_type=refresh_token`, { refresh_token: token });
  assertEquals(res.status, 200);
  const body = await res.json();

  assertEquals(body.token_type, "bearer");
  assertEquals(body.expires_in, 3600);
  assertEquals(body.user.id, user.id);
  assertNotEquals(body.refresh_token, token);
  assertEquals(decodeJwt(body.access_token).session_id, sessionId);

  assertEquals((await refreshTokenRow(pool, token)).revoked, true);
  const rotated = await refreshTokenRow(pool, body.refresh_token);
  assertEquals(rotated.revoked, false);
  assertEquals(rotated.session_id, sessionId);
});

contractTest("POST /token refresh grant rejects a replayed token", async ({ url, pool }) => {
  const user = await createUser(pool);
  const { token } = await insertRefreshToken(pool, user.id, crypto.randomUUID());

  const first = await post(`${url}/token?grant_type=refresh_token`, { refresh_token: token });
  assertEquals(first.status, 200);
  await drain(first);

  const replay = await post(`${url}/token?grant_type=refresh_token`, { refresh_token: token });
  assertEquals(replay.status, 400);
  assertEquals(await replay.json(), {
    error: "invalid_grant",
    error_description: "Invalid or revoked refresh token",
  });
});

contractTest("POST /token refresh grant rejects a token it has never seen", async ({ url }) => {
  const res = await post(`${url}/token?grant_type=refresh_token`, {
    refresh_token: crypto.randomUUID(),
  });
  assertEquals(res.status, 400);
  assertEquals(await res.json(), {
    error: "invalid_grant",
    error_description: "Invalid or revoked refresh token",
  });
});

contractTest("POST /token refresh grant consumes an expired token as it rejects it", async ({ url, pool }) => {
  const user = await createUser(pool);
  const { token } = await insertRefreshToken(pool, user.id, crypto.randomUUID());
  await pool.query(
    `UPDATE trexdb.refresh_token SET "createdAt" = NOW() - INTERVAL '31 days' WHERE token_hash = $1`,
    [await hashRefreshToken(token)],
  );

  const res = await post(`${url}/token?grant_type=refresh_token`, { refresh_token: token });
  assertEquals(res.status, 400);
  assertEquals(await res.json(), {
    error: "invalid_grant",
    error_description: "Refresh token expired",
  });
  assertEquals((await refreshTokenRow(pool, token)).revoked, true);
});

contractTest("POST /token refresh grant is 400 invalid_grant for a banned user", async ({ url, pool }) => {
  const user = await createUser(pool, { banned: true });
  const { token } = await insertRefreshToken(pool, user.id, crypto.randomUUID());

  const res = await post(`${url}/token?grant_type=refresh_token`, { refresh_token: token });
  assertEquals(res.status, 400);
  assertEquals(await res.json(), {
    error: "invalid_grant",
    error_description: "User not found or banned",
  });
});

contractTest(
  "POST /token refresh grant is not gated by the native password switch",
  async ({ url, pool }) => {
    const user = await createUser(pool);
    const { token } = await insertRefreshToken(pool, user.id, crypto.randomUUID());

    await withEnv({ TREX_NATIVE_PASSWORD_LOGIN_ENABLED: "false" }, async () => {
      const res = await post(`${url}/token?grant_type=refresh_token`, { refresh_token: token });
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body.token_type, "bearer");
      assertEquals(body.user.id, user.id);
    });
  },
);

// ═══════════════════════════════════════════════════════════════════════════
// 3. POST /sync-cookie
// ═══════════════════════════════════════════════════════════════════════════

contractTest("POST /sync-cookie is 401 not_authenticated without a bearer", async ({ url }) => {
  const res = await post(`${url}/sync-cookie`);
  assertEquals(res.status, 401);
  assertEquals(await res.json(), { error: "not_authenticated" });
});

contractTest("POST /sync-cookie is 401 not_authenticated for an unusable token", async ({ url, pool }) => {
  const user = await createUser(pool);

  const garbage = await post(`${url}/sync-cookie`, undefined, "not-a-jwt");
  assertEquals(garbage.status, 401);
  assertEquals(await garbage.json(), { error: "not_authenticated" });

  const expired = await mintToken({
    sub: user.id,
    role: "authenticated",
    exp: Math.floor(Date.now() / 1000) - 60,
    iat: Math.floor(Date.now() / 1000) - 3660,
  });
  const stale = await post(`${url}/sync-cookie`, undefined, expired);
  assertEquals(stale.status, 401);
  assertEquals(await stale.json(), { error: "not_authenticated" });
});

contractTest("POST /sync-cookie refuses the service_role and anon keys", async ({ url }) => {
  const service = await post(`${url}/sync-cookie`, undefined, await generateServiceRoleKey());
  assertEquals(service.status, 401);
  assertEquals(await service.json(), { error: "not_authenticated" });

  const anon = await post(`${url}/sync-cookie`, undefined, await generateAnonKey());
  assertEquals(anon.status, 401);
  assertEquals(await anon.json(), { error: "not_authenticated" });
});

contractTest("POST /sync-cookie is 204 with the cookie lifetime taken from exp", async ({ url, pool }) => {
  const user = await createUser(pool);
  const now = Math.floor(Date.now() / 1000);
  const token = await mintToken({
    sub: user.id,
    role: "authenticated",
    aud: "authenticated",
    exp: now + 120,
    iat: now,
    session_id: crypto.randomUUID(),
  });

  const res = await post(`${url}/sync-cookie`, undefined, token);
  assertEquals(res.status, 204);
  assertEquals(await res.text(), "");

  const cookie = setCookie(res, "sb-access-token");
  assertEquals(cookie?.startsWith(`sb-access-token=${token};`), true);
  assertEquals(cookieAttr(cookie!, "Path"), "/");
  assertEquals(cookie!.includes("HttpOnly"), true);
  assertEquals(cookieAttr(cookie!, "SameSite"), "Lax");
  assertEquals(cookie!.includes("Secure"), false);
  const maxAge = Number(cookieAttr(cookie!, "Max-Age"));
  assertEquals(maxAge > 110 && maxAge <= 120, true);
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. POST /logout
// ═══════════════════════════════════════════════════════════════════════════

contractTest("POST /logout is 204 and clears the cookie on every path", async ({ url, pool }) => {
  const user = await createUser(pool);

  for (
    const [label, token] of [
      ["no bearer", undefined],
      ["invalid token", "not-a-jwt"],
      ["valid token", await tokenFor(user)],
    ] as Array<[string, string | undefined]>
  ) {
    const res = await post(`${url}/logout`, undefined, token);
    assertEquals(res.status, 204, label);
    assertEquals(await res.text(), "", label);
    const cookie = setCookie(res, "sb-access-token");
    assertEquals(cookie?.startsWith("sb-access-token=;"), true, label);
    assertEquals(cookieAttr(cookie!, "Path"), "/", label);
    assertEquals(
      cookieAttr(cookie!, "Expires"),
      "Thu, 01 Jan 1970 00:00:00 GMT",
      label,
    );
  }
});

contractTest("POST /logout revokes only the presented session's refresh tokens", async ({ url, pool }) => {
  const user = await createUser(pool);
  const sessionId = crypto.randomUUID();
  const { token: mine } = await insertRefreshToken(pool, user.id, sessionId);
  const { token: other } = await insertRefreshToken(pool, user.id, crypto.randomUUID());

  const res = await post(`${url}/logout`, undefined, await tokenFor(user, sessionId));
  assertEquals(res.status, 204);
  await drain(res);

  assertEquals((await refreshTokenRow(pool, mine)).revoked, true);
  assertEquals((await refreshTokenRow(pool, other)).revoked, false);
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. GET /user
// ═══════════════════════════════════════════════════════════════════════════

contractTest("GET /user is 401 with the header-specific description", async ({ url }) => {
  const res = await fetch(`${url}/user`);
  assertEquals(res.status, 401);
  assertEquals(await res.json(), {
    error: "not_authenticated",
    error_description: "Missing or invalid authorization header",
  });
});

contractTest("GET /user is 401 with the token-specific description", async ({ url }) => {
  const res = await request("GET", `${url}/user`, undefined, "not-a-jwt");
  assertEquals(res.status, 401);
  assertEquals(await res.json(), {
    error: "not_authenticated",
    error_description: "Invalid or expired token",
  });
});

contractTest("GET /user is 404 user_not_found for an unknown or soft-deleted subject", async ({ url, pool }) => {
  const unknown = await request(
    "GET",
    `${url}/user`,
    undefined,
    await tokenFor({ id: crypto.randomUUID() }),
  );
  assertEquals(unknown.status, 404);
  assertEquals(await unknown.json(), {
    error: "user_not_found",
    error_description: "User not found",
  });

  const deleted = await createUser(pool, { softDeleted: true });
  const gone = await request("GET", `${url}/user`, undefined, await tokenFor(deleted));
  assertEquals(gone.status, 404);
  assertEquals(await gone.json(), {
    error: "user_not_found",
    error_description: "User not found",
  });
});

contractTest("GET /user returns the literal GoTrue user body", async ({ url, pool }) => {
  const user = await createUser(pool, {
    name: "Read Me",
    image: "https://example.test/i.png",
    role: "admin",
    mustChangePassword: true,
    userMetadata: { team: "core" },
    appMetadata: { provider: "email", providers: ["email"], tenant: "t1" },
  });

  const res = await request("GET", `${url}/user`, undefined, await tokenFor(user));
  assertEquals(res.status, 200);
  const row = await readUser(pool, user.id);

  assertEquals(await res.json(), {
    id: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    email_confirmed_at: iso(row.email_confirmed_at),
    last_sign_in_at: null,
    app_metadata: {
      provider: "email",
      providers: ["email"],
      trex_role: "admin",
      tenant: "t1",
    },
    user_metadata: {
      name: "Read Me",
      image: "https://example.test/i.png",
      must_change_password: true,
      team: "core",
    },
    identities: [],
    created_at: iso(row.createdAt),
    updated_at: iso(row.updatedAt),
  });
});

contractTest("GET /user lets stored metadata override the fixed keys", async ({ url, pool }) => {
  // The JSONB is spread after the fixed keys, so a stored trex_role or name
  // wins over the column it shadows.
  const user = await createUser(pool, {
    name: "Column Name",
    role: "user",
    userMetadata: { name: "Metadata Name" },
    appMetadata: { provider: "email", providers: ["email"], trex_role: "admin" },
  });

  const res = await request("GET", `${url}/user`, undefined, await tokenFor(user));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.app_metadata.trex_role, "admin");
  assertEquals(body.user_metadata.name, "Metadata Name");
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. PUT /user
// ═══════════════════════════════════════════════════════════════════════════

contractTest("PUT /user is 401 with the same two descriptions as GET /user", async ({ url }) => {
  const missing = await request("PUT", `${url}/user`, {});
  assertEquals(missing.status, 401);
  assertEquals(await missing.json(), {
    error: "not_authenticated",
    error_description: "Missing or invalid authorization header",
  });

  const invalid = await request("PUT", `${url}/user`, {}, "not-a-jwt");
  assertEquals(invalid.status, 401);
  assertEquals(await invalid.json(), {
    error: "not_authenticated",
    error_description: "Invalid or expired token",
  });
});

contractTest("PUT /user is 422 validation_failed and writes nothing for a short password", async ({ url, pool }) => {
  const user = await createUser(pool);
  const before = await readUser(pool, user.id);

  const res = await request("PUT", `${url}/user`, { password: "1234567" }, await tokenFor(user));
  assertEquals(res.status, 422);
  assertEquals(await res.json(), {
    error: "validation_failed",
    error_description: "Password must be at least 8 characters",
  });

  const after = await readUser(pool, user.id);
  assertEquals(after.password_hash, before.password_hash);
  assertEquals(iso(after.updatedAt), iso(before.updatedAt));
});

contractTest("PUT /user merges user_metadata shallowly", async ({ url, pool }) => {
  const user = await createUser(pool, {
    name: "Original",
    userMetadata: { keep: "me", nested: { x: 1 } },
  });

  const res = await request(
    "PUT",
    `${url}/user`,
    { data: { nested: { y: 2 }, added: true } },
    await tokenFor(user),
  );
  assertEquals(res.status, 200);
  const body = await res.json();

  assertEquals(body.user_metadata, {
    name: "Original",
    image: null,
    must_change_password: false,
    keep: "me",
    // Shallow: the whole nested object is replaced, not merged into.
    nested: { y: 2 },
    added: true,
  });
  const row = await readUser(pool, user.id);
  assertEquals(row.user_metadata, { keep: "me", nested: { y: 2 }, added: true });
  assertEquals(row.name, "Original");
});

contractTest("PUT /user writes the name and image columns from data", async ({ url, pool }) => {
  const user = await createUser(pool, { name: "Before" });

  const res = await request(
    "PUT",
    `${url}/user`,
    { data: { name: "After", image: "https://example.test/n.png" } },
    await tokenFor(user),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.user_metadata.name, "After");
  assertEquals(body.user_metadata.image, "https://example.test/n.png");

  const row = await readUser(pool, user.id);
  assertEquals(row.name, "After");
  assertEquals(row.image, "https://example.test/n.png");
});

contractTest("PUT /user changes the email with no verification step", async ({ url, pool }) => {
  const user = await createUser(pool);
  const before = await readUser(pool, user.id);
  const newEmail = uniqueEmail("changed");

  const res = await request("PUT", `${url}/user`, { email: newEmail }, await tokenFor(user));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.email, newEmail);

  const row = await readUser(pool, user.id);
  assertEquals(row.email, newEmail);
  // The new address inherits the old one's confirmation outright.
  assertEquals(row.emailVerified, true);
  assertEquals(iso(row.email_confirmed_at), iso(before.email_confirmed_at));
  assertEquals(
    await pool.query(
      `SELECT count(*)::int AS n FROM trexdb.verification WHERE identifier = $1`,
      [newEmail],
    ).then((r: Json) => r.rows[0].n),
    0,
  );
});

contractTest("PUT /user with no updates returns the current row untouched", async ({ url, pool }) => {
  const user = await createUser(pool);
  const before = await readUser(pool, user.id);

  const res = await request("PUT", `${url}/user`, {}, await tokenFor(user));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.id, user.id);
  assertEquals(body.updated_at, iso(before.updatedAt));
  assertEquals(iso((await readUser(pool, user.id)).updatedAt), iso(before.updatedAt));
});

contractTest("PUT /user password change mirrors the hash and revokes refresh tokens", async ({ url, pool }) => {
  const user = await createUser(pool);
  await pool.query(
    `INSERT INTO trexdb.account (id, "userId", "accountId", "providerId", password)
     VALUES ($1, $2, $2, 'credential', 'stale')`,
    [crypto.randomUUID(), user.id],
  );
  const { token: refresh } = await insertRefreshToken(pool, user.id, crypto.randomUUID());
  const before = await readUser(pool, user.id);

  const res = await request(
    "PUT",
    `${url}/user`,
    { password: "a-brand-new-password" },
    await tokenFor(user),
  );
  assertEquals(res.status, 200);
  await drain(res);

  const after = await readUser(pool, user.id);
  assertNotEquals(after.password_hash, before.password_hash);
  const account = await pool.query(
    `SELECT password FROM trexdb.account WHERE "userId" = $1 AND "providerId" = 'credential'`,
    [user.id],
  );
  assertEquals(account.rows[0].password, after.password_hash);
  assertEquals((await refreshTokenRow(pool, refresh)).revoked, true);
});

contractTest("PUT /user is 404 user_not_found with no description", async ({ url, pool }) => {
  const user = await createUser(pool, { softDeleted: true });
  const res = await request("PUT", `${url}/user`, {}, await tokenFor(user));
  assertEquals(res.status, 404);
  assertEquals(await res.json(), { error: "user_not_found" });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. POST /recover
// ═══════════════════════════════════════════════════════════════════════════

contractTest("POST /recover is always 200 {} and issues nothing", async ({ url, pool }) => {
  const user = await createUser(pool);
  const verificationsBefore = await pool.query(
    `SELECT count(*)::int AS n FROM trexdb.verification`,
  );

  for (
    const body of [
      { email: user.email },
      { email: `nobody${TEST_DOMAIN}` },
      {},
    ]
  ) {
    const res = await post(`${url}/recover`, body);
    assertEquals(res.status, 200);
    assertEquals(await res.json(), {});
  }

  const verificationsAfter = await pool.query(
    `SELECT count(*)::int AS n FROM trexdb.verification`,
  );
  assertEquals(verificationsAfter.rows[0].n, verificationsBefore.rows[0].n);
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. POST /password-changed
// ═══════════════════════════════════════════════════════════════════════════

contractTest("POST /password-changed is 401 Unauthorized, not not_authenticated", async ({ url }) => {
  const missing = await post(`${url}/password-changed`);
  assertEquals(missing.status, 401);
  assertEquals(await missing.json(), { error: "Unauthorized" });

  const invalid = await post(`${url}/password-changed`, undefined, "not-a-jwt");
  assertEquals(invalid.status, 401);
  assertEquals(await invalid.json(), { error: "Unauthorized" });
});

contractTest("POST /password-changed clears mustChangePassword", async ({ url, pool }) => {
  const user = await createUser(pool, { mustChangePassword: true });

  const res = await post(`${url}/password-changed`, undefined, await tokenFor(user));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { success: true });
  assertEquals((await readUser(pool, user.id)).mustChangePassword, false);
});

contractTest("POST /password-changed succeeds for a subject with no row", async ({ url }) => {
  // The UPDATE matches nothing and no row count is checked, so an unknown
  // subject is reported as a success.
  const res = await post(
    `${url}/password-changed`,
    undefined,
    await tokenFor({ id: crypto.randomUUID() }),
  );
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { success: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. POST /change-password
// ═══════════════════════════════════════════════════════════════════════════

contractTest("POST /change-password is 401 not_authenticated without a usable bearer", async ({ url }) => {
  const missing = await post(`${url}/change-password`, {});
  assertEquals(missing.status, 401);
  assertEquals(await missing.json(), { error: "not_authenticated" });

  const invalid = await post(`${url}/change-password`, {}, "not-a-jwt");
  assertEquals(invalid.status, 401);
  assertEquals(await invalid.json(), { error: "not_authenticated" });
});

contractTest("POST /change-password reports its validation failures as sentences", async ({ url, pool }) => {
  const user = await createUser(pool);
  const token = await tokenFor(user);

  const missing = await post(`${url}/change-password`, { currentPassword: user.password }, token);
  assertEquals(missing.status, 400);
  assertEquals(await missing.json(), {
    error: "Current password and new password are required",
  });

  const short = await post(
    `${url}/change-password`,
    { currentPassword: user.password, newPassword: "1234567" },
    token,
  );
  assertEquals(short.status, 422);
  assertEquals(await short.json(), { error: "Password must be at least 8 characters" });

  const wrong = await post(
    `${url}/change-password`,
    { currentPassword: "not-the-password", newPassword: "a-long-new-password" },
    token,
  );
  assertEquals(wrong.status, 400);
  assertEquals(await wrong.json(), { error: "Current password is incorrect" });
});

contractTest("POST /change-password is 404 User not found for an unknown subject", async ({ url }) => {
  const res = await post(
    `${url}/change-password`,
    { currentPassword: "whatever-it-is", newPassword: "a-long-new-password" },
    await tokenFor({ id: crypto.randomUUID() }),
  );
  assertEquals(res.status, 404);
  assertEquals(await res.json(), { error: "User not found" });
});

contractTest("POST /change-password is 400 when the account has no password", async ({ url, pool }) => {
  const user = await createUser(pool, { password: null });
  const res = await post(
    `${url}/change-password`,
    { currentPassword: "whatever-it-is", newPassword: "a-long-new-password" },
    await tokenFor(user),
  );
  assertEquals(res.status, 400);
  assertEquals(await res.json(), { error: "No password set for this account" });
});

contractTest("POST /change-password rotates the hash and revokes refresh tokens", async ({ url, pool }) => {
  const user = await createUser(pool);
  await pool.query(
    `INSERT INTO trexdb.account (id, "userId", "accountId", "providerId", password)
     VALUES ($1, $2, $2, 'credential', 'stale')`,
    [crypto.randomUUID(), user.id],
  );
  const { token: refresh } = await insertRefreshToken(pool, user.id, crypto.randomUUID());

  const res = await post(
    `${url}/change-password`,
    { currentPassword: user.password, newPassword: "a-long-new-password" },
    await tokenFor(user),
  );
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { success: true });

  const row = await readUser(pool, user.id);
  const account = await pool.query(
    `SELECT password FROM trexdb.account WHERE "userId" = $1 AND "providerId" = 'credential'`,
    [user.id],
  );
  assertEquals(account.rows[0].password, row.password_hash);
  assertEquals((await refreshTokenRow(pool, refresh)).revoked, true);

  await withEnv({ TREX_NATIVE_PASSWORD_LOGIN_ENABLED: undefined }, async () => {
    const grant = await post(`${url}/token?grant_type=password`, {
      email: user.email,
      password: "a-long-new-password",
    });
    assertEquals(grant.status, 200);
    await drain(grant);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. GET /sessions
// ═══════════════════════════════════════════════════════════════════════════

contractTest("GET /sessions is 401 not_authenticated without a usable bearer", async ({ url }) => {
  const missing = await fetch(`${url}/sessions`);
  assertEquals(missing.status, 401);
  assertEquals(await missing.json(), { error: "not_authenticated" });

  const invalid = await request("GET", `${url}/sessions`, undefined, "not-a-jwt");
  assertEquals(invalid.status, 401);
  assertEquals(await invalid.json(), { error: "not_authenticated" });
});

contractTest("GET /sessions is a bare array with literal nulls, one row per session", async ({ url, pool }) => {
  const user = await createUser(pool);
  const sessionA = crypto.randomUUID();
  const sessionB = crypto.randomUUID();
  // Two live tokens in session A: DISTINCT ON collapses them to the newest.
  await insertRefreshToken(pool, user.id, sessionA);
  const newestA = await insertRefreshToken(pool, user.id, sessionA);
  const onlyB = await insertRefreshToken(pool, user.id, sessionB);
  const revoked = await insertRefreshToken(pool, user.id, crypto.randomUUID());
  await pool.query(`UPDATE trexdb.refresh_token SET revoked = true WHERE id = $1`, [revoked.id]);
  // Another user's session must not appear.
  const stranger = await createUser(pool);
  await insertRefreshToken(pool, stranger.id, crypto.randomUUID());

  const res = await request("GET", `${url}/sessions`, undefined, await tokenFor(user));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(Array.isArray(body), true);
  assertEquals(body.length, 2);

  const rows = await pool.query(
    `SELECT id, session_id, "createdAt", "updatedAt" FROM trexdb.refresh_token WHERE id = ANY($1)`,
    [[newestA.id, onlyB.id]],
  );
  const expected = rows.rows
    .map((r: Json) => ({
      id: r.id,
      token: r.session_id,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
      ipAddress: null,
      userAgent: null,
      expiresAt: null,
    }))
    .sort((a: Json, b: Json) => a.id.localeCompare(b.id));

  assertEquals(
    body.slice().sort((a: Json, b: Json) => a.id.localeCompare(b.id)),
    expected,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. POST /revoke-session
// ═══════════════════════════════════════════════════════════════════════════

contractTest("POST /revoke-session is 401 not_authenticated without a usable bearer", async ({ url }) => {
  const missing = await post(`${url}/revoke-session`, {});
  assertEquals(missing.status, 401);
  assertEquals(await missing.json(), { error: "not_authenticated" });

  const invalid = await post(`${url}/revoke-session`, {}, "not-a-jwt");
  assertEquals(invalid.status, 401);
  assertEquals(await invalid.json(), { error: "not_authenticated" });
});

contractTest("POST /revoke-session is 400 without a session_id", async ({ url, pool }) => {
  const user = await createUser(pool);
  const res = await post(`${url}/revoke-session`, {}, await tokenFor(user));
  assertEquals(res.status, 400);
  assertEquals(await res.json(), { error: "session_id is required" });
});

contractTest("POST /revoke-session revokes trex's session_id UUID", async ({ url, pool }) => {
  const user = await createUser(pool);
  const sessionId = crypto.randomUUID();
  const { token } = await insertRefreshToken(pool, user.id, sessionId);

  const res = await post(`${url}/revoke-session`, { session_id: sessionId }, await tokenFor(user));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { success: true });
  assertEquals((await refreshTokenRow(pool, token)).revoked, true);
});

contractTest("POST /revoke-session is success even when nothing matched", async ({ url, pool }) => {
  const user = await createUser(pool);
  const stranger = await createUser(pool);
  const strangerSession = crypto.randomUUID();
  const { token } = await insertRefreshToken(pool, stranger.id, strangerSession);

  const unknown = await post(
    `${url}/revoke-session`,
    { session_id: crypto.randomUUID() },
    await tokenFor(user),
  );
  assertEquals(unknown.status, 200);
  assertEquals(await unknown.json(), { success: true });

  // Someone else's session is a silent no-op that still reports success.
  const theirs = await post(
    `${url}/revoke-session`,
    { session_id: strangerSession },
    await tokenFor(user),
  );
  assertEquals(theirs.status, 200);
  assertEquals(await theirs.json(), { success: true });
  assertEquals((await refreshTokenRow(pool, token)).revoked, false);
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. GET /accounts
// ═══════════════════════════════════════════════════════════════════════════

contractTest("GET /accounts is 401 not_authenticated without a usable bearer", async ({ url }) => {
  const missing = await fetch(`${url}/accounts`);
  assertEquals(missing.status, 401);
  assertEquals(await missing.json(), { error: "not_authenticated" });

  const invalid = await request("GET", `${url}/accounts`, undefined, "not-a-jwt");
  assertEquals(invalid.status, 401);
  assertEquals(await invalid.json(), { error: "not_authenticated" });
});

contractTest("GET /accounts is a bare array of raw account rows", async ({ url, pool }) => {
  const user = await createUser(pool, { accountOnlyPassword: "legacy-password" });

  const res = await request("GET", `${url}/accounts`, undefined, await tokenFor(user));
  assertEquals(res.status, 200);
  const rows = await pool.query(
    `SELECT id, "createdAt" FROM trexdb.account WHERE "userId" = $1`,
    [user.id],
  );
  assertEquals(await res.json(), [
    {
      id: rows.rows[0].id,
      providerId: "credential",
      accountId: user.id,
      createdAt: iso(rows.rows[0].createdAt),
    },
  ]);
});

contractTest("GET /accounts is an empty array for a user with none", async ({ url, pool }) => {
  const user = await createUser(pool);
  const res = await request("GET", `${url}/accounts`, undefined, await tokenFor(user));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), []);
});

// ═══════════════════════════════════════════════════════════════════════════
// 13. GET /settings
// ═══════════════════════════════════════════════════════════════════════════

contractTest("GET /settings needs no authentication and follows auth.selfRegistration", async ({ url, pool }) => {
  await withEnv(
    { TREX_NATIVE_PASSWORD_LOGIN_ENABLED: undefined, TREX_FEDERATION_ENABLED: "false" },
    async () => {
      await withSetting(pool, "auth.selfRegistration", undefined, async () => {
        const res = await fetch(`${url}/settings`);
        assertEquals(res.status, 200);
        assertEquals(await res.json(), {
          external: { email: true },
          disable_signup: true,
          mailer_autoconfirm: true,
          phone_autoconfirm: false,
          sms_provider: "",
        });
      });

      await withSetting(pool, "auth.selfRegistration", true, async () => {
        const res = await fetch(`${url}/settings`);
        assertEquals(res.status, 200);
        assertEquals(await res.json(), {
          external: { email: true },
          disable_signup: false,
          mailer_autoconfirm: true,
          phone_autoconfirm: false,
          sms_provider: "",
        });
      });
    },
  );
});

contractTest("GET /settings hides the password form when the switch is off", async ({ url, pool }) => {
  await withEnv(
    { TREX_NATIVE_PASSWORD_LOGIN_ENABLED: "false", TREX_FEDERATION_ENABLED: "false" },
    async () => {
      await withSetting(pool, "auth.selfRegistration", true, async () => {
        const res = await fetch(`${url}/settings`);
        assertEquals(res.status, 200);
        assertEquals(await res.json(), {
          external: { email: false },
          disable_signup: false,
          mailer_autoconfirm: true,
          phone_autoconfirm: false,
          sms_provider: "",
        });
      });
    },
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// 14. GET /health
// ═══════════════════════════════════════════════════════════════════════════

contractTest("GET /health is the unauthenticated GoTrue banner", async ({ url }) => {
  const res = await fetch(`${url}/health`);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), {
    version: "trex-gotrue-1.0.0",
    name: "GoTrue",
    description: "Trex GoTrue-compatible auth",
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 15-18. The admin block
// ═══════════════════════════════════════════════════════════════════════════

interface AdminRoute {
  label: string;
  method: string;
  path: (id: string) => string;
  body?: unknown;
}

const ADMIN_ROUTES: AdminRoute[] = [
  { label: "POST /admin/create-user", method: "POST", path: () => "/admin/create-user", body: {} },
  { label: "POST /admin/users", method: "POST", path: () => "/admin/users", body: {} },
  { label: "PUT /admin/users/:id", method: "PUT", path: (id) => `/admin/users/${id}`, body: {} },
  { label: "GET /admin/users/:id", method: "GET", path: (id) => `/admin/users/${id}` },
  { label: "DELETE /admin/users/:id", method: "DELETE", path: (id) => `/admin/users/${id}` },
];

for (const route of ADMIN_ROUTES) {
  contractTest(`${route.label} is 401 not_authenticated without a usable bearer`, async ({ url, pool }) => {
    const target = await createUser(pool);

    const missing = await request(route.method, `${url}${route.path(target.id)}`, route.body);
    assertEquals(missing.status, 401);
    assertEquals(await missing.json(), { error: "not_authenticated" });

    const invalid = await request(
      route.method,
      `${url}${route.path(target.id)}`,
      route.body,
      "not-a-jwt",
    );
    assertEquals(invalid.status, 401);
    assertEquals(await invalid.json(), { error: "not_authenticated" });
  });

  contractTest(`${route.label} is 403 forbidden for an ordinary user`, async ({ url, pool }) => {
    const caller = await createUser(pool, { role: "user" });
    const target = await createUser(pool);

    const res = await request(
      route.method,
      `${url}${route.path(target.id)}`,
      route.body,
      await tokenFor(caller),
    );
    assertEquals(res.status, 403);
    assertEquals(await res.json(), {
      error: "forbidden",
      error_description: "Admin access required",
    });
  });
}

/** The two authorizations the admin block accepts, checked on every route. */
async function adminBearers(pool: PgPool): Promise<Array<[string, string]>> {
  const admin = await createUser(pool, { role: "admin" });
  return [
    ["app_metadata.trex_role admin", await tokenFor(admin)],
    ["service_role key", await generateServiceRoleKey()],
  ];
}

contractTest("POST /admin/create-user accepts both admin authorizations", async ({ url, pool }) => {
  for (const [label, bearer] of await adminBearers(pool)) {
    const email = uniqueEmail("adminnew");
    const res = await post(
      `${url}/admin/create-user`,
      { email, password: "long-enough-password" },
      bearer,
    );
    assertEquals(res.status, 200, label);
    const body = await res.json();
    assertEquals(body.email, email, label);
    assertEquals(body.aud, "authenticated", label);
    // A user body, not a token response.
    assertEquals("access_token" in body, false, label);
  }
});

contractTest("POST /admin/users accepts both admin authorizations", async ({ url, pool }) => {
  for (const [label, bearer] of await adminBearers(pool)) {
    const email = uniqueEmail("adminalias");
    const res = await post(
      `${url}/admin/users`,
      { email, password: "long-enough-password" },
      bearer,
    );
    assertEquals(res.status, 200, label);
    const body = await res.json();
    assertEquals(body.email, email, label);
    assertEquals("access_token" in body, false, label);
  }
});

contractTest("POST /admin/create-user returns the literal GoTrue user body", async ({ url, pool }) => {
  const admin = await createUser(pool, { role: "admin" });
  const email = uniqueEmail("adminbody");

  const res = await post(
    `${url}/admin/create-user`,
    { email, password: "long-enough-password", data: { name: "Made By Admin", role: "admin" } },
    await tokenFor(admin),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  const row = await pool.query(`SELECT * FROM trexdb."user" WHERE email = $1`, [email]);
  const created = row.rows[0];

  assertEquals(body, {
    id: created.id,
    aud: "authenticated",
    role: "authenticated",
    email,
    email_confirmed_at: iso(created.email_confirmed_at),
    last_sign_in_at: null,
    app_metadata: { provider: "email", providers: ["email"], trex_role: "admin" },
    user_metadata: {
      name: "Made By Admin",
      image: null,
      must_change_password: false,
      role: "admin",
    },
    identities: [],
    created_at: iso(created.createdAt),
    updated_at: iso(created.updatedAt),
  });
});

contractTest("POST /admin/create-user enforces no minimum password length", async ({ url, pool }) => {
  // Unlike /signup and PUT /admin/users/:id, this route has no length check.
  const admin = await createUser(pool, { role: "admin" });
  const email = uniqueEmail("adminshort");

  const res = await post(
    `${url}/admin/create-user`,
    { email, password: "x" },
    await tokenFor(admin),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.email, email);
});

contractTest("POST /admin/create-user validates the body after authorization", async ({ url, pool }) => {
  const admin = await createUser(pool, { role: "admin" });
  const existing = await createUser(pool);
  const token = await tokenFor(admin);

  const missing = await post(`${url}/admin/create-user`, {}, token);
  assertEquals(missing.status, 422);
  assertEquals(await missing.json(), {
    error: "validation_failed",
    error_description: "Email and password are required",
  });

  const duplicate = await post(
    `${url}/admin/create-user`,
    { email: existing.email, password: "long-enough-password" },
    token,
  );
  assertEquals(duplicate.status, 422);
  assertEquals(await duplicate.json(), {
    error: "user_already_exists",
    error_description: "A user with this email already exists",
  });
});

contractTest("PUT /admin/users/:id accepts both admin authorizations", async ({ url, pool }) => {
  for (const [label, bearer] of await adminBearers(pool)) {
    const target = await createUser(pool);
    const res = await request(
      "PUT",
      `${url}/admin/users/${target.id}`,
      { banned: true },
      bearer,
    );
    assertEquals(res.status, 200, label);
    const body = await res.json();
    assertEquals(body.id, target.id, label);
    assertEquals((await readUser(pool, target.id)).banned, true, label);
  }
});

contractTest("PUT /admin/users/:id validates its body in order", async ({ url, pool }) => {
  const admin = await createUser(pool, { role: "admin" });
  const target = await createUser(pool);
  const token = await tokenFor(admin);

  const neither = await request("PUT", `${url}/admin/users/${target.id}`, {}, token);
  assertEquals(neither.status, 422);
  assertEquals(await neither.json(), {
    error: "validation_failed",
    error_description: "One of 'password' or 'banned' is required",
  });

  // This one is a bare sentence, unlike its neighbours.
  const short = await request(
    "PUT",
    `${url}/admin/users/${target.id}`,
    { password: "1234567" },
    token,
  );
  assertEquals(short.status, 422);
  assertEquals(await short.json(), { error: "Password must be at least 8 characters" });

  const notBoolean = await request(
    "PUT",
    `${url}/admin/users/${target.id}`,
    { banned: "yes" },
    token,
  );
  assertEquals(notBoolean.status, 422);
  assertEquals(await notBoolean.json(), {
    error: "validation_failed",
    error_description: "'banned' must be a boolean",
  });

  const unknown = await request(
    "PUT",
    `${url}/admin/users/${crypto.randomUUID()}`,
    { banned: true },
    token,
  );
  assertEquals(unknown.status, 404);
  assertEquals(await unknown.json(), { error: "User not found" });
});

contractTest("PUT /admin/users/:id resets a password and revokes refresh tokens", async ({ url, pool }) => {
  const admin = await createUser(pool, { role: "admin" });
  const target = await createUser(pool);
  await pool.query(
    `INSERT INTO trexdb.account (id, "userId", "accountId", "providerId", password)
     VALUES ($1, $2, $2, 'credential', 'stale')`,
    [crypto.randomUUID(), target.id],
  );
  const { token: refresh } = await insertRefreshToken(pool, target.id, crypto.randomUUID());

  const res = await request(
    "PUT",
    `${url}/admin/users/${target.id}`,
    { password: "admin-set-password" },
    await tokenFor(admin),
  );
  assertEquals(res.status, 200);
  await drain(res);

  const row = await readUser(pool, target.id);
  const account = await pool.query(
    `SELECT password FROM trexdb.account WHERE "userId" = $1 AND "providerId" = 'credential'`,
    [target.id],
  );
  assertEquals(account.rows[0].password, row.password_hash);
  assertEquals((await refreshTokenRow(pool, refresh)).revoked, true);
});

contractTest("PUT /admin/users/:id revokes on a ban but not on an unban", async ({ url, pool }) => {
  const admin = await createUser(pool, { role: "admin" });
  const token = await tokenFor(admin);

  const banned = await createUser(pool);
  const banRefresh = await insertRefreshToken(pool, banned.id, crypto.randomUUID());
  const ban = await request("PUT", `${url}/admin/users/${banned.id}`, { banned: true }, token);
  assertEquals(ban.status, 200);
  await drain(ban);
  assertEquals((await refreshTokenRow(pool, banRefresh.token)).revoked, true);

  const unbanned = await createUser(pool, { banned: true });
  const unbanRefresh = await insertRefreshToken(pool, unbanned.id, crypto.randomUUID());
  const unban = await request("PUT", `${url}/admin/users/${unbanned.id}`, { banned: false }, token);
  assertEquals(unban.status, 200);
  await drain(unban);
  assertEquals((await readUser(pool, unbanned.id)).banned, false);
  assertEquals((await refreshTokenRow(pool, unbanRefresh.token)).revoked, false);
});

contractTest("GET /admin/users/:id accepts both admin authorizations", async ({ url, pool }) => {
  for (const [label, bearer] of await adminBearers(pool)) {
    const target = await createUser(pool);
    const res = await request("GET", `${url}/admin/users/${target.id}`, undefined, bearer);
    assertEquals(res.status, 200, label);
    const body = await res.json();
    assertEquals(body.id, target.id, label);
  }
});

contractTest("GET /admin/users/:id returns the literal GoTrue user body", async ({ url, pool }) => {
  const admin = await createUser(pool, { role: "admin" });
  const target = await createUser(pool, { name: "Looked Up" });

  const res = await request(
    "GET",
    `${url}/admin/users/${target.id}`,
    undefined,
    await tokenFor(admin),
  );
  assertEquals(res.status, 200);
  const row = await readUser(pool, target.id);
  assertEquals(await res.json(), {
    id: target.id,
    aud: "authenticated",
    role: "authenticated",
    email: target.email,
    email_confirmed_at: iso(row.email_confirmed_at),
    last_sign_in_at: null,
    app_metadata: { provider: "email", providers: ["email"], trex_role: "user" },
    user_metadata: { name: "Looked Up", image: null, must_change_password: false },
    identities: [],
    created_at: iso(row.createdAt),
    updated_at: iso(row.updatedAt),
  });
});

contractTest("GET /admin/users/:id is 404 User not found", async ({ url, pool }) => {
  const admin = await createUser(pool, { role: "admin" });
  const deleted = await createUser(pool, { softDeleted: true });
  const token = await tokenFor(admin);

  const unknown = await request(
    "GET",
    `${url}/admin/users/${crypto.randomUUID()}`,
    undefined,
    token,
  );
  assertEquals(unknown.status, 404);
  assertEquals(await unknown.json(), { error: "User not found" });

  const soft = await request("GET", `${url}/admin/users/${deleted.id}`, undefined, token);
  assertEquals(soft.status, 404);
  assertEquals(await soft.json(), { error: "User not found" });
});

contractTest("DELETE /admin/users/:id accepts both admin authorizations", async ({ url, pool }) => {
  for (const [label, bearer] of await adminBearers(pool)) {
    const target = await createUser(pool);
    const res = await request("DELETE", `${url}/admin/users/${target.id}`, undefined, bearer);
    assertEquals(res.status, 200, label);
    assertEquals(await res.json(), {}, label);
  }
});

contractTest("DELETE /admin/users/:id hard-deletes the row and its tokens", async ({ url, pool }) => {
  const admin = await createUser(pool, { role: "admin" });
  const target = await createUser(pool, { accountOnlyPassword: "legacy-password" });
  const { token: refresh } = await insertRefreshToken(pool, target.id, crypto.randomUUID());

  const res = await request(
    "DELETE",
    `${url}/admin/users/${target.id}`,
    undefined,
    await tokenFor(admin),
  );
  assertEquals(res.status, 200);
  assertEquals(await res.json(), {});

  assertEquals(await readUser(pool, target.id), null);
  assertEquals(await refreshTokenRow(pool, refresh), null);
  const accounts = await pool.query(
    `SELECT count(*)::int AS n FROM trexdb.account WHERE "userId" = $1`,
    [target.id],
  );
  assertEquals(accounts.rows[0].n, 0);
});

contractTest("DELETE /admin/users/:id is 404 User not found", async ({ url, pool }) => {
  const admin = await createUser(pool, { role: "admin" });
  const res = await request(
    "DELETE",
    `${url}/admin/users/${crypto.randomUUID()}`,
    undefined,
    await tokenFor(admin),
  );
  assertEquals(res.status, 404);
  assertEquals(await res.json(), { error: "User not found" });
});

// ═══════════════════════════════════════════════════════════════════════════
// The mount-level native IdP switch (index.ts:180-192)
// ═══════════════════════════════════════════════════════════════════════════

mountTest("the whole prefix is 403 idp_disabled while TREX_IDP_ENABLED is off", async () => {
  await withEnv({ TREX_IDP_ENABLED: undefined }, async () => {
    const server = await startMountedContractServer();
    try {
      for (const path of ["/health", "/settings", "/signup", "/token?grant_type=password"]) {
        const res = await fetch(`${server.url}${path}`, { method: "POST" });
        assertEquals(res.status, 403, path);
        assertEquals(await res.json(), {
          error: "idp_disabled",
          error_description: "Native login is disabled. Set TREX_IDP_ENABLED=true to enable it.",
        }, path);
      }
    } finally {
      await server.close();
    }
  });
});

mountTest("the routes are reachable once TREX_IDP_ENABLED is on", async () => {
  await withEnv({ TREX_IDP_ENABLED: "true" }, async () => {
    const server = await startMountedContractServer();
    try {
      const res = await fetch(`${server.url}/health`);
      assertEquals(res.status, 200);
      assertEquals(await res.json(), {
        version: "trex-gotrue-1.0.0",
        name: "GoTrue",
        description: "Trex GoTrue-compatible auth",
      });
    } finally {
      await server.close();
    }
  });
});
