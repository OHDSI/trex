// Batch B (task-v2-brief.md): thin wrapper over the legacy devx planningQuestionnaireTool.
// Internals live in functions/tools/plan_tools.ts (multi-export file — one wrapper
// per registry entry) — imported, never copied.
import { wrap } from "../lib/context.ts";
import { planningQuestionnaireTool } from "../../functions/tools/plan_tools.ts";

export default wrap({
  description: planningQuestionnaireTool.description,
  schema: planningQuestionnaireTool.parameters,
  execute: planningQuestionnaireTool.execute,
  modifiesState: planningQuestionnaireTool.modifiesState,
  defaultConsent: planningQuestionnaireTool.defaultConsent,
});
