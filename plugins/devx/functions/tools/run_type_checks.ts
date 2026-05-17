// @ts-nocheck - Deno edge function
import type { ToolDefinition } from "./types.ts";
import { duckdb, escapeSql } from "../duckdb.ts";

export const runTypeChecksTool: ToolDefinition<Record<string, never>> = {
  name: "TypeCheck",
  description:
    "Run TypeScript type checking (npx tsc --noEmit) in the workspace and return any errors.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  defaultConsent: "always",
  modifiesState: false,

  async execute(_args, ctx) {
    const json = await duckdb(
      `SELECT * FROM trex_devx_tsc_check('${escapeSql(ctx.workspacePath)}')`
    );
    const result = JSON.parse(json);
    return result.message;
  },
};
