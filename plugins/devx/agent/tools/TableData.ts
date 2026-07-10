// Batch B (task-v2-brief.md): thin wrapper over the legacy devx getTableDataTool.
// Internals live in functions/tools/get_table_data.ts — imported, never copied.
import { wrap } from "../lib/context.ts";
import { getTableDataTool } from "../../functions/tools/get_table_data.ts";

export default wrap({
  description: getTableDataTool.description,
  schema: getTableDataTool.parameters,
  execute: getTableDataTool.execute,
  modifiesState: getTableDataTool.modifiesState,
  defaultConsent: getTableDataTool.defaultConsent,
});
