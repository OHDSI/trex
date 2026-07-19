// @ts-nocheck - Deno edge function
import type { SubAppRun, PortStyle } from "./types.ts";

/** Known per-sub-app run recipes for the d2e-ui monorepo. Keyed by app dir name
 * under apps/. install runs ONCE at the monorepo root (bun workspaces).
 *
 * devCommand is `bun run start` for every app (d2e-ui is a bun workspace) — it runs
 * the app's OWN `start` script (no nx project-name coupling), and the dev-server
 * manager appends the allocated `--port`/`--base` per portStyle. Every app is Vite except `portal`,
 * which is CRA (react-scripts): portStyle "cra" makes the manager inject `PORT`
 * env instead of `--port`/`--base` flags, which react-scripts ignores. */
export const UI_RECIPES: Record<string, { name: string; framework: string; devCommand: string; port: number; portStyle: PortStyle; notes?: string }> = {
  portal:            { name: "Portal (shell)",         framework: "react-cra",  devCommand: "bun run start", port: 4000, portStyle: "cra" },
  // vue-mri-ui-lib has NO `start` script — its dev server is `serve`.
  "vue-mri-ui-lib":  { name: "Cohorts (MRI)",           framework: "vue-vite",   devCommand: "bun run serve", port: 8081, portStyle: "vite" },
  jobs:              { name: "Jobs (Prefect UI)",      framework: "vue-vite",   devCommand: "bun run start", port: 5173, portStyle: "vite" },
  flow:              { name: "Flow (dataflow)",        framework: "react-vite", devCommand: "bun run start", port: 4900, portStyle: "vite", notes: "module-federation remote; usually loaded inside Portal" },
  "analysis-ui":     { name: "Analysis (Strategus)",   framework: "react-vite", devCommand: "bun run start", port: 4800, portStyle: "vite", notes: "module-federation remote; usually loaded inside Portal" },
  mapping:           { name: "Mapping",                framework: "react-vite", devCommand: "bun run start", port: 4500, portStyle: "vite", notes: "module-federation remote; usually loaded inside Portal" },
  "concept-sets":    { name: "Concept Sets",           framework: "react-vite", devCommand: "bun run start", port: 4600, portStyle: "vite", notes: "micro-frontend; usually loaded inside Portal" },
  "concept-mapping": { name: "Concept Mapping",        framework: "react-vite", devCommand: "bun run start", port: 4601, portStyle: "vite", notes: "micro-frontend; usually loaded inside Portal" },
  "notebook-ui":     { name: "Notebook UI",            framework: "react-vite", devCommand: "bun run start", port: 4602, portStyle: "vite", notes: "micro-frontend; usually loaded inside Portal" },
  wizards:           { name: "Wizards",                framework: "react-vite", devCommand: "bun run start", port: 4603, portStyle: "vite" },
  // webr-notebook has NO `start` script either, and its `dev` is a
  // build:watch + vite-preview combo (not a dev server that accepts --port/--base),
  // so drive vite directly.
  // `bun x` (not `bunx`): the process manager's command allowlist permits `bun`,
  // and validation.rs rejects a bare `bunx` first-word.
  "webr-notebook":   { name: "Notebooks (WebR)",       framework: "react-vite", devCommand: "bun x vite",    port: 4604, portStyle: "vite" },
};

/** Build a UI sub-app run spec. installCwd is the monorepo root (uiRoot). */
export function uiRun(uiRoot: string, appDirName: string): SubAppRun {
  const r = UI_RECIPES[appDirName];
  return {
    installCwd: uiRoot === "." ? "." : uiRoot,
    // d2e-ui is a bun workspace (bun.lock; scripts use bun/bunx). Installing the
    // monorepo root once links the apps/* and libs/* (@portal/*) workspaces.
    installCommand: "bun install",
    devCwd: uiRoot === "." ? `apps/${appDirName}` : `${uiRoot}/apps/${appDirName}`,
    devCommand: r?.devCommand ?? "bun run start",
    port: r?.port ?? null,
    portStyle: r?.portStyle ?? "vite",
    needsGithubToken: true,
  };
}

/** A d2e edge function (Deno/Express). Runs standalone via deno; talks to an
 * external d2e DB/API through env. */
export function functionRun(fnDir: string): SubAppRun {
  return {
    installCwd: fnDir,
    installCommand: "deno cache index.ts",
    devCwd: fnDir,
    devCommand: "deno run --allow-all index.ts",
    port: 8000,
    portStyle: "deno",
  };
}

/** A Prefect flow. v1: validate/test via the test harness; no long-running server. */
export function flowRun(flowDir: string, entrypoint: string): SubAppRun {
  return {
    installCwd: flowDir,
    installCommand: "echo 'flows: deps are baked into the d2e flow image; see SKILL'",
    devCwd: flowDir,
    devCommand: `echo 'run: prefect flow-run execute / prefect_test_harness for ${entrypoint}'`,
    port: null,
    portStyle: "none",
  };
}
