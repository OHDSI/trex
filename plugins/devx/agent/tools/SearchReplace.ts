// Batch A (task-v2-brief.md): thin wrapper over the legacy devx searchReplaceTool.
// Internals live in functions/tools/search_replace.ts — imported, never copied.
import { wrap } from "../lib/context.ts";
import { searchReplaceTool } from "../../functions/tools/search_replace.ts";

export default wrap({
  description: searchReplaceTool.description,
  schema: searchReplaceTool.parameters,
  execute: searchReplaceTool.execute,
  modifiesState: searchReplaceTool.modifiesState,
  defaultConsent: searchReplaceTool.defaultConsent,
});
