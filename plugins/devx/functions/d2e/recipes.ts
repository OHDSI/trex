// @ts-nocheck - Deno edge function
import type { SubAppRun, PortStyle } from "./types.ts";

/** Known per-sub-app run recipes for the d2e-ui monorepo. Keyed by app dir name
 * under apps/. install runs ONCE at the monorepo root (Nx + yarn workspaces). */
export const UI_RECIPES: Record<string, { name: string; framework: string; devCommand: string; port: number; portStyle: PortStyle; notes?: string }> = {
  portal:          { name: "Portal (shell)",        framework: "react-cra",     devCommand: "npx nx start portal",   port: 4000, portStyle: "nx" },
  flow:            { name: "Flow (dataflow)",        framework: "react-webpack", devCommand: "npm start",             port: 4900, portStyle: "webpack", notes: "module-federation remote; usually loaded inside Portal" },
  analysis:        { name: "Analysis (Strategus)",   framework: "react-webpack", devCommand: "npm start",             port: 4800, portStyle: "webpack", notes: "module-federation remote; usually loaded inside Portal" },
  jobs:            { name: "Jobs (Prefect UI)",      framework: "vue-vite",      devCommand: "npx nx dev jobs",       port: 5173, portStyle: "vite" },
  mapping:         { name: "Mapping",                framework: "react-vite",    devCommand: "npm start",             port: 5173, portStyle: "vite", notes: "module-federation remote; usually loaded inside Portal" },
  "vue-mri-ui-lib":{ name: "Patient Analytics (MRI)",framework: "vue-cli",       devCommand: "npx nx serve vue-mri",  port: 8081, portStyle: "nx" },
};

/** Build a UI sub-app run spec. installCwd is the monorepo root (uiRoot). */
export function uiRun(uiRoot: string, appDirName: string): SubAppRun {
  const r = UI_RECIPES[appDirName];
  return {
    installCwd: uiRoot === "." ? "." : uiRoot,
    installCommand: "yarn install",
    devCwd: uiRoot === "." ? `apps/${appDirName}` : `${uiRoot}/apps/${appDirName}`,
    devCommand: r?.devCommand ?? "npm start",
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
