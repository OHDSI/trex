import type { Express } from "express";
import { addPlugin as addFlowPlugin } from "./flow.ts";
import { addPlugin as addFunctionPlugin } from "./function.ts";
import { addTransformPlugin } from "./transform.ts";
import { addPlugin as addUIPlugin } from "./ui.ts";
import { addAgentsPlugin, agentsCoreMigrationTarget } from "./agents.ts";
import { TRUSTED_PLUGIN_SCOPES } from "./function.ts";
import {
  isTrustedScopeMemoryPlugin,
  normalizeMemoryValue,
  type MemoryEntry,
} from "./memory.ts";
import { mergeMemoryEntries, type SourceOwners } from "./memory-merge.ts";
import { addSkillsPlugin } from "./skills.ts";
import { collectDeclaredSkillPacks } from "./skill-packs.ts";
import { scanPluginDirectory, splitPathList } from "./utils.ts";
import { escapeSql } from "../lib/sql.ts";
import { waitForAttachedDatabase } from "../lib/db-wait.ts";

declare const Trex: any;

// Accumulated across all plugins during a scan pass (see the `memory` case
// in addPlugin below): every `trex.memory` declaration, merged so multiple
// plugins can contribute sources to the same memory name (see
// memory-merge.ts). Each source is stamped with the declaring plugin's
// directory (MemorySource.pluginDir, see memory.ts) before merging, so an
// inline `dir` source always resolves against the plugin that declared it —
// even when a memory spans plugins in different directories that each
// contribute inline sources — see materializeSource in memory/importer.ts.
const MEMORY_ENTRIES: MemoryEntry[] = [];
const MEMORY_SOURCE_OWNERS: SourceOwners = new Map();

// Declared `trex.memory` NAMES only (not full entries — see MEMORY_ENTRIES
// above for those), used purely as an allow-list for agent-linked-memory
// validation (plugin/agents.ts's addAgentsPlugin/unknownMemoryLinks).
// Populated in two ways:
//  1. A pre-pass (collectDeclaredMemoryNames, run once at the top of
//     initPlugins, BEFORE any plugin is dispatched) that scans every
//     discovered plugin's package.json across all PLUGINS_DEV_PATH/
//     PLUGINS_PATH directories. Needed because dispatch order is:
//     WITHIN one plugin's own trex block, agents (orderRank 4) sort before
//     memory (5); but ACROSS different plugins, scanAndRegister dispatches
//     each plugin's whole trex block as it's found on disk — an
//     agents-declaring plugin can be (and often is) a completely different
//     plugin from the one declaring the memory it links, and may be scanned
//     first. Without the pre-pass, addAgentsPlugin would see an empty
//     allow-list for a memory that's perfectly valid but just not processed
//     yet, and incorrectly skip the agent.
//  2. Incrementally, in the `memory` case below (dynamic registration via
//     registerFromPath happens after boot's pre-pass already ran).
const DECLARED_MEMORY_NAMES: Set<string> = new Set();

async function collectDeclaredMemoryNames(rawPaths: string[]): Promise<void> {
  for (const rawPath of rawPaths) {
    for (const dir of splitPathList(rawPath)) {
      const scanned = await scanPluginDirectory(dir);
      for (const { pkg } of scanned) {
        const memoryValue = pkg?.trex?.memory;
        if (memoryValue === undefined) continue;
        // Same trusted-scope requirement as the `memory` dispatch case below
        // (which reports the skip loudly) — an untrusted plugin's names must
        // not enter the allow-list via this pre-pass either.
        if (!isTrustedScopeMemoryPlugin(pkg?.name ?? "")) continue;
        try {
          for (const e of normalizeMemoryValue(memoryValue)) {
            DECLARED_MEMORY_NAMES.add(e.name);
          }
        } catch {
          // Invalid `trex.memory` declaration — surfaces with a real error
          // in the actual scan/dispatch pass below; don't double-report
          // here, and don't let a bad manifest abort the whole pre-pass.
        }
      }
    }
  }
}

