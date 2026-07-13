# devx (Code) agent evals

Eve-convention eval suite (`core/server/agents/README.md` §Evals). One eval
per `*.eval.ts` file; the file path is the eval id.

## Verified facts (live dx stack, plan Task 3, 2026-07-13)

- **Target URL**: `http://localhost:9001/plugins/trex/devx-agent` (port 9001
  confirmed; `/eve/v1/health` 200, `/eve/v1/info` returns
  `"kind":"eve-agent-info"` — but only with auth, see below).
- **Auth is required on the mount** (`pluginAuthz` 401s anonymous requests),
  and the devx agent additionally **rejects anonymous turns** (`agent.ts`
  `resolveModel` throws "devx agent requires an authenticated user"), so the
  plan's "anonymous → workspace base dir" assumption does NOT hold here.
  Two working auth paths, verified live:
  - raw curl probes: `apikey: <auth.serviceRoleKey>` header (admin bypass;
    key: `docker exec trex-dx-postgres-1 psql -U postgres -d testdb -tAc
    "SELECT value #>> '{}' FROM trexdb.setting WHERE key='auth.serviceRoleKey'"`).
    Note service_role CANNOT be sent as a Bearer token — auth-context.ts
    rejects it on that channel by design. Sessions created this way are
    anonymous and their turns always fail (see above); use them only for
    health/info probing.
  - eve runner + real turns: a minted user JWT via `EVE_EVAL_AUTH_TOKEN`
    (the only auth mechanism eve's eval client supports):
    `export EVE_EVAL_AUTH_TOKEN="$(plugins/devx/agent/evals/mint-eval-token.sh)"`.
    The sub MUST be a uuid (`agents.sessions.created_by` and the devx
    tables are uuid-typed; a non-uuid sub fails the turn with
    "invalid input syntax for type uuid").
- **Eval user id**: `6e6a3b1c-0000-4000-8000-0de70e0a1001` (fixed sub baked
  into `mint-eval-token.sh`).
- **Workspace path**: `/tmp/devx-workspaces/<userId>` →
  `/tmp/devx-workspaces/6e6a3b1c-0000-4000-8000-0de70e0a1001` for the eval
  user. Derivation: `plugins/devx/functions/tools/workspace.ts` uses
  `DEVX_WORKSPACE_DIR || "/tmp/devx-workspaces"` and `DEVX_WORKSPACE_DIR` is
  unset in the dx stack (container env verified); the compose file mounts
  the `devx-workspaces` volume at `/tmp/devx-workspaces`. The brief's
  WHEREAMI empirical probe needs a live LLM turn — re-run it once an API
  key is present to double-confirm: ask the agent to `Write` a file named
  `WHEREAMI.txt`, then
  `docker compose -f docker-compose.dx.yml exec trex find /tmp/devx-workspaces -name WHEREAMI.txt`.
- **Model resolution** (verified up to the provider call): with no
  `devx.settings`/`devx.provider_configs` row the agent falls back to
  anthropic/claude-sonnet-4-20250514 and the worker env's
  `ANTHROPIC_API_KEY`. A raw turn walks the full chain (session insert,
  agent load, settings lookup, model spec assembly) and fails with exactly
  `AI_LoadAPIKeyError: Anthropic API key is missing` when no key is set.

### Model auth setup — Bedrock bearer token (recommended, live-verified)

The eval target now routes through AWS Bedrock using an existing bearer
token instead of a per-project Anthropic API key. Verified live end-to-end
(session created → `message.appended`/`message.completed` with reply
`"PONG."` → `turn.completed` → `session.waiting`) on 2026-07-13.

1. Put `AWS_BEARER_TOKEN_BEDROCK=<token>` (and optionally `AWS_REGION`, default
   `us-east-1`) in `./.env` at the repo root (compose auto-loads it; the
   compose file passes both through to the trex service, and core's
   agent-worker `PASSTHROUGH_ENV` — `core/server/plugin/agents.ts` — forwards
   them into the agent worker). Core's `bedrockModel()`
   (`core/server/agents/service/model.ts`) falls back to this env var
   (bearer auth, dummy static credentials) whenever the resolved `ModelSpec`
   has no `apiKey`.
2. Recreate the trex service so it picks up the new env vars:
   `docker compose -f docker-compose.dx.yml up -d trex`, wait for healthy,
   then re-run `plugins/devx/agent/evals/fix-agent-mount.sh` (see "Known
   live-stack gaps" below — worker import map is creation-time).
3. Point the eval user at Bedrock: the devx agent's `resolveModel` hook
   (`plugins/devx/agent/agent.ts:53-72`) checks `devx.provider_configs`
   first, then falls back to the legacy `devx.settings` row — a
   `provider_configs` row, if one exists, takes precedence and must be
   absent/inactive for this to take effect. Insert (or update) the
   `devx.settings` row for the eval user with `api_key` left `NULL` so the
   agent's bedrock branch drops to the env fallback above instead of trying
   to unpack a JSON credential blob from the column:

   ```bash
   PGPASSWORD=mypass psql -h localhost -p 65443 -U postgres -d testdb -c "
   INSERT INTO devx.settings (user_id, provider, model, api_key, base_url)
   VALUES ('6e6a3b1c-0000-4000-8000-0de70e0a1001', 'bedrock', 'us.anthropic.claude-sonnet-4-6', NULL, NULL)
   ON CONFLICT (user_id) DO UPDATE
     SET provider = EXCLUDED.provider,
         model = EXCLUDED.model,
         api_key = EXCLUDED.api_key,
         base_url = EXCLUDED.base_url,
         updated_at = now();
   "
   ```

   (`devx.settings.user_id` has a unique constraint, so this is idempotent —
   safe to re-run after every reseed.)

### Model auth setup — Anthropic API key (alternative)

Put `ANTHROPIC_API_KEY=sk-ant-...` in `./.env` at the repo root (compose
auto-loads it; the compose file passes it through to the trex service and
core's agent-worker `PASSTHROUGH_ENV` forwards it into the agent worker),
then `docker compose -f docker-compose.dx.yml up -d trex` and re-run
`plugins/devx/agent/evals/fix-agent-mount.sh` (see below). Per-user
alternative: seed a `devx.settings` row (`user_id` = the eval user uuid)
with `provider='anthropic'`, `model`, `api_key` via
`psql -h localhost -p 65443 -U postgres testdb` — matches the query at
`plugins/devx/agent/agent.ts:72`.

### Mutating-tool HITL approval — sticky consent (required for Write/Edit evals)

Verified live, plan Task 5, 2026-07-13. `Write` and `Edit` (`plugins/devx/functions/tools/write_file.ts`/`edit_file.ts`, `defaultConsent: "ask"`) run through core's generic `authoredTool` wrapper (`core/server/agents/service/toolset.ts`), which requires human-in-the-loop approval for any tool with `needsApproval`. Read-only tools (Read, Glob, Grep, CodeSearch) don't set this and need no approval. Without a sticky consent on file, the tool call emits an `input.requested` event and then polls `agents.approvals` for up to `approvalTimeoutMs` (default **5 minutes**) before failing with `{"error": "approval timed out"}` — and critically, **`t.send()` blocks for the full poll window** rather than returning early with `t.pendingInputRequests` populated (this agent's tool executor awaits the approval synchronously inside the same request, so there is no way to `t.respondAll()` mid-turn from an eval script; the approval must already be on file before the turn starts).

Fix: pre-seed an "always" sticky consent for the eval user, once per fresh `testdb` (survives container restarts, keyed in Postgres — re-run if the DB volume is ever reset):

```bash
PGPASSWORD=mypass psql -h localhost -p 65443 -U postgres -d testdb -c "
INSERT INTO agents.tool_consents (user_id, plugin, agent, tool, consent)
VALUES
  ('6e6a3b1c-0000-4000-8000-0de70e0a1001', '@trex/devx', 'devx-agent', 'Write', 'always'),
  ('6e6a3b1c-0000-4000-8000-0de70e0a1001', '@trex/devx', 'devx-agent', 'Edit', 'always'),
  ('6e6a3b1c-0000-4000-8000-0de70e0a1001', '@trex/devx', 'devx-agent', 'GitCommit', 'always'),
  ('6e6a3b1c-0000-4000-8000-0de70e0a1001', '@trex/devx', 'devx-agent', 'Bash', 'always'),
  ('6e6a3b1c-0000-4000-8000-0de70e0a1001', '@trex/devx', 'devx-agent', 'ExecuteSQL', 'always')
ON CONFLICT (user_id, plugin, agent, tool) DO UPDATE SET consent = EXCLUDED.consent;
"
```

(`plugin`/`agent` values confirmed from a live `agents.sessions` row for this eval user — `@trex/devx` / `devx-agent`.) With the row present, `store.getToolConsent` short-circuits the approval flow entirely and the tool executes immediately, same as the read-only tools. Any future eval that exercises another `needsApproval` tool needs its own row here — check `defaultConsent`/`modifiesState` on the tool definition in `plugins/devx/functions/tools/` if a new eval hangs for ~5 minutes before failing.

The `GitCommit` and `Bash` rows above were added for the `tools/git/` family
(plan Task 6): of `plugins/devx/functions/tools/git.ts`'s tools, `GitLog`,
`GitDiff`, `GitStatus`, and `GitBranchList` are `defaultConsent: "always"`
(no approval needed), but `GitCommit` (and `GitInit`/`GitBranchCreate`/
`GitBranchSwitch`/`GitRevert`, unused by the current evals) is
`defaultConsent: "ask"` and needs a sticky row exactly like Write/Edit.
`Bash` (`plugins/devx/functions/tools/bash.ts`) is also `defaultConsent:
"ask"`; its row is defensive — the model will reach for `Bash` to run raw
`git` commands (its description explicitly advertises "git operations, ...")
when a task's phrasing implies precision the coarse `GitCommit` tool can't
give (see the `git-commit` note below), and an unconsented `Bash` call hangs
the same 5 minutes as any other unconsented mutating tool.

The `ExecuteSQL` row above was added for the `tools/sql/` family (plan
Task 7): `ExecuteSQL` (`plugins/devx/functions/tools/execute_sql.ts`) is
`defaultConsent: "ask"`/`modifiesState: true`; `DatabaseSchema`
(`plugins/devx/functions/tools/get_database_schema.ts`) is
`defaultConsent: "always"` (read-only, no row needed).

### SQL-tool app-database fixture (`tools/sql/` — ExecuteSQL/DatabaseSchema)

Verified live, plan Task 7, 2026-07-13. Both SQL tools scope every query to
one **app**'s own `devx_app_*` Postgres schema — this is a materially
different context model from every other tool family (which only need
`ctx.workspacePath`, resolved purely from the authenticated `userId`):

- `DatabaseSchema` takes `app_id` as an explicit, required tool argument
  (`get_database_schema.ts`) and does `SELECT schema_name FROM
  devx.app_databases WHERE app_id = $1` with **no ownership check** — any
  caller who knows an `app_id` can introspect its schema.
- `ExecuteSQL` (`execute_sql.ts`) instead resolves the schema from
  `ctx.chatId`: `... FROM devx.app_databases WHERE app_id = (SELECT id FROM
  devx.apps WHERE id IN (SELECT app_id FROM devx.chats WHERE id =
  ctx.chatId))`. `ctx.chatId` comes from `readMetadata(evectx.metadata).chatId`
  (`plugins/devx/agent/lib/context.ts` `toDevxCtx`), verified against the
  authenticated `userId` via `devx.chats.user_id`
  (`verifyChatOwnership`) — and `evectx.metadata` is exactly the raw HTTP
  request's top-level `metadata` field
  (`core/server/agents/service/handler.ts`'s `/eve/v1/session` route reads
  `body.metadata` directly, `startTurn(..., body.metadata, ...)`).

**The blocker**: eve's eval-harness `t.send()` can never populate that
`metadata` field. `SendTurnPayload`
(`node_modules/eve/dist/src/client/types.d.ts`) only carries
`message`/`inputResponses`/`clientContext`/`outputSchema`/`continuationToken`
onto the request body (confirmed in
`node_modules/eve/dist/src/client/session.js`'s `createHandleMessageBody`),
and `clientContext` is a *different* channel — it's rendered as an injected
user-role context message, never surfaced as `ToolContext.metadata`. So a
plain `t.send()` turn always resolves `ctx.chatId` to `""`, and `ExecuteSQL`
fails before running any SQL: `invalid input syntax for type uuid: ""`. This
is a structural gap in the eval harness/tool contract, not a fixture
problem — no amount of pre-seeding a `devx.chats` row fixes it, because
`t.send()` never hands the tool anything to match that row against.

**Fixture** (idempotent; part of `seed.sh`, re-run before every full run
like the rest of the fixture): one `devx.apps` row, one `devx.chats` row
(fixed id, owned by the eval user, pointing at that app), a real
`devx_app_eval` Postgres schema with one seeded table
(`devx_app_eval.widgets`), and a `devx.app_databases` row tying the app to
that schema:

```bash
EVAL_APP_ID="6e6a3b1c-0000-4000-8000-00000000a001"
EVAL_CHAT_ID="6e6a3b1c-0000-4000-8000-00000000c001"
```

(see `seed.sh` for the exact SQL). `database-schema.eval.ts` passes
`EVAL_APP_ID` to the model directly in its prompt (there is no "list apps"
tool in this suite to discover it another way) — this also means the
original brief's `includes("devx")` check passes unmodified, since the
fixture schema is literally named `devx_app_eval`.

**Workaround for `ExecuteSQL`** (`execute-sql.eval.ts`): rather than
`t.send()`, the eval uses two *documented, supported*
`EveEvalTargetHandle` members instead of the session driver — not an eve
internals hack:

1. `t.target.fetch("/eve/v1/session", { method: "POST", body: JSON.stringify({ message, metadata: { chatId: EVAL_CHAT_ID } }) })` —
   "Authenticated fetch against the target base URL" per eve's own type
   doc comment; posts directly to the raw HTTP route with a `metadata` field
   the `ClientSession` wrapper would otherwise strip.
2. `t.target.attachSession(sessionId)` — "Attach to a pre-existing session
   and consume one turn boundary"; returns a full `EveEvalSession` (same
   assertion vocabulary as `t.send()`'s result: `succeeded()`,
   `calledTool()`, etc.) wired into the *same* assertion collector as the
   eval's primary session (confirmed by reading
   `node_modules/eve/dist/src/evals/runner/execute-task.js`: `t.target` is
   `scopeEvalTargetHandle(target, { sessions: <the same EvalSessionManager
   backing t> })`), so gates recorded on the attached session are reported
   exactly like `t`'s own.

Verified live before writing the eval file: a raw `curl -X POST
.../eve/v1/session -d '{"message":"...","metadata":{"chatId":"<EVAL_CHAT_ID>"}}'`
followed by reading the session's event stream showed the tool call's
`action.result` output as `"answer\n------\n42"` — genuine SQL execution
against the fixture schema, not the model doing arithmetic in text (which
is what happens, and silently passes a naive `includes("42")` check on
`t.reply`, if the tool call is left to fail).

`EveEvalSession` has no `.message` field (only `EveEvalTurn`, returned by
`send()`/`respond()`, does) — the eval derives the final assistant text
from the public `session.events` list instead, mirroring eve's own
internal `extractCompletedMessage` (`client/session-utils.js`): the last
`message.completed` event whose `finishReason !== "tool-calls"`.

### Task/Cron-tool fixture (`tools/tasks/` — TaskCreate/TaskList/CronList)

Verified live, plan Task 8, 2026-07-13. Two live-stack gaps here, one a real
product bug and one the same structural harness gap already documented above
for `ExecuteSQL`:

- **Missing tables (real bug, not an eval/fixture problem)**: `TaskCreate`/
  `TaskGet`/`TaskList`/`TaskUpdate`/`TaskStop`
  (`plugins/devx/functions/tools/task_tools.ts`) query `devx.agent_todos`,
  and `CronCreate`/`CronDelete`/`CronList` (`plugins/devx/functions/tools/cron.ts`)
  query `devx.scheduled_tasks` — neither table was ever created by any
  migration (`plugins/devx/migrations/V1__initial_schema.sql` only has
  `devx.todos`, a different table with a different column set, used by
  `update_todos.ts`). Confirmed live: `psql \dt devx.*` showed no
  `agent_todos`/`scheduled_tasks` relation before this task. `TaskCreate`/
  `TaskList` have no `try`/`catch` around their `ctx.sql(...)` calls, so this
  fails the turn outright ("relation ... does not exist"); `CronList` happens
  to catch the error and return a string, which is why it alone would have
  silently "passed" against the broken schema (always reporting zero cron
  jobs) — not a real pass. Fixed with a new forward migration,
  `plugins/devx/migrations/V12__task_cron_tables.sql` (per this project's
  "never edit applied migrations" rule — V1-V11 are untouched), creating both
  tables (`agent_todos`: `id`/`chat_id` FK → `devx.chats`/`content`/`status`/
  timestamps; `scheduled_tasks`: `id`/`chat_id` FK/`user_id`/`schedule`/
  `prompt`/`name`/`created_at`), applied to the live dx-stack Postgres via
  `psql -f` (this dev stack has no migration-tracking table — `CREATE TABLE
  IF NOT EXISTS` is applied directly, idempotently, same as `seed.sh`'s
  fixture SQL).
- **`ctx.chatId` gap (same root cause as `ExecuteSQL` above)**: `TaskCreate`/
  `TaskList` scope every row by `ctx.chatId`, which a plain `t.send()` turn
  always resolves to `""` (no `metadata` field on `SendTurnPayload`) —
  inserting/selecting on an empty-string UUID column fails
  ("invalid input syntax for type uuid"). `task-create.eval.ts` uses the
  identical `t.target.fetch("/eve/v1/session", ...)` +
  `t.target.attachSession()` workaround as `execute-sql.eval.ts`, reusing the
  same fixture `EVAL_CHAT_ID` (`6e6a3b1c-0000-4000-8000-00000000c001`,
  already seeded by `seed.sh` for the `tools/sql` fixture and owned by the
  eval user) so both the `TaskCreate` and `TaskList` tool calls inside the
  one turn see a matching, ownership-verified `chatId`. `CronList` needed no
  such workaround — it scopes only by `ctx.userId` (the authenticated caller,
  never client-supplied metadata), so `cron-list.eval.ts` uses a plain
  `t.send()` like the rest of the suite.
- **No new sticky consent rows**: `TaskCreate`, `TaskList`, and `CronList`
  are all `defaultConsent: "always"` in their tool definitions
  (`task_tools.ts`/`cron.ts`), which `plugins/devx/agent/lib/context.ts`'s
  `wrap()` maps to `needsApproval: false` — none of the three requires an
  `agents.tool_consents` row. (`CronCreate`/`CronDelete` are
  `defaultConsent: "ask"` but are not exercised by either eval in this
  family; a future eval touching them would need rows added here, same
  pattern as `GitCommit`/`ExecuteSQL` above.)

## Known live-stack gaps (`fix-agent-mount.sh`)

The published dx image cannot serve the devx-agent mount as-is — run
`plugins/devx/agent/evals/fix-agent-mount.sh` (from the repo root) after EVERY trex container
(re)start, BEFORE the first request to the mount (the worker boots lazily
and bakes its import map at creation). It patches the staged worker copy
under `/tmp/trex-agents-*` in the container:

1. core's agent staging (`core/server/plugin/agents.ts`) copies only the
   `agent/` dir, but the devx agent imports `../functions/**` → stages the
   plugin's `functions/` dir alongside;
2. the worker cannot fetch remote modules → maps the
   `deno.land/std@0.224.0/path` import to `node:path`;
3. `@ai-sdk/anthropic@latest` resolves to 4.x whose model spec the runtime's
   `ai@6.0.224` rejects ("Unsupported model version v4") → pins 3.0.96;
4. the MCP SDK is not in the image's frozen npm package set → makes
   `dynamic-tools.ts`'s `mcp_manager` import lazy (eval users have no
   `devx.mcp_servers` rows, so it never loads).
5. (found live, plan Task 4) the published image also bakes a pre-rename
   `agent/instructions.md` ("You are DevX...") → overwrites the staged copy
   with this checkout's `plugins/devx/agent/instructions.md` ("You are
   Code..."), via `docker compose cp` from the host (the only one of these
   five fixes pulling from the branch rather than the image). Without this,
   `smoke/persona.eval.ts` fails — not because the eval is wrong, but
   because the live target's system prompt is stale; see "Rename (DevX →
   Code) live verification" below for the same root cause elsewhere.

