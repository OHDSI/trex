import type { Express } from "express";
import { addPlugin as addFlowPlugin } from "./flow.ts";
import { addPlugin as addFunctionPlugin } from "./function.ts";
import { addTransformPlugin } from "./transform.ts";
import { addPlugin as addUIPlugin } from "./ui.ts";
import { scanPluginDirectory } from "./utils.ts";

interface ActivePluginEntry {
  name: string;
  version: string;
  source: "dev" | "npm";
  registeredAt: Date;
}

export class Plugins {
  static activeRegistry: Map<string, ActivePluginEntry> = new Map();

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