interface ActivePluginEntry {
  name: string;
  version: string;
  source: "dev" | "npm";
  registeredAt: Date;
  // The plugin's `trex` config block (pkg.trex). Retained so the D2E_COMPAT
  // layer can mirror the active registry into the legacy `trex.plugins` table
  // that d2e's jobplugins/DataModelFlowService read (payload->'flow'->'flows').
  trexConfig?: unknown;
}

interface MigrationTarget {
  name: string;
  path: string;
  schema: string;
  database: string;
}

export class Plugins {
  static activeRegistry: Map<string, ActivePluginEntry> = new Map();
  // Migration targets collected from plugins that declare a `migrations` config.
  // Applied at boot by applyMigrations(); also consumed by the runPluginMigrations
  // GraphQL mutation so the admin "run migrations" action covers plugins too.
  static migrationTargets: MigrationTarget[] = [];

  private static async addPlugin(
    app: Express,
    dir: string,
    pkg: any,
    shortName: string,
    fullName: string,
    source: "dev" | "npm"
  ) {
    try {
      if (!pkg.trex || typeof pkg.trex !== "object") {
        console.log(
          `Plugin ${fullName} has no trex config — skipping registration`
        );
        return;
      }
      // Express matches handlers in registration order. UI static routes must
      // register BEFORE function `app.all(...)` catch-alls so that when a UI
      // and a function share the same URL prefix (e.g. `/plugins/<scope>/notes`
      // for the UI and `/plugins/<scope>/notes/list` for a function), the UI's
      // express.static handler gets a chance to serve real files first and
      // falls through (via next()) for paths that don't exist on disk — letting
      // the function handle them. If functions registered first, the catch-all
      // would shadow every UI request and the static assets would never serve.
      const trexEntries = Object.entries(pkg.trex);
      const orderRank = (k: string): number => {
        switch (k) {
          case "ui": return 0;
          case "transform": return 1;
          case "functions": return 2;
          case "flow": return 3;
          case "skills": return 4;
          case "agents": return 5;
          case "memory": return 6;
          default: return 7;
        }
      };
      const sortedEntries = trexEntries.slice().sort(
        (a, b) => orderRank(a[0]) - orderRank(b[0])
      );
      for (const [key, value] of sortedEntries) {
        switch (key) {
          case "functions":
            addFunctionPlugin(app, value, dir, fullName);
            break;
          case "ui":
            addUIPlugin(app, value, dir, fullName);
            break;
          case "flow":
            addFlowPlugin(value);
            break;
          case "transform":
            addTransformPlugin(app, value, dir, shortName);
            break;
          case "migrations":
            Plugins.registerMigrations(dir, shortName, value);
            break;
          case "agents":
            await addAgentsPlugin(app, value, dir, fullName, DECLARED_MEMORY_NAMES);
            if (!Plugins.migrationTargets.some((t) => t.name === "agents-core")) {
              Plugins.migrationTargets.push(await agentsCoreMigrationTarget());
            }
            break;
          case "skills":
            await addSkillsPlugin(app, value, dir, fullName);
            break;
          case "memory": {
            // Same trust requirement as agents (agents.ts's
            // isTrustedScopeAgentsPlugin): memory names become Postgres
            // schemas served by the shared worker, so an untrusted plugin
            // must not be able to declare (or feed sources into) one.
            if (!isTrustedScopeMemoryPlugin(fullName)) {
              console.error(
                `plugins: memory declarations from ${fullName} skipped — trex.memory requires a trusted scope (${TRUSTED_PLUGIN_SCOPES.join(", ")})`,
              );
              break;
            }
            // Collect only — the proxy/gbrain/provisioning start once, after
            // the full plugin scan, so a shared brain fed by multiple
            // plugins (see MEMORY_SOURCE_OWNERS above) sees every source
            // before gbrain is warmed up.
            const entries = normalizeMemoryValue(value);
            for (const e of entries) {
              DECLARED_MEMORY_NAMES.add(e.name);
              for (const src of e.sources) {
                src.pluginDir = dir;
              }
            }
            mergeMemoryEntries(MEMORY_ENTRIES, entries, fullName, MEMORY_SOURCE_OWNERS);
            break;
          }
          default:
            console.log(`Unknown plugin type: ${key}`);
        }
      }
      Plugins.activeRegistry.set(shortName, {
        name: fullName,
        version: pkg.version,
        source,
        registeredAt: new Date(),
        trexConfig: pkg.trex,
      });
    } catch (e) {
      console.error("Failed to register plugin:", fullName, e);
    }
  }

