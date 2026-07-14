// Stages the vendored gbrain core + the H2 thin handler (./handler.ts) as a
// self-contained Deno servicePath and mounts it as an edge-runtime worker at
// `/memory` via the function-plugin proxy (plugin/function.ts's
// `_addFunction`). This REPLACES the pre-pivot Task 9 (Bun subprocess
// supervisor, commit 0c6ba7f3, memory/gbrain-process.ts) and Task 10
// (localhost reverse-proxy, commit 588f814b, plugin/memory.ts's
// mountMemoryProxy) — there is no child process and no loopback fetch hop
// anymore; the worker runs in-runtime like an `agents`-type plugin. Mirrors
// plugin/agents.ts's `buildAgentWorkerConfig` + `addAgentsPlugin` structure
// closely — read that file's header comment first for the staging rationale
// (a worker can only import modules that live under its own servicePath).
//
// Trust-scope & auth (see task-h3-report.md "Trust-scope & auth" for the
// full writeup): mounted under a synthetic first-party plugin name
// (`MEMORY_PLUGIN_NAME`, `@trex/memory`) so `_addFunction` treats it as
// trusted-scope and guards the PUBLIC Express route with
// `authContext`+`pluginAuthz` (a valid trex session is required to reach it
// over HTTP). That is layered ON TOP of, not instead of, the worker's own
// internal bearer-token check (`GBRAIN_MEMORY_TOKEN`, see ./handler.ts) —
// worker-to-worker calls that go through `fnmap`/`Trex.tokioChannel`
// (function.ts's inter-service call path) bypass Express middleware
// entirely and are gated purely by that bearer token, same as any other
// first-party inter-service call.
import type { Express } from "express";
import {
  _addFunction,
  isTrustedPluginScope,
  TRUSTED_PLUGIN_SCOPES,
} from "../../plugin/function.ts";
import { scopeUrlPrefix } from "../../plugin/utils.ts";
import { PLUGINS_BASE_PATH } from "../../config.ts";
import type { MemoryEntry } from "../../plugin/memory.ts";

// There is no single owning plugin for the memory worker: `trex.memory`
// declarations are aggregated across EVERY installed plugin (see
// plugin/plugin.ts's module-level MEMORY_ENTRIES) before this mounts once,
// post-scan — unlike `agents`, which mounts once per declaring plugin. Fixed
// under the `@trex/` scope so `isTrustedPluginScope` treats it as
// first-party trusted, matching the design's intent that this is a
// core-owned surface, not a third-party plugin's own route.
export const MEMORY_PLUGIN_NAME = "@trex/memory";

async function copyDirRecursive(src: string, dest: string): Promise<void> {
  await Deno.mkdir(dest, { recursive: true });
  for await (const entry of Deno.readDir(src)) {
    const s = `${src}/${entry.name}`;
    const d = `${dest}/${entry.name}`;
    // Deno.stat follows symlinks, so linked files/dirs are copied as content
    // (matches plugin/agents.ts's copyDirRecursive exactly).
    const info = entry.isSymlink ? await Deno.stat(s) : entry;
    if (info.isDirectory) await copyDirRecursive(s, d);
    else if (info.isFile) await Deno.copyFile(s, d);
  }
}

// Resolve the on-disk vendor/gbrain/src dir. import.meta.url is NOT a
// reliable disk path in the packaged image (the main service can execute
// from a build-time compile graph whose file URLs don't exist at runtime).
// Try meta-relative first (source checkouts, tests), then cwd-relative
// (packaged image) — same dual-path convention as
// plugin/agents.ts:resolveAgentsRuntimeDir and
// memory/gbrain-process.ts:resolveGbrainDir.
export async function resolveGbrainSrcDir(): Promise<string> {
  const candidates = [
    new URL("../../../../vendor/gbrain/src/", import.meta.url).pathname,
    `${Deno.cwd()}/vendor/gbrain/src/`,
  ];
  for (const c of candidates) {
    try {
      await Deno.stat(`${c}core/postgres-engine.ts`);
      return c;
    } catch { /* try next candidate */ }
  }
  throw new Error(
    `memory: cannot locate vendor/gbrain/src (tried ${candidates.join(", ")})`,
  );
}

