// Batch B (task-v2-brief.md): thin wrapper over the legacy devx generateImageTool.
// Internals live in functions/tools/generate_image.ts — imported, never copied.
import { wrap } from "../lib/context.ts";
import { generateImageTool } from "../../functions/tools/generate_image.ts";

export default wrap({
  description: generateImageTool.description,
  schema: generateImageTool.parameters,
  execute: generateImageTool.execute,
  modifiesState: generateImageTool.modifiesState,
  defaultConsent: generateImageTool.defaultConsent,
});
