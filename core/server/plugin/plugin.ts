import type { Express } from "express";
import { addPlugin as addFlowPlugin } from "./flow.ts";
import { addPlugin as addFunctionPlugin } from "./function.ts";
import { addTransformPlugin } from "./transform.ts";
import { addPlugin as addUIPlugin } from "./ui.ts";
import { scanPluginDirectory } from "./utils.ts";
import { escapeSql } from "../lib/sql.ts";

declare const Trex: any;

interface ActivePluginEntry {
  name: string;
  version: string;
  source: "dev" | "npm";
  registeredAt: Date;
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

  private static addPlugin(
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
          default: return 5;
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
          default:
            console.log(`Unknown plugin type: ${key}`);
        }
      }
      Plugins.activeRegistry.set(shortName, {
        name: fullName,
        version: pkg.version,
        source,
        registeredAt: new Date(),
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
      Plugins.addPlugin(app, pluginDir, pkg, shortName, fullName, source);
      console.log(`Registered plugin ${shortName} [${source}]`);
    }
  }

  static async initPlugins(app: Express) {
    const devPath = Deno.env.get("PLUGINS_DEV_PATH") || "./plugins-dev";
    const pluginsPath = Deno.env.get("PLUGINS_PATH") || "./plugins";
    console.log("Scanning and registering plugins");

    // Dev plugins have highest priority — scanned first
    await Plugins.scanAndRegister(app, devPath, "dev");
    await Plugins.scanAndRegister(app, pluginsPath, "npm");

    console.log(
      `Plugin registration complete: ${Plugins.activeRegistry.size} plugins active`
    );

    // Apply any schema migrations declared by registered plugins. Without this,
    // a plugin's `migrations` config is silently ignored and its tables never
    // get created — surfacing later as "relation <schema>.<table> does not exist".
    await Plugins.applyMigrations();
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
      Plugins.addPlugin(app, dir, pkg, shortName, fullName, "dev");
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
