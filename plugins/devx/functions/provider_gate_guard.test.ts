// Guards one invariant that spans files and cannot be reached through any
// single unit under test: a provider row whose engine no longer exists must
// never be waived past the API-key check.
//
// Why a source scan and not a behavioural test. Two of the gates live in
// functions/index.ts, which is a `Deno.serve` monolith — no exported request
// handler, no injectable `sql`, no seam to drive a request through without a
// live database. Those two are the gates the majority of affected users
// actually hit, so leaving them uncovered was not acceptable; scanning the
// source is the only practical way to reach them. The other two sites (
// routes/security_routes.ts, tools/spawn_agent.ts) and the agents-loop one
// (agent/agent.ts) do have real behavioural tests colocated with them, and
// this file is belt-and-braces for those.
//
// What goes wrong when the invariant breaks. The no-key set waives the
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
// The key check is `!api_key && !NO_KEY_PROVIDERS.has(provider)`. For a
// removed provider that happens to be keyless it fails closed by accident —
// but the create-config route accepts any provider string with any api_key, so
// a row naming a removed engine WITH a key would pass a key check. The gates
// therefore reject on the provider NAME, ahead of the key check. Test 1 keeps
// the removed provider out of the waiver set; test 2 keeps the name-based
// gates from being deleted, and keeps them ahead of the key check. Neither
// implies the other.
//
// What changed when the gate was made shared. The gate and the waiver set now
// have one definition, in provider_support.ts, and the read sites call into
// it. That moves two things out of this file's reach and into ordinary unit
// coverage: the rejection's wording and status are asserted behaviourally
// against the shared helpers (routes/security_routes.test.ts,
// tools/spawn_agent.test.ts, ../agent/lib/resolve_model.test.ts), so this file
// no longer greps for the sentence. What is still only reachable here is
// structural and is what the two tests below assert: every read site still
// CALLS the gate, each call is still WIRED to a rejection rather than
// evaluated and dropped, each call still runs AHEAD of that site's key check,
// and no waiver set — shared or freshly copied — names a removed provider.
//
// The merge hazard this is really here for: an in-flight branch that predates
// the removal can carry the old inline gate or the old three-element set and
// touch disjoint lines, so git merges it cleanly with no conflict for a human
// to notice. Whichever side lands second, this test fails.
import { assertEquals } from "jsr:@std/assert";
import { NO_KEY_PROVIDERS, REMOVED_PROVIDERS } from "./provider_support.ts";

const ROOT = "plugins/devx";

// The module the gate and the waiver set now live in. Read sites must import
// from here rather than re-declaring either.
const SHARED_MODULE = "provider_support.ts";

// The two shapes the shared gate is called in. Four sites answer an HTTP
// request and take the Response-returning wrapper; two fail a turn (a tool,
// and the agents loop) and take the throwing one. Both wrap the same
// predicate — the split is about the call site's contract, not about two
// gates.
const RESPONSE_GATE = "removedProviderResponse";
const THROW_GATE = "assertProviderSupported";

// Files carrying a name-based gate today, how many each carries, and which
// wrapper they call. A site that starts reading a provider row is added here;
// a site that stops reading one is removed. A site that keeps reading one and
// drops its gate is the failure this test exists to catch.
const GATE_SITES: Record<string, { calls: number; gate: string }> = {
  // Two: POST /chats/:id/stream and the agent/plan run stream each resolve a
  // provider row of their own, so each carries a gate.
  [`${ROOT}/functions/index.ts`]: { calls: 2, gate: RESPONSE_GATE },
  // Two: the active-provider_configs branch and the legacy devx.settings
  // fallback each resolve a provider row of their own, so each carries a gate.
  [`${ROOT}/functions/routes/security_routes.ts`]: { calls: 2, gate: RESPONSE_GATE },
  [`${ROOT}/functions/tools/spawn_agent.ts`]: { calls: 1, gate: THROW_GATE },
  // The agents-loop equivalent. It was outside this list while the gate was
  // copy-pasted, because its wording differs (it surfaces through a
  // plugin-agnostic runtime) and asserting the sentence here would have meant
  // two places to edit for one wording change. Counting gate CALLS rather than
  // sentences removes that objection, so it is covered here now too.
  [`${ROOT}/agent/agent.ts`]: { calls: 1, gate: THROW_GATE },
};

