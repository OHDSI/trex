// Batch A (task-v2-brief.md): thin wrapper over the legacy devx deleteFileTool.
// Internals live in functions/tools/delete_file.ts — imported, never copied.
import { wrap } from "../lib/context.ts";
import { deleteFileTool } from "../../functions/tools/delete_file.ts";

export default wrap({
  description: deleteFileTool.description,
  schema: deleteFileTool.parameters,
  execute: deleteFileTool.execute,
  modifiesState: deleteFileTool.modifiesState,
  defaultConsent: deleteFileTool.defaultConsent,
});
