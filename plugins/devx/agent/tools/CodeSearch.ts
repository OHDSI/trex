// Batch A (task-v2-brief.md): thin wrapper over the legacy devx codeSearchTool.
// Internals live in functions/tools/code_search.ts — imported, never copied.
import { wrap } from "../lib/context.ts";
import { codeSearchTool } from "../../functions/tools/code_search.ts";

export default wrap({
  description: codeSearchTool.description,
  schema: codeSearchTool.parameters,
  execute: codeSearchTool.execute,
  modifiesState: codeSearchTool.modifiesState,
  defaultConsent: codeSearchTool.defaultConsent,
});
