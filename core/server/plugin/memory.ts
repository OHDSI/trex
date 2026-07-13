// The `memory` plugin type: each declared memory maps 1:1 to a gbrain brain =
// one Postgres schema (memory_<name>), served at /memory/<name> by the shared
// vendored-gbrain subprocess (see core/server/memory/gbrain-process.ts).
//
// Two distinct name regexes are used deliberately:
//  - MEMORY_NAME_RE has NO hyphen: a memory name is interpolated unquoted
//    into DDL as `memory_<name>` (a Postgres schema identifier), where a
//    hyphen is illegal.
//  - SOURCE_NAME_RE allows hyphens: a source name is a namespace within a
//    memory, not a schema identifier.
const MEMORY_NAME_RE = /^[a-z0-9][a-z0-9_]*$/;
const SOURCE_NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;

export interface MemorySource {
  name: string;
  repo?: string; // git source
  ref?: string; // git ref, default "main"
  dir?: string; // subdir within repo (git) OR path within the plugin package (inline)
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
