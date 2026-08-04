---
sidebar_position: 8
---

# Skill Plugins

Skill plugins declare **skill packs**: named bundles of agent skills
(markdown + supporting files, optionally MCP connections) that get injected
into agents declared by *other* plugins. Attachment is inverted relative to
[linked memories](./memory-plugins#linking-a-memory-to-an-agent): the **pack
names its target agents**, so you deploy the agent first and skills to it
afterwards — including while the agent is already running.

## Configuration

Declare packs under `trex.skills` in `package.json` (a single object or an
array):

```json
{
  "name": "@trex/ohdsi-skills",
  "trex": {
    "skills": [
      { "name": "ohdsi-cohorts", "dir": "pack", "agents": ["claw", "coder"] },
      { "name": "house-style",   "dir": "style", "agents": ["*"] }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Pack name, `^[a-z0-9][a-z0-9_-]*$` (no `--`, no trailing `-`/`_`). Pack names are a **global namespace** across all installed plugins — a duplicate is a registration error. |
| `dir` | string | Pack directory inside the plugin package. Default `pack`. Relative only (no `..`, no leading `/`). |
| `agents` | array | Target agent names (exact), or `"*"` for every agent on the deployment. Required, non-empty. |

:::warning Trusted scope required
Like agent and memory plugins, `trex.skills` is honored only for
trusted-scope packages (`@trex/`, `@ohdsi/`) — packs inject prompt content
and MCP connections into other plugins' agents. Declarations from other
scopes are skipped.
:::

## Pack layout

Only the directory form of skills is supported, so supporting files travel
with the skill; `connections/` is optional:

```
pack/
  skills/
    cohort-building/
      SKILL.md            # frontmatter `description:` + body — required
      references/*.md     # supporting files, referenced by relative path
  connections/
    atlas.ts              # defineMcpClientConnection(...) — optional
```

Every `skills/<name>/SKILL.md` must carry a frontmatter `description:` line —
it is the one-liner listed in the agent's system prompt. A `skills/` entry
without a `SKILL.md` is skipped, matching the agent loader's behavior.

## Staging and namespacing

For each targeted agent, pack content is staged into the agent's worker
directory at registration time:

- `pack/skills/<skill>/` → `skills/<pack>--<skill>/` — picked up by the
  standard skills discovery, listed in the system prompt, and loaded on
  demand via the built-in `skill` tool.
- `pack/connections/<c>.ts` → `connections/<pack>--<c>.ts` — the MCP
  server's tools surface in the agent's toolset as `<pack>--<c>__<tool>`.

`--` is the reserved separator (don't use it in hand-authored skill names).
The agent's `GET /eve/v1/info` reports provenance per skill in
`skills.static[].pack` (`null` for hand-authored skills).

A pack colliding with a hand-authored file in the agent directory fails
loudly instead of overwriting; at boot this skips just the affected agent,
and a pack directory that fails validation is skipped entirely so it cannot
block targeted agents from registering.

## Deployment lifecycle

- **Boot:** a pre-pass records every declared pack before any plugin is
  dispatched, so scan order between the pack-declaring and agent-declaring
  plugins doesn't matter.
- **Deploy after the agent:** registering a skills plugin at runtime
  re-stages every mounted agent the new packs target and swaps the worker
  over atomically — the next request runs with the new skills, no server
  restart, and sessions (DB-backed) are preserved. Registration errors on
  the dynamic path surface in the server logs.
- **Waiting packs:** a pack targeting an agent that doesn't exist yet simply
  waits; it attaches when such an agent appears.
- **Removal:** uninstalling a skills plugin takes effect at next boot, as
  for every plugin type.
- `"*"` packs apply to agents from any trusted plugin, **including ones
  installed later** — a deployment-wide pack changes other plugins' prompt
  surface by design, so declare it deliberately.

## Example

`plugins/skills-example/` — deploys the `examplepack` pack (a `haiku-mode`
skill with a supporting reference file) to the toy agent:

```json
{
  "name": "@trex/skills-example",
  "trex": {
    "skills": [
      { "name": "examplepack", "dir": "pack", "agents": ["toy"] }
    ]
  }
}
```

Authoring details for the skills themselves (file format, how agents load
them) are covered in the agents runtime guide at `core/server/agents/README.md`
("Skill packs" section) in the source tree.
