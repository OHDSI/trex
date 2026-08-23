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
// What goes wrong when the invariant breaks. The no-key waiver skips the
// "no API key configured" check for providers that genuinely authenticate
// without a stored key. Waive a provider whose engine has been deleted, and
// the row falls through to createModel's last branch — the OpenAI-compatible
// client — which resolves an absent apiKey from the worker's own
// OPENAI_API_KEY. One user's turn then runs on, and is billed to, the
// operator's account. That is a cross-tenant credential substitution, not a
// UX gap, which is why it is worth a guard that fails loudly rather than a
// comment nobody reads.
//
// Why the waiver membership is not enough on its own, and both tests exist.
// The key check is `!api_key && !isNoKeyProvider(provider)`. For a removed
// provider that happens to be keyless it fails closed by accident — but the
// create-config route accepts any provider string with any api_key, so a row
// naming a removed engine WITH a key would pass a key check. The gates
// therefore reject on the provider NAME, ahead of the key check. Test 1 keeps
// the removed provider out of the waiver; test 2 keeps the name-based gates
// from being deleted, keeps them wired, keeps the wording they ask for, and
// keeps them ahead of a key check that still exists. Neither implies the
// other.
//
// What changed when the gate was made shared, and what this file had to take
// on as a result. The gate and the waiver now have one definition, in
// provider_support.ts, and the read sites call into it. The rejection's
// wording is therefore no longer visible at the call sites, so this file can
// no longer grep for the sentence — provider_support.test.ts pins the two
// endings by value instead, and the colocated behavioural tests
// (routes/security_routes.test.ts, tools/spawn_agent.test.ts,
// ../agent/lib/resolve_model.test.ts) pin them end-to-end for four of the six
// sites. What remains reachable only here is structural, and is what test 2
// asserts, one property per mutation it is meant to survive:
//   - every read site still CALLS the gate (a deleted gate);
//   - each call is WIRED to a rejection rather than evaluated and dropped
//     (a `Response` returned into the void, which nothing notices at runtime);
//   - each call asks for the message STYLE that site is supposed to produce —
//     index.ts has no behavioural coverage at all, so without this a one-word
//     argument change would silently reword the 400 on the busiest route;
//   - each call runs AHEAD of that site's key check, and that site still HAS
//     the expected number of key checks — otherwise deleting the key checks
//     would delete the ordering assertion along with them.
//
// The merge hazard this is really here for: an in-flight branch that predates
// the removal can carry the old inline gate or the old three-element waiver
// and touch disjoint lines, so git merges it cleanly with no conflict for a
// human to notice. Whichever side lands second, this test fails.
import { assertEquals } from "jsr:@std/assert";
import { isNoKeyProvider, REMOVED_PROVIDER_NAMES } from "./provider_support.ts";

const ROOT = "plugins/devx";

// The module the gate and the waiver now live in. Read sites must import from
// here rather than re-declaring either.
const SHARED_MODULE = "provider_support.ts";

// The two shapes the shared gate is called in, and how many arguments each
// takes before an optional message style. Four sites answer an HTTP request
// and take the Response-returning wrapper; two fail a turn (a tool, and the
// agents loop) and take the throwing one. Both wrap the same predicate — the
// split is about the call site's contract, not about two gates.
const RESPONSE_GATE = "removedProviderResponse";
const THROW_GATE = "assertProviderSupported";
const GATE_BASE_ARGS: Record<string, number> = {
  [RESPONSE_GATE]: 2, // (provider, corsHeaders)
  [THROW_GATE]: 1, // (provider)
};

// `plugin` is the default, so it is spelled by OMITTING the style argument;
// any other style must be passed explicitly. Pinning this is what stops a
// site's user-visible wording from being changed by a one-word edit.
const DEFAULT_STYLE = "plugin";

// Files carrying a name-based gate today: how many gate calls each carries,
// which wrapper they call, which message style each asks for, and how many key
// checks sit alongside. A site that starts reading a provider row is added
// here; a site that stops reading one is removed. A site that keeps reading
// one and drops, unwires, rewords, or reorders its gate is the failure this
// test exists to catch.
interface GateSite {
  calls: number;
  gate: string;
  style: string;
  keyChecks: number;
}

