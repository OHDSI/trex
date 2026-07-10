// Batch B (task-v2-brief.md): thin wrapper over the legacy devx sendMessageTool.
// Internals live in functions/tools/send_message.ts — imported, never copied.
import { wrap } from "../lib/context.ts";
import { sendMessageTool } from "../../functions/tools/send_message.ts";

export default wrap({
  description: sendMessageTool.description,
  schema: sendMessageTool.parameters,
  execute: sendMessageTool.execute,
  modifiesState: sendMessageTool.modifiesState,
  defaultConsent: sendMessageTool.defaultConsent,
});