These are container-local, boot-scoped workarounds; the upstream fixes
(staging the sibling dir + pinning the import map + rebuilding the image
from this branch) are follow-up work.

## Rename (DevX → Code) live verification

- `docker compose -f docker-compose.dx.yml exec trex printenv
  TREX_WEB_NAV_EXTRA | grep -c '"label":"Code"'` → `1` (verified).
- `curl -s http://localhost:9001/trex/api/web-config` returns
  `{"navExtra":[{"path":"/devx","label":"Code",...}]}` — this endpoint is
  what the web shell renders the top-nav from, so the user-visible nav says
  "Code" (verified).
- The SPA `<title>` at `/plugins/trex/devx/` still shows `DevX` on the live
  stack: the published image bakes a pre-rename `dist/` build. The branch
  source has `<title>Code</title>` (`plugins/devx/index.html`); the title
  check passes only after the image is rebuilt from this branch.
- The agent's own self-introduction has the identical problem for the
  identical reason (baked `agent/instructions.md`, not rebuilt from this
  branch) — worked around live by `fix-agent-mount.sh`'s step 5 above, so
  `smoke/persona.eval.ts` passes today, but a real image rebuild is still
  the upstream fix.

## Prerequisites

1. A running dx stack: `docker compose -f docker-compose.dx.yml up -d`
   (from the repo root). First boot on a fresh checkout: `./secrets` is
   created root-owned by Docker while trex-init runs as uid 1000 — if
   trex-init exits 1 with `PermissionDenied ... /shared/root.env`, chown the
   dir (`docker run --rm -v "$PWD/secrets:/shared" alpine chown 1000:1000 /shared`)
   and `up -d` again; the trex container must then be recreated once more
   (`up -d --force-recreate trex`) because compose evaluated the (then
   missing) `secrets/*.env` env_file before trex-init wrote them.
