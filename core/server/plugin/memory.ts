// The `memory` plugin type: each declared memory maps 1:1 to a gbrain brain =
// one Postgres schema (memory_<name>), served at /memory/<name> by the
// edge-runtime worker (see core/server/memory/gbrain-worker/mount.ts's
// `mountMemoryWorker`). This module only holds the declaration-normalization
// logic (`normalizeMemoryValue`) shared by plugin.ts's scan pass and the
// worker mount.
//
// Two distinct name regexes are used deliberately:
//  - MEMORY_NAME_RE has NO hyphen: a memory name is interpolated unquoted
//    into DDL as `memory_<name>` (a Postgres schema identifier), where a
//    hyphen is illegal.
//  - SOURCE_NAME_RE allows hyphens: a source name is a namespace within a
//    memory, not a schema identifier.
import { isTrustedPluginScope } from "./function.ts";

const MEMORY_NAME_RE = /^[a-z0-9][a-z0-9_]*$/;
const SOURCE_NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;

// Same trust requirement as agents (agents.ts's isTrustedScopeAgentsPlugin):
// a memory name becomes a Postgres schema served by the shared worker, so
// only trusted-scope plugins may declare one or feed sources into one.
// Enforced by plugin.ts in both the pre-pass (collectDeclaredMemoryNames)
// and the dispatch `case "memory"`.
export function isTrustedScopeMemoryPlugin(name: string): boolean {
  return isTrustedPluginScope(name);
}

export interface MemorySource {
  name: string;
  repo?: string; // git source
  ref?: string; // git ref, default "main"
  dir?: string; // subdir within repo (git) OR path within the plugin package (inline)
  // Internal: the directory of the plugin that declared this source, stamped
  // by plugin.ts's `case "memory"` after normalizeMemoryValue returns (NOT
  // set or required by normalizeMemoryValue itself). Needed because 2+
  // plugins may contribute INLINE sources to the SAME memory name — a single
  // per-memory directory would resolve a later plugin's `dir` against the
  // wrong plugin's directory. Git sources don't need this (they resolve
  // against the cloned checkout), but it's stamped uniformly for simplicity.
  pluginDir?: string;
}
export interface MemoryEntry {
  name: string;
  sources: MemorySource[];
}

export function normalizeMemoryValue(value: unknown): MemoryEntry[] {
  const arr = Array.isArray(value) ? value : [value];
  return arr.map((e) => {
    const entry = e as { name?: string; sources?: unknown };
    if (!entry?.name || !MEMORY_NAME_RE.test(entry.name)) {
      throw new Error(
        `memory: each entry needs a name (${MEMORY_NAME_RE}), got ${
          JSON.stringify(e)
        }`,
      );
    }
    const rawSources = Array.isArray(entry.sources) ? entry.sources : [];
    if (rawSources.length === 0) {
      throw new Error(`memory ${entry.name}: at least one source is required`);
    }
    const seen = new Set<string>();
    const sources: MemorySource[] = rawSources.map((s) => {
      const src = s as MemorySource;
      if (!src?.name || !SOURCE_NAME_RE.test(src.name)) {
        throw new Error(
          `memory ${entry.name}: source needs a name (${SOURCE_NAME_RE})`,
        );
      }
      if (seen.has(src.name)) {
        throw new Error(
          `memory ${entry.name}: duplicate source name ${src.name}`,
        );
      }
      seen.add(src.name);
      if (!src.repo && !src.dir) {
        throw new Error(`memory ${entry.name}/${src.name}: needs repo or dir`);
      }
      return src.repo
        ? {
          name: src.name,
          repo: src.repo,
          ref: src.ref ?? "main",
          dir: src.dir,
        }
        : { name: src.name, dir: src.dir };
    });
    return { name: entry.name, sources };
  });
}
