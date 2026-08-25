// Loads an eve-layout agent directory into a runtime description.
// Layout (spec §3): instructions.md (required), agent.ts (optional),
// tools/*.ts|*.js (one tool per file, filename = tool name),
// skills/<name>.md or skills/<name>/SKILL.md (metadata parsed here, content
// loaded on demand by the built-in skill tool), subagents/<name>/ (each an
// eve-layout dir, ONE level deep), channels/*.ts|*.js (one channel per file,
// filename = channel id, default-exporting defineChannel(...)),
// connections/*.ts|*.js (one connection per file, filename = connection name,
// default-exporting defineMcpClientConnection/defineOpenApiConnection(...)).
// Unsupported eve dirs (sandbox/) are ignored with a log line so real eve
// projects still load.
//
// EDN alternatives (trex extension for CLJS-authored agents, spec §3): the
// eve-native file always wins when both exist, so directories stay portable
// to real eve. agent.edn {:model "..." :max-steps N}; instructions.edn (EDN
// string or {:instructions "..."}); skills/<name>.edn {:description "..."
// :content "..."}.
import { parseEDNString } from "edn-data";
import type { ChannelDef } from "./channels/types.ts";
import type { ConnectionDef } from "./connections/types.ts";
import type { AgentConfig, ToolDef, ToolProviderFn } from "./eve-shim/types.ts";
import { type ContextConfig, DEFAULT_CONTEXT_CONFIG } from "./service/context/budget.ts";

export interface SkillMeta {
  name: string;
  description: string;
  path: string;
  content?: string; // pre-extracted for EDN skills; md skills read from path
}

// deno-lint-ignore no-explicit-any
async function readEdn(path: string): Promise<any | null> {
  let text: string;
  try {
    text = await Deno.readTextFile(path);
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return null;
    throw new Error(`agents: failed to read ${path}: ${e instanceof Error ? e.message : e}`);
  }
  try {
    // keywordAs/mapAs make {:model "x"} arrive as {model: "x"}.
    const parsed = parseEDNString(text, { mapAs: "object", keywordAs: "string" });
    // edn-data is lenient and yields null for malformed input instead of
    // throwing — treat that as a parse failure unless the file really says nil.
    if (parsed === null && text.trim() !== "" && text.trim() !== "nil") {
      throw new Error("invalid EDN");
    }
    return parsed;
  } catch (e) {
    throw new Error(`agents: failed to parse ${path}: ${e instanceof Error ? e.message : e}`);
  }
}

export interface LoadedAgent {
  dir: string;
  instructions: string;
  config: AgentConfig;
  tools: Record<string, ToolDef>;
  skills: SkillMeta[];
  subagents: Record<string, LoadedAgent>;
  // channels/*.{ts,js} — each default-exports a defineChannel(...) result;
  // key = filename sans ext (same shape as tools/, gated on __trexChannel).
  channels: Record<string, ChannelDef>;
  // connections/*.{ts,js} — each default-exports a defineMcpClientConnection /
  // defineOpenApiConnection result; key = filename sans ext (same shape as
  // channels/, gated on __trexConnection). The loader sets def.name from the
  // filename (the shim reserved a name? field for exactly this).
  connections: Record<string, ConnectionDef>;
  // H2: agent-dir-ROOT `dynamic-tools.ts`/`dynamic-tools.js` only (never
  // discovered inside tools/ — that dir is scanned separately and a
  // dynamic-tools.ts placed there is just an ordinary tools/ entry, which
  // throws the __trexTool brand-mismatch error like any other non-defineTool
  // default export). toolset.ts's buildSdkTools calls this at depth 0 only.
  toolProvider?: ToolProviderFn;
}

const IGNORED_DIRS = ["sandbox"];

// Description = frontmatter `description:` if a leading YAML block exists,
// else the first non-empty, non-heading line.
export function parseSkillDescription(markdown: string): string {
  const fm = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (fm) {
    const d = fm[1].match(/^description:\s*(.+)$/m);
    if (d) return d[1].trim();
  }
  const body = fm ? markdown.slice(fm[0].length) : markdown;
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (t && !t.startsWith("#")) return t;
  }
  return "";
}

// A skill staged from a skills-plugin pack is named `<pack>--<skill>`
// (plugin/skill-packs.ts's staging convention; "--" is rejected in pack and
// pack-skill names, and reserved — hand-authored skills should not use it).
// Returns the pack name, or null for a hand-authored skill.
export function packOfSkillName(name: string): string | null {
  const i = name.indexOf("--");
  return i > 0 ? name.slice(0, i) : null;
}

