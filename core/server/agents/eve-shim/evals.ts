// Eval definitions are primarily executed by the real eve CLI against our
// HTTP surface (`eve eval --url`). This shim only makes .eval.ts files
// loadable by a trex-side fallback runner.
export interface EvalDef {
  description?: string;
  judge?: string;
  // deno-lint-ignore no-explicit-any
  test: (t: any) => Promise<void>;
}

export function defineEval(def: EvalDef): EvalDef {
  if (typeof def.test !== "function") throw new Error("defineEval: test function required");
  return def;
}
