import { assertEquals } from "jsr:@std/assert";
import { collectSiblingImportDirs, relativeSpecifiers, siblingDirFor } from "./agent-sibling-imports.ts";

Deno.test("relativeSpecifiers: finds static, dynamic, side-effect and re-export forms", () => {
  const src = `
    import { a } from "../functions/skills/resolver.ts";
    import type { T } from "../functions/skills/types.ts";
    export { b } from "./local.ts";
    const m = await import("../functions/lazy.ts");
    import "../functions/side-effect.ts";
    import pg from "npm:pg@^8";
    import { x } from "jsr:@std/path";
    import { y } from "eve";
  `;
  const found = relativeSpecifiers(src).sort();
  assertEquals(found, [
    "../functions/lazy.ts",
    "../functions/side-effect.ts",
    "../functions/skills/resolver.ts",
    "../functions/skills/types.ts",
    "./local.ts",
  ]);
  // Bare and remote specifiers are the worker's import map's problem, not this
  // function's — including them would try to stage a directory that is not one.
  assertEquals(found.includes("npm:pg@^8"), false);
  assertEquals(found.includes("eve"), false);
});

Deno.test("siblingDirFor: only reports imports that escape the agent dir but stay in the plugin", () => {
  const agent = "/p/devx/agent";
  const plugin = "/p/devx";
  // The real failure: agent/agent.ts -> ../functions/skills/resolver.ts
  assertEquals(siblingDirFor(`${agent}/agent.ts`, "../functions/skills/resolver.ts", agent, plugin), "functions");
  // Nested source, same sibling.
  assertEquals(siblingDirFor(`${agent}/tools/KBSearch.ts`, "../../functions/duckdb.ts", agent, plugin), "functions");

  // Inside the agent dir — already staged, must NOT be reported as a sibling.
  assertEquals(siblingDirFor(`${agent}/agent.ts`, "./tools/Edit.ts", agent, plugin), null);
  assertEquals(siblingDirFor(`${agent}/tools/Edit.ts`, "../lib/util.ts", agent, plugin), null);
  assertEquals(siblingDirFor(`${agent}/tools/Edit.ts`, "../../agent/lib/util.ts", agent, plugin), null);

  // Escapes the plugin entirely — not ours to stage; the loader rejecting it
  // is the correct signal, and silently copying someone else's tree is not.
  assertEquals(siblingDirFor(`${agent}/agent.ts`, "../../other-plugin/x.ts", agent, plugin), null);
  assertEquals(siblingDirFor(`${agent}/agent.ts`, "../../../etc/passwd", agent, plugin), null);
});

/** In-memory fs so the walk is exercised without touching disk. */
function fakeFs(files: Record<string, string>) {
  const dirs = new Set<string>();
  for (const p of Object.keys(files)) {
    const parts = p.split("/");
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }
  return {
    // deno-lint-ignore require-yield
    async *readDir(path: string) {
      const seen = new Set<string>();
      for (const p of Object.keys(files)) {
        if (!p.startsWith(`${path}/`)) continue;
        const rest = p.slice(path.length + 1);
        const name = rest.split("/")[0];
        if (seen.has(name)) continue;
        seen.add(name);
        const isFile = rest === name;
        yield { name, isFile, isDirectory: !isFile, isSymlink: false };
      }
    },
    readTextFile: (p: string) => files[p] !== undefined ? Promise.resolve(files[p]) : Promise.reject(new Error("nope")),
    stat: (p: string) =>
      Promise.resolve({ isFile: files[p] !== undefined, isDirectory: dirs.has(p) }),
  };
}

Deno.test("collectSiblingImportDirs: finds the sibling devx actually imports", async () => {
  const fs = fakeFs({
    "/p/devx/agent/agent.ts": `import { loadSkillsForPrompt } from "../functions/skills/resolver.ts";`,
    "/p/devx/functions/skills/resolver.ts": `export const loadSkillsForPrompt = 1;`,
  });
  assertEquals(await collectSiblingImportDirs("/p/devx/agent", "/p/devx", fs), ["functions"]);
});

