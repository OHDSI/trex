// Batch A (task-v2-brief.md): thin wrapper over the legacy devx renameFileTool.
// Internals live in functions/tools/rename_file.ts — imported, never copied.
import { wrap } from "../lib/context.ts";
import { renameFileTool } from "../../functions/tools/rename_file.ts";

export default wrap({
  description: renameFileTool.description,
  schema: renameFileTool.parameters,
  execute: renameFileTool.execute,
  modifiesState: renameFileTool.modifiesState,
  defaultConsent: renameFileTool.defaultConsent,
});
