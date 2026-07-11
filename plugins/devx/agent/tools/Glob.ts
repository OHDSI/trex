// Batch A (task-v2-brief.md): thin wrapper over the legacy devx listFilesTool
// (registry tool name "Glob"). Internals live in functions/tools/list_files.ts
// — imported, never copied.
import { wrap } from "../lib/context.ts";
import { listFilesTool } from "../../functions/tools/list_files.ts";

export default wrap({
  description: listFilesTool.description,
  schema: listFilesTool.parameters,
  execute: listFilesTool.execute,
  modifiesState: listFilesTool.modifiesState,
  defaultConsent: listFilesTool.defaultConsent,
});
