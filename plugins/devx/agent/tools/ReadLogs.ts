// Batch B (task-v2-brief.md): thin wrapper over the legacy devx readLogsTool.
// Internals live in functions/tools/read_logs.ts — imported, never copied.
import { wrap } from "../lib/context.ts";
import { readLogsTool } from "../../functions/tools/read_logs.ts";

export default wrap({
  description: readLogsTool.description,
  schema: readLogsTool.parameters,
  execute: readLogsTool.execute,
  modifiesState: readLogsTool.modifiesState,
  defaultConsent: readLogsTool.defaultConsent,
});
