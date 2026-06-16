---
name: d2e
description: Use when working in a Data2Evidence (d2e) app — explains d2e platform architecture, the three artifact types (ui/functions/flows), conventions, and how to run/iterate each within devx.
---

# Data2Evidence (d2e)

Data2Evidence (d2e) is an open clinical/observational-research data platform (OHDSI/OMOP CDM ecosystem). A d2e app in devx is a **clone of a d2e repository** whose runnable units ("sub-apps") have been auto-detected. There are three artifact types: **ui**, **functions**, and **flows**. This skill is the authoritative reference for how the platform fits together and how to run/iterate each type inside devx.

## Platform shape (how the full stack runs in production)

d2e is a **docker-compose platform**. Requests flow through a chain of services:

- **Caddy** reverse proxy on `:41100` fronts everything (TLS terminator + router).
- **trex gateway** on `:33001` — serves the **functions** (edge functions, routed by path) and the **portal** UI shell. This is the same trex runtime devx itself runs on.
- **Postgres (minerva)** — the primary relational store (OMOP CDM data, metadata). **HANA** is an optional alternative analytics database.
- **Logto** — the OIDC identity provider (`/sign-in`, `/oidc`). All auth is Logto-issued JWTs.
- **Prefect** on `:41120` (`/d2e/api`) — the workflow/orchestration server that runs **flows**.

Backend calls are routed by path through trex, e.g. `/gateway/api/...`, `/analytics-svc/...`.

### How devx runs a d2e sub-app (the devx contract)

devx runs **ONE subprocess per app inside the trex container** — there is no Docker access, so it cannot bring up the full compose stack. Instead:

- devx runs a **single selected sub-app's standalone dev server**.
- Backend/API calls are proxied to a **separately-running d2e stack** whose URL you set as the app's **External API** (`config.d2e.externalApiBase`). devx writes this to `.env.local` (as `D2E_API_BASE` / `VITE_D2E_API_BASE`) in the sub-app's dev dir before starting it.
- Without an External API set, the preview still loads but backend calls fail until you point it at a running d2e.
- You are **editing a clone** of the repo; the **active sub-app** is the one that runs and that `TREX.md` describes.

### Repo access

- **OHDSI/d2e** (the platform repo: functions + compose) is **public**.
- The **d2e-ui** and **d2e-flows** repos are **private** — cloning and installing them needs a connected **GitHub token** (for private `@portal/*` packages, see UI section). If install fails with `401`/`@portal`/authentication errors, connect GitHub in Settings.

---

## Artifact type: functions

**Location:** `plugins/functions/<name>/` (legacy: `functions/<name>/`). `_shared/` is a **shared library directory, not a function** — skip it.

**Runtime:** the trex **Deno** runtime running **Node/Express** style code. Each function has a `deno.json` with `npm:` imports (`npm:express`, etc.) and starts an HTTP server (`app.listen(8000)` / `Deno.serve({ port: 8000 })`).

**Routing & registration:** functions are routed through trex **by path** (e.g. `/gateway/api/...`, `/analytics-svc/...`) and registered via the **parent** `plugins/functions/package.json` under `trex.functions.api` — an array of `{ source, function, imports, env }` entries mapping a URL prefix to a function dir.

**Auth:** Logto JWT, validated via `_shared/alp-base-utils/GetUser.ts`.

**Data access:** via environment variables (`PG__*` for Postgres, `HANA__*` for HANA) plus `_shared` connection libraries — `PostgresConnection`, `NodeHDBConnection`.

**Running one standalone in devx:**
- The dev server is `deno run --allow-all index.ts`, binding `PORT` (the proxy forwards `/proxy/` → `localhost:PORT`).
- Most DB-backed routes need a **reachable external d2e DB/API** — set the **External API** and provide the `PG__*`/`HANA__*` env. Without that, only **health/echo** routes work; DB-backed routes will 5xx.
- v1 devx value for functions is **edit + context + register**, not full runtime. Add a route, wire it into the parent `trex.functions.api`, and test health/echo locally; rely on an external d2e for live data.

---

## Artifact type: ui

**Repo:** `d2e-ui` — an **Nx + yarn-workspaces monorepo**.

**Install once, dev per app:** run install **ONCE at the repo root** (`yarn`), which needs `GITHUB_TOKEN` for the private `@portal/*` packages. Then run each app's dev server individually.

**Apps in the monorepo:**

| app | dir | framework | port | role |
|---|---|---|---|---|
| `portal` | `apps/portal` | React (CRA) | 4000 | **the SHELL** — hosts the other UIs |
| `flow` | `apps/flow` | React (webpack) | 4900 | module-federation **remote** loaded INTO portal |
| `analysis` | `apps/analysis` | React (webpack) | 4800 | module-federation **remote** loaded INTO portal |
| `mapping` | `apps/mapping` | React (Vite) | — | module-federation **remote** loaded INTO portal |
| `jobs` | `apps/jobs` | Vue (Vite) | 5173 | embeds the Prefect UI |
| `vue-mri-ui-lib` | `apps/vue-mri-ui-lib` | Vue (CLI) | 8081 | patient analytics (MRI) |

**Module-federation remotes:** `flow`, `analysis`, and `mapping` are **remotes loaded into `portal`** — they render **limited UI standalone**. For a faithful experience run `portal` too (devx v1 runs one process, so standalone is what you get; document this limitation). `portal` and `jobs` are the best standalone demos.

**Portal context** props passed into plugins/remotes: `getToken()`, `username`, `datasetId`, `studyId`, `apiBase`. Always use these — `getToken()` for auth headers, `apiBase` as the base URL for backend calls.

**Styling:** **MUI** (primary navy `#000080`). **NOT Tailwind.**

**Build output:** built assets go to `resources/<app>/`.

**Running in devx:** `npx nx start <app>` / `npx nx dev <app>` / `npm start` depending on the app (the run command is in the sub-app's `TREX.md`). Install runs at the monorepo root.

---

## Artifact type: flows

**Repo:** `d2e-flows` — **Prefect 3 / Python**.

**Layout:** one directory per flow containing:
- `flow.py` — the Prefect flow (`@flow` / `@task` decorators).
- `types.py` — Pydantic models for the flow's parameters.
- `package.json` — a `trex.flow.flows[]` manifest with `entrypoint` / `command` per flow.
- `Dockerfile` — the flow's container image.

**Manifest generation:** generate the `trex.flow` manifest with `flowinit.py`.

**Data access:** via `DBDao` — **Ibis** for Postgres, **SQLAlchemy** for HANA/DuckDB.

**Testing locally:** use `prefect_test_harness()` to run a flow against an ephemeral Prefect backend.

**Platform run (production):** a Prefect **server** (`:41120`) plus a **Docker worker pool** that spawns one flow container per run.

**In devx:** flows are **CONTEXT + local test only**. The Rust process manager's command allowlist lacks `python`/`prefect`, so **full flow execution needs an image rebuild and is out of scope for v1**. Use the test harness to validate logic; the real platform runs flows via Prefect + Docker workers.

---

## Quick reference: the devx contract (all types)

- You are editing a **clone** of a d2e repo.
- The **active sub-app** is what runs and what `TREX.md` describes.
- Set **External API** (`config.d2e.externalApiBase`) to a separately-running d2e for live data — devx writes it to `.env.local`.
- **Module-federation remotes** (`flow`/`analysis`/`mapping`) need `portal` running too for a faithful UI.
- Private repos (`d2e-ui`, `d2e-flows`) need a connected **GitHub token**; OHDSI/d2e is public.
