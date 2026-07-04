// Batch B (task-v2-brief.md): thin wrapper over the legacy devx executeSqlTool.
// Internals live in functions/tools/execute_sql.ts — imported, never copied.
import { wrap } from "../lib/context.ts";
import { executeSqlTool } from "../../functions/tools/execute_sql.ts";

export default wrap({
  description: executeSqlTool.description,
  schema: executeSqlTool.parameters,
  execute: executeSqlTool.execute,
  modifiesState: executeSqlTool.modifiesState,
  defaultConsent: executeSqlTool.defaultConsent,
});
