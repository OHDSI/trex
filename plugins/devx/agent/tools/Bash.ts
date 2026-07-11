// Batch A (task-v2-brief.md): thin wrapper over the legacy devx bashTool.
// Internals live in functions/tools/bash.ts — imported, never copied.
import { wrap } from "../lib/context.ts";
import { bashTool } from "../../functions/tools/bash.ts";

export default wrap({
  description: bashTool.description,
  schema: bashTool.parameters,
  execute: bashTool.execute,
  modifiesState: bashTool.modifiesState,
  defaultConsent: bashTool.defaultConsent,
});
