// @ts-nocheck - Deno edge function
import type { D2EConfig, SubApp } from "./types.ts";
import { UI_RECIPES, uiRun, functionRun, flowRun } from "./recipes.ts";

async function exists(p: string): Promise<boolean> {
  try { await Deno.stat(p); return true; } catch { return false; }
}
async function isDir(p: string): Promise<boolean> {
  try { return (await Deno.stat(p)).isDirectory; } catch { return false; }
}
async function readJson(p: string): Promise<any | null> {
  try { return JSON.parse(await Deno.readTextFile(p)); } catch { return null; }
}

/** Find an Nx/yarn-workspaces UI monorepo root at or below wsPath (depth<=1). */
async function findUiRoot(wsPath: string): Promise<string | null> {
  const candidates = [wsPath, `${wsPath}/ui`, `${wsPath}/d2e-ui`];
  for (const c of candidates) {
    if (await exists(`${c}/nx.json`) && await isDir(`${c}/apps`)) return c;
    const pkg = await readJson(`${c}/package.json`);
    const ws = pkg?.workspaces?.packages ?? pkg?.workspaces;
    if (Array.isArray(ws) && ws.some((w) => String(w).startsWith("apps")) && await isDir(`${c}/apps`)) return c;
  }
  return null;
}

async function detectUi(wsPath: string, subApps: SubApp[]): Promise<boolean> {
  const uiRoot = await findUiRoot(wsPath);
  if (!uiRoot) return false;
  let found = false;
  for await (const e of Deno.readDir(`${uiRoot}/apps`)) {
    if (!e.isDirectory) continue;
    if (!await exists(`${uiRoot}/apps/${e.name}/package.json`)) continue;
    const r = UI_RECIPES[e.name];
    const rel = uiRoot.replace(wsPath + "/", "").replace(wsPath, "") || ".";
    subApps.push({
      key: `ui:${e.name}`,
      type: "ui",
      name: r?.name ?? e.name,
      dir: `${rel === "." ? "" : rel + "/"}apps/${e.name}`,
      framework: r?.framework ?? "unknown",
      run: uiRun(uiRoot.replace(wsPath, "").replace(/^\//, "") || ".", e.name),
      notes: r?.notes,
    });
    found = true;
  }
  return found;
}

async function detectFunctions(wsPath: string, subApps: SubApp[]): Promise<boolean> {
  let found = false;
  for (const base of ["plugins/functions", "functions"]) {
    const dir = `${wsPath}/${base}`;
    if (!await isDir(dir)) continue;
    for await (const e of Deno.readDir(dir)) {
      if (!e.isDirectory || e.name.startsWith("_")) continue;
      const fnDir = `${dir}/${e.name}`;
      if (!(await exists(`${fnDir}/index.ts`)) && !(await exists(`${fnDir}/src/main.ts`))) continue;
      subApps.push({
        key: `fn:${e.name}`, type: "function", name: e.name,
        dir: `${base}/${e.name}`, framework: "deno-express",
        run: functionRun(`${base}/${e.name}`),
        notes: "trex edge function; needs an external d2e DB/API (set External API).",
      });
      found = true;
    }
  }
  return found;
}

async function detectFlows(wsPath: string, subApps: SubApp[]): Promise<boolean> {
  const root = `${wsPath}/flows`;
  if (!await isDir(root)) return false;
  let found = false;
  // Walk flows/** for package.json with trex.flow
  const stack = [root];
  while (stack.length) {
    const d = stack.pop()!;
    let entries: Deno.DirEntry[] = [];
    try { for await (const e of Deno.readDir(d)) entries.push(e); } catch { continue; }
    for (const e of entries) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory) { stack.push(p); continue; }
      if (e.name !== "package.json") continue;
      const pkg = await readJson(p);
      const flows = pkg?.trex?.flow?.flows;
      if (!Array.isArray(flows)) continue;
      const rel = d.replace(wsPath + "/", "");
      for (const f of flows) {
        subApps.push({
          key: `flow:${f.name}`, type: "flow", name: f.name,
          dir: rel, framework: "prefect",
          run: flowRun(rel, f.entrypoint ?? f.name),
          notes: "Prefect flow; v1 supports context + local test harness, not a long-running server.",
        });
        found = true;
      }
    }
  }
  return found;
}

export async function detectD2E(wsPath: string, repoUrl: string): Promise<D2EConfig> {
  const subApps: SubApp[] = [];
  const hasUi = await detectUi(wsPath, subApps);
  const hasFn = await detectFunctions(wsPath, subApps);
  const hasFlow = await detectFlows(wsPath, subApps);
  const kinds = [hasUi && "ui", hasFn && "functions", hasFlow && "flows"].filter(Boolean);
  const repoKind = kinds.length > 1 ? "platform" : (kinds[0] as any) ?? "unknown";
  return { repo: repoUrl, repoKind, detectedAt: new Date().toISOString(), subApps };
}
