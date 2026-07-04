// Batch A (task-v2-brief.md): thin wrapper over the legacy devx addDependencyTool.
// Internals live in functions/tools/add_dependency.ts — imported, never copied.
import { wrap } from "../lib/context.ts";
import { addDependencyTool } from "../../functions/tools/add_dependency.ts";

export default wrap({
  description: addDependencyTool.description,
  schema: addDependencyTool.parameters,
  execute: addDependencyTool.execute,
  modifiesState: addDependencyTool.modifiesState,
  defaultConsent: addDependencyTool.defaultConsent,
});
