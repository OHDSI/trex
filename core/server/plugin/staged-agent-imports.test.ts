// A plugin agent is not run from the repo. addAgentsPlugin STAGES it into
// /tmp/trex-agents-<hash>/, where the agent dir lands at <stage>/agent/ and the
// slice of core it may use lands at <stage>/agents/ — a different shape from
// the repo, where the same files sit at plugins/<p>/agent/ and
// core/server/agents/.
//
// So a RUNTIME import written as "../../../core/server/agents/..." resolves in
// the repo and silently breaks once staged: from <stage>/agent/ it climbs past
// /tmp to the filesystem root and asks for /core/server/agents/..., which does
// not exist. The worker then dies at module evaluation with
// "Module not found: file:///core/server/agents/...", the agent never boots,
// and every call to it fails — the devx coding agent was dead this way for two
// weeks while the loader tests, which load from the REPO dir, stayed green.
//
// Type-only imports are exempt: they are erased before the module is evaluated,
// so they never hit the loader. Everything a staged agent imports at runtime
// must go through an "eve/..." specifier from the generated import map (see
// agents.ts), which points inside the stage.
import { assert, assertEquals } from "jsr:@std/assert";
import { walk } from "jsr:@std/fs/walk";
import { fromFileUrl } from "jsr:@std/path";

const REPO = fromFileUrl(new URL("../../../", import.meta.url));

/** `import ... from "<spec>"` / `export ... from "<spec>"`, capturing the statement head. */
const IMPORT_RE = /(^|\n)\s*(import|export)(\s+type)?\b([\s\S]*?)from\s*["']([^"']+)["']/g;

function offendingImports(source: string): string[] {
  const bad: string[] = [];
  for (const m of source.matchAll(IMPORT_RE)) {
    const isTypeKeyword = Boolean(m[3]);
    const clause = m[4];
    const spec = m[5];
    if (!/(\.\.\/)+core\/server\//.test(spec)) continue;
    // `import type {...}` and a clause whose every binding is `type X` are
    // erased at runtime and cannot reach the module loader.
    if (isTypeKeyword) continue;
    const bindings = clause.replace(/[{}]/g, "").split(",").map((s) => s.trim()).filter(Boolean);
    if (bindings.length > 0 && bindings.every((b) => b.startsWith("type "))) continue;
    bad.push(spec);
  }
  return bad;
}

Deno.test("no plugin agent imports core through a relative path at runtime", async () => {
  const found: string[] = [];
  for await (
    const entry of walk(`${REPO}plugins`, {
      exts: [".ts"],
      includeDirs: false,
      skip: [/node_modules/, /\/functions\//, /\.test\.ts$/],
    })
  ) {
    if (!/\/agent\//.test(entry.path)) continue;
    for (const spec of offendingImports(await Deno.readTextFile(entry.path))) {
      found.push(`${entry.path.slice(REPO.length)} -> ${spec}`);
    }
  }
  assertEquals(
    found,
    [],
    "these resolve in the repo but not in the staged layout; import them through an " +
      `"eve/..." specifier instead:\n  ${found.join("\n  ")}`,
  );
});

// Guards the exemption above: a type-only import must stay allowed, or the
// rule becomes unfollowable (types have no "eve/..." equivalent).
Deno.test("the rule exempts type-only imports and catches value imports", () => {
  assertEquals(offendingImports(`import type { X } from "../../../core/server/agents/eve-shim/types.ts";`), []);
  assertEquals(offendingImports(`import { type X, type Y } from "../../../core/server/agents/eve-shim/types.ts";`), []);
  assertEquals(
    offendingImports(`import { capHookOutput } from "../../../core/server/agents/service/context/hook-output.ts";`),
    ["../../../core/server/agents/service/context/hook-output.ts"],
  );
  assertEquals(
    offendingImports(`import {\n  realizeMcp,\n  type McpConnectFn,\n} from "../../../core/server/agents/connections/mcp.ts";`),
    ["../../../core/server/agents/connections/mcp.ts"],
  );
  assertEquals(offendingImports(`import { defineTool } from "eve/tools";`), []);
});

// ---------------------------------------------------------------------------
// The same confinement rule as above, for REMOTE specifiers.
//
// buildAgentWorkerConfig stages the agent and gives the worker that stage as
// its servicePath, and "the worker can only import modules under its
// servicePath" (agents.ts). A relative path that climbs out of the stage is one
// way to break that; an `https://…` URL is another — it is not under the stage
// either, so the worker dies at module evaluation with
// "Module not found: https://…".
//
// That is not hypothetical: plugins/devx/functions/** imported
// `https://deno.land/std@0.224.0/path/mod.ts` for join/dirname/relative/resolve,
// and the agent reaches those files through `../functions/...`. Once the
// relative-core-import bug above was fixed, module resolution got one step
// further and died on this instead — the coder's session create returned 500
// again, for the same reason wearing a different specifier.
//
// Path helpers must come from `node:path` (a runtime builtin, so it needs
// neither the network nor anything under the stage). The walk below follows
// only relative imports, so it reports exactly what a staged agent would
// actually try to load — a plugin's own function files included.
import { dirname as pdirname, join as pjoin, normalize as pnormalize } from "jsr:@std/path";

const REL_RE = /(?:^|\n)\s*(?:import|export)(?:\s+type)?[\s\S]*?from\s*["'](\.[^"']+)["']/g;
const REMOTE_RE = /(?:^|\n)\s*(?:import|export)(?:\s+type)?[\s\S]*?from\s*["'](https?:\/\/[^"']+)["']/g;

/** Every file a staged agent can reach by following relative imports. */
async function reachableFrom(entries: string[]): Promise<Set<string>> {
  const seen = new Set<string>();
  const queue = [...entries];
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f)) continue;
    let src: string;
    try {
      src = await Deno.readTextFile(f);
    } catch {
      continue; // a specifier we cannot resolve on disk is not ours to police here
    }
    seen.add(f);
    for (const m of src.matchAll(REL_RE)) {
      queue.push(pnormalize(pjoin(pdirname(f), m[1])));
    }
  }
  return seen;
}

Deno.test("no module a staged agent can reach imports from a remote URL", async () => {
  const entries: string[] = [];
  for await (const plugin of Deno.readDir(`${REPO}plugins`)) {
    if (!plugin.isDirectory) continue;
    const agentDir = `${REPO}plugins/${plugin.name}/agent`;
    try {
      if (!(await Deno.stat(agentDir)).isDirectory) continue;
    } catch {
      continue;
    }
    // loader.ts dynamic-imports agent.ts, dynamic-tools.ts and every tools/*.ts,
    // so each is an entrypoint in its own right.
    for await (
      const e of walk(agentDir, { exts: [".ts"], includeDirs: false, skip: [/\.test\.ts$/, /\/evals\//] })
    ) entries.push(e.path);
  }
  assert(entries.length > 0, "found no plugin agent entrypoints to walk");

  const offenders: string[] = [];
  for (const f of await reachableFrom(entries)) {
    for (const m of (await Deno.readTextFile(f)).matchAll(REMOTE_RE)) {
      offenders.push(`${f.slice(REPO.length)} -> ${m[1]}`);
    }
  }
  assertEquals(
    offenders.sort(),
    [],
    "a staged agent cannot load a remote URL (it is outside the worker's " +
      `servicePath); import path helpers from "node:path" instead:\n  ${offenders.join("\n  ")}`,
  );
});