// Resolve this module's own directory (holds handler.ts + the H2-authored
// deno.json this reuses) with the same dual-path convention.
async function resolveGbrainWorkerDir(): Promise<string> {
  const candidates = [
    new URL("./", import.meta.url).pathname,
    `${Deno.cwd()}/core/server/memory/gbrain-worker/`,
  ];
  for (const c of candidates) {
    try {
      await Deno.stat(`${c}handler.ts`);
      return c;
    } catch { /* try next candidate */ }
  }
  throw new Error(
    `memory: cannot locate gbrain-worker dir (tried ${candidates.join(", ")})`,
  );
}

export interface MemoryWorkerConfig {
  servicePath: string;
  importMapPath: string;
  env: Record<string, string>;
}

/**
 * Stages a self-contained servicePath for the memory worker and returns its
 * config WITHOUT mounting it (no `_addFunction` call) — factored out so it
 * can be unit-tested on disk without the edge runtime (see mount.test.ts).
 * `mountMemoryWorker` below is the thin wrapper that also mounts it.
 */
export async function buildMemoryWorkerConfig(
  entries: MemoryEntry[],
): Promise<MemoryWorkerConfig> {
  // The worker's module loader only resolves file: specifiers under its own
  // servicePath (plus npm:/jsr:/remote specifiers) — same constraint
  // buildAgentWorkerConfig documents at length. Stage everything the worker
  // imports inside the servicePath: the vendored gbrain core (its own
  // relative imports + bare specifiers, patched Deno-native per
  // vendor/gbrain/PATCHES.md) and the H2 handler.
  const tmp = await Deno.makeTempDir({ prefix: "trex-memory-" });
  const gbrainSrc = await resolveGbrainSrcDir();
  const workerDir = await resolveGbrainWorkerDir();

  // Copy target is `${tmp}/gbrain/src/` (not `${tmp}/gbrain/`) so the
  // `"gbrain/": "./gbrain/src/"` import-map alias below resolves — matches
  // H2's own `deno.json` alias, just rooted at the staged copy instead of
  // `../../../../vendor/gbrain/src/`. ~799 files; acceptable per-mount cost,
  // same order of magnitude as buildAgentWorkerConfig's runtime copy.
  await copyDirRecursive(gbrainSrc, `${tmp}/gbrain/src`);
  await Deno.copyFile(`${workerDir}handler.ts`, `${tmp}/handler.ts`);

  // Worker entry point: mirrors core/server/agents/service/index.ts's shape
  // (construct dependencies from env, build the handler, Deno.serve it) —
  // see that file for the pattern this is intentionally parallel to.
  const indexSrc = `// Edge-runtime worker entry for the memory plugin type. One worker serves
// every declared memory (schema-routed per request, see handler.ts /
// gbrain/core/multi-tenant.ts's parseMemoryPath) — unlike agents, which run
// one worker per agent.
import { PostgresEngine } from "gbrain/core/postgres-engine.ts";
import { createMemoryHandler } from "./handler.ts";

const engine = new PostgresEngine();
// Cast: EngineConfig's full shape carries fields (poolSize, etc.) this
// thin worker doesn't set — same cast handler.test.ts uses to connect.
await engine.connect(
  { engine: "postgres", database_url: Deno.env.get("DATABASE_URL") } as never,
);

const allowlist = new Set(
  (Deno.env.get("GBRAIN_MEMORY_ALLOWLIST") ?? "").split(",").filter(Boolean),
);
const token = Deno.env.get("GBRAIN_MEMORY_TOKEN") ?? "";
const basePath = Deno.env.get("TREX_MEMORY_BASE") ?? "";

const handler = createMemoryHandler({ engine, allowlist, token, basePath });

Deno.serve((req) => handler(req));
`;
  await Deno.writeTextFile(`${tmp}/index.ts`, indexSrc);

  // Reuse H2's already-working import map (deno.json, sibling to
  // handler.ts) rather than re-deriving the npm/node: dependency closure —
  // only the `gbrain/` alias target changes (staged copy vs. the vendor
  // checkout H2 pointed at directly).
  const h2ImportMap = JSON.parse(
    await Deno.readTextFile(`${workerDir}deno.json`),
  ) as { imports: Record<string, string> };
  const imports: Record<string, string> = {
    ...h2ImportMap.imports,
    "gbrain/": "./gbrain/src/",
  };

  const importMapPath = `${tmp}/import_map.json`;
  await Deno.writeTextFile(importMapPath, JSON.stringify({ imports }, null, 2));
  // The worker's static graph builder resolves bare specifiers from the
  // servicePath's OWN deno.json, not from the importMapPath worker option
  // (that one is runtime-only) — same requirement buildAgentWorkerConfig
  // documents; without this, graph creation fails with `Import "postgres"
  // not a dependency` on the staged index.ts/handler.ts.
  await Deno.writeTextFile(`${tmp}/deno.json`, JSON.stringify({ imports }, null, 2));

  const env: Record<string, string> = {
    DATABASE_URL: Deno.env.get("DATABASE_URL") ?? "",
    // Security gate (design §8 / gbrain-process.ts's prior GBRAIN_MEMORY_ALLOWLIST):
    // the worker only routes/provisions memories declared by installed
    // plugins — never an arbitrary caller-supplied name.
    GBRAIN_MEMORY_ALLOWLIST: entries.map((e) => e.name).join(","),
    GBRAIN_MEMORY_TOKEN: Deno.env.get("GBRAIN_MEMORY_TOKEN") ?? "",
  };

  return { servicePath: tmp, importMapPath, env };
}