2. The trex container needs model auth configured — either the Bedrock
   bearer token or the Anthropic API key — see "Model auth setup" above.
   Both recipes end with `docker compose -f docker-compose.dx.yml up -d trex`
   (recreates the container), so do this before step 3.
3. `plugins/devx/agent/evals/fix-agent-mount.sh` (from the repo root) — see
   "Known live-stack gaps". Must run AFTER any trex container (re)start,
   including the recreate in step 2.
4. `export EVE_EVAL_AUTH_TOKEN="$(plugins/devx/agent/evals/mint-eval-token.sh)"` — see auth notes.
5. Fixture seeding: `plugins/devx/agent/evals/seed.sh` (from the repo root) — resets the fixture
   workspace AND the `tools/sql/` app-database fixture (idempotent). Run it
   before every full suite run.
6. Sticky tool consent for mutating tools (Write/Edit/GitCommit/ExecuteSQL): the
   `agents.tool_consents` insert in "Mutating-tool HITL approval" above — a
   one-time row per `testdb`, only needed again if the Postgres volume is
   reset. Skipping this doesn't fail the `tools/files/write`/`edit`,
   `tools/git/git-commit`, or `tools/sql/execute-sql` evals outright, but
   makes each hang for the full 5-minute `approvalTimeoutMs` before failing.

