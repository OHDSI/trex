// Batch A (task-v2-brief.md): thin wrapper over the legacy devx readFileTool.
// Internals live in functions/tools/read_file.ts — imported, never copied.
import { wrap } from "../lib/context.ts";
import { readFileTool } from "../../functions/tools/read_file.ts";

export default wrap({
  description: readFileTool.description,
  schema: readFileTool.parameters,
  execute: readFileTool.execute,
  modifiesState: readFileTool.modifiesState,
  defaultConsent: readFileTool.defaultConsent,
});