// The worker needs `--allow-sys` (@ai-sdk/gateway -> @vercel/oidc calls
// os.hostname() at import time, unconditionally, per task-h2-report.md's
// "Deviations" #3 — a real cost of importing gbrain's dispatch/operations
// table wholesale, not something this mount can avoid) plus the obvious
// net/env/read a Postgres-backed HTTP worker needs. NOTE: the exact shape
// `EdgeRuntime.userWorkers.create`'s `permissions` option expects is defined
// in the `trex-runtime` submodule (plugins/runtime/trex-runtime), which is
// NOT checked out in this environment (see task-h3-report.md) — this object
// is best-effort, modeled on Deno's own permission-flag names (the
// `EdgeRuntime.userWorkers` API's supabase-edge-runtime lineage uses the
// same `allow_*` naming), and MUST be verified once the runtime is
// available (deferred, same gate as live worker execution).
export const MEMORY_WORKER_PERMISSIONS = {
  allow_net: true,
  allow_env: true,
  allow_read: true,
  allow_sys: true,
};

/**
 * Mounts the memory worker at `${PLUGINS_BASE_PATH}/trex/memory` (see the
 * module doc comment for the trust-scope/auth reasoning and mount.test.ts /
 * task-h3-report.md for why the basePath the worker strips is the SCOPE
 * prefix only, not the full mount path).
 *
 * No-ops (and logs) if there are no declared memories, or if
 * `MEMORY_PLUGIN_NAME` somehow isn't trusted-scope (defensive — it's a
 * module constant, not operator input, so this should never trip; mirrors
 * addAgentsPlugin's guard shape for consistency/documentation).
 */
