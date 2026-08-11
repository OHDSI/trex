# devx (Code) agent evals

Eve-convention eval suite (`core/server/agents/README.md` §Evals). One eval
per `*.eval.ts` file; the file path is the eval id.

## Eval catalog — 34 evals across 11 families

| Family | Count | Eval ids | What it covers |
|---|---|---|---|
| `smoke/` | 3 | `reply`, `multi-turn`, `persona` | Basic liveness: single-turn reply, session continuity across turns, and the agent's persona/system-prompt identity ("Code"). |
| `tools/files/` | 6 | `read`, `write`, `edit`, `glob`, `grep`, `code-search` | Each of the six file/code tools (`Read`/`Write`/`Edit`/`Glob`/`Grep`/`CodeSearch`) invoked for real against the seeded `fixture/` workspace. |
| `tools/git/` | 3 | `git-log`, `git-diff`, `git-commit` | `GitLog`/`GitDiff`/`GitCommit` against a real git repo seeded at the workspace root (see "Known-flaky" for the run-order gotcha). |
| `tools/sql/` | 2 | `database-schema`, `execute-sql` | `DatabaseSchema`/`ExecuteSQL` against a real `devx_app_eval` Postgres schema; `execute-sql` needs the raw-HTTP `metadata.chatId` workaround (see below). |
| `tools/tasks/` | 2 | `task-create`, `cron-list` | `TaskCreate`+`TaskList` (needs the same `chatId` workaround) and `CronList`; uncovered a real missing-migration product bug (`devx.agent_todos`/`devx.scheduled_tasks`), fixed by `V12__task_cron_tables.sql`. |
| `tools/web/` | 1 | `web-fetch` | `WebFetch` against a real external URL (`https://example.com`) — needs outbound network, see "Known-flaky". |
| `modes/` | 4 | `default-allows`, `ask-blocks-mutation`, `plan-restricted`, `build-no-tools` | `agent.ts`'s `filterTools` mode gating (default/ask/plan/build), all needing the `metadata.mode` raw-HTTP workaround except `default-allows`. |
| `subagents/` | 2 | `code-explorer`, `code-reviewer` | Genuine dispatch through the built-in `agent` tool to a named subagent, verified against real subagent output artifacts (not just a tool-call assertion). |
| `skills/` | 6 | `load-testing-d2e-ui`, `load-testing-d2e-functions`, `load-testing-d2e-flows`, `load-d2e-ui-preview`, `load-screenshotting-mockups`, `load-documenting-d2e-features` | The built-in `load_skill` tool (`t.loadedSkill(...)`) loads the correct skill for a UI-verify/screenshot, function-test, flow-run, live-preview, mockup-capture, or document-the-feature task — covering #163's new d2e testing skills, the #163/#166 preview-vs-screenshot split, the mockup-screenshot flow, and the docs-update flow. Added after #147; see "skills/ family" below. |
| `quality/` | 3 | `explanation-quality`, `plan-quality`, `code-change-quality` | LLM-as-judge (`t.judge.autoevals.closedQA(...).gate()`) rubric checks — the first evals in the suite with a real judge model wired in (see "Judge-based quality evals"). |
| `errors/` | 2 | `read-missing-file`, `sql-error` | A tool call that genuinely errors (missing file / missing table) is surfaced honestly in the reply rather than hallucinated around; judged, plus asserts `calledTool(name, { status: "pending" })` (a real harness quirk — see below). |

Total: 3 + 6 + 3 + 2 + 2 + 1 + 4 + 2 + 6 + 3 + 2 = 34.

> The 28 → 34 additions are the `skills/` family. They were added after #147,
> to cover the d2e testing skills #163 introduced (`testing-d2e-ui`,
> `testing-d2e-functions`, `testing-d2e-flows`, `d2e-ui-preview`), which the
> original suite never exercised — it tests the built-in `agent` tool
> (`subagents/`) but never the built-in `skill`/`load_skill` tool. They have not
> yet been run against a live stack from this worktree (`node_modules` not
> installed here); the historical "28/28" run records below predate them. Run
> `npm run eval -- skills` to confirm.

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
- **Model resolution** (verified up to the provider call, 2026-07-13; changed
  since): at verification time, with no `devx.settings`/`devx.provider_configs`
  row the agent fell back to a hardcoded anthropic/claude-sonnet-4-20250514
  default and the worker env's `ANTHROPIC_API_KEY` (a raw turn failed with
  exactly `AI_LoadAPIKeyError: Anthropic API key is missing` when no key was
  set). That silent fallback has been REMOVED — `resolveModel` now throws
  `"devx: no model provider configured"` when the user has neither row, so the
  eval user's seeded `devx.settings` row (see "Model auth setup" below) is a
  hard prerequisite for every turn, not just for choosing bedrock.

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

