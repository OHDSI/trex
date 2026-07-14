// Agent-linked memories (agent-linked-memory design, task 1): parses
// `trex.agents[].memory` entries declared on an agent manifest. Each entry
// links the agent to a declared `memory` plugin brain (see memory.ts) by
// name, with a read/readwrite mode. This module only holds manifest
// normalization — allow-list validation against declared memories and the
// injection of tools/skills/env happen in later tasks.
//
// Same name regex as memory.ts's MEMORY_NAME_RE (no hyphen: a memory name is
// interpolated unquoted into DDL as `memory_<name>`, a Postgres schema
// identifier).
const MEMORY_LINK_NAME_RE = /^[a-z0-9][a-z0-9_]*$/;

export type AgentMemoryMode = "read" | "readwrite";

export interface AgentMemoryLink {
  name: string;
  mode: AgentMemoryMode;
}

export function parseMemoryLinks(value: unknown): AgentMemoryLink[] {
  const arr = Array.isArray(value) ? value : [value];
  const seen = new Set<string>();
  return arr.map((e) => {
    const entry = e as { name?: string; mode?: string };
    if (!entry?.name || !MEMORY_LINK_NAME_RE.test(entry.name)) {
      throw new Error(
        `agents: memory link needs a name (${MEMORY_LINK_NAME_RE}), got ${JSON.stringify(e)}`,
      );
    }
    if (seen.has(entry.name)) {
      throw new Error(`agents: duplicate memory link name "${entry.name}"`);
    }
    seen.add(entry.name);
    const mode = entry.mode ?? "read";
    if (mode !== "read" && mode !== "readwrite") {
      throw new Error(
        `agents: memory link "${entry.name}" has invalid mode ${JSON.stringify(entry.mode)} (must be "read" or "readwrite")`,
      );
    }
    return { name: entry.name, mode };
  });
}
