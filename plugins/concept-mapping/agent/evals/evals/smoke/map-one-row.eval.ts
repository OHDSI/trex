import { defineEval } from "eve/evals";
import { satisfies } from "eve/evals/expect";

// One pasted term end to end: retrieval, judge vote, answer with a concept id.
export default defineEval({
  description: "maps a single pasted term to a concept",
  async test(t) {
    await t.send(
      "Map this term: source_data_identifier=1, source_code=K-100, " +
        "original_source_name=Kniegelenkspiegelung, source_name=Arthroscopy of the knee joint",
    );
    t.succeeded();
    t.calledTool("retrieve_candidates");
    t.calledTool("judge_candidates");
    t.check(t.reply, satisfies((v) => /\b\d{4,10}\b/.test(String(v)), "reply names a concept id"));
  },
});
