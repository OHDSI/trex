// Guards one invariant that spans files and cannot be reached through any
// single unit under test: a provider row whose engine no longer exists must
// never be waived past the API-key check.
//
// Why a source scan and not a behavioural test. Two of the four gates live in
// functions/index.ts, which is a `Deno.serve` monolith — no exported request
// handler, no injectable `sql`, no seam to drive a request through without a
// live database. Those two are the gates the majority of affected users
// actually hit, so leaving them uncovered was not acceptable; scanning the
// source is the only practical way to reach them. The other two (
// routes/security_routes.ts, tools/spawn_agent.ts) do have real behavioural
// tests colocated with them, and this file is belt-and-braces for those.
//
// What goes wrong when the invariant breaks. `noKeyProviders` waives the
// "no API key configured" check for providers that genuinely authenticate
// without a stored key. Put a provider in that set whose engine has been
// deleted, and the row falls through to createModel's last branch — the
// OpenAI-compatible client — which resolves an absent apiKey from the
// worker's own OPENAI_API_KEY. One user's turn then runs on, and is billed
// to, the operator's account. That is a cross-tenant credential
// substitution, not a UX gap, which is why it is worth a guard that fails
// loudly rather than a comment nobody reads.
//
// Why the set membership is not enough on its own, and both tests exist.
// The key check is `!api_key && !noKeyProviders.has(provider)`. For a removed
// provider that happens to be keyless it fails closed by accident — but the
// create-config route accepts any provider string with any api_key, so a row
// naming a removed engine WITH a key would pass a key check. The gates
// therefore reject on the provider NAME, ahead of the key check. Test 1 keeps
// the removed provider out of the waiver set; test 2 keeps the name-based
// gates from being deleted. Neither implies the other.
//
// The merge hazard this is really here for: an in-flight branch that predates
// the removal can carry the old three-element set and touch disjoint lines,
// so git merges it cleanly with no conflict for a human to notice. Whichever
// side lands second, this test fails.
import { assertEquals } from "jsr:@std/assert";

const ROOT = "plugins/devx";

// Providers with no engine behind them. A name lands here when its dispatch
// path is deleted; it must never appear in a waiver set again.
const REMOVED_PROVIDERS = ["copilot"];

// The user-facing rejection each legacy-loop gate returns. Asserting the
// message (not just the provider name) means a gate that is gutted into a
// bare `if` with no response still fails here.
const REMOVAL_MESSAGE =
  "GitHub Copilot support has been removed — choose another provider in Settings.";

// Files carrying a name-based gate today, and how many each carries.
// plugins/devx/agent/agent.ts has the agents-loop equivalent (worded for a
// plugin-agnostic runtime, so its string differs); it is deliberately absent
// here because lib/resolve_model.test.ts already asserts that throw
// behaviourally — duplicating it would mean two places to edit for one
// wording change.
const GATE_SITES: Record<string, number> = {
  [`${ROOT}/functions/index.ts`]: 2,
  // Two: the active-provider_configs branch and the legacy devx.settings
  // fallback each resolve a provider row of their own, so each carries a gate.
  [`${ROOT}/functions/routes/security_routes.ts`]: 2,
  [`${ROOT}/functions/tools/spawn_agent.ts`]: 1,
};

async function collectTsFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    const path = `${dir}/${entry.name}`;
    // ROOT is an npm package. Installed dependencies are not ours to fix, and
    // a vendored .ts matching the pattern below would fail this guard with an
    // offender nobody on the team can act on. Same exclusion, same reason, as
    // prompt_divergence.test.ts's scan.
    if (entry.isDirectory && entry.name === "node_modules") continue;
    if (entry.isDirectory) {
      out.push(...(await collectTsFiles(path)));
    } else if (entry.isFile && path.endsWith(".ts") && !path.endsWith(".test.ts")) {
      out.push(path);
    }
  }
  return out;
}

// Matches the set literal wherever it is declared, including a fresh copy in
// a file that does not exist yet — the whole point of scanning the tree
// rather than a fixed list of known sites.
const WAIVER_SET = /noKeyProviders\s*=\s*new Set\(\s*\[([\s\S]*?)\]\s*\)/g;

Deno.test("no API-key waiver set lists a provider whose engine has been removed", async () => {
  const files = await collectTsFiles(ROOT);
  const offenders: string[] = [];

  for (const path of files) {
    const src = await Deno.readTextFile(path);
    for (const match of src.matchAll(WAIVER_SET)) {
      const contents = match[1];
      for (const provider of REMOVED_PROVIDERS) {
        if (contents.includes(`"${provider}"`) || contents.includes(`'${provider}'`)) {
          offenders.push(`${path} (waives "${provider}")`);
        }
      }
    }
  }

  assertEquals(
    offenders,
    [],
    "an API-key waiver set names a provider with no engine behind it. Such a row has " +
      "no usable credential, so waiving the key check drops it into the " +
      "OpenAI-compatible client, which falls back to the worker's own " +
      "OPENAI_API_KEY — the turn then runs on the operator's account instead of " +
      "the user's. Remove the provider from the set; the row is rejected by the " +
      "name-based gate above it. If this fired after a merge, the other branch " +
      "predates the engine's removal and reintroduced the old set. Offenders: ",
  );
});

Deno.test("every request path that reads a provider row still rejects removed providers by name", async () => {
  const missing: string[] = [];

  for (const [path, expected] of Object.entries(GATE_SITES)) {
    const src = await Deno.readTextFile(path);
    const found = src.split(REMOVAL_MESSAGE).length - 1;
    if (found !== expected) {
      missing.push(`${path}: expected ${expected} gate(s), found ${found}`);
    }
  }

  assertEquals(
    missing,
    [],
    "a request path that resolves a provider row no longer rejects removed providers " +
      "by name. Rejecting on the name — ahead of the API-key check — is what makes the " +
      "guarantee structural: the key check only fails closed for these rows because they " +
      "happen to be keyless, and the create-config route accepts any provider string with " +
      "any key, so a removed-engine row WITH a key would pass it and spend that credential " +
      "against the wrong provider. If a gate moved to a new file, update GATE_SITES; do not " +
      "delete the gate. Sites: ",
  );
});
