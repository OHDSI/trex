// Which sibling directories of a plugin's agent dir the agent actually imports.
//
// buildAgentWorkerConfig stages the agent dir into the worker's servicePath
// because the worker's module loader only resolves `file:` specifiers under
// that path. But an agent may import ACROSS its own directory boundary —
// devx's agent/agent.ts opens with ten `../functions/**` imports — and those
// files were never staged, so the worker died at module evaluation with
//
//   agents: failed to load /tmp/trex-agents-<id>/agent/agent.ts:
//     Module not found: file:///tmp/trex-agents-<id>/functions/skills/resolver.ts
//
// and every request to that agent 500'd. It was survivable while devx ran on
// the legacy loop; once #303 moved devx and claw's coder onto the eve runtime
// for every provider, the agent worker became the only path.
//
// The rule buildAgentWorkerConfig states for itself is "stage everything the
// worker imports inside the servicePath". This resolves what "everything"
// means by reading the imports rather than hardcoding `functions`, so an agent
// that grows a new sibling does not reintroduce the same failure.

/** Source files whose imports are worth following. */
const SOURCE_EXT = /\.(?:ts|tsx|mts|js|jsx|mjs)$/;

/**
 * Tests are not part of the worker's module graph, and following them
 * over-collects badly: devx's only references to `src/` (the 873K SPA) and
 * `fn-claude-code/` come from claude_code_agent.test.ts, so scanning tests
 * would stage ~1MB of code no worker ever imports.
 */
const TEST_FILE = /\.(?:test|spec)\.[a-z]+$|_test\.[a-z]+$/;

/**
 * Paths the core staging owns inside the temp servicePath. A plugin sibling of
 * the same name must never be copied over them.
 *
 * `auth` is the live case, and it is subtle: claw's agent/lib/code-stream.ts
 * does `await import("../../auth/keys.ts")`, which does NOT resolve in the
 * source tree (plugins/claw/auth does not exist — its own comment says so) and
 * is only meaningful in the staged layout, where it lands on the core
 * auth/keys.ts that buildAgentWorkerConfig puts at `${tmp}/auth`. Treating it
 * as a plugin sibling would try to copy a directory that isn't there, and for
 * a plugin that did have one would silently shadow core's.
 */
const RESERVED_STAGING_DIRS: ReadonlySet<string> = new Set(["auth", "agents", "agent"]);

/**
 * Never follow into these when scanning or staging. `node_modules` would drag
 * a dependency tree into a temp dir for no benefit (the worker resolves bare
 * specifiers through its import map, not the filesystem); `evals` matches the
 * agent dir's own staging exclude.
 */
export const SIBLING_STAGING_EXCLUDES: ReadonlySet<string> = new Set([
  "node_modules",
  "evals",
  ".git",
]);

/** Every relative specifier in a source file, from static and dynamic imports. */
export function relativeSpecifiers(source: string): string[] {
  const out: string[] = [];
  // `from "..."` / `import "..."` / `export ... from "..."` / `import("...")`.
  // Deliberately a regex and not a real parser: this only needs to find path
  // strings, and a miss degrades to the pre-existing behaviour (not staged)
  // rather than to something incorrect.
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s+["']([^"']+)["']/g,
  ];
  for (const re of patterns) {
    for (const m of source.matchAll(re)) {
      if (m[1].startsWith("./") || m[1].startsWith("../")) out.push(m[1]);
    }
  }
  return out;
}

/** Normalise a POSIX-ish path, resolving `.` and `..` segments. */
function normalize(path: string): string {
  const parts: string[] = [];
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return (path.startsWith("/") ? "/" : "") + parts.join("/");
}

/** The directory portion of a path. */
function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "/" : path.slice(0, i);
}

/**
 * Resolve `specifier` against the file that contains it, then report which
 * direct child of `pluginDir` it lands in — or null when it stays inside
 * `agentDir` (already staged) or escapes the plugin entirely (not ours to
 * stage; the worker's loader will reject it and that is the correct signal).
 */
