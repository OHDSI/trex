// Batch A (task-v2-brief.md): thin wrapper over the legacy devx writeFileTool.
// Internals live in functions/tools/write_file.ts — imported, never copied.
import { wrap } from "../lib/context.ts";
import { writeFileTool } from "../../functions/tools/write_file.ts";

export default wrap({
  description: writeFileTool.description,
  schema: writeFileTool.parameters,
  execute: writeFileTool.execute,
  modifiesState: writeFileTool.modifiesState,
  defaultConsent: writeFileTool.defaultConsent,
});