Deno.test("collectSiblingImportDirs: follows transitively — a sibling importing another sibling", async () => {
  // functions/ pulling in lib/ must stage lib/ too, or the worker fails one
  // module deeper with the identical error.
  const fs = fakeFs({
    "/p/devx/agent/agent.ts": `import "../functions/a.ts";`,
    "/p/devx/functions/a.ts": `import "../shared/b.ts";`,
    "/p/devx/shared/b.ts": `export const b = 1;`,
  });
  assertEquals(await collectSiblingImportDirs("/p/devx/agent", "/p/devx", fs), ["functions", "shared"]);
});

Deno.test("collectSiblingImportDirs: an agent that imports nothing outside itself stages nothing", async () => {
  const fs = fakeFs({
    "/p/toy/agent/agent.ts": `import "./tools/echo.ts"; import { x } from "eve";`,
    "/p/toy/agent/tools/echo.ts": `export const x = 1;`,
  });
  assertEquals(await collectSiblingImportDirs("/p/toy/agent", "/p/toy", fs), []);
});

Deno.test("collectSiblingImportDirs: excluded dirs are neither followed nor staged", async () => {
  const fs = fakeFs({
    "/p/devx/agent/agent.ts": `import "../node_modules/pkg/index.js"; import "../evals/helper.ts";`,
    "/p/devx/node_modules/pkg/index.js": `export default 1;`,
    "/p/devx/evals/helper.ts": `export const h = 1;`,
  });
  // node_modules would drag a dependency tree into a temp dir for nothing, and
  // evals matches the agent dir's own staging exclude.
  assertEquals(await collectSiblingImportDirs("/p/devx/agent", "/p/devx", fs), []);
});

Deno.test("collectSiblingImportDirs: an unreadable file inside a real sibling is skipped, not fatal", async () => {
  // functions/ exists and is staged; one file in it cannot be read (the fake
  // rejects any path it was not given). The scan must skip that file rather
  // than fail registration — the worker's own loader reports anything actually
  // missing, with the accurate module path.
  const fs = fakeFs({
    "/p/devx/agent/agent.ts": `import "../functions/a.ts";`,
    "/p/devx/functions/a.ts": `export const a = 1;`,
  });
  const original = fs.readTextFile;
  fs.readTextFile = (path: string) =>
    path.endsWith("/functions/a.ts") ? Promise.reject(new Error("EACCES")) : original(path);
  assertEquals(await collectSiblingImportDirs("/p/devx/agent", "/p/devx", fs), ["functions"]);
});

// The three corrections below all came from running this against the real
// plugin tree; each would have staged something wrong.

Deno.test("collectSiblingImportDirs: test files are not followed", async () => {
  // devx's ONLY references to src/ (873K of SPA) and fn-claude-code/ are from
  // claude_code_agent.test.ts. The worker never loads tests, so following them
  // stages ~1MB for nothing.
  const fs = fakeFs({
    "/p/devx/agent/agent.ts": `import "../functions/a.ts";`,
    "/p/devx/functions/a.ts": `export const a = 1;`,
    "/p/devx/functions/a.test.ts": `import { toolsOption } from "../fn-claude-code/tool_options.js";`,
    "/p/devx/fn-claude-code/tool_options.js": `export const toolsOption = 1;`,
  });
  assertEquals(await collectSiblingImportDirs("/p/devx/agent", "/p/devx", fs), ["functions"]);
});

Deno.test("collectSiblingImportDirs: never stages over a path the core staging owns", async () => {
  // claw's agent/lib/code-stream.ts does `await import("../../auth/keys.ts")`.
  // That resolves only in the STAGED layout, onto core's auth/keys.ts —
  // plugins/claw/auth does not exist. Copying a plugin `auth` here would
  // shadow core's, and for claw would try to copy a missing directory.
  const fs = fakeFs({
    "/p/claw/agent/lib/code-stream.ts": `const m = await import("../../auth/keys.ts");`,
    "/p/claw/auth/keys.ts": `export const LABELS = 1;`, // even when one DOES exist
  });
  assertEquals(await collectSiblingImportDirs("/p/claw/agent", "/p/claw", fs), []);
});

Deno.test("collectSiblingImportDirs: a specifier naming no real directory is skipped", async () => {
  // Dead or staged-layout-only specifiers must not make registration throw.
  const fs = fakeFs({
    "/p/x/agent/agent.ts": `import "../ghost/gone.ts"; import "../real/ok.ts";`,
    "/p/x/real/ok.ts": `export const ok = 1;`,
  });
  assertEquals(await collectSiblingImportDirs("/p/x/agent", "/p/x", fs), ["real"]);
});
