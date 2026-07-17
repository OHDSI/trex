import { STATUS_CODE } from "jsr:@std/http@^1.0/status";
import { Buffer } from "node:buffer";
import type { Express, NextFunction, Request, Response } from "express";
import { authContext } from "../middleware/auth-context.ts";
import { pluginAuthz, d2eAuthn } from "../middleware/plugin-authz.ts";
import { scopeUrlPrefix, waitfor } from "./utils.ts";
import { PLUGINS_BASE_PATH } from "../config.ts";
import { apiLimiter } from "../middleware/rate-limit.ts";
import { buildDatabaseCredentials, getRegistrationEpoch } from "../d2e-compat/dbm-sync.ts";

// eszip bundles are immutable on disk for the life of the process, so read each
// one once and cache the bytes in memory — re-reading the (brotli-compressed)
// bundle from disk on every worker create is pure overhead on the hot path.
const _eszipCache = new Map<string, Uint8Array>();
async function readEszipCached(eszipPath: string): Promise<Uint8Array> {
  const cached = _eszipCache.get(eszipPath);
  if (cached) return cached;
  const bytes = await Deno.readFile(eszipPath);
  _eszipCache.set(eszipPath, bytes);
  return bytes;
}

// buildDatabaseCredentials() marshals the whole credential registry across the
// Trex.DatabaseManager FFI boundary and JSON-serializes it. Doing that on every
// _callWorker — once per request, and again for each cross-worker fan-out hop —
// was the dominant per-request cost under D2E_COMPAT. The registry only changes
// on a deliberate sync (getRegistrationEpoch advances on boot and /trex/db
// writes), so memoize the serialized value and rebuild only when the epoch moves.
let _dbCredsJson: string | null = null;
let _dbCredsEpoch = -1;
function cachedDatabaseCredentialsJson(): string {
  const epoch = getRegistrationEpoch();
  if (_dbCredsJson === null || _dbCredsEpoch !== epoch) {
    _dbCredsJson = JSON.stringify(buildDatabaseCredentials());
    _dbCredsEpoch = epoch;
  }
  return _dbCredsJson;
}
export const ROLE_SCOPES: Record<string, string[]> = {};
export const REQUIRED_URL_SCOPES: Array<{ path: string; scopes: string[]; httpMethods?: string[] }> = [];

export const REGISTERED_FUNCTIONS: Array<{
  name: string;
  source: string;
  function: string;
}> = [];

// Inter-service request map (function name -> handler)
export const fnmap: Record<string, (req: globalThis.Request) => Promise<globalThis.Response>> = {};

// deno-lint-ignore no-explicit-any
const Trex = (globalThis as any).Trex;
if (Trex?.createRequestListener) {
  Trex.createRequestListener(
    async (
      message: any,
      respond: (data: any) => void
    ) => {
      try {
        if (!message?.request) {
          respond({
            ok: false,
            status: 400,
            statusText: "Bad Request",
            headers: { "Content-Type": "application/json" },
            body: { error: "Invalid message structure" },
          });
          return;
        }

        const handler = fnmap[message.service];
        if (handler === undefined) {
          respond({
            ok: false,
            status: 404,
            statusText: "Not Found",
            headers: { "Content-Type": "application/json" },
            body: { error: `Unknown service: ${message.service}` },
          });
          return;
        }

        const httpResponse = await handler(message.request);
        if (httpResponse instanceof Response) {
          const responseBody = await httpResponse.text();
          respond({
            body: responseBody,
            status: httpResponse.status,
            statusText: httpResponse.statusText,
            ok: httpResponse.ok,
            headers: Object.fromEntries(httpResponse.headers.entries()),
            url: httpResponse.url,
          });
        } else {
          respond(httpResponse);
        }
      } catch (error: any) {
        respond({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          headers: { "Content-Type": "application/json" },
          body: { error: error.message },
        });
      }
    }
  );
}

function substituteEnvVars(input: string): string {
  let result = input;
  const maxIterations = 10;
  let iteration = 0;
  while (iteration < maxIterations) {
    const before = result;
    result = processVariables(result);
    if (result === before) break;
    iteration++;
  }
  return result;
}

