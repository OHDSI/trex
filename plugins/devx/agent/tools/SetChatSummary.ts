// Batch B (task-v2-brief.md): thin wrapper over the legacy devx setChatSummaryTool.
// Internals live in functions/tools/set_chat_summary.ts — imported, never copied.
import { wrap } from "../lib/context.ts";
import { setChatSummaryTool } from "../../functions/tools/set_chat_summary.ts";

export default wrap({
  description: setChatSummaryTool.description,
  schema: setChatSummaryTool.parameters,
  execute: setChatSummaryTool.execute,
  modifiesState: setChatSummaryTool.modifiesState,
  defaultConsent: setChatSummaryTool.defaultConsent,
});
