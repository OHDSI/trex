// @ts-nocheck - Deno edge function
import type { ToolDefinition } from "./types.ts";
import { duckdb, escapeSql } from "../duckdb.ts";

export const addDependencyTool: ToolDefinition<{
  packages: string[];
  dev?: boolean;
}> = {
  name: "AddDependency",
  description:
    "Install npm packages in the workspace. Runs `npm install` with the specified packages.",
  parameters: {
    type: "object",
    properties: {
      packages: {
        type: "array",
        items: { type: "string" },
        description: "Package names to install (e.g. ['express', 'zod'])",
      },
      dev: {
        type: "boolean",
        description: "Install as dev dependencies (default: false)",
      },
    },
    required: ["packages"],
  },
  defaultConsent: "ask",
  modifiesState: true,

  getConsentPreview(args) {
    const flag = args.dev ? " --save-dev" : "";
    return `npm install${flag} ${args.packages.join(" ")}`;
  },

  async execute(args, ctx) {
    // Validate package names — only allow typical npm package names
    for (const pkg of args.packages) {
      if (!/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*(@[\d][\w.\-]*)?$/.test(pkg)) {
        throw new Error(`Invalid package name: "${pkg}"`);
      }
    }

    const packagesJson = JSON.stringify(args.packages);
    const dev = args.dev ? "true" : "false";
    const json = await duckdb(
      `SELECT * FROM trex_devx_npm_install('${escapeSql(ctx.workspacePath)}', '${escapeSql(packagesJson)}', '${dev}')`
    );
    const result = JSON.parse(json);

    if (!result.ok) {
      throw new Error(`npm install failed: ${result.message}`);
    }

    return `Installed: ${args.packages.join(", ")}\n${result.message}`.trim();
  },
};