## Running

    cd plugins/devx/agent/evals
    npm install
    npm run eval                # full suite
    # single eval / family: <filter syntax documented in step 3 below>

Results land in `.eve/evals/<timestamp>/summary.json` (`{"passed":N,"failed":M}`)
plus per-eval `*.events.ndjson`. trex does not collect results.

## Known-flaky

- `tools/web/web-fetch.eval.ts` depends on external network — exclude it
  when running offline.
- The `tools/git/` family (plan Task 6) has two live gotchas, both worked
  around at the eval-prompt level rather than by relying on run order:
  - **Fixture location**: `GitLog`/`GitDiff`/`GitCommit`
    (`plugins/devx/functions/tools/git.ts`) always operate on
    `ctx.workspacePath` directly — there is no path/cwd parameter to scope
    into a subdirectory. `seed.sh` therefore `git init`s at the workspace
    root (`$EVAL_WS`), with the `fixture/` tree as ordinary tracked content
    inside that repo — NOT a separately-initialized repo nested under
    `fixture/`, which the git tools would never see.
  - **`GitCommit` always stages everything**: `trex_devx_git_commit`
    (`plugins/devx-ext/src/git.rs`) runs `git add -A` unconditionally before
    committing — there is no way, via that tool, to commit only one file.
    Eve's discovered eval order for a directory filter is NOT the CLI's
    positional argument order (verified: `npm run eval -- tools/git/git-log
    tools/git/git-diff tools/git/git-commit --max-concurrency 1` still ran
    `git-commit` first) — it appears to be alphabetical by eval id
    (`git-commit` < `git-diff` < `git-log`), so within a single
    `tools/git` run `git-commit` reliably executes before `git-diff`/
    `git-log` and its `add -A` silently absorbs whatever uncommitted state
    those two evals expect to find. The fix here is that `git-diff.eval.ts`
    creates its own uncommitted change (via `Write`) in the same turn
    instead of relying on `seed.sh`'s pre-seeded pending line surviving
    until it runs, and `git-log.eval.ts` asks for "the commit message that
    mentions the greeting note" rather than "the most recent commit
    message" (which `git-commit`'s new commit would otherwise have become).
    With both evals order-independent, `npm run eval -- tools/git` passes
    3/3 regardless of scheduling — verified across three separate re-seeded
    runs. Still re-run `seed.sh` before every run regardless, since
    `git-commit` mutates the shared repo every time it runs.
  - A related trap: telling the model to commit "ONLY" one file (implying
    `GitCommit` supports partial staging) pushes it toward the `Bash` tool
    instead (`git add <file> && git commit`) to honor that literal
    constraint — which both breaks the `calledTool("GitCommit")` assertion
    and hangs for 5 minutes if `Bash` has no sticky consent row (see above).
    The `git-commit` prompt now just says to use the `GitCommit` tool (and
    not a shell command) without claiming exclusivity.