### Mode-filtering fixture (`modes/` — ask/plan/build/default)

Verified live, plan Task 10, 2026-07-13. `plugins/devx/agent/agent.ts`'s
`filterTools` hook (`:164-195`) keys off `metadata.mode` — a raw HTTP
request field, exactly the same structural gap as `ExecuteSQL`'s `chatId`
and `TaskCreate`'s `chatId` above: `t.send()`'s `SendTurnPayload` has no
`metadata` field at all, so a plain `t.send()` turn can never exercise
`ask`/`plan`/`build` mode filtering. `evals/modes/helpers.ts` factors the
same `t.target.fetch("/eve/v1/session", { metadata: { mode } })` +
`t.target.attachSession()` workaround as `execute-sql.eval.ts`/
`task-create.eval.ts` into one shared `sendWithMode(t, message, mode)`
helper (three of the four mode evals import it); `default-allows.eval.ts`
is the exception — absent/unknown mode is exactly what a plain `t.send()`
already produces (no metadata field sent at all), so it drives its turn
normally and needs no workaround.

Each eval's tool choice is deliberate, not incidental. `PLAN_MODE_TOOLS`
(transcribed at `agent.ts:23-31`, re-verified against that source before
writing these evals) allows `Read` but excludes `DatabaseSchema` even
though `DatabaseSchema` is just as read-only (`modifiesState: false`,
`defaultConsent: "always"`, no sticky consent row needed) — `ask` mode's
`filterTools` branch only drops `modifiesState: true` tools (plus the
built-in `agent` tool), so it allows `DatabaseSchema` through where `plan`
mode blocks it. Using `DatabaseSchema` (not just `Write`) as the second
probe tool in `ask-blocks-mutation.eval.ts`/`plan-restricted.eval.ts` is
what makes "ask" and "plan" pairwise distinguishable — a design that only
ever tried `Read`+`Write` per mode would pass identically under either
mode's real semantics or a bug that collapsed ask mode into plan mode's
narrower allowlist. `build-no-tools.eval.ts` asserts the real
`session.usedNoTools()` gate (not a manual event scan) plus a negative
content check (the reply must not leak the fixture codeword, since the
agent has no way to have actually read it). See `task-10-report.md` for the
full per-eval assertion rationale.

No new sticky consent rows were needed: `Write`'s `always` row already
existed (from the `tools/files` family) and is reachable only from
`default-allows.eval.ts` (the only mode of the four where `Write` is
actually offered to the model); `DatabaseSchema` needs none regardless of
mode.

### Error-handling evals (`errors/` — task 13)

Verified live, plan Task 13, 2026-07-13. `read-missing-file.eval.ts` and
`sql-error.eval.ts` check that a failed tool call is surfaced honestly in
the reply rather than hallucinated around, using the real judge API (see
"Judge-based quality evals" above) — the plan-stage brief again put a
`judge:` rubric string directly on `defineEval`; both files instead call
`t.judge.autoevals.closedQA(criteria).gate()` inside `test(t)`, same shape
as `quality/*.eval.ts`.

`sql-error.eval.ts` needs `ctx.chatId` for `ExecuteSQL` exactly like
`tools/sql/execute-sql.eval.ts` (same `t.target.fetch()` +
`t.target.attachSession()` workaround, reusing seed.sh's fixture
`EVAL_CHAT_ID`/`devx_app_eval` schema) — otherwise the tool would fail
before ever reaching Postgres (`ctx.chatId` resolving to `""`), which would
make the eval pass for the wrong reason. `t.succeeded()`/`session.succeeded()`
holds in **both** files: a tool call erroring does not fail the turn on
this stack — the agent catches the error and replies describing it, and
the turn/session itself completes normally.

