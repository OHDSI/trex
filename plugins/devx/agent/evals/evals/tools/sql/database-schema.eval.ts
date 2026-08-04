import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

// DatabaseSchema (plugins/devx/functions/tools/get_database_schema.ts) takes
// `app_id` as an explicit, required tool argument (no ctx.chatId/ownership
// check at all) — so the model needs a real app id to call it successfully.
// seed.sh seeds exactly one devx.apps/devx.app_databases fixture (schema
// "devx_app_eval", app id below); the prompt hands the model that id
// directly rather than expecting it to discover one (there is no
// "list apps" tool in this eval suite). "devx_app_eval" also satisfies the
// original brief's includes("devx") check unmodified.
const EVAL_APP_ID = "6e6a3b1c-0000-4000-8000-00000000a001";

export default defineEval({
  description: "inspects the database with the DatabaseSchema tool",
  async test(t) {
    await t.send(
      `Use the DatabaseSchema tool with app_id ${EVAL_APP_ID} and tell me the names of some schemas that exist in the database.`,
    );
    t.succeeded();
    t.calledTool("DatabaseSchema");
    t.check(t.reply, includes("devx"));
  },
});
