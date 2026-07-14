import { defineEval } from "eve/evals";

export default defineEval({
  description: "lists cron jobs with the CronList tool",
  async test(t) {
    await t.send("Use the CronList tool and tell me how many cron jobs exist (zero is a fine answer).");
    t.succeeded();
    t.calledTool("CronList");
  },
});
