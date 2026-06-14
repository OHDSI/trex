# D2E Frontend (d2e-ui)

> Distilled from d2e-docs part 2 (frontend), 2026-06-14. See `00-overview` for context.

## Tech Stack — deliberately polyglot
- **Portal shell:** React 18 + TypeScript (Create React App), Material UI 5, React Router v6, Axios, `@axa-fr/react-oidc`. Served from `/d2e/portal`.
- **Patient Analytics:** Vue 3 (`vue-mri-ui-lib`), progressively rewritten from a legacy SAP UI5 app (`mri-pa-ui` ancestors persist). Both React and Vue runtimes ship to any session visiting Patient Analytics — permanent bundle duplication.
- **Monorepo:** Bun + NX. Build tooling varies by app age: CRA (portal), Webpack 5 (ETL flow), Vite/Rollup (newer apps + Vue), `@ui5/cli` (legacy).

## Micro-Frontend Architecture
Host React shell mounts independently-built modules at runtime per the user's roles. **Two coexisting loaders:**
1. **Legacy SystemJS 0.21.6** — AMD/UMD bundles; shared deps (React/ReactDOM/Router/Emotion) pre-registered to avoid duplicate-React bugs; plugins export a `plugin` object with a `page` component fed a `metadata` prop.
2. **single-spa micro-apps** — export bootstrap/mount/unmount; each gets its own DOM div; used by concept-sets, notebook-ui, analysis-ui, wizards. `import-map-overrides` is the dev hot-swap escape hatch.

Plugin manifest = `uiplugins` section of root `package.json`, three role categories: `researcher`, `systemadmin`, `setup`. No discovery protocol — manifest baked into deployment, read via `REACT_APP_PLUGINS` / `window.ENV_DATA`.

## Deployment
**No dedicated web server** — Trex serves all static assets (mapped via `trex.ui.routes`); Caddy reverse-proxies `/d2e/portal/*` to Trex. Runtime config via `window.ENV_DATA` (same artifact for all environments, no rebuild).

## Portal Shell
Owns four cross-cutting concerns: **OIDC auth, global state, unified HTTP layer, role-based routing.** OIDC via authorization-code + PKCE (Logto or Entra ID with required-claim check). Deep-link params saved to session storage *before* the OIDC redirect or lost. Post-auth loads roles via `userMgmt.getUserGroupList`. State = `useReducer` + context (16 action types); `usePersistedReducer` whitelists only `activeDataset` + `postLoginRedirectUri` to localStorage — **tokens never persisted**. Axios layer: public-endpoint whitelist, Bearer injection, ERR_NETWORK retry 3×/10s, 800ms `memoizee` dedup. The shell is a single point of failure for all modules.

## Modules
- **Patient Analytics (Vue 3)** — the signature cohort builder. Filter-card canvas (cards = clinical event types from PA config; mandatory Basic Data card); nested boolean containers build the IFR (cards OR within a container, containers AND); IFR serialized → compressed → base64 → `mriquery` query param to Analytics Service. Chart router (bar, box plot, patient list, KM); up to 4 X-dims + 1 Y-measure. Bookmarks/cohorts as versioned JSON; integrates Atlas-format definitions. State = normalized flat entity maps keyed by stable IDs (avoids whole-tree re-render). React↔Vue seam via token-getter callback + `custom-props-changed` DOM event; router URL ownership not type-enforced (mistakes → blank pages).
- **Data Management Tools** — Concept Sets (React/Vite; expression algebra via Terminology through D2E WebAPI), Concept Mapping (CSV import, embedding suggestions review-only), ETL Dataflow Editor (Webpack 5 + Redux Toolkit + React Flow DAG; Python/R/SQL nodes via Monaco; runs via Prefect, polled), Data Mapping (React Flow + WhiteRabbit scan reports).
- **Analysis & Notebooks** — Strategus config (`analysis-ui`, ReactFlow DAG of 20+ OHDSI node types, RTK Query, recursive-setTimeout polling), Notebook UI (Starboard `StarboardEmbed`, `.ipynb` import via `jupystar`, persisted via StudyNotebook, Git sync, NLUX AI chat). Notebook/iframe auth = short-lived path-scoped JWT cookie (iframes can't reach parent JS tokens).
- **Admin Tools** — dialog-over-table pattern: User Management, Dataset/Study Management, CDM Config Editor (draft→validate→activate), PA Config Editor, DQD, Job Management (embedded Vue micro-frontend), Docker Log Viewer (Dozzle iframe), Setup Config (DB connections, Git, feature flags).

## Shared Components
- **`@portal/components`** — 30+ React components on MUI v5 (form/layout/data-display/feedback), encoding platform conventions. Icons: ~60 SVGs built via SVGR (`Edit.svg` → `EditIcon`; prebuild is destructive — never hand-edit). Rollup → CJS+ESM+`.d.ts`.
- **`@portal/plugin`** — compile-time TypeScript contract: `SystemAdminPagePlugin`, `SetupPagePlugin`, `ResearcherStudyPlugin` (richest metadata), each with a typed `page`.
- **Theme:** primary blue `#2E74B5`; each micro-app provides its own `ThemeProvider`; Vue Patient Analytics replicates the same tokens rather than importing the lib.

All modules inherit auth token + active dataset from the shell's injected single-spa props; each tool hits a specific backend cloud function (failure isolation).
