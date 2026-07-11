// Batch B (task-v2-brief.md): thin wrapper over the legacy devx refreshAppPreviewTool.
// Internals live in functions/tools/refresh_app_preview.ts — imported, never copied.
import { wrap } from "../lib/context.ts";
import { refreshAppPreviewTool } from "../../functions/tools/refresh_app_preview.ts";

export default wrap({
  description: refreshAppPreviewTool.description,
  schema: refreshAppPreviewTool.parameters,
  execute: refreshAppPreviewTool.execute,
  modifiesState: refreshAppPreviewTool.modifiesState,
  defaultConsent: refreshAppPreviewTool.defaultConsent,
});
