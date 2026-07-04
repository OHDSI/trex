// Batch B (task-v2-brief.md): thin wrapper over the legacy devx getDatabaseSchemaTool.
// Internals live in functions/tools/get_database_schema.ts — imported, never copied.
import { wrap } from "../lib/context.ts";
import { getDatabaseSchemaTool } from "../../functions/tools/get_database_schema.ts";

export default wrap({
  description: getDatabaseSchemaTool.description,
  schema: getDatabaseSchemaTool.parameters,
  execute: getDatabaseSchemaTool.execute,
  modifiesState: getDatabaseSchemaTool.modifiesState,
  defaultConsent: getDatabaseSchemaTool.defaultConsent,
});