const GATE_SITES: Record<string, GateSite> = {
  // Two: POST /chats/:id/stream and the agent/plan run stream each resolve a
  // provider row of their own, so each carries a gate and a key check.
  [`${ROOT}/functions/index.ts`]: { calls: 2, gate: RESPONSE_GATE, style: "plugin", keyChecks: 2 },
  // Two: the active-provider_configs branch and the legacy devx.settings
  // fallback each resolve a provider row of their own, so each carries a gate.
  [`${ROOT}/functions/routes/security_routes.ts`]: {
    calls: 2,
    gate: RESPONSE_GATE,
    style: "plugin",
    keyChecks: 2,
  },
  [`${ROOT}/functions/tools/spawn_agent.ts`]: {
    calls: 1,
    gate: THROW_GATE,
    style: "plugin",
    keyChecks: 1,
  },
  // The agents-loop equivalent. It was outside this list while the gate was
  // copy-pasted, because its wording differs (it surfaces through a
  // plugin-agnostic runtime) and asserting the sentence here would have meant
  // two places to edit for one wording change. Pinning the style ARGUMENT
  // rather than the sentence removes that objection, so it is covered here
  // now too — including the fact that its wording is the host-agnostic one.
  // It resolves a model rather than serving a request and has no key check of
  // its own, hence zero.
  [`${ROOT}/agent/agent.ts`]: {
    calls: 1,
    gate: THROW_GATE,
    style: "hostAgnostic",
    keyChecks: 0,
  },
};

