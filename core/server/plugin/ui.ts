import type { Express } from "express";
import express from "express";
import { join } from "jsr:@std/path@^1.0";
import { PLUGINS_BASE_PATH } from "../config.ts";
import { scopeUrlPrefix } from "./utils.ts";

let pluginsJson: string = "{}";

export const REGISTERED_UI_ROUTES: Array<{
  pluginName: string;
  urlPrefix: string;
  fsPath: string;
}> = [];

export function getPluginsJson(): string {
  return pluginsJson;
}

export function addPlugin(app: Express, value: any, dir: string, fullName: string = "") {
  const scopePrefix = scopeUrlPrefix(fullName);
  if (value.routes) {
    for (const r of value.routes) {
      const urlPrefix = r.path || r.source;
      const fsPath = `${dir}/${r.dir || r.target}`;
      const fullPrefix = `${PLUGINS_BASE_PATH}${scopePrefix}${urlPrefix}`;
      console.log(`Registering static route: ${fullPrefix} -> ${fsPath}`);
      REGISTERED_UI_ROUTES.push({ pluginName: fullName, urlPrefix: fullPrefix, fsPath });
      let staticRegistered = false;
      try {
        // deno-lint-ignore no-explicit-any
        (Deno as any).core.ops.op_register_static_route(fullPrefix, fsPath);
        staticRegistered = true;
      } catch (e) {
        console.warn(`Native static route failed for ${fullPrefix}, using express.static fallback`);
        app.use(fullPrefix, express.static(fsPath));
        staticRegistered = true;
      }

      // SPA fallback: serve index.html for non-file paths.
      // Read on every request so npm-run-build's new asset hashes are picked up
      // without restarting trex; and skip paths that look like asset requests
      // (.js/.css/etc) so a stale browser HTML asking for a missing bundle gets
      // a clean 404 instead of HTML masquerading as JS.
      if (r.spa) {
        const indexPath = join(fsPath, "index.html");
        try {
          // Validate the file exists at registration time; the handler reads fresh per request.
          Deno.statSync(indexPath);
          app.use(fullPrefix, (req, res) => {
            // Bail on extension-bearing paths — those are asset requests, not SPA routes.
            if (/\.[a-zA-Z0-9]{1,8}$/.test(req.path)) {
              res.status(404).send("Not found");
              return;
            }
            try {
              const html = Deno.readTextFileSync(indexPath);
              res.type("html").send(html);
            } catch {
              res.status(404).send("Not found");
            }
          });
          console.log(`Registered SPA fallback: ${fullPrefix}/* -> ${indexPath}`);
        } catch {
          console.warn(`SPA fallback skipped (index.html not found): ${indexPath}`);
        }
      }
    }
  }

  if (value.uiplugins) {
    pluginsJson = updatePluginJson(JSON.parse(pluginsJson), value.uiplugins);
    console.log("Updated UI plugins JSON");
  }
}

export function mergeChildren(existingItem: any, incomingItem: any): void {
  if (!incomingItem.children || !Array.isArray(incomingItem.children)) {
    return;
  }

  if (!existingItem.children) {
    existingItem.children = [];
  }

  const existingChildrenByRoute = new Map<string, any>();
  existingItem.children.forEach((child: any) => {
    if (child.route) {
      existingChildrenByRoute.set(child.route, child);
    }
  });

  incomingItem.children.forEach((incomingChild: any) => {
    if (!incomingChild.route) return;

    if (existingChildrenByRoute.has(incomingChild.route)) {
      Object.assign(
        existingChildrenByRoute.get(incomingChild.route),
        incomingChild
      );
    } else {
      existingItem.children.push(incomingChild);
    }
  });
}

export function mergePluginItem(existingItem: any, incomingItem: any): void {
  if (incomingItem.children && Array.isArray(incomingItem.children)) {
    mergeChildren(existingItem, incomingItem);
  }

  const existingChildren = existingItem.children;
  Object.assign(existingItem, incomingItem);
  if (existingChildren) {
    existingItem.children = existingChildren;
  }
}

export function updatePluginJson(plugins: any, uiPlugins: any): string {
  for (const [key, value] of Object.entries(uiPlugins)) {
    const pluginArray = value as any[];

    if (plugins[key]) {
      const existingItemsByRoute = new Map<string, any>();
      plugins[key].forEach((item: any) => {
        if (item.route) {
          existingItemsByRoute.set(item.route, item);
        }
      });

      pluginArray.forEach((incomingItem: any) => {
        const route = incomingItem.route;
        if (!route) return;

        if (existingItemsByRoute.has(route)) {
          mergePluginItem(existingItemsByRoute.get(route), incomingItem);
        } else {
          plugins[key].push(incomingItem);
        }
      });
    } else {
      plugins[key] = pluginArray;
    }
  }

  const fqdn = Deno.env.get("PUBLIC_FQDN") || "";
  return JSON.stringify(plugins).replace(/\$\$FQDN\$\$/g, fqdn);
}
