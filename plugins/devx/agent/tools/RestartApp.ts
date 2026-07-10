// Batch B (task-v2-brief.md): thin wrapper over the legacy devx restartAppTool.
// Internals live in functions/tools/restart_app.ts — imported, never copied.
import { wrap } from "../lib/context.ts";
import { restartAppTool } from "../../functions/tools/restart_app.ts";

export default wrap({
  description: restartAppTool.description,
  schema: restartAppTool.parameters,
  execute: restartAppTool.execute,
  modifiesState: restartAppTool.modifiesState,
  defaultConsent: restartAppTool.defaultConsent,
});