## Harness API

_Findings below are from inspecting the installed `node_modules/eve@0.19.0`
package directly: `npx eve --help` / `npx eve eval --help`, and reading the
shipped `.d.ts` files under `node_modules/eve/dist/src/evals/**` (the
package ships full type declarations even though the JS is minified/bundled,
so the types below are read from source, not inferred). Confirmed facts are
stated plainly; anything not directly observed is marked UNCONFIRMED._

### CLI: single-eval / subdirectory filter syntax

`npx eve eval --help` output:

```
Usage: eve eval [options] [evalIds...]

Run evals against an eve agent.

Arguments:
  evalIds                Eval ids (or directory prefixes) to run (all discovered
                         evals when omitted)

Options:
  --url <url>            Remote agent URL (skip local host startup)
  --tag <tag...>         Run only evals carrying a tag
  --strict               Fail the exit code when any score falls below its
                         threshold
  --list                 Print discovered evals without running them
  --timeout <ms>         Per-eval timeout in milliseconds
  --max-concurrency <n>  Max concurrent eval executions
  --json                 Output results as JSON
  --junit <path>         Write JUnit XML results to a file
  --skip-report          Skip eval-defined reporters (e.g. Braintrust)
  --verbose              Stream per-eval t.log lines to stdout
  -h, --help             display help for command
```