const EDN_KEY_MAP: Record<string, keyof ContextConfig> = {
  "fresh-tool-output-chars": "freshToolOutputChars",
  "stale-tool-output-chars": "staleToolOutputChars",
  "fresh-turns": "freshTurns",
  "compact-at-fraction": "compactAtFraction",
  "verbatim-turns-after-compaction": "verbatimTurnsAfterCompaction",
  "context-window": "contextWindow",
  "summarization-prompt": "summarizationPrompt",
  "deferred-tools": "deferredTools",
};

/** Merge an agent's partial `context` block over the conservative defaults. */
export function resolveContextConfig(raw: unknown): ContextConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CONTEXT_CONFIG };
  const out: ContextConfig = { ...DEFAULT_CONTEXT_CONFIG };
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = (EDN_KEY_MAP[k] ?? k) as keyof ContextConfig;
    if (key in out) (out as Record<string, unknown>)[key] = v;
  }
  return out;
}

export async function loadAgent(dir: string, opts: { depth?: number } = {}): Promise<LoadedAgent> {
  const depth = opts.depth ?? 0;
  let instructions: string | null = null;
  try {
    instructions = await Deno.readTextFile(`${dir}/instructions.md`);
  } catch (e) {
    // NotFound falls through to the EDN alternative; anything else is real.
    if (!(e instanceof Deno.errors.NotFound)) {
      throw new Error(`agents: failed to read ${dir}/instructions.md: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (instructions == null) {
    const edn = await readEdn(`${dir}/instructions.edn`);
    if (typeof edn === "string") instructions = edn;
    else if (edn && typeof edn.instructions === "string") instructions = edn.instructions;
  }
  if (instructions == null) {
    throw new Error(`agents: ${dir}/instructions.md is required but missing (or instructions.edn)`);
  }

  let config: AgentConfig = { maxSteps: 25, context: DEFAULT_CONTEXT_CONFIG };
  let configLoaded = false;
  for (const f of ["agent.ts", "agent.js"]) {
    try {
      await Deno.stat(`${dir}/${f}`);
      const mod = await import(`file://${dir}/${f}`);
      if (mod.default) {
        config = { maxSteps: 25, context: DEFAULT_CONTEXT_CONFIG, ...mod.default };
        // Ensure context is always fully resolved, never partial
        config.context = resolveContextConfig(config.context);
      }
      configLoaded = true;
      break;
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) continue;
      throw new Error(`agents: failed to load ${dir}/${f}: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (!configLoaded) {
    const edn = await readEdn(`${dir}/agent.edn`);
    if (edn && typeof edn === "object") {
      config = {
        maxSteps: typeof edn["max-steps"] === "number" ? edn["max-steps"] : 25,
        ...(typeof edn.model === "string" ? { model: edn.model } : {}),
        context: resolveContextConfig(edn.context),
      };
    }
  }

  const tools: Record<string, ToolDef> = {};
  try {
    for await (const entry of Deno.readDir(`${dir}/tools`)) {
      if (!entry.isFile) continue;
      // Colocated test files (e.g. dispatchToCode.test.ts) are the
      // established convention alongside tool/lib modules in this repo —
      // skip them rather than treating them as tool definitions.
      if (/\.test\.(ts|js|mts|mjs)$/.test(entry.name)) continue;
      const m = entry.name.match(/^(.+)\.(ts|js|mts|mjs)$/);
      if (!m) continue;
      const name = m[1];
      const mod = await import(`file://${dir}/tools/${entry.name}`);
      const def = mod.default;
      if (!def || !(def as { __trexTool?: boolean }).__trexTool) {
        throw new Error(`agents: ${dir}/tools/${entry.name} must default-export defineTool(...)`);
      }
      tools[name] = def as ToolDef;
    }
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }

  // H2: agent-dir-ROOT dynamic-tools.ts|js only — a separate stat/import
  // from the tools/ scan above, so a dynamic-tools.ts placed *inside*
  // tools/ is never discovered here (it just hits the tools/ loop's
  // __trexTool brand-mismatch error like any other stray file there).
  let toolProvider: ToolProviderFn | undefined;
  for (const f of ["dynamic-tools.ts", "dynamic-tools.js"]) {
    try {
      await Deno.stat(`${dir}/${f}`);
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) continue;
      throw new Error(`agents: failed to read ${dir}/${f}: ${e instanceof Error ? e.message : e}`);
    }
    // Import/brand errors below propagate as-is (not re-wrapped), same as
    // the tools/ loop's brand-mismatch error a few lines up.
    const mod = await import(`file://${dir}/${f}`);
    const fn = mod.default;
    if (!fn || !(fn as { __trexToolProvider?: boolean }).__trexToolProvider) {
      throw new Error(`agents: ${dir}/${f} must default-export defineToolProvider(...)`);
    }
    toolProvider = fn as ToolProviderFn;
    break;
  }

  const channels: Record<string, ChannelDef> = {};
  try {
    for await (const entry of Deno.readDir(`${dir}/channels`)) {
      if (!entry.isFile) continue;
      // Colocated test files (e.g. discord.load.test.ts) are the established
      // convention alongside channel modules in this repo — skip them rather
      // than treating them as channel definitions (same rationale as the
      // tools/ scan above).
      if (/\.test\.(ts|js|mts|mjs)$/.test(entry.name)) continue;
      const m = entry.name.match(/^(.+)\.(ts|js|mts|mjs)$/);
      if (!m) continue;
      const name = m[1];
      const mod = await import(`file://${dir}/channels/${entry.name}`);
      const def = mod.default;
      if (!def || !(def as { __trexChannel?: boolean }).__trexChannel) {
        throw new Error(`agents: ${dir}/channels/${entry.name} must default-export defineChannel(...)`);
      }
      channels[name] = def as ChannelDef;
    }
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }

  const connections: Record<string, ConnectionDef> = {};
  try {
    for await (const entry of Deno.readDir(`${dir}/connections`)) {
      if (!entry.isFile) continue;
      const m = entry.name.match(/^(.+)\.(ts|js|mts|mjs)$/);
      if (!m) continue;
      const name = m[1];
      const mod = await import(`file://${dir}/connections/${entry.name}`);
      const def = mod.default;
      if (!def || !(def as { __trexConnection?: boolean }).__trexConnection) {
        throw new Error(
          `agents: ${dir}/connections/${entry.name} must default-export defineMcpClientConnection(...)/defineOpenApiConnection(...)`,
        );
      }
      // The loader owns the connection's name (= filename); the shim reserved
      // the field for exactly this so authored files don't repeat themselves.
      connections[name] = Object.assign(def as ConnectionDef, { name });
    }
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }

  const skills: SkillMeta[] = [];
  try {
    for await (const entry of Deno.readDir(`${dir}/skills`)) {
      if (entry.isFile && entry.name.endsWith(".md")) {
        const path = `${dir}/skills/${entry.name}`;
        skills.push({
          name: entry.name.slice(0, -3),
          description: parseSkillDescription(await Deno.readTextFile(path)),
          path,
        });
      } else if (entry.isFile && entry.name.endsWith(".edn")) {
        const name = entry.name.slice(0, -4);
        // eve-native wins when both exist: flat md twin or SKILL.md dir form
        try {
          await Deno.stat(`${dir}/skills/${name}.md`);
          continue;
        } catch { /* no md twin */ }
        try {
          await Deno.stat(`${dir}/skills/${name}/SKILL.md`);
          continue;
        } catch { /* no SKILL.md dir twin */ }
        const path = `${dir}/skills/${entry.name}`;
        const edn = await readEdn(path);
        if (edn && typeof edn === "object" && typeof edn.content === "string") {
          skills.push({
            name,
            description: typeof edn.description === "string" ? edn.description : "",
            path,
            content: edn.content,
          });
        } else {
          console.log(`agents: ${path} skipped — expected {:description :content}`);
        }
      } else if (entry.isDirectory) {
        try {
          await Deno.stat(`${dir}/skills/${entry.name}/SKILL.md`);
          const path = `${dir}/skills/${entry.name}/SKILL.md`;
          skills.push({
            name: entry.name,
            description: parseSkillDescription(await Deno.readTextFile(path)),
            path,
          });
        } catch { /* dir without SKILL.md — skip */ }
      }
    }
  } catch (e) {
    // Missing skills/ dir is fine; EDN parse failures etc. must fail loudly.
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
  skills.sort((a, b) => a.name.localeCompare(b.name));

  const subagents: Record<string, LoadedAgent> = {};
  try {
    for await (const entry of Deno.readDir(`${dir}/subagents`)) {
      if (!entry.isDirectory) continue;
      if (depth >= 1) {
        console.log(`agents: ${dir}/subagents ignored — subagents are one level deep only`);
        break;
      }
      subagents[entry.name] = await loadAgent(`${dir}/subagents/${entry.name}`, { depth: depth + 1 });
    }
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }

  for (const d of IGNORED_DIRS) {
    try {
      await Deno.stat(`${dir}/${d}`);
      console.log(`agents: ${dir}/${d} present but not supported in v1 — ignored`);
    } catch { /* absent */ }
  }

  return { dir, instructions, config, tools, skills, subagents, channels, connections, toolProvider };
}
