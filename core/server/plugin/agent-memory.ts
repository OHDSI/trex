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

// ---------------------------------------------------------------------------
// Task 2: curated-op mapping + tool/skill renderers (pure — no I/O; Task 3
// wires these into files on disk).
//
// A linked memory is never exposed to an agent as the raw gbrain MCP surface
// (full CRUD, admin ops, etc.) — only a small curated subset, namespaced
// `<memoryName>_<op>` so multiple linked memories can't collide with each
// other or with hand-authored tools. `mode: "read"` gets search/recall/
// get_page; `mode: "readwrite"` additionally gets `capture` (put_page), the
// only write path — an agent can never overwrite a page it didn't write,
// since captures always land under the agent's own `default` source (see
// renderMemorySkill's body).
export interface MemoryOpSpec {
  // Tool-name suffix, e.g. "search" -> tool "<memoryName>_search".
  op: string;
  // Full tool name for a given memory link, e.g. "d2e" -> "d2e_search".
  tool: (memoryName: string) => string;
  // The gbrain MCP tool this curated op forwards to (see gbrain's
  // src/mcp/dispatch.ts tool names: query/recall/get_page/put_page).
  gbrainOp: string;
  description: string;
  // JSON Schema object (matches the shape real eve tools use — see
  // eve-shim/tools.ts's ToolDef.inputSchema and testdata/toy-agent's
  // tools/echo.ts — not a zod schema).
  inputSchema: Record<string, unknown>;
}

const READ_OPS: MemoryOpSpec[] = [
  {
    op: "search",
    tool: (name) => `${name}_search`,
    gbrainOp: "query",
    description: "Keyword-search this memory's pages.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query." },
        limit: { type: "number", description: "Max results (optional)." },
      },
      required: ["query"],
    },
  },
  {
    op: "recall",
    tool: (name) => `${name}_recall`,
    gbrainOp: "recall",
    description: "Recall relevant facts/notes from this memory for a query.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to recall." },
      },
      required: ["query"],
    },
  },
  {
    op: "get_page",
    tool: (name) => `${name}_get_page`,
    gbrainOp: "get_page",
    description: "Fetch a single page from this memory by its slug.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string", description: "Page slug." },
      },
      required: ["slug"],
    },
  },
];

const CAPTURE_OP: MemoryOpSpec = {
  op: "capture",
  tool: (name) => `${name}_capture`,
  gbrainOp: "put_page",
  description:
    "Capture a durable fact or note into this memory (lands in the agent's own 'default' source; never overwrites imported knowledge).",
  inputSchema: {
    type: "object",
    properties: {
      slug: { type: "string", description: "Page slug to write." },
      content: { type: "string", description: "Page content (markdown)." },
    },
    required: ["slug", "content"],
  },
};

export function curatedOps(mode: AgentMemoryMode): MemoryOpSpec[] {
  return mode === "readwrite" ? [...READ_OPS, CAPTURE_OP] : [...READ_OPS];
}

// Renders the TS source for `tools/<memoryName>_<op>.ts` — an eve `defineTool`
// whose `execute` forwards the call as a JSON-RPC `tools/call` for the
// underlying gbrain op to this memory's MCP endpoint. Kept as a single
// self-contained file (no shared helper module) since agent tool dirs are
// staged/copied independently per agent (see agents.ts's
// buildAgentWorkerConfig) — a shared import would need its own staging step.
export function renderMemoryTool(memoryName: string, spec: MemoryOpSpec): string {
  const toolName = spec.tool(memoryName);
  return `// GENERATED by agent-memory.ts (agent-linked-memory) — do not hand-edit.
// Curated tool "${toolName}": forwards to memory "${memoryName}"'s gbrain op
// "${spec.gbrainOp}" over JSON-RPC (MCP tools/call).
import { defineTool } from "eve/tools";

async function callMemory(gbrainOp: string, args: Record<string, unknown>): Promise<unknown> {
  const base = Deno.env.get("MEMORY_MCP_URL");
  const token = Deno.env.get("GBRAIN_MEMORY_TOKEN");
  if (!base || !token) {
    return { error: "memory tool misconfigured: MEMORY_MCP_URL/GBRAIN_MEMORY_TOKEN not set" };
  }
  try {
    const res = await fetch(\`\${base}/memory/${memoryName}/mcp\`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: \`Bearer \${token}\`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: gbrainOp, arguments: args },
      }),
    });
    if (!res.ok) {
      return { error: \`memory "${memoryName}" ${spec.gbrainOp} failed: HTTP \${res.status}\` };
    }
    const body = await res.json();
    if (body?.error) {
      return { error: \`memory "${memoryName}" ${spec.gbrainOp} failed: \${JSON.stringify(body.error)}\` };
    }
    return body?.result;
  } catch (e) {
    return { error: \`memory "${memoryName}" ${spec.gbrainOp} threw: \${e instanceof Error ? e.message : String(e)}\` };
  }
}

export default defineTool({
  description: ${JSON.stringify(spec.description)},
  inputSchema: ${JSON.stringify(spec.inputSchema, null, 2)},
  execute: (args) => callMemory(${JSON.stringify(spec.gbrainOp)}, args as Record<string, unknown>),
});
`;
}

