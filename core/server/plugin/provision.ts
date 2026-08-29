// Boot-time database provisioning declared by plugins.
//
// A plugin declares `"trex": { "provision": { "module": "./index.ts" } }`. The
// module's default export receives a superuser SQL executor and the process env
// and returns the number of statements it ran.
//
// Unlike every other plugin kind this is collected and run BEFORE the plugin
// scan dispatches anything, because the roles, schemas and grants it creates are
// what plugin init functions and plugin migrations connect as. That is the same
// pre-pass shape `collectDeclaredMemoryNames` uses, for the same reason: one
// ordered scan/dispatch pass cannot express a dependency on itself.

import { scanPluginDirectory, splitPathList } from "./utils.ts";

export interface ProvisionContext {
  /** Runs one statement on trex's superuser connection. */
  exec: (sql: string) => Promise<unknown>;
  env: Record<string, string | undefined>;
}

/** Returns the number of statements applied, for the boot log. */
export type ProvisionFn = (ctx: ProvisionContext) => Promise<number | undefined>;

export interface ProvisionTarget {
  name: string;
  /** Absolute path of the module to import. */
  path: string;
}

/** A provision module runs arbitrary SQL as the superuser before any authz
 *  exists, so it is gated harder than `functions`: TRUSTED_PLUGIN_SCOPES plus
 *  @data2evidence, which owns the d2e bootstrap. Kept separate from
 *  TRUSTED_PLUGIN_SCOPES so widening this never silently widens agents/memory. */
export const TRUSTED_PROVISION_SCOPES = ["@trex/", "@ohdsi/", "@data2evidence/"];

export function isTrustedProvisionScope(name: string): boolean {
  return TRUSTED_PROVISION_SCOPES.some((s) => name.startsWith(s));
}

function resolveModule(dir: string, value: unknown): string | null {
  const mod = typeof value === "string" ? value : (value as { module?: unknown })?.module;
  if (typeof mod !== "string" || mod.length === 0) return null;
  // Relative to the plugin directory only — an absolute or parent path would let
  // a plugin dir point the superuser executor at a module it does not ship.
  if (mod.startsWith("/") || mod.split("/").includes("..")) return null;
  return `${dir}/${mod.replace(/^\.\//, "")}`;
}

/** Filesystem pre-pass: collect `trex.provision` declarations without importing
 *  anything. Mirrors collectDeclaredMemoryNames — a bad manifest is skipped
 *  rather than aborting the scan. */
export async function collectProvisionTargets(
  rawPaths: string[],
): Promise<ProvisionTarget[]> {
  const targets: ProvisionTarget[] = [];
  const seen = new Set<string>();
  for (const rawPath of rawPaths) {
    for (const dir of splitPathList(rawPath)) {
      for (const { pkg, dir: pluginDir } of await scanPluginDirectory(dir)) {
        const value = pkg?.trex?.provision;
        if (value === undefined) continue;
        const fullName = pkg?.name ?? "";
        if (!isTrustedProvisionScope(fullName)) {
          console.error(
            `provision: ${fullName || pluginDir} skipped — trex.provision requires a trusted scope (${
              TRUSTED_PROVISION_SCOPES.join(", ")
            })`,
          );
          continue;
        }
        const path = resolveModule(pluginDir, value);
        if (!path) {
          console.error(`provision: ${fullName} skipped — trex.provision needs a relative "module"`);
          continue;
        }
        // Dev paths are scanned first and win, same precedence as registration.
        if (seen.has(fullName)) continue;
        seen.add(fullName);
        targets.push({ name: fullName, path });
      }
    }
  }
  return targets;
}

/** Import and run each target in order. Throws on the first failure — boot
 *  treats provisioning as fatal, so a half-provisioned database never reaches
 *  server.listen. */
export async function runProvisionTargets(
  targets: ProvisionTarget[],
  ctx: ProvisionContext,
): Promise<number> {
  let total = 0;
  for (const t of targets) {
    const mod = await import(`file://${t.path}`);
    const fn = mod.default;
    if (typeof fn !== "function") {
      throw new Error(`provision: ${t.name} (${t.path}) has no default-exported function`);
    }
    const applied = await (fn as ProvisionFn)(ctx);
    if (typeof applied === "number") total += applied;
    console.log(`provision: ${t.name} applied ${applied ?? 0} statement(s)`);
  }
  return total;
}