function processVariables(input: string): string {
  let result = "";
  let i = 0;
  while (i < input.length) {
    if (input[i] === "$" && input[i + 1] === "{") {
      const varContentStart = i + 2;
      let braceCount = 1;
      let j = varContentStart;
      while (j < input.length && braceCount > 0) {
        if (input[j] === "{") braceCount++;
        else if (input[j] === "}") braceCount--;
        j++;
      }
      if (braceCount === 0) {
        const varExpression = input.substring(varContentStart, j - 1);
        result += substituteVariable(varExpression);
        i = j;
      } else {
        result += input[i];
        i++;
      }
    } else {
      result += input[i];
      i++;
    }
  }
  return result;
}

function substituteVariable(varExpression: string): string {
  const operatorMatch = varExpression.match(/^([^:?+-]+)([:+-]?[?+-])(.*)$/);
  if (operatorMatch) {
    const [, varName, operator, operand] = operatorMatch;
    const envValue = Deno.env.get(varName);
    const isSet = envValue !== undefined;
    const isNonEmpty = isSet && envValue !== "";
    switch (operator) {
      case ":-":
        return isNonEmpty ? envValue! : operand;
      case "-":
        return isSet ? envValue! : operand;
      case ":?":
        if (!isNonEmpty)
          throw new Error(operand || `${varName}: parameter null or not set`);
        return envValue!;
      case "?":
        if (!isSet)
          throw new Error(operand || `${varName}: parameter not set`);
        return envValue!;
      case ":+":
        return isNonEmpty ? operand : "";
      case "+":
        return isSet ? operand : "";
      default:
        return "${" + varExpression + "}";
    }
  }
  const envValue = Deno.env.get(varExpression);
  return envValue !== undefined ? envValue : "";
}

export function substituteEnvVarsInObject(obj: any): any {
  if (typeof obj === "string") return substituteEnvVars(obj);
  if (Array.isArray(obj)) return obj.map(substituteEnvVarsInObject);
  if (obj !== null && typeof obj === "object") {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = substituteEnvVarsInObject(value);
    }
    return result;
  }
  return obj;
}

// Under D2E_COMPAT, function workers bake the DB registry (DATABASE_CREDENTIALS,
// built from Trex.DatabaseManager) into their startup env. The runtime reuses
// workers by servicePath, so a worker created before a database was registered at
// runtime keeps a stale credential set — analytics-svc then 404s /alpdb/schema/exists
// for the just-added DB ("not found in analyticsCredentials"), failing demo setup.
// We record the registration epoch each path's worker was created at; when a later
// deliberate registry sync bumps the epoch (getRegistrationEpoch in dbm-sync), the
// next call to that path forceCreates a fresh worker so it re-reads the registry.
//
// The trigger is the sync epoch, NOT a content hash of getCredentials(): runtime
// cache attaches (POST /trex/attach, e.g. a dataset's source DB and cache) mutate
// the credential view mid-flow, so a content signature would churn workers during
// long operations like DQD and crash them. Only syncTrexDatabaseManager — boot and
// /trex/db writes — bumps the epoch, so cache attaches leave warm workers untouched.
const _workerEpoch = new Map<string, number>();

// Only credential-caching services need a fresh worker when the registry changes —
// they read Trex.databaseManager() at worker startup and cache the result, so a warm
// one misses a runtime-registered DB. Other workers MUST NOT be recreated mid-flight:
// the d2e demo orchestrator, for one, holds async setup progress in an in-memory Map,
// and recreating it loses that state (its /demo/progress then 500s). Scope forceCreate
// to an allowlist (override via D2E_COMPAT_CRED_REFRESH_SERVICES) matched against the
// service path/dir.
const _CRED_REFRESH_SERVICES = (Deno.env.get("D2E_COMPAT_CRED_REFRESH_SERVICES") ??
  "analytics-svc,cdw-svc,terminology-svc,parquet-export,portal")
  .split(",").map((s) => s.trim()).filter(Boolean);
function _needsCredentialRefresh(servicePath: string, dir: string): boolean {
  const hay = `${servicePath} ${dir}`;
  return _CRED_REFRESH_SERVICES.some((s) => hay.includes(s));
}

