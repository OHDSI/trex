// Batch B (task-v2-brief.md): thin wrapper over the legacy devx updateTodosTool.
// Internals live in functions/tools/update_todos.ts — imported, never copied.
import { wrap } from "../lib/context.ts";
import { updateTodosTool } from "../../functions/tools/update_todos.ts";

export default wrap({
  description: updateTodosTool.description,
  schema: updateTodosTool.parameters,
  execute: updateTodosTool.execute,
  modifiesState: updateTodosTool.modifiesState,
  defaultConsent: updateTodosTool.defaultConsent,
});