export function siblingDirFor(
  fromFile: string,
  specifier: string,
  agentDir: string,
  pluginDir: string,
): string | null {
  const resolved = normalize(`${dirname(fromFile)}/${specifier}`);
  const agentPrefix = `${normalize(agentDir)}/`;
  const pluginPrefix = `${normalize(pluginDir)}/`;
  if (resolved.startsWith(agentPrefix)) return null; // inside the agent dir
  if (!resolved.startsWith(pluginPrefix)) return null; // outside the plugin
  const rest = resolved.slice(pluginPrefix.length);
  const top = rest.split("/")[0];
  if (!top) return null;
  // The agent dir itself is staged separately under a different name.
  if (`${pluginPrefix}${top}` === normalize(agentDir)) return null;
  return top;
}

interface Fs {
  readDir(path: string): AsyncIterable<{ name: string; isFile: boolean; isDirectory: boolean; isSymlink: boolean }>;
  readTextFile(path: string): Promise<string>;
  stat(path: string): Promise<{ isFile: boolean; isDirectory: boolean }>;
}

const denoFs: Fs = {
  readDir: (p) => Deno.readDir(p),
  readTextFile: (p) => Deno.readTextFile(p),
  stat: (p) => Deno.stat(p),
};

async function* walkSources(root: string, fs: Fs, excludes: ReadonlySet<string>): AsyncGenerator<string> {
  // Collected eagerly inside the try: Deno.readDir is LAZY, so a missing or
  // unreadable directory throws when the iterator is advanced, not when it is
  // created — a try around the readDir() call alone catches nothing and lets
  // the failure escape into plugin registration. A directory we cannot read is
  // simply one we cannot follow; the worker's own loader reports anything
  // genuinely missing, with the accurate module path.
  const entries: Array<{ name: string; isFile: boolean; isDirectory: boolean; isSymlink: boolean }> = [];
  try {
    for await (const entry of fs.readDir(root)) entries.push(entry);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (excludes.has(entry.name)) continue;
    const p = `${root}/${entry.name}`;
    let isDir = entry.isDirectory;
    let isFile = entry.isFile;
    if (entry.isSymlink) {
      try {
        const info = await fs.stat(p);
        isDir = info.isDirectory;
        isFile = info.isFile;
      } catch {
        continue;
      }
    }
    if (isDir) yield* walkSources(p, fs, excludes);
    else if (isFile && SOURCE_EXT.test(entry.name) && !TEST_FILE.test(entry.name)) yield p;
  }
}

/**
 * The sibling directories under `pluginDir` that `agentDir`'s sources import,
 * transitively — a staged sibling may import another one.
 *
 * Returns names relative to `pluginDir` (e.g. `["functions"]`), sorted for a
 * deterministic staging order.
 */
export async function collectSiblingImportDirs(
  agentDir: string,
  pluginDir: string,
  fs: Fs = denoFs,
  excludes: ReadonlySet<string> = SIBLING_STAGING_EXCLUDES,
): Promise<string[]> {
  const found = new Set<string>();
  // Scan the agent dir first, then each sibling it pulls in, until nothing new
  // appears. Bounded by the number of top-level dirs in the plugin.
  const queue: string[] = [agentDir];
  const scanned = new Set<string>();
  while (queue.length > 0) {
    const root = queue.shift()!;
    if (scanned.has(root)) continue;
    scanned.add(root);
    for await (const file of walkSources(root, fs, excludes)) {
      let source: string;
      try {
        source = await fs.readTextFile(file);
      } catch {
        continue;
      }
      for (const spec of relativeSpecifiers(source)) {
        const sibling = siblingDirFor(file, spec, agentDir, pluginDir);
        if (!sibling || found.has(sibling) || excludes.has(sibling)) continue;
        if (RESERVED_STAGING_DIRS.has(sibling)) continue;
        // Only stage what is actually a directory on disk. A specifier can name
        // a path that exists only in the staged layout (see RESERVED_STAGING_DIRS)
        // or be plain dead code; copying either would throw during registration.
        const abs = `${normalize(pluginDir)}/${sibling}`;
        try {
          if (!(await fs.stat(abs)).isDirectory) continue;
        } catch {
          continue;
        }
        found.add(sibling);
        queue.push(abs);
      }
    }
  }
  return [...found].sort();
}