// Renders the markdown for `skills/<memoryName>-memory.md` — a flat-file eve
// skill (matches testdata/toy-agent's skills/greeting-style.md shape: a
// `description:` frontmatter field, then a body). loader.ts's
// parseSkillDescription reads the frontmatter `description:` field first, so
// that's where the one-liner shown in the system prompt must live.
export function renderMemorySkill(link: AgentMemoryLink): string {
  const readOnly = link.mode === "read";
  const description = `Use the "${link.name}" knowledge brain — search/recall it before answering domain questions.${
    readOnly ? " (read-only)" : ""
  }`;
  const bodyLines = [
    `# ${link.name} memory`,
    "",
    `This agent is linked to the "${link.name}" knowledge brain.`,
    "",
    `- Before answering a domain question this brain might cover, call \`${link.name}_search\` (keyword) or \`${link.name}_recall\` (relevant facts) first.`,
    `- Use \`${link.name}_get_page\` once search/recall points you at a specific page slug and you need its full content.`,
  ];
  if (readOnly) {
    bodyLines.push(
      "",
      `This link is read-only: there is no capture tool for "${link.name}" — do not attempt to write to it.`,
    );
  } else {
    bodyLines.push(
      "",
      `- Call \`${link.name}_capture\` to record a durable fact or note worth keeping for next time — reserve it for durable facts only, not scratch work.`,
      `- Captures always land in this agent's own "default" source; they never overwrite imported knowledge already in "${link.name}".`,
    );
  }
  return `---
description: ${description}
---

${bodyLines.join("\n")}
`;
}

// ---------------------------------------------------------------------------
// Task 3: stages the rendered tools/skills for each linked memory into the
// agent's own staged directory (see agents.ts's buildAgentWorkerConfig for
// where `stagedAgentDir` comes from). All I/O is confined to
// `stagedAgentDir` — this never touches anything outside it.
export async function generateMemoryArtifacts(
  stagedAgentDir: string,
  links: AgentMemoryLink[],
): Promise<void> {
  const toolsDir = `${stagedAgentDir}/tools`;
  const skillsDir = `${stagedAgentDir}/skills`;
  await Deno.mkdir(toolsDir, { recursive: true });
  await Deno.mkdir(skillsDir, { recursive: true });

  for (const link of links) {
    for (const spec of curatedOps(link.mode)) {
      const toolName = spec.tool(link.name);
      const toolPath = `${toolsDir}/${toolName}.ts`;
      // Collision guard: an agent may have hand-authored a tool of this
      // exact name — never clobber it.
      let exists = true;
      try {
        await Deno.stat(toolPath);
      } catch (e) {
        if (e instanceof Deno.errors.NotFound) {
          exists = false;
        } else {
          throw e;
        }
      }
      if (exists) {
        throw new Error(
          `agent-memory: refusing to overwrite hand-authored tool "${toolPath}" ` +
            `(collides with generated memory tool "${toolName}" for link "${link.name}")`,
        );
      }
      await Deno.writeTextFile(toolPath, renderMemoryTool(link.name, spec));
    }

    const skillPath = `${skillsDir}/${link.name}-memory.md`;
    await Deno.writeTextFile(skillPath, renderMemorySkill(link));
  }
}
