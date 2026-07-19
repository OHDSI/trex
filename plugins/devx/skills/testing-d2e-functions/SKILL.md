---
name: testing-d2e-functions
description: Use when running or testing a Data2Evidence (d2e) function locally — how to exercise an edge function against a full d2e stack running in the same trex (edge runtime, register, hot-reload, real Postgres), plus pure-logic unit tests.
---

# Testing d2e functions locally

For what a function IS (location, runtime, routing, auth, data access), see the
`d2e` skill. This covers how to **run and test** one against a full d2e stack
running locally in the same trex container (the facilitated / claw case) — the
backend, Postgres, and Logto are all local and live.

Confirm the local stack once — **from inside the container**
(`docker exec alp-trex …`; both fail silently on the host): `env | grep '^PG__'` and
`curl -s -o /dev/null -w '%{http_code}' http://localhost:33001/` (expect `302`).
From the host, go through Caddy instead: `curl -sk https://localhost:41100/…`
(`-k` — the cert is self-signed). What's local:
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

To exercise a function for real it must be **served by trex** (an edge worker). Which
recipe you use depends on **where the function lives** — this distinction decides
everything below, so establish it first:

- **Platform function** — bind-mounted from the d2e repo into the container, e.g. host
  `plugins/functions/<name>` → `/usr/src/plugins/d2ef/<name>`. This is the common case
  in a local/facilitated stack.
- **Workspace function** — under `/tmp/devx-workspaces` (`DEVX_WORKSPACE_DIR`), i.e. a
  devx sub-app you registered.

### Platform function (the usual case)
1. Edit it in `plugins/functions/<name>/` (bind-mounted, so the edit is visible to trex
   immediately — no copy needed).
2. **`docker restart alp-trex`** (~15s to healthy). Platform functions are pooled and
   cached: **hot-reload does NOT apply to them** (see below). Without the restart your
   edit is invisible and you will misdiagnose it as "the edit didn't land".
3. Call the route and assert the change.
4. **Revert the edit, then restart again.** The running edge worker still holds your
   modified code, so reverting the file alone leaves the endpoint serving it. Re-request
   afterwards to confirm the change is gone. `git status` must be clean.

### Workspace function
Register it: `POST http://localhost:33001${BASE_PATH:-/trex}/api/plugins/register` body
`{"path":"<abs dir under /tmp/devx-workspaces>"}` (needs an **admin JWT**). Then hit its
real route. Here **hot-reload does apply**: with `DEVX_HOT_RELOAD=true`, an edit is picked
up on the **next request** — a fresh, module-cache-bypassing edge worker re-reads source,
and concurrent requests to the same function are serialized so they don't clobber each
other's rebuild.

### Hot-reload — the exact gate
`DEVX_HOT_RELOAD=true` is **necessary but not sufficient**. `core/server/plugin/function.ts`:
```ts
const _hotReload = Deno.env.get("DEVX_HOT_RELOAD") === "true" &&
  (servicePath.startsWith(_wsDir) || dir.startsWith(_wsDir));   // _wsDir = DEVX_WORKSPACE_DIR
```
So it is scoped to the **workspace dir** — the baked/bind-mounted platform functions are
deliberately excluded ("pooled, cached"). An eszip-bundled function needs a rebuild
regardless; check with `find <dir> -name '*.eszip'`.

Iterate logic with `deno test`; use the served route for the real integration check.

## Reaching a route without a token
Most routes require a Logto JWT and will `401`; a client-credentials service token gets
you to `403 insufficient scopes`, not through. The exception is the public-URL allowlist
(`D2E_PUBLIC_URL_PATTERNS`, applied in `core/server/middleware/plugin-authz.ts`). Known
token-free targets, ideal for a smoke test:
- `GET /system-portal/feature/list`
- `GET /system-portal/dataset/public/list`

To find a function's route prefix, read the `trex.functions.api` array in the **parent**
`plugins/functions/package.json` — it maps URL prefix → function dir for all 40+ routes.
