---
name: testing-d2e-functions
description: Use when running or testing a Data2Evidence (d2e) function locally — how to exercise an edge function against a full d2e stack running in the same trex (edge runtime, register, hot-reload, real Postgres), plus pure-logic unit tests.
---

# Testing d2e functions locally

For what a function IS (location, runtime, routing, auth, data access), see the
`d2e` skill. This covers how to **run and test** one against a full d2e stack
running locally in the same trex container (the facilitated / claw case) — the
backend, Postgres, and Logto are all local and live.

Confirm the local stack once: `env | grep '^PG__'` and
`curl -s -o /dev/null -w '%{http_code}' http://localhost:33001/`. What's local:
- **Postgres** at `PG__HOST:PG__PORT` (e.g. `alp-minerva-postgres-1:5432`, db
  `alp`); `PG__*` is exported, so a function's `_shared` `PostgresConnection`
  reaches **real local data**.
- **trex gateway** on `:33001` serves every function by path.

## Exercise a function
d2e functions do NOT run under plain `deno run` — they execute in trex's embedded
**edge runtime** (`EdgeRuntime.userWorkers`), which gives them `EdgeRuntime`, the
worker/`envVars` model, decorator metadata, and `_shared` resolution. `deno run
index.ts` lacks all of that, so it is NOT a faithful test — use it only for
**pure-logic unit tests** (`deno test` on `*.test.ts`), never to validate a route.

To exercise a function for real it must be **served by trex** (an edge worker):
1. Edit it in the app's `plugins/functions/<name>/`.
2. Mount it into the running trex:
   `POST http://localhost:33001${BASE_PATH:-/trex}/api/plugins/register` body
   `{"path":"<abs worktree function dir>"}` — needs an **admin JWT**, and the dir
   must be under `/tmp/devx-workspaces`. Then hit the function's real route on
   `:33001`; because `PG__*` is set, DB-backed routes return real local data.
3. **Hot-reload (edits go live, no restart):** with `DEVX_HOT_RELOAD` on (default
   in local dev), an edit to a served workspace function is picked up on the
   **next request** — a fresh, module-cache-bypassing edge worker re-reads source.
   Concurrent requests to the same function are serialized so they don't clobber
   each other's rebuild. Applies to source (unbundled) functions; an eszip-bundled
   function still needs a rebuild. Iterate logic with `deno test`; use the served
   route for the real integration check.
4. **Restore the original function when done.** If a test changed the function
   only to exercise it (a temporary probe/version marker, a loosened check), revert
   that edit — never leave a scratch/debug edit in the shared local deployment.
