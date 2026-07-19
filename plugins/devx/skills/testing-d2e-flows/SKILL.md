---
name: testing-d2e-flows
description: Use when running or verifying a Data2Evidence (d2e) Prefect flow locally — trigger a real flow run over the Prefect REST API (no UI), send the authtoken input the flow blocks on, poll to a terminal state and read its logs; plus prefect_test_harness for pure logic.
---

# Testing d2e flows

For what a flow IS (layout, `DBDao`, Pydantic params), see the `d2e` skill. This is how
to actually **run one and prove it worked**. Drive it over the **Prefect REST API** —
you do not need the portal UI.

## How a flow run executes
- **Prefect server**: `http://alp-dataflow-gen-1:41120/d2e/api` (container-internal).
- **Worker**: a **pixi process worker** (`process-pool`). Flow runs execute as
  subprocesses in per-plugin pixi environments — not containers.
- The worker runs `/app/run-flow.sh <plugin> [env]`, which resolves the code:
  1. deployment's `job_variables.plugin_artifact` → provision that tarball into
     `$D2E_FLOWS_CACHE/<plugin>/<sha>` (default `/var/lib/d2e-flows`), else
  2. the newest provisioned dir in the local cache (the image's **baked** envs).
  Then `cd <plugin_dir> && pixi run -e <env> prefect flow-run execute`.
- trex registers deployments at **boot** (`core/server/plugin/flow.ts` → `addFlowPlugin`),
  and it **skips deploying entirely if the work pool doesn't exist yet**.

## Prerequisites — check these first, they fail silently
1. **Worker healthy and pool READY.** `POST /work_pools/filter` should show
   `process-pool` `type=process` `status=READY`, and
   `POST /work_pools/process-pool/workers/filter` an `ONLINE` worker. If the worker
   container is dead, a triggered run just sits in `SCHEDULED` forever.
   A worker image without pixi exits `127` (`exec: pixi: not found`) — that means the
   image predates the pixi migration; pull a current one.
2. **Deployments on the right pool.** `POST /deployments/filter` → check
   `work_pool_name`. Deployments left on a stale `docker-pool` are never picked up.
   Because registration happens at trex boot **after** the pool exists, the fix order is:
   worker up → pool READY → **restart trex** → deployments land on `process-pool`.

## Running a flow (the verified recipe)
```
POST /deployments/filter                     -> find the deployment by name
POST /flow_runs/filter                       -> crib `parameters` from a previous run
POST /deployments/{id}/create_flow_run       -> {"parameters": {...}, "name": "..."}
POST /flow_runs/{run_id}/input               -> the authtoken (see below) — IMMEDIATELY
GET  /flow_runs/{run_id}                     -> poll state.type until terminal
POST /logs/filter                            -> {"logs":{"flow_run_id":{"any_":[id]}}}
```
Terminal states: `COMPLETED | FAILED | CRASHED | CANCELLED`. Assert `COMPLETED`; on
anything else dump the logs — the real error is in the last few lines.

**Don't invent `parameters`.** Most flows take one required `options` object with many
required keys. Copy it from a previous successful run of the same deployment
(`/flow_runs/filter`, take `parameters`) and edit what you need.

## The authtoken input — the trap that costs you 5 minutes
Flows wait for a Prefect **run input** named exactly `authtoken` and use it to call back
into the portal. `create_flow_run` alone does NOT supply it (the portal sends it
separately), so the run sits in `RUNNING`, logs stop after a line like
`Checking if schema '<x>' exists in cache`, and it dies ~300s later. It looks like a
hang or an infra problem; it is neither.

Send it **immediately after** creating the run:
```
POST /flow_runs/{run_id}/input
{ "key": "authtoken",
  "value": "{\"token\":\"Bearer eyJ...\",\"thirdpartytoken\":\"\",\"thirdpartyrefreshtoken\":\"\"}" }
```
- `key` must be exactly `authtoken` (it matches the object name in the Python flow).
- `value` must be a **string** — JSON-encode the object, don't nest it.
- Measured: same flow, same params — **15s `COMPLETED`** with the input vs **298s
  `FAILED`** without it.

**The token must be one the portal accepts.** A trex-minted HS256 token passes Prefect
but the flow then fails `[401] PortalServerAPI - Failed to update dataset attribute …`.
Use a real Logto/portal token. Reliable way to get one: log into the portal with
Playwright (see `testing-d2e-ui` for the login recipe) and capture the `Authorization`
header off any authenticated request:
```js
p.on("request", r => { const a=r.headers()["authorization"];
                       if (a && /^bearer /i.test(a) && !tok) tok=a; });
```
It is not in `localStorage` — the Logto SDK doesn't put it there. The portal's own
implementation is `plugins/functions/jobplugins/src/api/PrefectAPI.ts`
(`createInputAuthToken` / `deleteInputAuthToken`) — read it if the shape ever changes.

## Pure logic — no infra
For flow logic that doesn't need the platform, use `prefect_test_harness()` against an
ephemeral backend and call the `@flow`/`@task` functions directly. That is the fast
loop; the REST path above is the integration check.

## Iterating on flow code
Deployments here carry **no** `plugin_artifact`, so the worker runs the **baked** env at
`/var/lib/d2e-flows/<plugin>/baked`. Re-provisioning is stamp-based (lockfile/artifact
sha), so editing `.py` files in that dir does **not** trigger a rebuild — the next run
picks the change up. Caveat: that path lives inside the **worker** container, and the
flows cache is not currently a shared volume, so trex/devx cannot write to it. Until a
shared volume + an explicit dev-override exist, iterate with `docker exec` into the
worker, or rebuild/redeploy the plugin.

## Cleanup
Runs and their inputs persist in Prefect. Give test runs an obvious `name`
(e.g. `devx-…`) so they're identifiable, and delete the `authtoken` input when done the
way the portal does (`DELETE /flow_runs/{id}/input/authtoken`) rather than leaving user
tokens sitting in Prefect.
