// Batch A (task-v2-brief.md): thin wrapper over the legacy devx editFileTool.
// Internals live in functions/tools/edit_file.ts — imported, never copied.
import { wrap } from "../lib/context.ts";
import { editFileTool } from "../../functions/tools/edit_file.ts";

export default wrap({
  description: editFileTool.description,
  schema: editFileTool.parameters,
  execute: editFileTool.execute,
  modifiesState: editFileTool.modifiesState,
  defaultConsent: editFileTool.defaultConsent,
});
