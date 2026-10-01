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
// neither the network nor anything under the stage). stageGraphOffenders below
// follows relative imports AND the `eve/...` specifiers the generated map
// points back into the staged core, so it reports what a staged agent would
// actually try to load — a plugin's own function files and core's own modules
// included.
import { dirname as pdirname, join as pjoin, normalize as pnormalize } from "jsr:@std/path";

// Resolution rules a staged worker actually has, in one place. `strip` removes
// comments AND template literals first: prompts.ts embeds example React/zod
// code inside prompt strings, and a scanner that reads those as real imports
// reports noise until someone switches the guard off.
function strip(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/`(?:[^`\\]|\\[\s\S])*`/g, "``")
    .split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
}

// Between the keyword and `from`, only a real clause may appear (identifiers,
// braces, commas, `as`, whitespace). `[^;]*?` used to span whole lines, so a
// description reading "switch from 'plan' to 'agent'" parsed as an import.
const STATIC_RE = /^\s*(?:import|export)(?:\s+type)?[\w*{},\s]*?\bfrom\s*["']([^"']+)["']/gm;
const SIDE_RE = /^\s*import\s+["']([^"']+)["']/gm;
const DYN_RE = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

/** Bare specifiers the generated import map names (plugin/agents.ts). */
async function mappedSpecifiers(): Promise<Set<string>> {
  const src = await Deno.readTextFile(`${REPO}core/server/plugin/agents.ts`);
  const start = src.indexOf("const imports: Record<string, string> = {");
  const block = src.slice(start, src.indexOf("\n  };", start));
  return new Set([...block.matchAll(/^\s*"([^"]+)":/gm)].map((m) => m[1]));
}

/**
 * Walk the graph a staged agent really loads: relative imports AND the
 * `eve/...` specifiers the generated map points back into the staged core, so
 * core's own modules are covered too — the unprefixed MCP SDK import that made
 * every MCP tool vanish lived in core, out of reach of a plugins-only walk.
 */
async function stageGraphOffenders(): Promise<string[]> {
  const CORE = `${REPO}core/server/agents/`;
  const mapped = await mappedSpecifiers();
  const entries: string[] = [];
  for await (const plugin of Deno.readDir(`${REPO}plugins`)) {
    if (!plugin.isDirectory) continue;
    const agentDir = `${REPO}plugins/${plugin.name}/agent`;
    try {
      if (!(await Deno.stat(agentDir)).isDirectory) continue;
    } catch {
      continue;
    }
    for await (
      const e of walk(agentDir, { exts: [".ts"], includeDirs: false, skip: [/\.test\.ts$/, /\/evals\//] })
    ) entries.push(e.path);
  }
  entries.push(`${CORE}service/index.ts`); // the stage's index.ts imports this
  assert(entries.length > 0, "found no plugin agent entrypoints to walk");

  const seen = new Set<string>();
  const offenders: string[] = [];
  const queue = [...entries];
  while (queue.length) {
    const f = queue.pop()!;
    if (seen.has(f)) continue;
    let raw: string;
    try {
      raw = await Deno.readTextFile(f);
    } catch {
      continue;
    }
    seen.add(f);
    const src = strip(raw);
    const rel = f.slice(REPO.length);
    const specs: string[] = [];
    for (const re of [STATIC_RE, SIDE_RE, DYN_RE]) {
      for (const m of src.matchAll(re)) specs.push(m[1]);
    }
    for (const spec of specs) {
      let file: string | undefined;
      if (spec.startsWith(".")) file = pnormalize(pjoin(pdirname(f), spec));
      else if (spec.startsWith("eve/core/")) file = CORE + spec.slice("eve/core/".length);
      else if (spec === "eve") file = `${CORE}eve-shim/mod.ts`;
      else if (spec === "eve/tools") file = `${CORE}eve-shim/tools.ts`;
      if (file) {
        // Outside the repo means outside the stage: the servicePath escape.
        if (!file.startsWith(REPO)) offenders.push(`${rel} -> ${spec} (escapes the stage)`);
        else queue.push(file);
        continue;
      }
      if (/^https?:\/\//.test(spec)) offenders.push(`${rel} -> ${spec} (remote URL)`);
      else if (spec.startsWith("node:") || spec.startsWith("npm:") || spec.startsWith("jsr:")) continue;
      else if (spec.startsWith("eve/") || mapped.has(spec)) continue;
      else offenders.push(`${rel} -> ${spec} (bare, not in the generated import map)`);
    }
  }
  return offenders.sort();
}

Deno.test("every module a staged agent can reach resolves inside the stage", async () => {
  assertEquals(
    await stageGraphOffenders(),
    [],
    'a staged worker resolves only what is under its servicePath, what the generated ' +
      'import map names, or what the runtime itself resolves (node:/npm:/jsr:). Use ' +
      '"node:path" for path helpers and an "npm:" prefix for npm packages.',
  );
});
