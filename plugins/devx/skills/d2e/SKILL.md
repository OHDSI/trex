---
name: d2e
description: Use when working in a Data2Evidence (d2e) app — the platform architecture, the three artifact types (ui/functions/flows), and conventions. For running/testing locally, see the testing-d2e-functions and testing-d2e-ui skills.
---

# Data2Evidence (d2e)

Data2Evidence (d2e) is an open clinical/observational-research data platform
(OHDSI/OMOP CDM ecosystem). A d2e app in devx is a **clone of a d2e repository**
whose runnable units ("sub-apps") have been auto-detected. There are three artifact
types: **ui**, **functions**, and **flows**. This skill is the reference for how the
platform fits together; for how to **run and test** each locally, see the
**`testing-d2e-functions`** and **`testing-d2e-ui`** skills.

## Platform shape (how the full stack runs in production)

d2e is a **docker-compose platform**. Requests flow through a chain of services:

- **Caddy** reverse proxy on `:41100` fronts everything (TLS terminator + router).
- **trex gateway** on `:33001` — serves the **functions** (edge functions, routed by path) and the **portal** UI shell. This is the same trex runtime devx itself runs on.
- **Postgres (minerva)** — the primary relational store (OMOP CDM data, metadata). **HANA** is an optional alternative analytics database.
- **Logto** — the OIDC identity provider (`/sign-in`, `/oidc`). All auth is Logto-issued JWTs.
- **Prefect** on `:41120` (`/d2e/api`) — the workflow/orchestration server that runs **flows**.

Backend calls are routed by path through trex, e.g. `/gateway/api/...`, `/analytics-svc/...`.

### How devx runs a d2e sub-app (the devx contract)

devx runs **ONE subprocess per app inside the trex container**. Two situations:

- **Standalone devx** — there is no full stack in the container. devx runs a single
  sub-app's dev server and proxies backend calls to a **separately-running d2e** whose
  URL you set as the app's **External API** (`config.d2e.externalApiBase`; written to
  `.env.local` as `D2E_API_BASE` / `VITE_D2E_API_BASE`).
- **Full stack local (facilitated / claw run)** — the backend, Postgres, functions,
  and portal are all live in the same trex container, so do NOT point at an external
  d2e. This is the common case for a coder; see `testing-d2e-functions` /
  `testing-d2e-ui` for how to run and test against it.

You are **editing a clone** of the repo; the **active sub-app** is the one that runs
and that `TREX.md` describes.

### Repo access

- **OHDSI/d2e** (the platform repo: functions + compose) is **public**.
- The **d2e-ui** and **d2e-flows** repos are **private** — cloning and installing them needs a connected **GitHub token** (for private `@portal/*` packages). If install fails with `401`/`@portal`/authentication errors, connect GitHub in Settings.

---

## Artifact type: functions

**Location:** `plugins/functions/<name>/` (legacy: `functions/<name>/`). `_shared/` is a **shared library directory, not a function** — skip it.

**Runtime:** the trex **edge runtime** (`EdgeRuntime.userWorkers`, Deno-based) running Node/Express-style code. Each function has a `deno.json` with `npm:` imports and starts an HTTP server (`app.listen(8000)` / `Deno.serve`).

**Routing & registration:** functions are routed through trex **by path** (e.g. `/gateway/api/...`, `/analytics-svc/...`) and registered via the **parent** `plugins/functions/package.json` under `trex.functions.api` — an array of `{ source, function, imports, env }` entries mapping a URL prefix to a function dir.

**Auth:** Logto JWT, validated via `_shared/alp-base-utils/GetUser.ts`.

**Data access:** environment variables (`PG__*` for Postgres, `HANA__*` for HANA) plus `_shared` connection libraries — `PostgresConnection`, `NodeHDBConnection`.

**Running / testing:** see **`testing-d2e-functions`**.

---

## Artifact type: ui

**Repo:** `d2e-ui` — an **Nx + yarn-workspaces monorepo**. Install once at the repo root (`yarn`, needs `GITHUB_TOKEN` for `@portal/*`); dev runs per app.

**Shared libs (build before running any app):** `@portal/components`
(`libs/portal-components`) and `@portal/plugin` (`libs/portal-plugin`) ship as build
output only — most apps won't compile/start until they're built. See `testing-d2e-ui`.

**Apps in the monorepo** (`apps/<name>`):

| app | framework | role |
|---|---|---|
| `portal` | React (CRA) | **the SHELL** — hosts the other UIs |
| `vue-mri-ui-lib` | Vue (Vite) | patient analytics (MRI / Atlas) |
| `jobs` | Vue (Vite) | embeds the Prefect UI |
| `flow`, `analysis-ui`, `mapping` | React (Vite) | module-federation **remotes** loaded INTO portal |
| `concept-sets`, `concept-mapping`, `notebook-ui`, `wizards` | React (Vite) | micro-frontends loaded INTO portal |
| `webr-notebook` | React (Vite, build+preview) | WebR notebook |
| `mri-pa-ui` | (library) | built lib, not a runnable app |

**Module-federation remotes / micro-frontends** are **loaded into `portal`** and
render **limited UI standalone** — provide portal context or run through the served
portal for a faithful view (see `testing-d2e-ui`). Only `vue-mri-ui-lib` and
`wizards` render meaningfully as bare dev servers.

**Portal context** props passed into plugins/remotes: `getToken()`, `username`, `datasetId`, `studyId`, `apiBase`. Use `getToken()` for auth headers, `apiBase` as the base URL for backend calls.

**Styling:** **MUI** (primary navy `#000080`). **NOT Tailwind.**

**Build output:** built assets go to `resources/<app>/`.

**Verifying / screenshotting a UI change:** default is build + overwrite the served
resources, then screenshot the real `:41100` route — see **`testing-d2e-ui`**. The
interactive hot-reload preview dev server is a separate concern — see
**`d2e-ui-preview`**.

---

## Artifact type: flows

**Repo:** `d2e-flows` — **Prefect 3 / Python**.

**Layout:** one directory per flow: `flow.py` (`@flow`/`@task`), `types.py` (Pydantic params), `package.json` (a `trex.flow.flows[]` manifest with `entrypoint`/`command`), `Dockerfile`. Generate the manifest with `flowinit.py`.

**Data access:** via `DBDao` — **Ibis** for Postgres, **SQLAlchemy** for HANA/DuckDB.

**Testing:** use `prefect_test_harness()` to validate flow logic against an ephemeral Prefect backend. **Full flow execution is out of scope in devx** — the Rust process manager's command allowlist lacks `python`/`prefect`, so real runs need an image rebuild; the platform runs flows via a Prefect server (`:41120`) + a Docker worker pool.

---

## Quick reference

- You are editing a **clone** of a d2e repo; the **active sub-app** is what runs and what `TREX.md` describes.
- Standalone devx points at a separately-running d2e (**External API**); a facilitated/local run uses the in-container stack — see the `testing-d2e-*` skills.
- Module-federation remotes (`flow`/`analysis`/`mapping`) need `portal` running too for a faithful UI.
- Private repos (`d2e-ui`, `d2e-flows`) need a connected **GitHub token**; OHDSI/d2e is public.
