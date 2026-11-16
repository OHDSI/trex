import { defineTool } from "eve/tools";
import { conceptDetails, vocabQuery, vocabSchema } from "../lib/vocab.ts";
import { type Ctx, envGet, guarded, requireSql } from "../lib/ctx.ts";

export default defineTool({
  description:
    "Look up OMOP concepts by id: name, vocabulary, domain, class, standard flag, synonyms, and up to five direct " +
    "parents and children. Use it to check how specific a candidate is before choosing exactMatch or broadMatch.",
  inputSchema: {
    type: "object",
    properties: {
      concept_ids: { type: "array", items: { type: "integer" }, minItems: 1, maxItems: 30 },
    },
    required: ["concept_ids"],
  },
  execute: (input, ctx?: Ctx) =>
    guarded(async () => {
      const q = vocabQuery(envGet, requireSql(ctx));
      return { concepts: await conceptDetails(q, vocabSchema(envGet), (input as { concept_ids: number[] }).concept_ids) };
    }),
});