  private static async scanAndRegister(
    app: Express,
    dir: string,
    source: "dev" | "npm"
  ) {
    const scanned = await scanPluginDirectory(dir);
    for (const { shortName, dir: pluginDir, pkg } of scanned) {
      const existing = Plugins.activeRegistry.get(shortName);
      if (existing) {
        console.log(
          `Skipping duplicate plugin ${shortName} from ${source} — already registered from ${existing.source}`
        );
        continue;
      }
      console.log(
        `Found plugin ${shortName} (v${pkg.version}) [${source}] in ${pluginDir}`
      );
      const fullName = pkg.name || shortName;
      await Plugins.addPlugin(app, pluginDir, pkg, shortName, fullName, source);
      console.log(`Registered plugin ${shortName} [${source}]`);
    }
  }

  static async initPlugins(app: Express) {
    const devPath = Deno.env.get("PLUGINS_DEV_PATH") || "./plugins-dev";
    const pluginsPath = Deno.env.get("PLUGINS_PATH") || "./plugins";
    console.log("Scanning and registering plugins");

    // Must run before any plugin is dispatched — see DECLARED_MEMORY_NAMES's
    // doc comment above for why a single ordered scan/dispatch pass isn't
    // enough to validate agent-linked-memory references.
    await collectDeclaredMemoryNames([devPath, pluginsPath]);

    // Same pre-pass rationale as collectDeclaredMemoryNames directly above,
    // for `trex.skills` packs (see skill-packs.ts).
    await collectDeclaredSkillPacks([devPath, pluginsPath]);

    // PLUGINS_DEV_PATH / PLUGINS_PATH may be colon-separated PATH-style lists
    // (e.g. d2e uses /usr/src/plugins-dev:/usr/src/bundled-plugins:/usr/src/plugins),
    // so scan each entry. Dev paths have highest priority — scanned first.
    for (const p of splitPathList(devPath)) {
      await Plugins.scanAndRegister(app, p, "dev");
    }
    for (const p of splitPathList(pluginsPath)) {
      await Plugins.scanAndRegister(app, p, "npm");
    }

    console.log(
      `Plugin registration complete: ${Plugins.activeRegistry.size} plugins active`
    );

    // Apply any schema migrations declared by registered plugins. Without this,
    // a plugin's `migrations` config is silently ignored and its tables never
    // get created — surfacing later as "relation <schema>.<table> does not exist".
    await Plugins.applyMigrations();

    // Start the memory runtime once, after every plugin's `trex.memory` has
    // been collected (a memory can span plugins — see MEMORY_SOURCE_OWNERS).
    // Mounting is best-effort: a failure here is logged and swallowed so an
    // unrelated boot doesn't crash because the worker failed to stage or a
    // git source was temporarily unreachable (see gbrain-worker/mount.ts for
    // the per-source resilience within the mount itself).
    if (MEMORY_ENTRIES.length > 0) {
      try {
        const { mountMemoryWorker } = await import("../memory/gbrain-worker/mount.ts");
        await mountMemoryWorker(app, MEMORY_ENTRIES);
      } catch (e) {
        console.error("memory: worker mount failed:", e);
      }
    }
  }

