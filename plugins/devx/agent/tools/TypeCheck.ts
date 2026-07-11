// Batch B (task-v2-brief.md): thin wrapper over the legacy devx runTypeChecksTool.
// Internals live in functions/tools/run_type_checks.ts — imported, never copied.
import { wrap } from "../lib/context.ts";
import { runTypeChecksTool } from "../../functions/tools/run_type_checks.ts";

export default wrap({
  description: runTypeChecksTool.description,
  schema: runTypeChecksTool.parameters,
  execute: runTypeChecksTool.execute,
  modifiesState: runTypeChecksTool.modifiesState,
  defaultConsent: runTypeChecksTool.defaultConsent,
});
