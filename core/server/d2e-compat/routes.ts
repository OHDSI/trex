/**
 * d2e-compat Express routes.
 *
 * Mounted only when D2E_COMPAT=true (see core/server/d2e-compat/index.ts).
 *
 * Routes and their protection levels:
 *
 *  /WebAPI/*             — logtoAuthn  (Logto JWT optional; WebAPI rejects unauthenticated callers itself)
 *  /logto                — public      (the Logto UI worker handles its own auth)
 *  /oauth/token          — public      (Logto PKCE token exchange; d2e base.ts: no authn/authz middleware)
 *  /portal/plugin.json   — public      (d2e portal.ts: no authn/authz middleware)
 *  /portal/env.js        — public      (d2e portal.ts: no authn/authz middleware)
 *  /trex/db/*            — requireAdmin (d2e: authn + authz → ALP_SYSTEM_ADMIN scope required)
 *  /trex/log             — requireAdmin (d2e: authn + authz → trex.log.write scope, assigned to ALP_SYSTEM_ADMIN)
 *
 * Env vars consumed (d2e names → trex Deno.env key):
 *   LOGTO__ISSUER                — Logto issuer URL (shared with auth.ts)
 *   GATEWAY__WO_PROTOCOL_FQDN   — hostname used to build portal URLs
 *   LOGTO__CLIENT_ID             — OIDC client id
 *   LOGTO__SCOPE                 — OIDC scopes string
 *   LOGTO__TOKEN_URL             — token endpoint URL for /oauth/token exchange
 *   LOGTO__RESOURCE_API          — resource indicator appended to token request
 *   SECURITY_AUTH_OIDC_APISECRET — client_secret appended to token request
 *   APP_LOCALE                   — portal locale
 *   GIT_COMMIT                   — build commit SHA
 *   IDP__RELYING_PARTY           — portal IDP relying party
 *   IDP__REQUIRED_CLAIM          — portal IDP required claim
 *   DB_CREDENTIALS__PUBLIC_KEYS  — RSA public keys for credential encryption
 *   PORTAL__LOG_DISCLAIMER       — portal log disclaimer text
 *   USE_PUBLIC_WEBAPI_PROXY      — portal flag
 *   PUBLIC_WEBAPI_PROXY_URL      — portal URL
 *   PUBLIC_WEBAPI_DATASOURCE     — portal datasource
 *   GATEWAY__IDP_SUBJECT_PROP    — JWT subject claim key (default: sub)
 */

import type { Express } from "express";
import { logtoAuthn, requireAdmin } from "./auth.ts";
import { pool } from "../db.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read a Deno env var; returns empty string if unset (never throws). */
function envGet(key: string): string {
  return Deno.env.get(key) ?? "";
}

/** Build a web Request from an Express req for proxying to a fetch-based worker. */
async function buildWebRequest(req: any): Promise<Request> {
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "http";
  const host = req.headers.host ?? "localhost";
  const url = `${proto}://${host}${req.originalUrl}`;

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers as Record<string, string | string[]>)) {
    if (v) headers.set(k, Array.isArray(v) ? v.join(", ") : String(v));
  }

  let body: ArrayBuffer | null = null;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const chunks: Uint8Array[] = [];
    for await (const chunk of req as unknown as AsyncIterable<Uint8Array | string>) {
      chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
    }
    if (chunks.length) body = await new Blob(chunks as BlobPart[]).arrayBuffer();
  }

  return new Request(url, {
    method: req.method,
    headers,
    body: body as BodyInit | null,
    redirect: "manual",
  });
}

/** Pipe a web Response back to an Express res. */
async function pipeResponse(webRes: Response, res: any): Promise<void> {
  res.status(webRes.status);
  webRes.headers.forEach((val: string, key: string) => {
    if (key.toLowerCase() !== "transfer-encoding") res.setHeader(key, val);
  });
  res.send(Buffer.from(await webRes.arrayBuffer()));
}

// ---------------------------------------------------------------------------
// Validation helper (ported from d2e middleware/dbm.ts, without Hono)
// ---------------------------------------------------------------------------
const DB_CODE_RE = /^[A-Za-z0-9_]+$/;

function isValidDbCode(code: unknown): boolean {
  return typeof code === "string" && DB_CODE_RE.test(code);
}