**Live-stack gotcha found here, not anticipated by the brief**:
`t.calledTool(name)` defaults to matching only `status: "completed"`
(`match.js`'s `toolCallMatches`: `e.status !== (t.status ?? "completed")`).
Inspecting the raw event ndjson for a passing vs. a failing tool call shows
why the default (and even an explicit `status: "failed"`) never matches an
erroring call here: a successful call emits an `action.result` event with
`status: "completed"`, but a call that errors (missing file / missing
table) emits **no `action.result` event at all** — the agent folds the
error straight into its text reply without ever completing the action on
the event stream. `eve`'s `derive-run-facts.js` seeds every tool call's
derived status as `"pending"` from the `actions.requested` event and only
updates it when a matching `action.result` arrives, so an
error-without-`action.result` call is permanently stuck at `"pending"` from
the harness's point of view — not `"failed"`. Both evals assert
`t.calledTool(name, { status: "pending" })` accordingly. Verified live:
`{ status: "failed" }` fails with the identical "expected a matching call"
message as no `status` option at all; `{ status: "pending" }` passes.

Verified the judge gate is real, not a soft no-op: temporarily inverting
`read-missing-file`'s criteria to demand a fabricated "file was read
successfully" reply scored 0 and failed the gate
(`npm run eval -- errors/read-missing-file` → `Gates: 2 passed, 1 failed`,
`✗ judge.autoevals.closedQA`); reverting back to the honest-error criteria
passes 3/3 again.

No new sticky consent rows needed: `Read` is `defaultConsent: "always"`
(read-only); `ExecuteSQL`'s row already exists from the `tools/sql` family
(task 7).

## skills/ family (added post-#147, for #163)

Four evals asserting the agent loads the right d2e skill for a task. Each is a
plain `t.send()` in default mode followed by `t.loadedSkill("<name>")` — eve
0.19 sugar for `calledTool("load_skill", { input: { skill: "<name>" } })` (the
built-in `load_skill` tool is present whenever `agent.skills.length > 0` and is
offered in default/ask mode; it is dropped in plan/build mode, so these evals
stay in default mode). Skills are discovered by core's loader via the
`plugins/devx/agent/skills -> ../skills` symlink; the five d2e skills
(`d2e`, `d2e-ui-preview`, `testing-d2e-ui`, `testing-d2e-functions`,
`testing-d2e-flows`) live under `plugins/devx/skills/`.

- `load-testing-d2e-ui` — a "verify/screenshot my d2e UI change" ask loads
  `testing-d2e-ui` (build + overwrite served resources → drive `:41100`).
- `load-d2e-ui-preview` — an "open the live hot-reload preview" ask loads
  `d2e-ui-preview` instead. Together with the previous eval this pins the
  #163/#166 split: screenshot/verify ≠ dev-server preview.
- `load-testing-d2e-functions` / `load-testing-d2e-flows` — a "run/test my d2e
  function/flow locally" ask loads the matching skill.
- `load-screenshotting-mockups` — a "capture the prototypes/ mockups as PNGs"
  ask loads `screenshotting-mockups` (the file://-based capture flow claw's
  `present-mockups` skill drives), not `testing-d2e-ui`/`d2e-ui-preview`.
- `load-documenting-d2e-features` — a "document the implemented feature" ask
  loads `documenting-d2e-features` (the docs/website update flow behind the
  UI's Docs Update check and claw's "Docs update" option).

**No new live-stack infra**: skill loading is read-only (no `agents.tool_consents`
row), needs no `chatId`/`mode` metadata workaround, and runs against the
already-seeded workspace — the cheapest additive family in the suite.

**Not yet live-verified from this worktree** (`node_modules` absent here). The
one thing to confirm on the first live run: the model may satisfy some d2e tasks
by absorbing the skill's guidance without a discrete `load_skill` call, in which
case `loadedSkill(...)` (a gate) fails legitimately — if that happens, either the
prompt needs to more explicitly ask "which skill applies here?", or the
assertion should soften to a `t.judge.autoevals.closedQA(...)` rubric on the
reply (the judge model is already wired in `evals.config.ts`). Verify with
`npm run eval -- skills`.

## Bedrock prompt caching (task 15)

Verified live, 2026-07-13. Every turn resends the agent's stable prefix — the
system prompt plus all authored tool JSON schemas — on every model step; this
was previously never cached (usage objects only ever carried
`inputTokens`/`outputTokens`). `core/server/agents/service/model.ts` now
exports `withBedrockCachePoint(model, system)`, called from both
`streamText` sites (`runner.ts`'s primary turn loop and `toolset.ts`'s
`runSubagent`): when `model.provider === "amazon-bedrock"` it wraps the
plain `system` string in a `SystemModelMessage` with
`providerOptions: { bedrock: { cachePoint: { type: "default" } } }`; for
every other provider (anthropic/openai/google) it returns the string
unchanged — a true no-op, verified by `deno test` staying green across the
whole `agents/service` suite (73/73) with no provider-specific test changes
needed.

**Why a cache point on `system` alone also covers `tools`**: the installed
`@ai-sdk/amazon-bedrock@^4.0.115` (resolves to 4.0.133 in the dx image's npm
set) has no mechanism to attach a cache point to the `tools` array itself —
`bedrock-prepare-tools.ts`'s `prepareTools()` never constructs one, even
though `BedrockCachePoint` is a valid `tools[]` member type. Bedrock's
Converse API builds an Anthropic model's context in the fixed order
`tools -> system -> messages` (same ordering Anthropic's own prompt-caching
docs describe), so a cache point on the system block caches everything
before it too — tool definitions included — as long as both are
byte-identical across requests, which they are here (deterministic per
agent+metadata+turn). This was confirmed empirically, not just by reading
docs: see the before/after numbers below, where `cacheReadInputTokens` on a
warm cache accounts for essentially the entire request (tools+system+small
per-turn overhead), not just a system-prompt-sized slice.

**Bearer-fetch compatibility (brief's caveat 3)**: `bedrockModel()`'s custom
`fetch` (dummy-credential bearer auth) only rewrites `parsed.messages` (it
injects a `"."` text part into tool-only assistant messages); it never
touches `parsed.system`, so the cache-point marker Bedrock actually receives
is untouched by that rewrite. Confirmed live, not just by reading the fetch
code: the AFTER runs below show real `cacheReadInputTokens`/
`cacheWriteInputTokens` values, which could only appear if the marker
reached Bedrock intact through that custom fetch.

**Before/after (same evals, live dx stack, `us.anthropic.claude-sonnet-4-6`
via bedrock bearer-token auth)**. BEFORE (`.eve/evals/2026-07-13T15-14-51`,
pre-change): usage objects never carry a cache field at all.

| eval | turn/step | inputTokens | outputTokens | cacheReadInputTokens | cacheWriteInputTokens |
|---|---|---|---|---|---|
| smoke/multi-turn | turn 1 | 12519 | 22 | *(absent)* | *(absent)* |
| smoke/multi-turn | turn 2 | 12562 | 7 | *(absent)* | *(absent)* |
| tools/files/edit | turn 1 (2 steps) | 38050 | 174 | *(absent)* | *(absent)* |

AFTER, cold cache (`.eve/evals/2026-07-13T15-29-59`, first request after the
change — establishes the cache):

| eval | turn/step | inputTokens | outputTokens | cacheReadInputTokens | cacheWriteInputTokens |
|---|---|---|---|---|---|
| smoke/multi-turn | turn 1 | 12519 | 24 | 0 | 12181 |
| smoke/multi-turn | turn 2 | 12564 | 7 | 12181 | 0 |
| tools/files/edit | turn 1 (2 steps) | 38050 | 174 | 24362 | 12181 |

Turn 1 of `smoke/multi-turn` pays a one-time `cacheWriteInputTokens: 12181`
(writing the tools+system prefix into the cache — nothing to read yet);
turn 2 of the SAME session reads that same 12181 tokens back
(`cacheReadInputTokens: 12181`, `cacheWriteInputTokens: 0`) instead of
resending them. `inputTokens` (the SDK's total-including-cache figure,
`noCache + cacheRead + cacheWrite`) stays roughly constant — the reduction
shows up in the cache-read/write split, not in that total: turn 2's
non-cached remainder is `12564 - 12181 = 383` tokens (just the per-turn user
message and bookkeeping), down from the full ~12.5k prefix a cold call pays.

AFTER, warm cache (`.eve/evals/2026-07-13T15-34-17`, a later full-suite run
within the same ~5-minute Bedrock cache TTL window — every eval in the run
benefits, not just the second turn of one session):

| eval | turn/step | inputTokens | outputTokens | cacheReadInputTokens | cacheWriteInputTokens |
|---|---|---|---|---|---|
| smoke/multi-turn | turn 1 | 12519 | 15 | 12181 | 0 |
| smoke/multi-turn | turn 2 | 12555 | 7 | 12181 | 0 |
| tools/files/edit | turn 1 (2 steps) | 38050 | 174 | 36543 | 0 |
| tools/files/write | turn 1 | 25178 | 88 | 24362 | 0 |

`runner.ts`'s persisted `usage` object was extended to surface
`cacheReadInputTokens`/`cacheWriteInputTokens` (re-expressed from ai@6's
`totalUsage.inputTokenDetails.cacheReadTokens`/`cacheWriteTokens` under the
provider-raw names) alongside the existing `inputTokens`/`outputTokens` —
this is what makes the numbers above visible in `.eve/evals/<ts>/*.ndjson`
at all; previously the cache breakdown was silently dropped even when the
provider returned it.

**Full suite stayed green**: `npm run eval` (all 28 evals) passed 28/28 both
before and after this change — the message-shape change (plain string ->
`SystemModelMessage` for bedrock only) caused no behavior regression.

**Live application**: `fix-agent-mount.sh` gained a 6th step that syncs
`core/server/agents/service/` (the whole dir, not just the three files this
task touches) from the checkout into the staged worker dir — core's agent
staging only copies this dir into a NEW worker's servicePath at
worker-creation time (see "Known live-stack gaps" below), so edits here
never reach an already-running worker without either this sync + a fresh
worker, or a full trex container restart. Verified live: two staged dirs
existed at once mid-task (`/tmp/trex-agents-*`, one stale from before this
task's edits) — `fix-agent-mount.sh`'s `head -1` pick only patches the
alphabetically-first one, so after any edit here, restart the trex
container (`docker compose -f docker-compose.dx.yml restart trex`) to force
exactly one fresh staging dir, THEN run `fix-agent-mount.sh` against it,
before the first request.

## Worker-staging exclusion for `evals/` (task 14)

**Finding**: `buildAgentWorkerConfig` (`core/server/plugin/agents.ts:118-119`,
pre-task-14) staged the agent dir with an unfiltered recursive copy:

```ts
const stagedAgentDir = `${tmp}/agent`;
await copyDirRecursive(agentDir, stagedAgentDir);
```

`copyDirRecursive` (`agents.ts:59-69`, pre-task-14) had no skip/exclusion
mechanism at all — it walked every entry in `src` unconditionally. `agentDir`
resolves to `plugins/devx/agent` (the plugin's declared `dir: "agent"`), and
this eval suite lives inside that same tree at
`plugins/devx/agent/evals/` — a real, on-disk sibling of `agent.ts`,
`instructions.md`, `tools/`, etc., not a separate location. So **every**
worker registration (every `buildAgentWorkerConfig` call, i.e. every trex
boot/restart that registers the devx agent, and every test that exercises
`buildAgentWorkerConfig` against the real `plugins/devx` dir — see
`core/server/plugin/agents.test.ts`'s "manifest" test) copied the entire
`evals/` subtree — including its own `node_modules` (`@ai-sdk/amazon-bedrock`,
`eve`, and everything else `plugins/devx/agent/evals/package.json` pulls in;
~100MB on disk) and its `.eve/` run-artifact directory — into the worker's
temp `servicePath`, even though nothing under `TREX_AGENT_DIR` (the staged
copy) is ever read by `loader.ts`/`agent.ts` at runtime. This is authoring-time
tooling (this eval suite's own local dev/test harness) with zero runtime
purpose; shipping it into every staged worker is pure waste (disk, copy time)
and a layering violation (an authoring-only tree leaking into what's meant to
be a minimal runtime staging area).

**Change made**: `copyDirRecursive` now takes an optional `skipNames` set,
applied only at the level it's called with (never forwarded into recursive
calls for subdirectories, so a same-named directory nested deeper in the tree
is never accidentally skipped). `buildAgentWorkerConfig` passes a new
`AGENT_DIR_STAGING_EXCLUDES = new Set(["evals"])` constant when staging the
agent dir, so `plugins/devx/agent/evals/` (whichever agent declares it) is
never copied into a worker's servicePath. Covered by a new test,
`buildAgentWorkerConfig excludes the authoring-only evals/ dir from the
staged agent tree` (`core/server/plugin/agents.test.ts`), which runs
`buildAgentWorkerConfig` against the REAL `plugins/devx` dir (not a synthetic
fixture) and asserts `${servicePath}/agent/evals` does not exist on disk
while `${servicePath}/agent/instructions.md` still does.

Scope note: this is a `core/server` code change (the plugin's registration
logic that runs in the main trex process), not an edit to
`core/server/agents/service/**` — it does not need a `fix-agent-mount.sh`
sync to take effect in the running dx stack (that script exists specifically
because `agents/service/**` is staged into an ALREADY-created worker and
image-baked; `agents.ts` itself governs staging at worker-CREATION time, so
it takes effect the next time a worker is created — e.g. after the container
restart already required for other reasons in this task, or the eventual
image rebuild from this branch — not on a running worker).

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

## Core-side unit tests (`core/server`)

This eval suite exercises the devx agent black-box, over HTTP. The
`core/server/agents/**` runtime it targets (and `core/server/plugin/agents.ts`,
which stages it — see "Worker-staging exclusion" above) has its own unit
suite, run separately:

```bash
cd core/server
DATABASE_URL="postgres://postgres:mypass@localhost:65443/testdb" \
  LD_LIBRARY_PATH=/usr/local/lib deno test --allow-all --no-check ./agents/
```

`--no-check` is required: `deno task test`'s type-check step fails on an
unrelated, pre-existing error in `d2e-compat/routes.ts` (`Cannot find name
'Buffer'`, present on the base branch before any of this work, confirmed via
`git stash`) — it has nothing to do with agents/evals and blocks type-checking
the whole `core/server` workspace member, not just that one file. `./agents/`
scopes the run to the agent runtime's own tests. Last verified (task 14,
2026-07-14): **114 passed, 0 failed** (includes task 15's 3 new
`model.test.ts` cache-helper cases). `core/server/plugin/agents.test.ts`
(a different workspace path, `./plugin/`, not `./agents/`) is verified the
same way and separately: **15 passed, 0 failed**, including the new
evals-exclusion staging test from "Worker-staging exclusion" above.

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
7. For `quality/` (LLM-as-judge evals, task 12): export `AWS_BEARER_TOKEN_BEDROCK`
   (and optionally `AWS_REGION`) into the shell that runs `npm run eval` —
   `evals.config.ts`'s judge model runs in this Node process, not the
   container, so it needs its own copy of the credential. See "Judge-based
   quality evals" below.

## Running

    cd plugins/devx/agent/evals
    npm install
    set -a; . ../../../../.env; set +a   # runner-side Bedrock judge creds (quality/)
    npm run eval                # full suite
    npm run eval -- tools/git   # single eval or family (directory-prefix match);
                                 # see "Harness API > CLI: single-eval / subdirectory
                                 # filter syntax" below for the full rules.

Results land in `.eve/evals/<timestamp>/summary.json` (`{"passed":N,"failed":M}`)
plus per-eval `*.events.ndjson`. trex does not collect results.

## Authoritative clean run (task 14, 2026-07-14)

Last verified full-suite run, live dx stack, all steps in "Prerequisites"
followed fresh (fix-agent-mount.sh re-applied after a trex container
restart, seed.sh re-run, `EVE_EVAL_AUTH_TOKEN` re-minted, `AWS_BEARER_TOKEN_BEDROCK`
exported into the runner shell): `.eve/evals/2026-07-13T16-09-27/summary.json`
(UTC timestamp; 2026-07-14 local) —

```json
{"passed":28,"failed":0,"scored":0,"skipped":0,"errored":0,"totalEvals":28}
```

28/28 evals, 82/82 gates, completed in 1m 19s. This run followed the exact
judge-flakiness pattern documented in "Known-flaky" below: the immediately
prior full-suite attempt (after exporting `AWS_BEARER_TOKEN_BEDROCK` for the
first time in this session) came back 25/28, with all 3 failures being
`judge.autoevals.closedQA` gates (`quality/code-change-quality`,
`quality/plan-quality`) plus one `tools/files/edit` failure traced to stale
fixture state from the run before that (the fixture's `FIXTURE_MARKER_EDIT`
marker had already been replaced by an earlier attempt, so the eval's
`Edit` call correctly reported a mismatch against the now-stale expected
text — not a real tool-call regression). Re-seeding
(`plugins/devx/agent/evals/seed.sh`) and re-running the full suite produced
the clean 28/28 above with no code changes.

## Known-flaky

- **`quality/*` and `errors/*` (LLM-as-judge gates) have transient flakiness
  — inherent to LLM-as-judge, not a suite bug.** `t.judge.autoevals.closedQA(...).gate()`
  calls a real Bedrock model to grade the agent's reply against a rubric;
  that grading call occasionally scores a genuinely-fine reply as failing
  (observed: `quality/plan-quality` and `quality/code-change-quality` both
  independently flaked on different full-suite runs during task 15's and
  task 14's verification — one run finished 27/28, another 25/28, each with
  only judge-gated evals in the failure set). Re-running the SAME flaked
  eval(s) alone (`npm run eval -- quality/plan-quality`) passes immediately
  with no code or fixture change, confirming this is judge-score variance,
  not a regression. When a full-suite run comes back short of 28/28, check
  first whether every failure is a `judge.autoevals.closedQA` gate (never a
  `calledTool`/`succeeded`/`includes` assertion) before treating it as a real
  break; if so, reseed (`seed.sh`) and rerun the full suite once — this has
  reliably produced a clean 28/28 every time it's been tried (tasks 13, 15,
  14).
- `tools/web/web-fetch.eval.ts` depends on external network (fetches
  `https://example.com` live) — exclude it when running offline; a
  DNS/connect failure from inside the `trex` container is the expected
  offline failure mode, not a wrong assertion. Verified live, plan Task 9,
  2026-07-13: the dx-stack container has outbound network access (`docker
  compose -f docker-compose.dx.yml exec trex curl -s -o /dev/null -w '%{http_code}'
  https://example.com` → `200`), and the eval passes (3/3 gates) with the
  `WebFetch` tool's `action.result` output showing genuine fetched content
  (`"Example Domain ... This domain is for use in documentation examples
  without needing permission."`), not the model fabricating a plausible
  reply.
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

`judge: EveEvalJudgeConfig` (both on `defineEval` and `defineEvalConfig`) = `{ model: LanguageModel, modelOptions?: AgentModelOptionsDefinition }` — `model` is an AI SDK `LanguageModel`; per `judge.js`'s `formatLanguageModelGatewayId`, string model ids appear to route through the Vercel AI Gateway per the type doc comment ("String model ids route through the Vercel AI Gateway; provider model instances run directly") — the provider-model-instance path (a real `LanguageModel`, not a gateway string) IS now exercised live: see "Judge-based quality evals" below.

**Soft-by-default does NOT gate the exit code — confirmed empirically (task 12).** `closedQA`/etc. record severity `soft` with no threshold by default; `collector.js`'s `computePassed` only defaults a threshold when severity is `gate` (`threshold ?? (severity==='gate' ? 1 : undefined)`), so an un-thresholded soft assertion's `passed` is always `true` regardless of score. Separately, `cli/eval.js` only flips `process.exitCode = 1` for a `scored`-only run (all gates held, a soft assertion missed threshold) when `--strict` is passed — plain `npm run eval` does not. **Net effect: `t.judge.autoevals.closedQA(criteria)` alone never fails a run.** Chain `.gate()` on the returned `AssertionHandle` (`closedQA(criteria).gate()`) to make it a real gate — severity becomes `gate`, default threshold 1, so a "no" verdict (score 0) fails the eval's exit status immediately, no `--strict` needed. Verified live: a deliberately-wrong `closedQA` criteria against `quality/explanation-quality` scored 0 and the run exited 1 (`npm run eval -- quality/explanation-quality; echo $?` → `1`, `Gates: 1 passed, 1 failed`).

### Judge-based quality evals (`quality/` — task 12)

`quality/explanation-quality.eval.ts`, `quality/plan-quality.eval.ts`, `quality/code-change-quality.eval.ts` are the first evals to use `t.judge.autoevals.closedQA(...).gate()`. The plan-stage brief for this task specified `judge: "<rubric string>"` directly on `defineEval`, but a bare `judge` string is not rejected at load time — `validateEvalInput` only rejects legacy top-level `model`/`modelOptions` keys, and a per-eval `judge` string would sit inert. The rubric text belongs at the `closedQA(criteria)` call site inside `test(t)`; `judge` (per-eval or in `evals.config.ts`) only ever configures *which model grades*.

**Judge model wiring.** The judge runs in the Node process executing `npm run eval` (the runner), not inside the trex container — so it needs its own credentials in *this* process's environment, distinct from the container-side agent-under-test's Bedrock setup. The only credential available anywhere in this environment is the Bedrock bearer token (no Anthropic/OpenAI key exists), so `evals/lib/judge-model.ts` replicates `core/server/agents/service/model.ts`'s `bedrockModel()` bearer-token pattern (dummy static credentials bypass SigV4; a custom `fetch` injects `Authorization: Bearer $AWS_BEARER_TOKEN_BEDROCK`) using `@ai-sdk/amazon-bedrock` (added as a direct dependency) and reads the token from `process.env` **lazily, inside the per-request fetch override** — not at module-load time — because `evals.config.ts` (where the resulting model is installed as the default `judge.model`) is loaded unconditionally for every `npm run eval` invocation, including families that never touch `t.judge.*`; throwing eagerly there would break `tools/`, `modes/`, etc. too when the runner shell has no Bedrock token exported. Model id defaults to `us.anthropic.claude-sonnet-4-6` (override with `EVE_JUDGE_MODEL_ID`); region defaults to `us-east-1` (override with `AWS_REGION`), matching the container-side default.

**Runner-shell env requirement.** Before running anything touching `quality/`, export the Bedrock credentials into the shell running `npm run eval` (the repo-root `.env` the container already loads via compose is NOT automatically visible to this process):

    set -a; . ../../../../.env; set +a   # from plugins/devx/agent/evals/
    npm run eval -- quality

**Fixture isolation.** `quality/plan-quality` and `quality/code-change-quality` both target a dedicated `fixture/src/quality-math.ts` (seeded by `seed.sh`, identical content to `fixture/src/math.ts`), NOT the shared `fixture/src/math.ts` that `quality/explanation-quality` reads. This was discovered empirically, not designed upfront: an initial version had all three evals share `math.ts`; a first run passed 3/3, but a second run without reseeding regressed `quality/explanation-quality` because the prior `code-change-quality` run had already added `subtract()` to the shared file, so "exactly two functions, add and multiply" no longer held. Splitting the file fixed the cross-eval pollution (mirrors the same hazard `tools/files/edit.eval.ts`'s dedicated `FIXTURE_MARKER_EDIT` comment documents). `quality-math.ts` itself is still not idempotent across re-runs without reseeding — same as every other mutating eval in this suite (Write/Edit/GitCommit/ExecuteSQL) — reseed before every run per "Prerequisites".

### Local helper `.ts` imports from eval files — confirmed supported

Eval files are not loaded with plain `import()` — `discover.js` calls `loadAuthoredModuleNamespace()` (`node_modules/eve/dist/src/internal/authored-module-loader.js`), which bundles each authored module (any file matching `/\.[cm]?[jt]sx?$/`, which includes `.eval.ts` and any `.ts` it imports) through **Rolldown** (`buildWithNitroRolldown`) before evaluating it. The bundler's plugin set includes `createAuthoredRelativeExtensionResolverPlugin({ extensions: [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json"] })`, which resolves extensionless relative imports (and `./foo/index.ts`-style directory imports) against that list. So `import { seedRepo } from "./helpers/seed.ts"` (or extensionless `"./helpers/seed"`) from inside a `*.eval.ts` file resolves and bundles correctly — **local helper `.ts` files are supported**, one bundle per entry eval file, each resolved relative to the eval file's own directory. Package imports (bare specifiers) resolve against the evals package's own `node_modules` via a package-boundary plugin, with `eve`/`eve/*` always treated as external (never bundled).

### Result artifacts (for completeness, from `runner/artifacts.d.ts` + `types.d.ts`)

Layout is `.eve/evals/<timestamp>/`, matching the skeleton README above. The full `EveEvalRunSummary` shape (not just `{passed, failed}`) is `{ target, results[], startedAt, completedAt, passed, failed, scored, skipped, errored }` — `scored` = gates all held but a soft assertion missed threshold, `errored` = the execution-error subset of `failed` (timeouts/transport/thrown task). `--json` prints this to stdout; `--junit <path>` additionally writes JUnit XML.
