// Thin wrapper over the legacy devx figmaListFramesTool. Internals live in
// functions/tools/figma.ts — imported, never copied.
import { wrap } from "../lib/context.ts";
import { figmaListFramesTool } from "../../functions/tools/figma.ts";

export default wrap({
  description: figmaListFramesTool.description,
  schema: figmaListFramesTool.parameters,
  execute: figmaListFramesTool.execute,
  modifiesState: figmaListFramesTool.modifiesState,
  defaultConsent: figmaListFramesTool.defaultConsent,
});