Confirmed: **filtering is positional, not a flag.** An eval's id is its file
path under `evals/` with the `.eval.ts` suffix stripped (e.g.
`evals/tools/git/commit.eval.ts` → id `tools/git/commit`). Matching, per
`discover.js`'s `matchesEvalFilter`: an id matches a given filter argument
either exactly, or by directory-prefix (`id === filter || id.startsWith(filter + "/")`).
So both of these work directly with `npm run eval` (which already forwards
`--url`) by appending extra positional args after `--`:

```bash
npm run eval -- tools/git/commit        # single eval
npm run eval -- tools/git               # whole subdirectory/family
npm run eval -- tools/git tools/fs      # multiple ids/prefixes at once
```

`--tag <tag...>` is a second, independent filter axis (matches an eval's
authored `tags` array in `defineEval`), usable instead of or combined with
positional ids. `--list` prints discovered ids without running anything —
useful for confirming a filter matches what you expect before a full run.

Per-eval timeout: `--timeout <ms>` on the CLI overrides everything; short of
that, an individual eval can set its own `timeoutMs` in `defineEval({...})`,
and `evals.config.ts`'s `defineEvalConfig({ timeoutMs })` sets the run-wide
default. Precedence (from `EveEvalConfigInput`'s doc comment): eval's own
`timeoutMs` overrides the config default, and `--timeout` overrides both.

### Confirmed members of `t` (`EveEvalContext`, from `evals/types.d.ts`)

`t` is `EveEvalContext`, which extends `EveEvalSessionDriver` (send/session
plumbing) and `EveEvalAssertions` (recorded assertions), plus its own
members. This is the full set — everything below is read directly from the
shipped type declarations, not guessed:

**Own `EveEvalContext` members:**
- `t.signal: AbortSignal` — the eval's timeout signal.
- `t.target: EveEvalTargetHandle` — `{ kind: "local"|"remote", url, capabilities }`, plus `dispatchSchedule()`, `fetch()`, `attachSession()`.
- `t.reply: string | null` — the primary session's last assistant message (this is what `core/server/agents/README.md`'s example checks with `t.check(t.reply, includes(...))`).
- `t.log(message: string)` — structured eval log; shown with `--verbose`.
- `t.sleep(ms?: number)` — defaults to 1s; respects the eval timeout.
- `t.newSession(): EveEvalSession` — an additional independent session against the same target.
- `t.check(value, assertion)` — apply a value-level assertion (from `eve/evals/expect`, e.g. `includes`) to an explicit value. Known-good per the README example: `t.check(t.reply, includes("banana"))`.
- `t.require<T>(value, assertion): Promise<T>` — like `check` but records an immediate gate and aborts dependent control flow on failure.
- `t.skip(reason: string): never` — marks the eval "skipped" and stops the test body.
- `t.judge: JudgeContext` — see "Judge" below.

