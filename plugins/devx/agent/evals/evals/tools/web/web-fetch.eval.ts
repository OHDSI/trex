import { defineEval } from "eve/evals";
import { includes } from "eve/evals/expect";

// Depends on external network — documented as known-flaky in the README;
// exclude this file when running offline.
export default defineEval({
  description: "fetches an external page with the WebFetch tool",
  async test(t) {
    await t.send("Use the WebFetch tool to fetch https://example.com and reply with the text of the page's main heading.");
    t.succeeded();
    t.calledTool("WebFetch");
    t.check(t.reply, includes("Example"));
  },
});