// SSE (text/event-stream) and eve's NDJSON session stream
// (application/x-ndjson) must both be piped to the client as they arrive
// rather than buffered — buffering waits for the worker stream to close,
// which for a live tail never happens until the client disconnects.
function isStreamingContentType(contentType: string): boolean {
  return contentType.includes("text/event-stream") || contentType.includes("application/x-ndjson");
}

async function _callWorker(
  req: globalThis.Request,
  servicePath: string,
  imports: string | null,
  fncfg: any,
  dir: string,
  xenv: any,
  signal?: AbortSignal
): Promise<globalThis.Response> {
  const myenv = Object.assign(
    {},
    xenv["_shared"],
    fncfg.env in xenv ? xenv[fncfg.env] : {},
    {
      TREX_FUNCTION_PATH: dir,
      // d2e functions build their `services` object from SERVICE_ROUTES; pass it
      // through to the worker (the d2e fork did the same). Added only when set so
      // @trex-only deployments are unaffected.
      ...(Deno.env.get("SERVICE_ROUTES")
        ? { SERVICE_ROUTES: Deno.env.get("SERVICE_ROUTES") as string }
        : {}),
      // Under d2e, provide the live DB registry to function workers the way d2e
      // fed its services DATABASE_CREDENTIALS. The engine only PROVIDES the data
      // (from Trex.DatabaseManager); the DATABASE_CREDENTIALS → VCAP_SERVICES
      // mapping stays in the plugin's own envConverter. Already a JSON string
      // (epoch-cached), so the _myenv builder passes it through unchanged.
      ...(Deno.env.get("D2E_COMPAT") === "true"
        ? { DATABASE_CREDENTIALS: cachedDatabaseCredentialsJson() }
        : {}),
    },
  );
  const _myenv = Object.keys(myenv).map((k) => [
    k,
    typeof myenv[k] === "string" ? myenv[k] : JSON.stringify(myenv[k]),
  ]);

  // Force a fresh worker when a deliberate registry sync has bumped the epoch since
  // the last worker was created for this path (see _workerEpoch above). First call
  // records the epoch without forcing; only a subsequent bump triggers a recreate.
  let forceCreate = false;
  if (Deno.env.get("D2E_COMPAT") === "true" && _needsCredentialRefresh(servicePath, dir)) {
    const epoch = getRegistrationEpoch();
    const prev = _workerEpoch.get(servicePath);
    if (prev !== undefined && prev !== epoch) forceCreate = true;
    _workerEpoch.set(servicePath, epoch);
  }

  // Dev hot-reload: with DEVX_HOT_RELOAD on, spin a fresh edge worker on every
  // request for functions served from the devx workspace, so source edits are
  // picked up live without a restart or rebuild. Scoped to the workspace dir so
  // the baked platform functions (pooled, cached) are untouched. A fresh worker
  // loads source from servicePath; an eszip bundle still overrides source, so
  // hot-reload applies to unbundled (source) dev functions only.
  const _wsDir = Deno.env.get("DEVX_WORKSPACE_DIR") || "/tmp/devx-workspaces";
  const _hotReload = Deno.env.get("DEVX_HOT_RELOAD") === "true" &&
    (servicePath.startsWith(_wsDir) || dir.startsWith(_wsDir));
  if (_hotReload) forceCreate = true;

  const options: any = {
    servicePath,
    memoryLimitMb: fncfg.memoryLimitMb ?? 4096,
    workerTimeoutMs: 30 * 60 * 1000,
    // Hot-reload needs BOTH a fresh worker (forceCreate) AND a source re-read:
    // with the module cache on, a fresh worker still loads the cached module, so
    // the file edit is invisible. Bypass the cache only for hot-reloaded workers.
    noModuleCache: _hotReload,
    importMapPath: imports,
    envVars: _myenv,
    forceCreate,
    netAccessDisabled: false,
    cpuTimeSoftLimitMs: fncfg.cpuTimeSoftLimitMs ?? 60_000_000,
    cpuTimeHardLimitMs: fncfg.cpuTimeHardLimitMs ?? 120_000_000,
    // d2e function plugins are NestJS/typedi/TypeORM apps that rely on
    // emitDecoratorMetadata for dependency injection and routing. Without this
    // the metadata is never emitted and controllers/services fail to instantiate
    // ("No url is set ...", 404s, hangs). The d2e fork set this for all workers;
    // harmless for non-decorator (@trex) functions.
    decoratorType: "typescript_with_metadata",
    // The d2e fork granted host fs access to every worker. typeorm/npm:pg and the
    // NestJS module loader touch the filesystem during init; denying it can make
    // dataSource.initialize() hang silently. Default ON, allow explicit opt-out.
    allowHostFsAccess: fncfg.allowHostFsAccess !== false,
    ...(fncfg.permissions ? { permissions: fncfg.permissions } : {}),
    context: {
      useReadSyncFileAPI: true,
      unstableSloppyImports: true,
      sourceMap: true,
    },
  };

  if (fncfg.eszip && !_hotReload) {
    // Prebuilt eszip; fall back to source if absent (e.g. unbundled dev plugin).
    // Skipped under hot-reload so edits to source are always what runs.
    try {
      options.maybeEszip = await readEszipCached(`${dir}${fncfg.eszip}`);
    } catch {
      /* no bundle on disk — use servicePath source */
    }
  }

  // Callers that don't care about cancellation (e.g. the inter-service
  // fnmap handler, which has no client response to tie an abort to) pass no
  // signal — fall back to a controller that's never aborted, matching prior
  // behavior.
  const fetchSignal = signal ?? new AbortController().signal;

  try {
    // deno-lint-ignore no-explicit-any
    const worker = await (globalThis as any).EdgeRuntime.userWorkers.create(options);
    return await worker.fetch(req, { signal: fetchSignal });
  } catch (e: any) {
    // Retry once on WorkerRequestCancelled, same as before — but only if
    // the caller's own signal isn't already aborted (client gone): retrying
    // a dead request just wastes a worker slot on a response nobody reads.
    if (e instanceof (Deno.errors as any).WorkerRequestCancelled && !fetchSignal.aborted) {
      // deno-lint-ignore no-explicit-any
      const worker = await (globalThis as any).EdgeRuntime.userWorkers.create(options);
      return await worker.fetch(req, { signal: fetchSignal });
    }
    console.error("Worker call error:", e);
    return new globalThis.Response(JSON.stringify({ msg: e.toString() }), {
      status: STATUS_CODE.InternalServerError,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function _callInit(
  servicePath: string,
  imports: string | null,
  fnEnv: string,
  xenv: any,
  eszip: string | null,
  dir: string,
  fncfg: any = {}
) {
  const myenv = Object.assign(
    {},
    xenv["_shared"],
    fnEnv in xenv ? xenv[fnEnv] : {},
    {
      TREX_FUNCTION_PATH: dir,
      // d2e functions build their `services` object from SERVICE_ROUTES; pass it
      // through to the worker (the d2e fork did the same). Added only when set so
      // @trex-only deployments are unaffected.
      ...(Deno.env.get("SERVICE_ROUTES")
        ? { SERVICE_ROUTES: Deno.env.get("SERVICE_ROUTES") as string }
        : {}),
      // Under d2e, provide the live DB registry to function workers the way d2e
      // fed its services DATABASE_CREDENTIALS. The engine only PROVIDES the data
      // (from Trex.DatabaseManager); the DATABASE_CREDENTIALS → VCAP_SERVICES
      // mapping stays in the plugin's own envConverter. Already a JSON string
      // (epoch-cached), so the _myenv builder passes it through unchanged.
      ...(Deno.env.get("D2E_COMPAT") === "true"
        ? { DATABASE_CREDENTIALS: cachedDatabaseCredentialsJson() }
        : {}),
    },
  );
  const _myenv = Object.keys(myenv).map((k) => [
    k,
    typeof myenv[k] === "string" ? myenv[k] : JSON.stringify(myenv[k]),
  ]);

  const options: any = {
    servicePath,
    memoryLimitMb: 1000,
    workerTimeoutMs: 3 * 60 * 1000,
    noModuleCache: false,
    importMapPath: imports,
    envVars: _myenv,
    forceCreate: false,
    netAccessDisabled: false,
    cpuTimeSoftLimitMs: 100000,
    cpuTimeHardLimitMs: 200000,
    // Init functions run DB migrations whose knex MigrationSource enumerates a
    // migrations/ directory via Deno.readDir; without host fs access that throws
    // `NotSupported` and the migration never runs (e.g. the usermgmt schema is
    // missing, so getMe 500s and DQD flow runs fail). _callWorker already grants
    // this to every regular worker, matching the d2e fork which granted host fs
    // access to ALL workers. Read it from the init config like _callWorker reads
    // fncfg — default ON, so an init entry can opt out via package.json
    // ("allowHostFsAccess": false) without changing the core.
    allowHostFsAccess: fncfg.allowHostFsAccess !== false,
    // Match _callWorker: emit decorator metadata so NestJS-style init functions
    // instantiate. Harmless for non-decorator functions.
    decoratorType: fncfg.decoratorType ?? "typescript_with_metadata",
    context: {
      useReadSyncFileAPI: true,
      unstableSloppyImports: true,
    },
  };

  if (eszip) {
    // Prebuilt eszip; fall back to source if absent.
    try {
      options.maybeEszip = await readEszipCached(`${dir}${eszip}`);
    } catch {
      /* no bundle on disk — use servicePath source */
    }
  }

  try {
    // deno-lint-ignore no-explicit-any
    await (globalThis as any).EdgeRuntime.userWorkers.create(options);
  } catch (e) {
    console.error("Init worker error:", e);
  }
}


// Scopes whose plugins are first-party trusted: their function routes mount
// scoped under PLUGINS_BASE_PATH/<scope>/ and are guarded by trex's own auth
// (authContext + pluginAuthz) instead of the d2e/legacy Logto path, and their
// agents plugins are allowed to mount (see agents.ts). @ohdsi is OHDSI's own
// publishing scope — GitHub Packages only accepts owner-scoped names, so
// first-party plugins built in OHDSI repos (e.g. the Pythia agent) publish as
// @ohdsi/* and must be trusted like @trex/*. UI plugins are NOT affected:
// ui.ts keeps non-@trex UI plugins root-mounted so @ohdsi/atlas3 stays at
// /atlas.
export const TRUSTED_PLUGIN_SCOPES = ["@trex/", "@ohdsi/"];
export function isTrustedPluginScope(name: string): boolean {
  return TRUSTED_PLUGIN_SCOPES.some((s) => name.startsWith(s));
}

export function _addFunction(
  app: Express,
  url: string,
  path: string,
  imports: string | null,
  fncfg: any,
  dir: string,
  name: string,
  xenv: any
) {
  REGISTERED_FUNCTIONS.push({ name, source: url, function: fncfg.function });

  // Worker-to-worker calls (Trex.tokioChannel) address functions by the
  // UNSCOPED plugin name + function path, e.g. `d2e-functions/portal` or
  // `fhir/fhir-gateway` — never the npm scope (`@data2evidence/...`). The plugin
  // loader passes the scoped fullName here, so register the fnmap handler under
  // both the scoped key and the unscoped short key; otherwise every inter-service
  // call (usermgmt→portal getDatasets, etc.) hits "Unknown service" → 404 and the
  // caller silently gets undefined.
  const shortName = name.startsWith("@") && name.includes("/")
    ? name.slice(name.indexOf("/") + 1)
    : name;
  const handler = (req: globalThis.Request) =>
    _callWorker(req, path, imports, fncfg, dir, xenv);
  fnmap[`${name}${fncfg.function}`] = handler;
  fnmap[`${shortName}${fncfg.function}`] = handler;

  const scopePrefix = scopeUrlPrefix(name);
  // Trusted-scope plugins mount scoped under PLUGINS_BASE_PATH/<scope>/;
  // d2e/legacy plugins (@data2evidence, ...) mount their function routes at the
  // bare source path (/analytics-svc, /system-portal, ...) as the d2e fork did,
  // so the d2e UI's API calls keep resolving.
  // Match both the bare source (`/list`) and any sub-path (`/list/...`).
  // Express 4's `/list/*` pattern requires content after `/list/`, so we
  // register two routes to cover both shapes.
  const isTrustedPlugin = isTrustedPluginScope(name);
  const fullSource = isTrustedPlugin
    ? PLUGINS_BASE_PATH + scopePrefix + url
    : url;
  // Trusted-scope plugins go through trex's auth (authContext + pluginAuthz, keyed
  // on the trex HS256 session). d2e/legacy plugins carry a Logto RS256 JWT that
  // authContext can't validate, so they use d2eAuthn: it verifies the Logto token
  // against the Logto JWKS and enforces the role/URL scope check before forwarding
  // to the worker (which only decodes the token). This restores the authn+authz the
  // d2e fork did itself; without it a forged JWT would be trusted. Public paths are
  // allowlisted inside d2eAuthn.
  //
  // authExemptPattern (agents channel routes, task-4): a trusted-scope plugin may
  // mark a subset of its paths as auth-exempt at the proxy — for agents, the channel
  // subpaths ({basePath}/eve/v1/<channelId>/*), which are authenticated by the
  // adapter's own platform-signature verify() inside the worker, NOT by a trex
  // JWT. Those paths skip authContext+pluginAuthz (which would otherwise 401 an
  // unauthenticated platform webhook). Everything else — session/chat/health/
  // info — keeps full proxy auth, unchanged. Non-agent plugins never set this,
  // so their auth behavior is byte-for-byte identical to before.
  const authExemptPattern = fncfg.authExemptPattern as RegExp | undefined;
  const trexAuth = (req: Request, res: Response, next: NextFunction) => {
    if (authExemptPattern && authExemptPattern.test(req.path)) return next();
    authContext(req, res, (err?: unknown) => {
      if (err) return next(err as Error);
      pluginAuthz(req, res, next);
    });
  };
  const authMw = isTrustedPlugin ? [trexAuth] : [d2eAuthn];
  app.all([fullSource, fullSource + "/*"], apiLimiter, ...authMw, async (req: Request, res: Response) => {
    // Propagate a client disconnect (browser tab closed, live tail dropped,
    // etc.) into the worker fetch so a long-lived stream (session tail,
    // SSE) doesn't run forever unread. "close" also fires on a normal,
    // fully-written response — only abort when the response hasn't
    // finished, i.e. this is a genuine premature disconnect.
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });
    try {
      const host = req.get("host") || "localhost";
      const protocol = req.protocol || "http";
      const requestUrl = `${protocol}://${host}${req.originalUrl}`;

      const headers = new Headers();
      for (const [key, val] of Object.entries(req.headers)) {
        if (val) {
          // Strip encoding headers — the outer proxy handles compression;
          // letting the worker compress causes double-encoding (ERR_CONTENT_DECODING_FAILED).
          // Also strip content-length/transfer-encoding: the body below is rebuilt
          // (re-serialized from req.body, or re-read), so the client's original
          // content-length no longer matches and would truncate the worker's body
          // stream ("user body write aborted: early end"). Let fetch recompute it.
          const lower = key.toLowerCase();
          if (lower === "accept-encoding" || lower === "content-length" || lower === "transfer-encoding") continue;
          headers.set(key, Array.isArray(val) ? val.join(", ") : String(val));
        }
      }

      // Inject auth context from middleware into headers for edge functions
      const pgSettings = (req as any).pgSettings;
      if (pgSettings?.["app.user_id"]) {
        headers.set("x-user-id", pgSettings["app.user_id"]);
      }
      if (pgSettings?.["app.user_role"]) {
        headers.set("x-user-role", pgSettings["app.user_role"]);
      }

      let body: Blob | string | undefined;
      if (req.method !== "GET" && req.method !== "HEAD") {
        // If body was already parsed by middleware (e.g. express.json()),
        // re-serialize it. Otherwise read the raw stream.
        if ((req as any).body && typeof (req as any).body === "object" && Object.keys((req as any).body).length > 0) {
          body = JSON.stringify((req as any).body);
        } else {
          const chunks: Uint8Array[] = [];
          try {
            for await (const chunk of req as any) {
              chunks.push(
                typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk
              );
            }
          } catch {
            // Stream may not be async iterable in some environments
          }
          if (chunks.length > 0) body = new Blob(chunks as BlobPart[]);
        }
      }

      const webReq = new globalThis.Request(requestUrl, {
        method: req.method,
        headers,
        body,
        signal: controller.signal,
      });

      const workerResponse = await _callWorker(webReq, path, imports, fncfg, dir, xenv, controller.signal);

      res.status(workerResponse.status);
      workerResponse.headers.forEach((value: string, key: string) => {
        // Skip transfer/encoding headers — .text() decodes the body,
        // so forwarding these would cause ERR_CONTENT_DECODING_FAILED
        const lower = key.toLowerCase();
        if (lower === "content-encoding" || lower === "content-length" || lower === "transfer-encoding") return;
        res.setHeader(key, value);
      });
      const contentType = workerResponse.headers.get("content-type") || "";

      if (isStreamingContentType(contentType) && workerResponse.body) {
        // SSE / NDJSON: pipe the stream directly — don't buffer. Buffering
        // (the arrayBuffer/text branches below) waits for the worker stream
        // to close, which for a live tail (eve's session stream) never
        // happens until the client disconnects — the request would hang
        // forever instead of delivering events as they're produced.
        res.flushHeaders();
        const reader = workerResponse.body.getReader();
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
          res.end();
        };
        pump().catch(() => res.end());
      } else if (contentType && !contentType.includes("text/") && !contentType.includes("application/json") && !contentType.includes("application/javascript")) {
        // Binary responses (fonts, images, etc.): use arrayBuffer to preserve data
        const responseBody = await workerResponse.arrayBuffer();
        res.end(Buffer.from(responseBody));
      } else {
        // Text responses: buffer as before
        const responseBody = await workerResponse.text();
        res.send(responseBody);
      }
    } catch (err) {
      console.error("Plugin route error:", err);
      res.status(500).json({ msg: String(err) });
    }
  });
}

export async function addPlugin(
  app: Express,
  value: any,
  dir: string,
  name: string
) {
  const xenv = substituteEnvVarsInObject(value.env || {});

  if (value.init) {
    for (const r of value.init) {
      if (r.function) {
        console.log(`add init fn @ ${dir}${r.function}`);
        const waitforUrl = r.waitfor ??
          (r.waitforEnvVar ? Deno.env.get(r.waitforEnvVar) ?? "" : "");
        if (waitforUrl) await waitfor(waitforUrl);

        await _callInit(
          `${dir}${r.function}`,
          r.imports
            ? r.imports.indexOf(":") < 0
              ? `${dir}${r.imports}`
              : r.imports
            : null,
          r.env,
          xenv,
          r.eszip || null,
          dir,
          r
        );

        if (r.delay) {
          await new Promise((resolve) => setTimeout(resolve, r.delay));
        }
        console.log(`add init fn done @ ${dir}${r.function}`);
      }
    }
  }

  if (value.roles) {
    for (const [roleName, scopes] of Object.entries(value.roles)) {
      if (ROLE_SCOPES[roleName]) {
        ROLE_SCOPES[roleName] = ROLE_SCOPES[roleName]
          .concat(scopes as string[])
          .filter((v: string, i: number, self: string[]) => self.indexOf(v) === i);
      } else {
        ROLE_SCOPES[roleName] = scopes as string[];
      }
    }
  }

  if (value.scopes) {
    REQUIRED_URL_SCOPES.push(...value.scopes);
  }

  if (value.api) {
    for (const r of value.api) {
      if (r.function) {
        console.log(`add fn ${r.source} @ ${dir}${r.function}`);
        _addFunction(
          app,
          r.source,
          `${dir}${r.function}`,
          r.imports
            ? r.imports.indexOf(":") < 0
              ? `${dir}${r.imports}`
              : r.imports
            : null,
          r,
          dir,
          name,
          xenv
        );
      }
    }
  }
}

export async function ensureRolesExist() {
  const roleNames = Object.keys(ROLE_SCOPES);
  if (roleNames.length === 0) return;

  try {
    const pg = (await import("pg")).default;
    const pool = new pg.Pool({ connectionString: Deno.env.get("DATABASE_URL") });
    try {
      const existing = await pool.query("SELECT name FROM trexdb.role");
      const existingNames = new Set(existing.rows.map((r: any) => r.name));
      for (const name of roleNames) {
        if (existingNames.has(name)) continue;
        const id = crypto.randomUUID();
        await pool.query(
          'INSERT INTO trexdb.role (id, name, description) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING',
          [id, name, "Auto-created from plugin registration"]
        );
        console.log(`Auto-created role: ${name}`);
      }
    } finally {
      await pool.end();
    }
  } catch (err) {
    console.error("ensureRolesExist error:", err);
  }
}