export async function mountMemoryWorker(
  app: Express,
  entries: MemoryEntry[],
): Promise<void> {
  if (entries.length === 0) return;
  if (!isTrustedPluginScope(MEMORY_PLUGIN_NAME)) {
    console.error(
      `memory: worker mount skipped — MEMORY_PLUGIN_NAME must be a trusted scope (${
        TRUSTED_PLUGIN_SCOPES.join(", ")
      })`,
    );
    return;
  }

  const cfg = await buildMemoryWorkerConfig(entries);

  // `_addFunction`'s fullSource = PLUGINS_BASE_PATH + scopePrefix + url for
  // trusted-scope plugins (see function.ts). Mounting url="/memory" (NOT
  // "" or "/") keeps the Express route scoped to a single subpath
  // (`/plugins/trex/memory[/*]`) rather than swallowing every other
  // `@trex/*` route under the shared `/plugins/trex` prefix.
  //
  // TREX_MEMORY_BASE, however, is the SCOPE PREFIX ONLY
  // (`${PLUGINS_BASE_PATH}${scope}`, e.g. `/plugins/trex`) — NOT the full
  // mount path. This is the one deliberate divergence from
  // addAgentsPlugin's TREX_AGENT_BASE (which passes the FULL mount path,
  // `cfg.source` included): handler.ts's routing
  // (gbrain/core/multi-tenant.ts's `parseMemoryPath`) hard-requires the
  // path REMAINING after the basePath strip to still start with literal
  // `/memory/<name>/...` — stripping the `/memory` mount segment itself
  // would leave e.g. `/research/mcp`, which parseMemoryPath rejects as a
  // 404. Stripping only the scope prefix leaves `/memory/research/mcp`,
  // which is exactly what parseMemoryPath expects.
  const scope = scopeUrlPrefix(MEMORY_PLUGIN_NAME);
  const basePath = `${PLUGINS_BASE_PATH}${scope}`;
  console.log(
    `memory: mounting ${entries.length} memories (${
      entries.map((e) => e.name).join(", ")
    }) at ${basePath}/memory`,
  );

  _addFunction(
    app,
    "/memory",
    cfg.servicePath,
    cfg.importMapPath,
    {
      function: "",
      allowHostFsAccess: true,
      permissions: MEMORY_WORKER_PERMISSIONS,
    },
    cfg.servicePath,
    MEMORY_PLUGIN_NAME,
    { _shared: { ...cfg.env, TREX_MEMORY_BASE: basePath } },
  );
}

/**
 * The same basePath `mountMemoryWorker` computes, exposed standalone so a
 * caller (Task 13's boot warmup) can build the internal URL to hit for
 * warmup without duplicating the scope-prefix logic.
 */
export function memoryWorkerBasePath(): string {
  return `${PLUGINS_BASE_PATH}${scopeUrlPrefix(MEMORY_PLUGIN_NAME)}`;
}

/**
 * Boot warmup: issues an internal MCP `initialize` request per declared
 * memory so the (lazily-created, per-servicePath) worker is provisioned
 * before the first real caller hits it — same lazy-worker-creation
 * semantics `_callWorker` has for every other function-plugin route
 * (EdgeRuntime.userWorkers.create happens on first `_callWorker`, keyed by
 * servicePath). `baseUrl` is the internal address of THIS trex server
 * (e.g. `http://127.0.0.1:<port>`) — the caller (Task 13) owns knowing
 * that; this only knows the path (`memoryWorkerBasePath()` + `/memory`).
 *
 * Best-effort: a failed warmup for one memory is logged and does not throw
 * or block the others — the worker still lazily provisions on the first
 * REAL request either way, so a failed warmup only costs one cold start,
 * not availability. Not exercised by mount.test.ts (needs a live HTTP
 * listener); see task-h3-report.md's runtime-execution limitation.
 */
export async function warmMemories(
  baseUrl: string,
  entries: MemoryEntry[],
  token: string,
): Promise<void> {
  const base = `${baseUrl}${memoryWorkerBasePath()}/memory`;
  for (const entry of entries) {
    try {
      const res = await fetch(`${base}/${entry.name}/mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "warmup",
          method: "initialize",
          params: {},
        }),
      });
      if (!res.ok) {
        console.error(
          `memory: warmup failed for ${entry.name}: HTTP ${res.status}`,
        );
      }
    } catch (e) {
      console.error(`memory: warmup failed for ${entry.name}:`, e);
    }
  }
}
