// Cross-plugin accumulation for the `memory` plugin type: multiple plugins
// MAY declare `trex.memory` entries that target the SAME memory name (e.g. a
// shared "research" brain fed by both the "clinical-notes" plugin and the
// "handbook" plugin). This module owns the merge rule:
//   - sources are unioned into the existing MemoryEntry for that name;
//   - a source `name` that collides with one already contributed to that
//     memory (by ANY plugin, including the same one re-registering) is
//     rejected loudly, naming both contributing plugins, rather than
//     silently shadowing one source with another.
// Kept as a small, side-effect-free (no I/O) helper so the merge/collision
// logic is unit-testable without booting the plugin loader.
import type { MemoryEntry } from "./memory.ts";

// Tracks, for a given "memory:source" pair, which plugin first contributed
// it — needed to name both plugins in a collision error. Callers own the
// map's lifetime (module-level in plugin.ts, a fresh Map() per test here).
export type SourceOwners = Map<string, string>;

function ownerKey(memoryName: string, sourceName: string): string {
  return `${memoryName}::${sourceName}`;
}

// Merges `incoming` (entries declared by `pluginName`) into `acc` in place.
// Throws on a source-name collision within the same memory name, before
// mutating `acc` for that memory's remaining sources (an entry is only
// partially applied if it fails partway — matching normalizeMemoryValue's
// fail-fast style elsewhere in this plugin type).
export function mergeMemoryEntries(
  acc: MemoryEntry[],
  incoming: MemoryEntry[],
  pluginName: string,
  sourceOwners: SourceOwners,
): void {
  for (const entry of incoming) {
    let existing = acc.find((e) => e.name === entry.name);
    if (!existing) {
      existing = { name: entry.name, sources: [] };
      acc.push(existing);
    }
    for (const src of entry.sources) {
      const key = ownerKey(entry.name, src.name);
      const owner = sourceOwners.get(key);
      if (owner) {
        throw new Error(
          `memory ${entry.name}: source "${src.name}" already contributed by plugin "${owner}" — plugin "${pluginName}" cannot reuse that source name in the same memory`,
        );
      }
      sourceOwners.set(key, pluginName);
      existing.sources.push(src);
    }
  }
}