// ---------------------------------------------------------------------------
// /portal/env.js helpers
// ---------------------------------------------------------------------------
function certEscapeNewLine(str: string): string {
  return str.replace(/-----BEGIN PUBLIC KEY-----(.*?)-----END PUBLIC KEY-----/gs, (match) =>
    match.replace(/\n/g, "\\n")
  );
}

// ---------------------------------------------------------------------------
// mountD2eRoutes — extends the Express app with all d2e thin-shell routes.
// ---------------------------------------------------------------------------
export function mountD2eRoutes(app: Express): void {
  // ─────────────────────────────────────────────────────────────────────────
  // /WebAPI/* proxy — Task 1.3 route; unchanged.
  // ─────────────────────────────────────────────────────────────────────────
  app.all(/^\/WebAPI\/.*/, logtoAuthn, async (req: any, res: any) => {
    const target = `http://localhost:8080${(req as any).originalUrl}`;
    const headers = new Headers();
    for (const [k, v] of Object.entries((req as any).headers as Record<string, string | string[]>)) {
      if (v && k.toLowerCase() !== "host") headers.set(k, Array.isArray(v) ? v.join(", ") : String(v));
    }
    const tok = (req as any).webApiToken;
    if (tok) headers.set("Authorization", `Bearer ${tok}`);
    let body: ArrayBuffer | undefined;
    if ((req as any).method !== "GET" && (req as any).method !== "HEAD") {
      const chunks: Uint8Array[] = [];
      for await (const c of req as any) chunks.push(typeof c === "string" ? new TextEncoder().encode(c) : c);
      if (chunks.length) body = await new Blob(chunks as BlobPart[]).arrayBuffer();
    }
    try {
      const r = await fetch(target, { method: (req as any).method, headers, body: body as BodyInit | undefined, redirect: "manual" });
      (res as any).status(r.status);
      r.headers.forEach((val, key) => { if (key.toLowerCase() !== "transfer-encoding") (res as any).setHeader(key, val); });
      (res as any).send(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      console.error(`[d2e-compat] WebAPI proxy error: ${e}`);
      (res as any).status(502).json({ error: "WebAPI proxy error" });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // /logto — Logto UI worker  (PUBLIC)
  //
  // Ported from d2e services/trex/core/server/index.ts lines 229–292.
  // The EdgeRuntime global is available in the trex main at runtime.
  // servicePath uses the absolute path where the d2e Dockerfile copies the
  // Logto worker: /usr/src/logto.
  //
  // Degradation: if EdgeRuntime is absent (plain Deno, not the trex runtime),
  // the route returns 503 rather than crashing route registration.
  // ─────────────────────────────────────────────────────────────────────────
  app.all("/logto", async (req: any, res: any) => {
    const er = (globalThis as any).EdgeRuntime;
    if (!er) {
      console.warn("[d2e-compat] /logto: EdgeRuntime not available");
      (res as any).status(503).json({ error: "Logto worker unavailable (EdgeRuntime not present)" });
      return;
    }

    const webReq = await buildWebRequest(req);

    const createWorker = async () => {
      const memoryLimitMb = 150;
      const workerTimeoutMs = 5 * 60 * 1000;
      const noModuleCache = false;
      const envVarsObj = Deno.env.toObject();
      const envVars = Object.keys(envVarsObj).map((k) => [k, envVarsObj[k]]);
      const forceCreate = false;
      const cpuTimeSoftLimitMs = 10_000;
      const cpuTimeHardLimitMs = 20_000;
      const staticPatterns = ["./logto/**/*.html"];

      return await er.userWorkers.create({
        servicePath: "/usr/src/logto",
        memoryLimitMb,
        workerTimeoutMs,
        noModuleCache,
        envVars,
        forceCreate,
        cpuTimeSoftLimitMs,
        cpuTimeHardLimitMs,
        staticPatterns,
        context: {
          useReadSyncFileAPI: true,
          unstableSloppyImports: true,
        },
        otelConfig: {
          tracing_enabled: false,
          propagators: [],
        },
      });
    };

    const callWorker = async (): Promise<Response> => {
      try {
        const worker = await createWorker();
        const controller = new AbortController();
        return await worker.fetch(webReq, { signal: controller.signal });
      } catch (e: any) {
        // WorkerAlreadyRetired is an EdgeRuntime-only Deno error; check by name
        // to avoid a TS2339 on plain Deno.errors which lacks this type.
        if (e?.constructor?.name === "WorkerAlreadyRetired" || e?.name === "WorkerAlreadyRetired") {
          return await callWorker();
        }
        return new Response(JSON.stringify({ msg: String(e) }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    };

    try {
      const workerRes = await callWorker();
      await pipeResponse(workerRes, res);
    } catch (e) {
      console.error(`[d2e-compat] /logto worker error: ${e}`);
      (res as any).status(500).json({ error: "Logto worker error" });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // /oauth/token — Logto PKCE token exchange  (PUBLIC)
  //
  // Ported from d2e services/trex/core/server/routes/base.ts.
  // Forwards the form body to LOGTO__TOKEN_URL, appending client_secret and
  // resource from env if not already present.
  //
  // Env vars: LOGTO__TOKEN_URL, LOGTO__RESOURCE_API, SECURITY_AUTH_OIDC_APISECRET
  // ─────────────────────────────────────────────────────────────────────────
  app.post("/oauth/token", async (req: any, res: any) => {
    console.log("[d2e-compat] /oauth/token: exchange code");
    const tokenUrl = envGet("LOGTO__TOKEN_URL");
    if (!tokenUrl) {
      console.error("[d2e-compat] /oauth/token: LOGTO__TOKEN_URL not set");
      (res as any).status(500).json({ error: "Token URL not configured" });
      return;
    }

    const params = new URLSearchParams();

    // Parse body — Express may have already parsed it as urlencoded or raw.
    const ct = ((req as any).headers["content-type"] ?? "") as string;
    if (
      ct.includes("application/x-www-form-urlencoded") &&
      (req as any).body &&
      typeof (req as any).body === "object"
    ) {
      for (const [k, v] of Object.entries((req as any).body as Record<string, string>)) {
        params.append(k, v);
      }
    } else {
      // Raw body — read stream.
      const chunks: Uint8Array[] = [];
      for await (const chunk of req as unknown as AsyncIterable<Uint8Array | string>) {
        chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
      }
      const buf = await new Blob(chunks as BlobPart[]).arrayBuffer();
      new URLSearchParams(new TextDecoder().decode(buf)).forEach((v, k) => params.append(k, v));
    }

    const resource = envGet("LOGTO__RESOURCE_API");
    if (!params.has("resource") && resource) params.append("resource", resource);

    const clientSecret = envGet("SECURITY_AUTH_OIDC_APISECRET");
    if (!params.has("client_secret") && clientSecret) params.append("client_secret", clientSecret);

    try {
      const r = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const data = await r.json();
      (res as any).status(r.ok ? 200 : r.status).json(data);
    } catch (e) {
      console.error(`[d2e-compat] /oauth/token error: ${e}`);
      (res as any).status(500).json({ error: "Token exchange failed" });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // /portal/plugin.json — plugin registry  (PUBLIC)
  //
  // Ported from d2e services/trex/core/server/routes/portal.ts.
  // d2e populates global.PLUGINS_JSON dynamically; trex does not use that
  // ambient global, so we degrade to an empty object.
  // ─────────────────────────────────────────────────────────────────────────
  app.get("/portal/plugin.json", (_req: any, res: any) => {
    // Degrade: trex does not maintain a mutable global.PLUGINS_JSON.
    // Return an empty object; plugin discovery is deferred to the parity phase.
    (res as any).json({});
  });

  // ─────────────────────────────────────────────────────────────────────────
  // /portal/env.js — portal client environment  (PUBLIC)
  //
  // Ported from d2e services/trex/core/server/routes/portal.ts.
  //
  // Env vars consumed (d2e name → Deno.env key):
  //   GATEWAY__WO_PROTOCOL_FQDN, LOGTO__CLIENT_ID, LOGTO__SCOPE,
  //   LOGTO__ISSUER, APP_LOCALE, GIT_COMMIT, IDP__RELYING_PARTY,
  //   IDP__REQUIRED_CLAIM, DB_CREDENTIALS__PUBLIC_KEYS,
  //   PORTAL__LOG_DISCLAIMER, USE_PUBLIC_WEBAPI_PROXY,
  //   PUBLIC_WEBAPI_PROXY_URL, PUBLIC_WEBAPI_DATASOURCE
  // ─────────────────────────────────────────────────────────────────────────
  app.get("/portal/env.js", (_req: any, res: any) => {
    const gatewayHost = envGet("GATEWAY__WO_PROTOCOL_FQDN") || "localhost";
    const gatewayBase = `https://${gatewayHost}/`;
    const clientId = envGet("LOGTO__CLIENT_ID");
    const scope = envGet("LOGTO__SCOPE");
    const issuer = envGet("LOGTO__ISSUER");
    const authorizationUrl = `${gatewayBase}oidc/auth`;
    const endSessionUrl =
      `${gatewayBase}oidc/session/end?client_id=${clientId}&redirect={window.location.origin}/d2e/portal`;

    const clientEnv = {
      PUBLIC_URL: "/d2e/portal",
      REACT_APP_LOCALE: envGet("APP_LOCALE"),
      GIT_COMMIT: envGet("GIT_COMMIT"),
      REACT_APP_IDP_RELYING_PARTY: envGet("IDP__RELYING_PARTY"),
      REACT_APP_IDP_REQUIRED_CLAIM: envGet("IDP__REQUIRED_CLAIM"),
      REACT_APP_DN_BASE_URL: gatewayBase,
      REACT_APP_CURRENT_SYSTEM: "Local",
      REACT_APP_IDP_SUBJECT_PROP: "sub",
      REACT_APP_IDP_NAME_PROP: "username",
      REACT_APP_IDP_OIDC_CONFIG: `{ "client_id": "${clientId}", "redirect_uri": "{window.location.origin}/d2e/portal/login-callback", "authority": "${gatewayBase}", "authority_configuration": { "issuer": "${issuer}", "authorization_endpoint": "${authorizationUrl}", "token_endpoint": "https://${gatewayHost}/d2e/oauth/token", "end_session_endpoint": "${endSessionUrl}" }, "scope": "${scope}", "refresh_time_before_tokens_expiration_in_second": 180 }`,
      REACT_APP_DB_CREDENTIALS_PUBLIC_KEYS: certEscapeNewLine(envGet("DB_CREDENTIALS__PUBLIC_KEYS")).replace("}\\\n", "}"),
      REACT_APP_PLUGINS: "{}",
      REACT_APP_MRI_CONFIG_NAME: "OMOP_GDM_PA_CONF",
      REACT_APP_LOG_DISCLAIMER: envGet("PORTAL__LOG_DISCLAIMER"),
      REACT_APP_USE_PUBLIC_WEBAPI_PROXY: envGet("USE_PUBLIC_WEBAPI_PROXY"),
      REACT_APP_PUBLIC_WEBAPI_PROXY_URL: envGet("PUBLIC_WEBAPI_PROXY_URL"),
      REACT_APP_PUBLIC_WEBAPI_DATASOURCE: envGet("PUBLIC_WEBAPI_DATASOURCE"),
    };

    (res as any).setHeader("Content-Type", "application/javascript");
    (res as any).send(`window.ENV_DATA = ${JSON.stringify(clientEnv)}`);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // /trex/db/*  — credential CRUD  (ADMIN-ONLY: requireAdmin)
  //
  // Ported from d2e services/trex/core/server/routes/dbm.ts.
  //
  // Schema mapping:
  //   d2e `trex.db`  →  trex `trexdb.database` + `trexdb.database_credential`
  //
  // The d2e DatabaseManager also calls:
  //   - Trex.DatabaseManager (ambient EdgeRuntime global) — not available;
  //     deferred to the parity phase.
  //   - PrefectAPI.createBlockDocument — not available in trex; skipped.
  //   - Trex.addDB (publication replication) — not available; skipped.
  // getPublications() is degraded to return an empty array.
  //
  // All endpoints use the trex pool (trexdb schema, search_path=trexdb,public).
  // ─────────────────────────────────────────────────────────────────────────

  // GET /trex/db/ — list all databases (credentials masked)
  app.get("/trex/db/", requireAdmin, async (_req: any, res: any) => {
    try {
      const client = await pool.connect();
      try {
        const dbRes = await client.query(
          `SELECT d.id, d.id AS code, d.host, d.port,
                  d."databaseName" AS name, d.dialect,
                  d."vocabSchemas" AS vocab_schemas, d.extra,
                  d.description, d.enabled,
                  d."createdAt", d."updatedAt",
                  COALESCE(
                    json_agg(
                      json_build_object(
                        'username', dc.username,
                        'userScope', dc."userScope",
                        'serviceScope', dc."serviceScope"
                      )
                    ) FILTER (WHERE dc.id IS NOT NULL),
                    '[]'::json
                  ) AS credentials
           FROM trexdb.database d
           LEFT JOIN trexdb.database_credential dc ON dc."databaseId" = d.id
           GROUP BY d.id
           ORDER BY d."createdAt" DESC`
        );
        (res as any).json(dbRes.rows);
      } finally {
        client.release();
      }
    } catch (e) {
      console.error(`[d2e-compat] GET /trex/db/: ${e}`);
      (res as any).status(500).send(String(e));
    }
  });

  // GET /trex/db/publications/ — degraded to empty array
  // Trex.DatabaseManager (ambient EdgeRuntime global) is not available.
  app.get("/trex/db/publications/", requireAdmin, (_req: any, res: any) => {
    (res as any).json([]);
  });

  // POST /trex/db/ — create / upsert a database entry
  app.post("/trex/db/", requireAdmin, async (req: any, res: any) => {
    const body: any = (req as any).body ?? {};
    const code = body.code || body.id;
    if (!isValidDbCode(code)) {
      (res as any).status(400).send("Database code invalid");
      return;
    }
    try {
      const client = await pool.connect();
      try {
        await client.query(
          `INSERT INTO trexdb.database
             (id, host, port, "databaseName", dialect, "vocabSchemas", extra, description)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
           ON CONFLICT (id) DO UPDATE SET
             host = EXCLUDED.host,
             port = EXCLUDED.port,
             "databaseName" = EXCLUDED."databaseName",
             dialect = EXCLUDED.dialect,
             "vocabSchemas" = EXCLUDED."vocabSchemas",
             extra = EXCLUDED.extra,
             description = EXCLUDED.description,
             "updatedAt" = NOW()`,
          [
            code,
            body.host ?? null,
            body.port ?? 5432,
            body.name ?? body.databaseName ?? null,
            body.dialect ?? "postgresql",
            body.vocabSchemas != null ? JSON.stringify(body.vocabSchemas) : null,
            body.extra != null ? JSON.stringify(body.extra) : null,
            body.description ?? null,
          ]
        );
        if (Array.isArray(body.credentials)) {
          for (const cred of body.credentials) {
            await client.query(
              `INSERT INTO trexdb.database_credential
                 ("databaseId", username, password, "userScope", "serviceScope")
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT ("databaseId", username) DO UPDATE SET
                 password = EXCLUDED.password,
                 "userScope" = EXCLUDED."userScope",
                 "serviceScope" = EXCLUDED."serviceScope",
                 "updatedAt" = NOW()`,
              [code, cred.username, cred.password ?? null, cred.userScope ?? null, cred.serviceScope ?? null]
            );
          }
        }
        (res as any).json({ id: code });
      } finally {
        client.release();
      }
    } catch (e) {
      console.error(`[d2e-compat] POST /trex/db/: ${e}`);
      (res as any).status(500).send(String(e));
    }
  });

  // PUT /trex/db/ — update an existing database entry
  app.put("/trex/db/", requireAdmin, async (req: any, res: any) => {
    const body: any = (req as any).body ?? {};
    const code = body.code || body.id;
    if (!isValidDbCode(code)) {
      (res as any).status(400).send("Database code invalid");
      return;
    }
    try {
      const client = await pool.connect();
      try {
        await client.query(
          `UPDATE trexdb.database SET
             host = COALESCE($2, host),
             port = COALESCE($3::integer, port),
             "databaseName" = COALESCE($4, "databaseName"),
             dialect = COALESCE($5, dialect),
             "vocabSchemas" = COALESCE($6::jsonb, "vocabSchemas"),
             extra = COALESCE($7::jsonb, extra),
             description = COALESCE($8, description),
             "updatedAt" = NOW()
           WHERE id = $1`,
          [
            code,
            body.host ?? null,
            body.port != null ? String(body.port) : null,
            body.name ?? body.databaseName ?? null,
            body.dialect ?? null,
            body.vocabSchemas != null ? JSON.stringify(body.vocabSchemas) : null,
            body.extra != null ? JSON.stringify(body.extra) : null,
            body.description ?? null,
          ]
        );
        if (Array.isArray(body.credentials)) {
          for (const cred of body.credentials) {
            await client.query(
              `INSERT INTO trexdb.database_credential
                 ("databaseId", username, password, "userScope", "serviceScope")
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT ("databaseId", username) DO UPDATE SET
                 password = EXCLUDED.password,
                 "userScope" = EXCLUDED."userScope",
                 "serviceScope" = EXCLUDED."serviceScope",
                 "updatedAt" = NOW()`,
              [code, cred.username, cred.password ?? null, cred.userScope ?? null, cred.serviceScope ?? null]
            );
          }
        }
        (res as any).json({ id: code });
      } finally {
        client.release();
      }
    } catch (e) {
      console.error(`[d2e-compat] PUT /trex/db/: ${e}`);
      (res as any).status(500).send(String(e));
    }
  });

  // DELETE /trex/db/:name — delete a database entry
  app.delete("/trex/db/:name", requireAdmin, async (req: any, res: any) => {
    const name = (req as any).params.name as string;
    try {
      const client = await pool.connect();
      try {
        await client.query("DELETE FROM trexdb.database WHERE id = $1", [name]);
        (res as any).json({ id: name });
      } finally {
        client.release();
      }
    } catch (e) {
      console.error(`[d2e-compat] DELETE /trex/db/${name}: ${e}`);
      (res as any).status(500).send(String(e));
    }
  });

  // POST /trex/db/pub/:name — add a publication (replication) entry.
  // Degraded: Trex.addDB (ambient global for DuckDB replication) is not
  // available in the open-source trex binary; logs a warning and returns ok.
  app.post("/trex/db/pub/:name", requireAdmin, (_req: any, res: any) => {
    console.warn(
      "[d2e-compat] POST /trex/db/pub/:name: Trex.addDB not available — publication deferred to parity phase"
    );
    (res as any).json({ message: "ok", warning: "Publication replication is not available in this build" });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // /trex/log — audit log POST  (ADMIN-ONLY: requireAdmin)
  //
  // Ported from d2e services/trex/core/server/routes/log.ts.
  // Logs a usage-agreement audit event to console (persisting to a database
  // log table is deferred to the parity phase).
  //
  // Env vars: GATEWAY__IDP_SUBJECT_PROP (default "sub")
  // ─────────────────────────────────────────────────────────────────────────
  app.post("/trex/log", requireAdmin, async (req: any, res: any) => {
    const body: any = (req as any).body ?? {};
    const { response } = body;

    if (!response) {
      (res as any).status(400).send("Log response is missing in the request body");
      return;
    }

    const authHeader = (req as any).headers["authorization"] as string | undefined;
    if (!authHeader) {
      (res as any).status(401).json({ error: "Authorization header missing" });
      return;
    }

    try {
      const rawToken = authHeader.split(" ")[1];
      // Decode JWT payload (signature already verified by requireAdmin).
      const parts = rawToken?.split(".");
      const payloadJson =
        parts && parts.length >= 2
          ? JSON.parse(
              new TextDecoder().decode(
                Uint8Array.from(
                  atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
                  (c) => c.charCodeAt(0)
                )
              )
            )
          : {};

      // Try to extract a thirdPartyToken (Azure AD pass-through) first.
      let idpUserId: string | undefined;
      const thirdPartyToken = payloadJson["thirdPartyToken"];
      if (thirdPartyToken) {
        try {
          const tpParts = thirdPartyToken.split(".");
          const tpPayload =
            tpParts.length >= 2
              ? JSON.parse(
                  new TextDecoder().decode(
                    Uint8Array.from(
                      atob(tpParts[1].replace(/-/g, "+").replace(/_/g, "/")),
                      (c) => c.charCodeAt(0)
                    )
                  )
                )
              : {};
          idpUserId = tpPayload["oid"];
        } catch {
          // Fall through to Logto subject.
        }
      }

      if (!idpUserId) {
        const subjectProp = envGet("GATEWAY__IDP_SUBJECT_PROP") || "sub";
        const sub = payloadJson[subjectProp];
        idpUserId = payloadJson["oid"] || sub;
      }

      console.info(
        `[Data2Evidence][AUDITLOG][${Date.now()}] Usage agreement ${response} by user: ${idpUserId}`
      );
      (res as any).json({ message: "success" });
    } catch (e) {
      console.error(`[d2e-compat] /trex/log error: ${e}`);
      (res as any).status(500).json({ error: "Log write failed" });
    }
  });
}
