# Memory plugin type — operations

Companion to `2026-07-14-memory-plugin-type-design.md` (what/why) and
`2026-07-14-memory-plugin-type-plan.md` (task-by-task detail). This doc is
the operator-facing surface: env vars, routing, how to declare a memory,
and — importantly — what is NOT yet verified because it needs the real
trex edge runtime.

## Environment variables

| Var | Set by | Purpose |
|---|---|---|
| `DATABASE_URL` | trex core (forwarded to the worker) | Postgres connection string the memory worker's `PostgresEngine` connects with. Same database as the rest of trex; memories live in their own schemas (see below), not a separate DB. |
| `GBRAIN_MEMORY_ALLOWLIST` | trex core, **auto-set** | Comma-separated list of declared memory names, derived automatically from every installed plugin's `trex.memory` manifest entries at mount time (`buildMemoryWorkerConfig` in `core/server/memory/gbrain-worker/mount.ts`). Not operator-configured directly — it exists so the worker only ever serves/provisions names that were actually declared by a trusted-scope plugin (design §8: never provision an arbitrary request-path name). Empty string when no plugin declares any memory. |
| `GBRAIN_MEMORY_TOKEN` | trex core (forwarded to the worker) | Internal shared-secret bearer token for the trex-to-memory-worker hop (`handler.ts`'s `timingSafeEqual` check). Not a user-facing credential — see the auth-path gate below for how a real caller reaches the worker at all. |
| `TREX_MEMORY_SOURCES` | trex core, **auto-set** | Absolute path to the staged `sources/` directory the worker self-imports at boot. Set by `buildMemoryWorkerConfig` to `<servicePath>/sources`; needed because the packaged runtime's compile dir carries only the module graph, so the worker can't resolve `./sources` relative to its own module URL there. |
| `GBRAIN_PORT` | — | **No longer used.** Leftover from the abandoned Bun-subprocess hosting model (pre-pivot plan, `serve --http` on a fixed port). The current in-runtime worker has no listening TCP port of its own — it's invoked in-process via `EdgeRuntime.userWorkers` / the `fnmap` inter-service call path. Safe to ignore if seen in older docs/notes. |

## Routing: `/memory/<name>` → schema `memory_<name>`

Each declared memory name maps 1:1 to a Postgres schema `memory_<name>` and
is served at `/memory/<name>` (MCP JSON-RPC at `/memory/<name>/mcp`). Per
request, `parseMemoryPath` (`vendor/gbrain/src/core/multi-tenant.ts`)
extracts `<name>` from the path, checks it against
`GBRAIN_MEMORY_ALLOWLIST`, and — if allow-listed — dispatches through
`withSchema(schema, fn)` so the op runs with
`search_path = memory_<name>, pg_catalog` inside a transaction on a pooled
connection. An undeclared name 404s; there is no request-driven schema
creation.

## Declaring a memory

A memory is declared by a `trex.memory` entry in a trusted-scope plugin's
`package.json` (`@trex`/`@ohdsi` scopes — same trust requirement as
`trex.agents`):

```jsonc
"trex": {
  "memory": [{
    "name": "research",
    "sources": [
      { "name": "clinical-notes", "repo": "https://github.com/org/notes", "ref": "main", "dir": "pages/" },
      { "name": "handbook", "dir": "memory/handbook" }
    ]
  }]
}
```

- **Memory names are hyphen-free**: `^[a-z0-9][a-z0-9_]*$`. The name is
  interpolated unquoted into DDL/`search_path` as `memory_<name>` (a
  Postgres schema identifier), where a hyphen is illegal.
- **Source names may contain hyphens**: `^[a-z0-9][a-z0-9_-]*$`. A source
  is a namespace within a memory (git repo or inline package dir), not a
  schema identifier.
- A source's `dir` is sanitized against `..` path-traversal segments by
  `core/server/memory/importer.ts`'s `joinDir`/`assertNoParentTraversal` —
  a manifest can't resolve outside the plugin package (inline) or the
  cloned checkout (git), even though manifests are already
  operator/tpm-controlled (defense-in-depth, not the primary boundary).

## Linking a memory to an agent

An agent (`trex.agents[]` entry, same trusted-scope requirement) links to a
declared memory by name via a `memory` array on its manifest entry:

```jsonc
"trex": {
  "agents": [{
    "name": "librarian",
    "dir": "agent",
    "memory": [{ "name": "handbook", "mode": "readwrite" }]
  }]
}
```

See `plugins/agent-memory-example/` for a complete minimal example (links
the `handbook` memory declared by `plugins/memory-example/package.json`).

- `mode` is `"read"` (default) or `"readwrite"`; the link is validated at
  boot against the declared-memory allow-list (`plugin.ts`'s
  `DECLARED_MEMORY_NAMES`) — a link to an undeclared name is dropped with a
  warning, not a boot failure (see `agents.ts`'s `unknownMemoryLinks`).
- For each link, boot auto-generates and stages into the agent's own
  directory: namespaced tools `<name>_search`, `<name>_recall`,
  `<name>_get_page` (all modes), plus `<name>_capture` for `readwrite`
  links only — and a `<name>-memory` skill (a short flat-file skill
  describing when to use those tools). These are generated fresh each
  boot and refuse to overwrite a hand-authored tool/skill file of the
  same name.
- Captures always land under the calling agent's own `default` source
  inside that memory — an agent link can never overwrite imported
  knowledge, only add to it.

**Pre-production note:** the tools above call out to the memory over HTTP
(`MEMORY_MCP_URL` + `GBRAIN_MEMORY_TOKEN`, see `agent-memory.ts`'s
`renderMemoryTool`). Actual agent→memory HTTP reachability — whether that
resolves via the public Express route (session-gated) or the internal
`fnmap`/`Trex.tokioChannel` path (bearer-token-gated only) — is one of the
runtime-gated pre-production gaps below (#2): it has not been verified
end-to-end against a live trex edge runtime.

## Pre-production gates (require the trex edge runtime, not verifiable in dev)

The H0-H4 spikes/tasks that built this feature verified everything possible
at the disk/type-check/unit-test level (`vendor/gbrain` patches, the thin
fetch handler, the worker staging pipeline, the boot self-import) without a
live `trex-runtime` submodule checkout or a running core server. The
following are real, open verification gaps — not yet exercised end-to-end —
and must be closed before this ships to production:

1. **Worker `permissions` shape — RESOLVED (#153).** `mount.ts` no longer
   passes a `permissions` object to `EdgeRuntime.userWorkers.create` at all:
   the runtime deserializes each permission field as `Option<Vec<String>>`
   (the earlier best-effort boolean shape would have failed worker
   creation), and the UserWorker defaults already cover this worker's needs
   — including `allow_sys` `"hostname"`, required because importing gbrain's
   dispatch/operations closure pulls in `@ai-sdk/gateway` → `@vercel/oidc`,
   which calls `os.hostname()` unconditionally at import time.
2. **Agent → memory auth path.** The public Express route is gated by
   `authContext`+`pluginAuthz` (requires a valid trex session) layered ON
   TOP OF the worker's own `GBRAIN_MEMORY_TOKEN` bearer check — so a caller
   with only the bearer token and no trex session is 401'd before reaching
   the worker at all over HTTP. The design's actual intended caller (an
   agent referencing a memory by name) is expected to reach it via
   worker-to-worker / the `fnmap` inter-service call path
   (`Trex.tokioChannel`), which bypasses Express middleware and is gated
   purely by the bearer token — same as any other first-party inter-service
   call. This has NOT been verified end-to-end: no live agent has actually
   called into a memory worker yet. If agents instead need to reach memory
   over the public HTTP route (not the internal fnmap path), they need a
   real trex session, which the current design doesn't provide a path for.
3. **Refresh-on-change is deferred.** The worker self-imports every staged
   source exactly once, at boot (`self-import.ts`'s `importStagedSources`,
   wired into the generated worker entry point in `mount.ts`). There is no
   in-worker polling, no file-watch, no webhook — a source's content only
   updates on the next full worker mount/restart. A scheduled refresh loop
   (re-stage + re-mount, or a push-based signal) is explicit future work,
   not present in this wave.
4. **Full worker-boot e2e.** Nobody has yet: mounted a real memory worker
   against a live Express app, issued an HTTP request through it, watched
   `EdgeRuntime.userWorkers.create` actually accept the staged servicePath
   + import maps + `permissions` object, confirmed `PostgresEngine.connect`
   succeeds inside the sandboxed worker process, or exercised the
   `put_page`/`query` MCP round-trip against a live schema. Everything
   verified so far is disk-level (staged file contents), type-check-level
   (`deno check`), and isolated-unit-test-level (stubbed HTTP servers,
   local git repos) — never a running worker.

## Image/Dockerfile — DONE (#153)

Hosting gbrain as an in-runtime Deno worker (rather than a Bun subprocess)
means **no Bun binary ships in the image for this feature**. The image build
now stages the worker's runtime inputs: `Dockerfile` copies
`vendor/gbrain/src/` plus the sibling `package.json` (the memory worker
resolves them from disk at mount time via
`gbrain-worker/mount.ts:resolveGbrainSrcDir`; tests/docs/CHANGELOG stay out
of the image). The `gbrain-worker/` handler itself ships with the rest of
`core/`. CI also gained a `core-server-tests` leg (`plugin-ci.yml`) that
runs the memory importer + gbrain-worker suites against a live pgvector
Postgres — the disk/unit-level gaps below remain runtime-gated, not
CI-gated.
