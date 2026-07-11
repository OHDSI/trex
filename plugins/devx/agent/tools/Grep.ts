// Batch A (task-v2-brief.md): thin wrapper over the legacy devx grepTool.
// Internals live in functions/tools/grep.ts — imported, never copied.
import { wrap } from "../lib/context.ts";
import { grepTool } from "../../functions/tools/grep.ts";

export default wrap({
  description: grepTool.description,
  schema: grepTool.parameters,
  execute: grepTool.execute,
  modifiesState: grepTool.modifiesState,
  defaultConsent: grepTool.defaultConsent,
});
