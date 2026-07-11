// Batch A (task-v2-brief.md): thin wrapper over the legacy devx copyFileTool.
// Internals live in functions/tools/copy_file.ts — imported, never copied.
import { wrap } from "../lib/context.ts";
import { copyFileTool } from "../../functions/tools/copy_file.ts";

export default wrap({
  description: copyFileTool.description,
  schema: copyFileTool.parameters,
  execute: copyFileTool.execute,
  modifiesState: copyFileTool.modifiesState,
  defaultConsent: copyFileTool.defaultConsent,
});
