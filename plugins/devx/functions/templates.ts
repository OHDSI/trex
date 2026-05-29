// @ts-nocheck - Deno edge function
/**
 * App template registry and scaffolding.
 */

import { duckdb, escapeSql } from "./duckdb.ts";

// Import individual templates
import { template as reactVite } from "./templates/react_vite.ts";
import { template as nextjs } from "./templates/nextjs.ts";
import { template as vueVite } from "./templates/vue_vite.ts";
import { template as d2eResearcherPlugin } from "./templates/d2e_researcher_plugin.ts";
import { template as d2eAdminPlugin } from "./templates/d2e_admin_plugin.ts";
import { template as atlasPlugin } from "./templates/atlas_plugin.ts";
import { template as blank } from "./templates/blank.ts";
import { template as strategusStudy } from "./templates/strategus_study.ts";

export interface AppTemplate {
  id: string;
  name: string;
  description: string;
  tech_stack: string;
  dev_command: string;
  install_command: string;
  build_command: string;
  /** Inline files to write for scaffolding */
  files: Record<string, string>;
}

export const TEMPLATES: AppTemplate[] = [
  reactVite,
  nextjs,
  vueVite,
  d2eResearcherPlugin,
  d2eAdminPlugin,
  atlasPlugin,
  blank,
  strategusStudy,
];

/**
 * Scaffold a template into the given directory.
 */
export async function scaffoldTemplate(templateId: string, targetDir: string, appId?: string): Promise<void> {
  const template = TEMPLATES.find((t) => t.id === templateId);
  if (!template) {
    // Fall back to blank
    const blank = TEMPLATES.find((t) => t.id === "blank")!;
    for (const [filePath, content] of Object.entries(blank.files)) {
      await Deno.writeTextFile(`${targetDir}/${filePath}`, content);
    }
    return;
  }

  // Write inline files, replacing __APP_ID__ placeholder with actual app ID
  for (const [filePath, content] of Object.entries(template.files)) {
    const dir = filePath.includes("/") ? filePath.substring(0, filePath.lastIndexOf("/")) : null;
    if (dir) {
      await Deno.mkdir(`${targetDir}/${dir}`, { recursive: true });
    }
    const finalContent = appId ? content.replace(/__APP_ID__/g, appId) : content;
    await Deno.writeTextFile(`${targetDir}/${filePath}`, finalContent);
  }

  // Install dependencies in the background — don't block app creation
  // The dev server start will also check for node_modules and install if needed
  duckdb(`SELECT * FROM trex_devx_run_command('${escapeSql(targetDir)}', 'npm install')`)
    .catch((err) => console.warn("npm install during scaffold failed:", err.message));

  // Register D2E app functions with the trex plugin system
  if (template.tech_stack === "d2e-react" && appId) {
    registerAppFunctions(targetDir).catch((err) =>
      console.warn("Function registration failed:", err.message)
    );
  }
}

/**
 * Register an app's functions directory with the trex plugin system.
 */
async function registerAppFunctions(appDir: string): Promise<void> {
  const basePath = Deno.env.get("BASE_PATH") || "/trex";
  const res = await fetch(`http://localhost:8001${basePath}/api/plugins/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: appDir }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Registration failed (${res.status}): ${body}`);
  }
  console.log(`[devx] Registered app functions from ${appDir}`);
}

/**
 * Inject the DevX component tagger Vite plugin into a scaffolded project.
 */
export async function injectComponentTagger(targetDir: string): Promise<void> {
  // Create .devx directory
  await Deno.mkdir(`${targetDir}/.devx`, { recursive: true });

  // Copy tagger plugin — try import.meta.url first, fall back to plugin mount path
  let taggerSource = "";
  const taggerCandidates = [
    new URL("./visual_editing/component_tagger_plugin.js", import.meta.url).pathname,
    "/usr/src/plugins-dev/devx/functions/visual_editing/component_tagger_plugin.js",
  ];
  for (const p of taggerCandidates) {
    try {
      taggerSource = await Deno.readTextFile(p);
      break;
    } catch {
      // try next
    }
  }
  if (!taggerSource) throw new Error("Could not load component_tagger_plugin.js");
  await Deno.writeTextFile(`${targetDir}/.devx/component_tagger_plugin.js`, taggerSource);

  // Find and patch vite.config
  for (const name of ["vite.config.ts", "vite.config.js", "vite.config.mts", "vite.config.mjs"]) {
    try {
      const configPath = `${targetDir}/${name}`;
      let config = await Deno.readTextFile(configPath);
      if (config.includes("devxComponentTagger")) return; // already patched

      // Add import
      config = `import devxComponentTagger from './.devx/component_tagger_plugin.js';\n` + config;

      // Add to plugins array
      config = config.replace(/plugins:\s*\[/, "plugins: [devxComponentTagger(), ");

      await Deno.writeTextFile(configPath, config);
      return;
    } catch {
      // config file doesn't exist, try next
    }
  }
}
