// Batch B (task-v2-brief.md): thin wrapper over the legacy devx webFetchTool.
// Internals live in functions/tools/web_fetch.ts — imported, never copied.
import { wrap } from "../lib/context.ts";
import { webFetchTool } from "../../functions/tools/web_fetch.ts";

export default wrap({
  description: webFetchTool.description,
  schema: webFetchTool.parameters,
  execute: webFetchTool.execute,
  modifiesState: webFetchTool.modifiesState,
  defaultConsent: webFetchTool.defaultConsent,
});