// Where the key check happens at a read site. Deliberately matches the USE of
// the shared predicate, not its import, so the ordering check below compares
// gates against key checks rather than against an import line.
const KEY_CHECK = /\bisNoKeyProvider\(/g;

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
// convention and with or without a type annotation: the shared module's
// private NO_KEY_PROVIDERS, and equally a `noKeyProviders` copy reintroduced
// in a file that does not exist yet — the whole point of scanning the tree
// rather than only asking the shared predicate.
const WAIVER_SET = /no_?key_?providers\s*(?::[^=\n]*)?=\s*new Set\(\s*\[([\s\S]*?)\]\s*\)/gi;

// Splits a call's argument list on top-level commas, starting from the index
// of its opening paren. Quote- and nesting-aware so an argument containing a
// comma inside a string or a nested call is not miscounted.
function callArguments(src: string, openParen: number): string[] {
  const args: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  for (let i = openParen; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      current += ch;
      if (ch === "\\") {
        current += src[++i] ?? "";
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      depth++;
      if (depth === 1) continue; // skip the call's own opening paren
      current += ch;
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) {
        if (current.trim() !== "") args.push(current.trim());
        return args;
      }
      current += ch;
      continue;
    }
    if (ch === "," && depth === 1) {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  return args;
}

Deno.test("no API-key waiver lists a provider whose engine has been removed", async () => {
  const offenders: string[] = [];

  // The shared waiver first, through the predicate every read site actually
  // consults rather than through its source text.
  for (const provider of REMOVED_PROVIDER_NAMES) {
    if (isNoKeyProvider(provider)) {
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
      for (const provider of REMOVED_PROVIDER_NAMES) {
        if (contents.includes(`"${provider}"`) || contents.includes(`'${provider}'`)) {
          offenders.push(`${path} (waives "${provider}")`);
        }
      }
    }
  }

  assertEquals(
    offenders,
    [],
    "an API-key waiver names a provider with no engine behind it. Such a row has " +
      "no usable credential, so waiving the key check drops it into the " +
      "OpenAI-compatible client, which falls back to the worker's own " +
      "OPENAI_API_KEY — the turn then runs on the operator's account instead of " +
      "the user's. Remove the provider from the waiver; the row is rejected by the " +
      "name-based gate above it. If this fired after a merge, the other branch " +
      "predates the engine's removal and reintroduced the old set. Offenders: ",
  );
});

Deno.test("every request path that reads a provider row still invokes the shared removed-provider gate", async () => {
  const missing: string[] = [];

  for (const [path, site] of Object.entries(GATE_SITES)) {
    const src = await Deno.readTextFile(path);

    // The gate must come from the shared module. A local re-declaration would
    // satisfy the call count below while being free to diverge. Every import
    // of the module is inspected, not just the first.
    const imported = [
      ...src.matchAll(new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*"[^"]*${SHARED_MODULE}"`, "g")),
    ]
      .map((m) => m[1])
      .join(",");
    if (!imported.includes(site.gate)) {
      missing.push(`${path}: does not import ${site.gate} from ${SHARED_MODULE}`);
      continue;
    }

    const gateCalls = [...src.matchAll(new RegExp(`\\b${site.gate}\\s*\\(`, "g"))];
    if (gateCalls.length !== site.calls) {
      missing.push(`${path}: expected ${site.calls} gate call(s), found ${gateCalls.length}`);
      continue;
    }

    // Which wording each call asks for. `plugin` is the default and must be
    // spelled by omission; anything else must name itself. Nothing else covers
    // this for index.ts, whose two gates have no behavioural test at all.
    const baseArgs = GATE_BASE_ARGS[site.gate];
    const expectedArgs = site.style === DEFAULT_STYLE ? baseArgs : baseArgs + 1;
    for (let i = 0; i < gateCalls.length; i++) {
      const args = callArguments(src, gateCalls[i].index! + gateCalls[i][0].length - 1);
      if (args.length !== expectedArgs) {
        missing.push(
          `${path}: gate #${i + 1} passes ${args.length} argument(s), expected ${expectedArgs} ` +
            `for style "${site.style}"`,
        );
        continue;
      }
      if (site.style !== DEFAULT_STYLE && args[baseArgs] !== `"${site.style}"`) {
        missing.push(
          `${path}: gate #${i + 1} asks for style ${args[baseArgs]}, expected "${site.style}"`,
        );
      }
    }

    // A Response-returning gate that is called and dropped is the same as no
    // gate at all, and unlike the throwing wrapper nothing at runtime notices.
    // Require each call to be wired straight to a return. Whitespace between
    // the assignment and the guard is free-form so that reformatting cannot
    // raise a security failure over a line break.
    if (site.gate === RESPONSE_GATE) {
      const wired = [
        ...src.matchAll(
          new RegExp(
            `const\\s+(\\w+)\\s*=\\s*${RESPONSE_GATE}\\([^;]*\\);\\s*if\\s*\\(\\s*\\1\\s*\\)\\s*(?:return\\s+\\1\\s*;|\\{\\s*return\\s+\\1\\s*;\\s*\\})`,
            "g",
          ),
        ),
      ];
      if (wired.length !== site.calls) {
        missing.push(
          `${path}: ${wired.length} of ${site.calls} gate call(s) return their rejection`,
        );
        continue;
      }
    }

    // Rejecting on the name only helps if it happens BEFORE the key check —
    // that ordering is what makes the guarantee structural rather than an
    // accident of these rows being keyless. Count the key checks first:
    // zipping alone would let the ordering assertion be deleted by deleting
    // the key checks it compares against.
    const keyChecks = [...src.matchAll(KEY_CHECK)];
    if (keyChecks.length !== site.keyChecks) {
      missing.push(
        `${path}: expected ${site.keyChecks} key check(s), found ${keyChecks.length}`,
      );
      continue;
    }
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
      "by name, with the wording that site owes its users, ahead of an API-key check that " +
      "still exists. That ordering is what makes the guarantee structural: the key check " +
      "only fails closed for these rows because they happen to be keyless, and the " +
      "create-config route accepts any provider string with any key, so a removed-engine " +
      "row WITH a key would pass it and spend that credential against the wrong provider. " +
      "If a gate moved to a new file, update GATE_SITES; do not delete the gate. If the " +
      "gate is present and correct, the call may use an idiom these patterns do not " +
      "recognise — widen the pattern rather than dropping the site. Sites: ",
  );
});
