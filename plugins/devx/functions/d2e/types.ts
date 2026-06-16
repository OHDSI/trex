// @ts-nocheck - Deno edge function
export type SubAppType = "ui" | "function" | "flow";
export type PortStyle = "vite" | "webpack" | "cra" | "nx" | "deno" | "none";

export interface SubAppRun {
  installCwd: string;      // workspace-relative dir to run install in (monorepo root for Nx)
  installCommand: string;  // e.g. "yarn install" | "npm install" | "deno cache index.ts"
  devCwd: string;          // workspace-relative dir to run the dev server in
  devCommand: string;      // e.g. "npx nx start portal" | "npm run dev"
  port: number | null;     // conventional/preferred port (informational; runtime port is allocated)
  portStyle: PortStyle;    // how to inject the allocated --port/--base
  needsGithubToken?: boolean;
  env?: Record<string, string>;
}

export interface SubApp {
  key: string;             // stable id: "ui:flow" | "fn:alpdb" | "flow:data_load_plugin"
  type: SubAppType;
  name: string;            // display name
  dir: string;             // workspace-relative path to the sub-app
  framework: string;       // "react-cra" | "react-webpack" | "vue-vite" | "react-vite" | "deno-express" | "prefect"
  run: SubAppRun;
  notes?: string;          // surfaced to the UI (e.g. "module-federation remote; run portal too")
}

export interface D2EConfig {
  repo: string;            // git url cloned
  repoKind: "ui" | "functions" | "flows" | "platform" | "unknown";
  detectedAt: string;      // ISO
  subApps: SubApp[];
  activeSubApp?: string;   // key
  externalApiBase?: string;
}