  /**
   * Record a plugin's `migrations` config for later application. The config
   * shape is `{ schema: string, database?: string }`; SQL files live in the
   * plugin's `migrations/` subdirectory.
   */
  private static registerMigrations(dir: string, shortName: string, value: any) {
    const schema = value?.schema;
    if (!schema) {
      console.warn(`Plugin ${shortName}: migrations config missing "schema" — ignoring`);
      return;
    }
    Plugins.migrationTargets.push({
      name: shortName,
      path: `${dir}/migrations`,
      schema,
      database: value?.database || "_config",
    });
  }

  /**
   * Run pending migrations for every registered plugin migration target.
   * Idempotent — trex_migration_run_schema tracks applied versions — so it is
   * safe to call on every boot. Failures are logged but never crash startup.
   */
  static async applyMigrations(): Promise<void> {
    if (Plugins.migrationTargets.length === 0) return;
    let conn: any;
    try {
      conn = new Trex.TrexDB("memory");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Plugin migrations skipped — TrexDB unavailable: ${msg}`);
      return;
    }
    // core/server is spawned by the trexas extension *before* the host attaches
    // the _config (Postgres) catalog and runs core migrations (src/main.rs loads
    // extensions, then ATTACHes _config). A plugin migration targeting an attached
    // catalog like _config can therefore run before that ATTACH lands and fail with
    // `Catalog "_config" does not exist` — and since applyMigrations runs once at
    // registration with no retry, the plugin's tables are then never created.
    // Wait for each non-memory target catalog to appear first. Bounded so a
    // genuinely missing catalog still surfaces as the per-target error below.
    const neededDatabases = [
      ...new Set(
        Plugins.migrationTargets
          .map((t) => t.database)
          .filter((d) => d && d !== "memory"),
      ),
    ];
    for (const db of neededDatabases) {
      const ready = await waitForAttachedDatabase(conn, db);
      if (!ready) {
        console.error(
          `Plugin migrations: catalog "${db}" not attached after timeout; dependent migrations may fail`,
        );
      }
    }
    for (const t of Plugins.migrationTargets) {
      try {
        const sql = `SELECT version, name, status FROM trex_migration_run_schema('${escapeSql(t.path)}', '${escapeSql(t.schema)}', '${escapeSql(t.database)}')`;
        const result = await conn.execute(sql, []);
        const rows = result?.rows || result || [];
        const applied = rows.filter((r: any) => (r.status ?? r[2]) === "applied").length;
        console.log(
          `Plugin ${t.name}: ${applied} migration(s) applied to schema "${t.schema}" (${rows.length} total)`
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`Plugin ${t.name}: migration failed for schema "${t.schema}": ${msg}`);
      }
    }
  }

  /**
   * Dynamically register a plugin from a directory path.
   * The directory must contain a package.json with a `trex` config section.
   * Used by devx to register D2E app functions at runtime.
   */
  static async registerFromPath(app: Express, dir: string): Promise<{ ok: boolean; name?: string; error?: string }> {
    try {
      const pkgJsonPath = `${dir}/package.json`;
      const pkg = JSON.parse(await Deno.readTextFile(pkgJsonPath));
      const shortName = pkg.name?.includes("/")
        ? pkg.name.split("/").pop()
        : pkg.name || dir.split("/").pop();

      if (!pkg.trex || typeof pkg.trex !== "object") {
        return { ok: false, error: `No trex config in ${pkgJsonPath}` };
      }

      const existing = Plugins.activeRegistry.get(shortName);
      if (existing) {
        return { ok: true, name: shortName };
      }

      const fullName = pkg.name || shortName;
      console.log(`Dynamic register: ${shortName} from ${dir}`);
      await Plugins.addPlugin(app, dir, pkg, shortName, fullName, "dev");
      console.log(`Registered dynamic plugin ${shortName}`);
      return { ok: true, name: shortName };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Dynamic plugin registration failed for:", dir, msg);
      return { ok: false, error: msg };
    }
  }

  static getActivePlugins(): Map<string, ActivePluginEntry> {
    return Plugins.activeRegistry;
  }
}