**`EveEvalSessionDriver` members (session-scoped, shared by `t` and `t.newSession()`):**
- `t.events` — all `HandleMessageStreamEvent`s observed on this session so far.
- `t.pendingInputRequests` — HITL input requests left pending by the last parked turn.
- `t.state` — serializable resume cursor.
- `t.sessionId` — set after the first successful send.
- `t.requireInputRequest(filter?)` — require exactly one pending input request matching filter, or abort.
- `t.respond(...responses)` / `t.respondAll(optionId)` — resolve HITL requests and run the resumed turn; both return `Promise<EveEvalTurn>`.
- `t.send(input: SendTurnInput): Promise<EveEvalTurn>` — the main driver call. `SendTurnInput` is `string | SendTurnPayload` where `SendTurnPayload` = `{ clientContext?, inputResponses?, message?, outputSchema?, signal?, headers? }` (from `client/types.d.ts`). **No `metadata` field exists on `SendTurnPayload`** — see "Metadata" below.
- `t.sendFile(text, filePath, mediaType?)` — send text plus a local file attached as a data URL.

**`EveEvalAssertions` members (available on both `t` directly and on `t.send()`'s returned `EveEvalTurn`):**
- `succeeded()`, `parked()`
- `messageIncludes(token: string | RegExp)`
- `calledTool(name, options?)` — confirmed per the README example.
- `loadedSkill(skill, options?)` — sugar for `calledTool("load_skill", { input: { skill }, ... })`.
- `notCalledTool(name)` — **the negative-assertion accessor** (answers the brief's "extras like a negative-assertion" question).
- `toolOrder(names: string[])` — asserts tool requests appeared in order (gaps allowed).
- `usedNoTools()`, `maxToolCalls(max)`
- `calledSubagent(name, options?)`
- `noFailedActions()`
- `event(type, options?)` / `notEvent(type, options?)` / `eventOrder(matchers)` / `eventsSatisfy(label, predicate)` — low-level stream-event assertions.

Every assertion method returns an `AssertionHandle` (`{ gate(threshold?), soft(threshold?), atLeast(threshold) }`) so severity/threshold can be overridden per-call, e.g. `t.calledTool("echo").soft()`.

**`EveEvalTurn`** (what `t.send()`/`t.respond()`/`t.respondAll()` resolve to) additionally exposes: `data`, `events`, `inputRequests`, `message`, `sessionId`, `status` (`"completed"|"failed"|"waiting"`), **`toolCalls: readonly EveEvalToolCall[]`** — this is the confirmed **tool-call-list accessor** the brief asked about (each entry: `{ name, input, output, status, turnIndex, sessionId? }`), plus `requireToolCall(name, options?)` (record a gate + return the matching call) and `expectOk()`. It also carries `EveEvalOutputAssertions`: `outputEquals(value)`, `outputMatches(schema)`.

### Metadata: eval-config vs. `t.send` — confirmed answer

**Not sendable via `t.send`.** `SendTurnPayload` (the object form of `t.send`'s argument) has no `metadata` field at all — only `clientContext`, `inputResponses`, `message`, `outputSchema`, `signal`, `headers`.

**Eval-level `metadata` exists but is reporter-only, not transmitted to the target agent.** `defineEval({ metadata: {...} })` is accepted (`EveEvalBase.metadata?: Readonly<Record<string, unknown>>`), but grepping `runner/reporters/braintrust.js` shows the only consumer: it's merged (`...t?.metadata`) into the Braintrust experiment log entry for that eval, alongside eve-derived fields (`eveSessionId`, `eveStatus`, `eveToolCalls`, etc.). The console/JUnit reporters and the `.eve/evals/<ts>/summary.json` artifact were not observed to read it. So: eval-config `metadata` is bookkeeping/observability data about the eval run, never part of the request the agent under test receives.

### Judge (`t.judge`) — how it's consumed

`t.judge: JudgeContext` exposes exactly one namespace today: `t.judge.autoevals` (`AutoevalsJudges`), wrapping the `autoevals` npm package (`Factuality`, `Summary`, `ClosedQA`, `Sql` — confirmed in `judge.js`'s imports): `factuality(expected, opts?)`, `summarizes(expected, opts?)`, `closedQA(criteria, opts?)`, `sql(expected, opts?)`. Each records a **soft** assertion by default (chain `.atLeast()`/`.gate()` to change that).

Per-call `opts: JudgeOpts` = `{ on?, model?, modelOptions? }` — `on` defaults to `t.reply` when omitted (confirmed in `judge.js`: `t?.on??a.getReply()`), `model`/`modelOptions` override the resolved judge model for that one call only.

Judge model resolution precedence (confirmed in `judge.js`'s `grade()`): per-call `opts.model` → the eval's own `judge` (`defineEval({ judge: { model } })`) → `evals.config.ts`'s `defineEvalConfig({ judge: { model } })` default. If none is set anywhere, the call throws `"<name> needs a judge model..."` at score time — not at definition time. The judge model is used **only for scoring**, never to drive the agent under test (this is stated explicitly in the type doc comments and structurally true: the judge model is passed straight into the `autoevals` grader call, with no path back into the session driver).

`judge: EveEvalJudgeConfig` (both on `defineEval` and `defineEvalConfig`) = `{ model: LanguageModel, modelOptions?: AgentModelOptionsDefinition }` — `model` is an AI SDK `LanguageModel`; per `judge.js`'s `formatLanguageModelGatewayId`, string model ids appear to route through the Vercel AI Gateway per the type doc comment ("String model ids route through the Vercel AI Gateway; provider model instances run directly") — UNCONFIRMED beyond that doc comment (did not exercise an actual judge call against a real model in this task).

### Local helper `.ts` imports from eval files — confirmed supported

Eval files are not loaded with plain `import()` — `discover.js` calls `loadAuthoredModuleNamespace()` (`node_modules/eve/dist/src/internal/authored-module-loader.js`), which bundles each authored module (any file matching `/\.[cm]?[jt]sx?$/`, which includes `.eval.ts` and any `.ts` it imports) through **Rolldown** (`buildWithNitroRolldown`) before evaluating it. The bundler's plugin set includes `createAuthoredRelativeExtensionResolverPlugin({ extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json"] })`, which resolves extensionless relative imports (and `./foo/index.ts`-style directory imports) against that list. So `import { seedRepo } from "./helpers/seed.ts"` (or extensionless `"./helpers/seed"`) from inside a `*.eval.ts` file resolves and bundles correctly — **local helper `.ts` files are supported**, one bundle per entry eval file, each resolved relative to the eval file's own directory. Package imports (bare specifiers) resolve against the evals package's own `node_modules` via a package-boundary plugin, with `eve`/`eve/*` always treated as external (never bundled).

### Result artifacts (for completeness, from `runner/artifacts.d.ts` + `types.d.ts`)

Layout is `.eve/evals/<timestamp>/`, matching the skeleton README above. The full `EveEvalRunSummary` shape (not just `{passed, failed}`) is `{ target, results[], startedAt, completedAt, passed, failed, scored, skipped, errored }` — `scored` = gates all held but a soft assertion missed threshold, `errored` = the execution-error subset of `failed` (timeouts/transport/thrown task). `--json` prints this to stdout; `--junit <path>` additionally writes JUnit XML.
