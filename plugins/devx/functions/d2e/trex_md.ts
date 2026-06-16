// @ts-nocheck - Deno edge function
import type { D2EConfig, SubApp } from "./types.ts";

/** Type-specific conventions block, condensed from the d2e skill. */
function conventionsBlock(subApp: SubApp): string {
  switch (subApp.type) {
    case "ui":
      return [
        "## UI conventions",
        "",
        "- `d2e-ui` is an **Nx + yarn-workspaces** monorepo. Install runs **once at the repo root** (`yarn`, needs `GITHUB_TOKEN` for private `@portal/*` packages); dev runs per app.",
        "- `portal` (CRA, :4000) is the **shell**. `flow` (:4900), `analysis` (:4800) and `mapping` are **module-federation remotes loaded INTO portal** — they render limited UI standalone, so run `portal` too for a faithful experience. `jobs` (Vue/Vite, :5173) embeds the Prefect UI.",
        "- Portal context props passed to plugins: `getToken()`, `username`, `datasetId`, `studyId`, `apiBase`. Use `getToken()` for auth headers and `apiBase` as the base URL for backend calls.",
        "- Styling is **MUI** (primary navy `#000080`). Do **NOT** use Tailwind. Built assets go to `resources/<app>/`.",
      ].join("\n");
    case "function":
      return [
        "## Function conventions",
        "",
        "- A trex **Deno** edge function running Node/Express style code (`deno.json` with `npm:` imports; `app.listen(8000)` / `Deno.serve({ port: 8000 })`).",
        "- Routed through trex **by path** (`/gateway/api/...`, `/analytics-svc/...`); registered via the parent `plugins/functions/package.json` under `trex.functions.api` (`{ source, function, imports, env }`). `_shared/` is shared libs, not a function.",
        "- Auth = Logto JWT via `_shared/alp-base-utils/GetUser.ts`. DB access via env (`PG__*`, `HANA__*`) + `_shared` libs (`PostgresConnection`, `NodeHDBConnection`).",
        "- Standalone here, only **health/echo** routes work without a reachable external d2e DB/API. Set the **External API** (and `PG__*`/`HANA__*`) for DB-backed routes; otherwise they 5xx.",
      ].join("\n");
    case "flow":
      return [
        "## Flow conventions",
        "",
        "- A **Prefect 3 / Python** flow: one dir with `flow.py` (`@flow`/`@task`), `types.py` (Pydantic params), `package.json` (`trex.flow.flows[]` manifest with `entrypoint`/`command`), and a `Dockerfile`. Generate the manifest with `flowinit.py`.",
        "- Data access via `DBDao` (Ibis for Postgres, SQLAlchemy for HANA/DuckDB).",
        "- Test locally with `prefect_test_harness()`. The platform runs flows via a Prefect server (:41120) + a Docker worker pool.",
        "- In devx, flows are **context + local test only** — the process manager's allowlist lacks `python`/`prefect`, so full flow execution needs an image rebuild (out of scope for v1).",
      ].join("\n");
    default:
      return "";
  }
}

/**
 * Render the per-sub-app TREX.md for a d2e app. Pure string building, no IO.
 * Describes the active sub-app, points the agent at the `d2e` skill, and gives
 * the exact run command + port + External API note plus type-specific conventions.
 */
export function renderD2ETrexMd(cfg: D2EConfig, subApp: SubApp): string {
  const run = subApp.run || {};
  const portLine = run.port != null
    ? `conventional port \`${run.port}\` (devx allocates the actual runtime port and proxies it)`
    : "no fixed port (not a long-running server / port allocated at runtime)";
  const apiBase = cfg.externalApiBase
    ? `It is currently set to \`${cfg.externalApiBase}\`.`
    : "It is **not set** — the preview loads but backend calls fail until you set it.";

  const lines = [
    `# Data2Evidence — ${subApp.name}`,
    "",
    `This workspace is a **Data2Evidence (d2e) \`${subApp.type}\` sub-app**.`,
    "",
    `- **Name:** ${subApp.name}`,
    `- **Type:** ${subApp.type}`,
    `- **Directory:** \`${subApp.dir}\``,
    `- **Framework:** ${subApp.framework}`,
    `- **Repo kind:** ${cfg.repoKind} (cloned from \`${cfg.repo}\`)`,
    subApp.notes ? `- **Note:** ${subApp.notes}` : null,
    "",
    "## Read this first",
    "",
    "**Invoke the `d2e` skill** for the full d2e platform architecture, the three artifact types (ui/functions/flows), and conventions. This file is a short, sub-app-specific summary; the skill is the authoritative reference.",
    "",
    "## Running this sub-app",
    "",
    `- **Install:** \`${run.installCommand ?? "(see d2e skill)"}\`` +
      (run.installCwd && run.installCwd !== run.devCwd ? ` (in \`${run.installCwd}\`)` : ""),
    `- **Dev command:** \`${run.devCommand ?? "(see d2e skill)"}\``,
    `- **Port:** ${portLine}.`,
    "",
    "## External API (live data)",
    "",
    "devx runs only **this** sub-app's dev server; there is no full d2e stack in the container. Backend calls are proxied to a **separately-running d2e** whose URL is the app's **External API** (`config.d2e.externalApiBase`), written to `.env.local` as `D2E_API_BASE` / `VITE_D2E_API_BASE`.",
    "",
    apiBase,
    "",
    conventionsBlock(subApp),
    "",
    "## Reminders",
    "",
    "- You are editing a **clone** of a d2e repo; this active sub-app is what runs.",
    "- Private repos (`d2e-ui`, `d2e-flows`) need a connected **GitHub token**; install failures mentioning `401`/`@portal`/authentication mean GitHub is not connected.",
  ];

  return lines.filter((l) => l !== null).join("\n") + "\n";
}
