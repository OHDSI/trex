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
let tok = null;
p.on("request", r => { const a=r.headers()["authorization"];
                       if (a && /^bearer /i.test(a) && !tok) tok=a; });
// ...log in, THEN make the app issue an authenticated call:
const demo = p.getByText("Demo dataset",{exact:false}).first();
if (await demo.count()) { await demo.click().catch(()=>{}); await p.waitForTimeout(5000); }
```
**Logging in is not enough** — the listener only fires once the app calls its API, so
click into a dataset (or any data view) or `tok` stays `null`. The token is RS256 and
~1.7k chars; it is NOT in `localStorage` (the Logto SDK doesn't put it there).

`thirdpartytoken` / `thirdpartyrefreshtoken` are decoded by the portal from the user
token's `thirdPartyToken` / `thirdPartyRefreshToken` claims. Empty strings were enough
for the flow verified here; supply them for flows that reach a third-party system
(e.g. HANA-backed runs) rather than assuming empty always works.

The portal's own implementation is `plugins/functions/jobplugins/src/api/PrefectAPI.ts`
(`createInputAuthToken` / `deleteInputAuthToken`) — read it if the shape ever changes.
Tokens expire (~1h), so capture one per test session rather than caching it.

## Pure logic — no infra
For flow logic that doesn't need the platform, use `prefect_test_harness()` against an
ephemeral backend and call the `@flow`/`@task` functions directly. That is the fast
loop; the REST path above is the integration check.

## Iterating on flow code — the dev overlay
Deployments here carry **no** `plugin_artifact`, so the worker runs the **baked** env at
`/var/lib/d2e-flows/<plugin>/baked`. Re-provisioning is stamp-based (lockfile/artifact
sha), so editing `.py` files does not trigger a rebuild — the next run picks the change up.

To edit flow source **from outside the worker**, use the `flows-dev` volume (shared with
trex, which mounts it at `/usr/src/flows-dev`):

1. Set `D2E_FLOWS_DEV_DIR=/var/lib/d2e-flows-dev` on the worker (in `.env.local`).
   **Unset is the default and the overlay is fully inert** — it can never shadow a real
   artifact in a deployed environment. It is not set by default, so enabling it means
   recreating the worker (`docker compose up -d --force-recreate alp-dataflow-gen-worker`).
2. Drop edited source at `<dev dir>/<plugin>/<same relative path>`, e.g.
   `…/d2e-flows/flows/create_cachedb_file_plugin/flow.py`. The `<plugin>` segment is the
   short name from the deployment's command (`/app/run-flow.sh d2e-flows`), **not** the
   flow name.
   The same `flows-dev` volume is mounted in **both** containers, so you can write from
   whichever side you are on — trex/devx at **`/usr/src/flows-dev`**, the worker at
   **`/var/lib/d2e-flows-dev`**. Writing from trex and executing on the worker is the
   devx path and is verified working.
3. Trigger a run. `run-flow.sh` rsyncs the dev dir over the resolved plugin dir just
   before `exec` and logs to the worker's stderr:
   `run-flow: DEV OVERRIDE — overlaying <src> onto <plugin_dir>`
   (`docker logs alp-dataflow-gen-worker | grep "DEV OVERRIDE"`). A `print()` in a
   `@flow(log_prints=True)` flow shows up in `/logs/filter`, which is the cheapest way to
   prove your edit is the code that ran.

Two things to know:
- **Source-only.** The overlay excludes `.pixi/` and `.d2e-env-ready` and reuses the
  resolved dir's provisioned env, so dependency changes still need a re-provision.
- **It MUTATES the baked dir.** The overlaid files stay after the run. Either revert them
  or recreate the worker to get back to pristine baked code.
- If you have hot-patched trex by `docker cp`-ing files into `/usr/src/plugins-dx` or
  `/usr/src/plugins-dev`, **recreating trex to pick up the mount drops those patches** —
  they live in the image, not a volume. Re-copy them afterwards. `/root/.claude` (the
  materialized skills) *is* a volume and survives.

To just check that a flow reaches your code without a valid portal token, send a
throwaway `authtoken`: the wait resolves instantly and the run fails fast at
`[401] PortalServerAPI` — long after flow entry, so entry-point logging still proves out.

## Cleanup
Runs and their inputs persist in Prefect. Give test runs an obvious `name`
(e.g. `devx-…`) so they're identifiable, and delete the `authtoken` input when done the
way the portal does (`DELETE /flow_runs/{id}/input/authtoken`) rather than leaving user
tokens sitting in Prefect.
