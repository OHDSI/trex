// Thin wrapper over the legacy devx figmaPullMockupsTool. Internals live in
// functions/tools/figma.ts — imported, never copied.
import { wrap } from "../lib/context.ts";
import { figmaPullMockupsTool } from "../../functions/tools/figma.ts";

export default wrap({
  description: figmaPullMockupsTool.description,
  schema: figmaPullMockupsTool.parameters,
  execute: figmaPullMockupsTool.execute,
  modifiesState: figmaPullMockupsTool.modifiesState,
  defaultConsent: figmaPullMockupsTool.defaultConsent,
});
