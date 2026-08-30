/**
 * Top-nav entries for the web shell.
 *
 * A plugin declares its own entry as `trex.ui.nav` ({ path, label }) in
 * package.json, so installing the plugin is all it takes for the link to
 * appear — no per-deployment TREX_WEB_NAV_EXTRA. The env var still works and
 * takes precedence, so a deployment can relabel or replace a declared entry.
 */

export interface NavEntry {
  path: string;
  label: string;
  /** Plugin short name — the shell loads /plugins/trex/<plugin>/<plugin>-spa.js. */
  plugin: string;
}

function isNavEntry(value: unknown): value is NavEntry {
  const v = value as NavEntry | null;
  return !!v && typeof v === "object" &&
    typeof v.path === "string" && typeof v.label === "string" &&
    typeof v.plugin === "string";
}

/** Nav entries declared by the registered plugins, sorted for a stable order. */
export function collectNavEntries(
  registry: ReadonlyMap<string, { trexConfig?: unknown }>,
): NavEntry[] {
  const entries: NavEntry[] = [];
  for (const [shortName, active] of registry) {
    const nav = (active.trexConfig as { ui?: { nav?: unknown } } | undefined)
      ?.ui?.nav as Partial<NavEntry> | undefined;
    const entry = { path: nav?.path, label: nav?.label, plugin: shortName };
    if (isNavEntry(entry)) entries.push(entry);
  }
  return entries.sort((a, b) => a.plugin.localeCompare(b.plugin));
}

/** Merge env-supplied entries over declared ones; same path means override. */
export function mergeNav(declared: NavEntry[], env: unknown[]): NavEntry[] {
  const merged = [...declared];
  for (const item of env) {
    if (!isNavEntry(item)) continue;
    const at = merged.findIndex((e) => e.path === item.path);
    if (at >= 0) merged[at] = item;
    else merged.push(item);
  }
  return merged;
}