// Where the key check happens at a read site. Deliberately matches the USE of
// the shared set, not its import, so the ordering check below compares gates
// against key checks rather than against an import line.
const KEY_CHECK = /NO_KEY_PROVIDERS\.has\(/g;

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

// Matches a waiver set literal wherever it is declared, under either naming
// convention and with or without a type annotation: the shared
// NO_KEY_PROVIDERS, and equally a `noKeyProviders` copy reintroduced in a file
// that does not exist yet — the whole point of scanning the tree rather than
// only asserting the shared set.
const WAIVER_SET = /no_?key_?providers\s*(?::[^=\n]*)?=\s*new Set\(\s*\[([\s\S]*?)\]\s*\)/gi;

Deno.test("no API-key waiver set lists a provider whose engine has been removed", async () => {
  const offenders: string[] = [];

  // The shared set first, by value rather than by source text — this is the
  // one every read site actually consults.
  for (const provider of REMOVED_PROVIDERS) {
    if (NO_KEY_PROVIDERS.has(provider)) {
      offenders.push(`${ROOT}/functions/${SHARED_MODULE} (waives "${provider}")`);
    }
  }

  // Then the tree, for a set copied back into a read site by a branch that
  // predates the shared module.
  const files = await collectTsFiles(ROOT);
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

Deno.test("every request path that reads a provider row still invokes the shared removed-provider gate", async () => {
  const missing: string[] = [];

  for (const [path, { calls: expected, gate }] of Object.entries(GATE_SITES)) {
    const src = await Deno.readTextFile(path);

    // The gate must come from the shared module. A local re-declaration would
    // satisfy the call count below while being free to diverge.
    const importLine = src.match(
      new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*"[^"]*${SHARED_MODULE}"`),
    );
    if (!importLine || !importLine[1].includes(gate)) {
      missing.push(`${path}: does not import ${gate} from ${SHARED_MODULE}`);
      continue;
    }

    const gateCalls = [...src.matchAll(new RegExp(`\\b${gate}\\s*\\(`, "g"))];
    if (gateCalls.length !== expected) {
      missing.push(`${path}: expected ${expected} gate call(s), found ${gateCalls.length}`);
      continue;
    }

    // A Response-returning gate that is called and dropped is the same as no
    // gate at all, and unlike the throwing wrapper nothing at runtime notices.
    // Require each call to be wired straight to a return.
    if (gate === RESPONSE_GATE) {
      const wired = [
        ...src.matchAll(
          new RegExp(
            `const\\s+(\\w+)\\s*=\\s*${RESPONSE_GATE}\\([^;]*\\);\\s*\\n\\s*if\\s*\\(\\1\\)\\s*return\\s+\\1;`,
            "g",
          ),
        ),
      ];
      if (wired.length !== expected) {
        missing.push(
          `${path}: ${wired.length} of ${expected} gate call(s) return their rejection`,
        );
        continue;
      }
    }

    // Rejecting on the name only helps if it happens BEFORE the key check —
    // that ordering is what makes the guarantee structural rather than an
    // accident of these rows being keyless. Compare the n-th gate against the
    // n-th key check; a site with no key check (the agents loop) has no pair
    // to compare and is skipped by the zip.
    const keyChecks = [...src.matchAll(KEY_CHECK)];
    for (let i = 0; i < Math.min(gateCalls.length, keyChecks.length); i++) {
      if (gateCalls[i].index! > keyChecks[i].index!) {
        missing.push(`${path}: gate #${i + 1} runs after that read site's key check`);
      }
    }
  }

  assertEquals(
    missing,
    [],
    "a request path that resolves a provider row no longer rejects removed providers " +
      "by name, ahead of the API-key check. That ordering is what makes the " +
      "guarantee structural: the key check only fails closed for these rows because they " +
      "happen to be keyless, and the create-config route accepts any provider string with " +
      "any key, so a removed-engine row WITH a key would pass it and spend that credential " +
      "against the wrong provider. If a gate moved to a new file, update GATE_SITES; do not " +
      "delete the gate. Sites: ",
  );
});
