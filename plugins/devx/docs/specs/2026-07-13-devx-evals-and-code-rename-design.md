# DevX Agent Evals + "Code" UI Rename — Design

Date: 2026-07-13
Status: approved (design), pending implementation plan

## Goal

Two deliverables:

1. Establish a comprehensive eval suite (~28 evals) for the devx agent
   (`plugins/devx/agent/`) — the first agent eval suite in the repo.
2. Rename "DevX" to "Code" in all user-visible text, leaving load-bearing
   identifiers untouched.

## Background / constraints

- Eval convention (from `core/server/agents/README.md` "Evals" section,
  adopted unchanged from eve): an `evals/` directory at the agent root with
  exactly one `evals/evals.config.ts` (`export default defineEvalConfig({})`)
  and one eval per `evals/**/*.eval.ts` file. The file path is the eval id.
  Each eval file exports
  `export default defineEval({ description, judge?, async test(t) {...} })`
  using the harness API: `await t.send("...")`, `t.succeeded()`,
  `t.calledTool("name")`, `t.check(t.reply, includes("..."))` with `includes`
  from `eve/evals/expect`.
- Evals are executed by the real eve CLI against a live trex-hosted agent:
  `npx eve eval --url https://<trex>/plugins/trex/devx-agent`. There is no
  trex-side fallback runner (COMPAT.md records the decision not to build one).
  Results land in `.eve/evals/<timestamp>/summary.json` + per-eval ndjson;
  trex does not collect them.
- Authoring deps pinned per COMPAT.md: `eve@^0.19.0`, `ai@^7`, `zod@^4`.
- The devx agent needs a user with `devx.settings` / `devx.provider_configs`
  rows — `resolveModel` (`plugins/devx/agent/agent.ts`) reads them and
  requires an authenticated `ctx.userId`. The control-server proxy injects
  `x-user-id` for `@trex/`-scoped plugin mounts.
- Chat mode (ask/plan/build) is read from session `metadata.mode`
  (`plugins/devx/agent/agent.ts:165`); sessions accept metadata on
  `POST /eve/v1/session`.

## Part 1 — Rename DevX → Code (user-visible text only)

Change:

- `docker-compose.dx.yml:196` — in `TREX_WEB_NAV_EXTRA`, `"label":"DevX"` →
  `"label":"Code"`. Leave `"path":"/devx"` and `"plugin":"devx"` — those are
  the route and plugin-loader id.
- `plugins/devx/index.html:6` — `<title>DevX</title>` → `<title>Code</title>`.
- `plugins/devx/src/spa.tsx:17` — `DevX failed to load` →
  `Code failed to load`.
- Assistant persona (visible in chat replies):
  - `plugins/devx/functions/prompts.ts:91,471,702,750` — "You are DevX…" /
    "You are DevX Plan Mode…" → "You are Code…".
  - `plugins/devx/agent/instructions.md:2` — "You are DevX, an AI assistant…"
    → "You are Code, an AI assistant…".
- Final sweep: grep the repo for remaining user-visible "DevX" strings
  (including i18n files) and rename any that render in UI or chat.

Do NOT change (load-bearing identifiers):

- Routes/paths: `/devx`, `/devx-api`, `devx-spa.js`/`.css`, the
  `index.html` path regex.
- Package/manifest ids: `@trex/devx`, `trex.agents` name `devx-agent`,
  migrations schema `devx`.
- Backend/infra: `DEVX_WORKSPACE_DIR`, `DEVX_ENCRYPTION_KEY`,
  `trex.devx.token.aes.v1`, `devx.*` DB tables, `/tmp|/var/devx-workspaces`,
  `trexsql-dx` image, "DevX image" CI workflow.
- Internal code identifiers: `Devx*` types/components, `devxId` element ids,
  `devx-lang` localStorage key.
- Borderline, intentionally left: `package.json` description (npm metadata,
  not rendered), User-Agent strings `DevX/1.0` (sent to external servers),
  generated-file comment in `supabase_routes.ts`.

## Part 2 — Eval infrastructure

New files under `plugins/devx/agent/evals/`:

- `evals.config.ts` — `export default defineEvalConfig({})` (from
  `eve/evals`).
- `package.json` — private authoring package pinning `eve@^0.19.0`, `ai@^7`,
  `zod@^4`, with scripts:
  - `"eval": "eve eval --url ${EVE_TARGET_URL:-http://localhost:9001/plugins/trex/devx-agent}"`
    (9001 = trexas UI/API port on the dx stack, 8001 offset by +1000; confirm
    the mount responds on `GET /eve/v1/health` before the first run)
  - optionally `"eval:smoke"` filtered to `smoke/` if the CLI supports
    filtering (verify; drop if not).
- `.gitignore` — `node_modules/`, `.eve/`.
- `README.md` — how to boot the dx stack, seed prerequisites, run the suite,
  interpret `.eve/evals/<ts>/summary.json`, expected token cost, and which
  evals are known-flaky (web).
- `seed.ts` (or `.sh`) — idempotent setup: ensure an eval user exists with
  `devx.settings`/`devx.provider_configs` rows (model + API key from env),
  and provision a small fixture workspace (a few source files + a git repo
  with 2–3 commits) that file/git evals reference. Mutating evals
  (Write/Edit/GitCommit) operate on scratch paths inside the fixture so
  reruns stay deterministic; seed script resets the fixture.

Run harness is manual only (no CI wiring): documented commands against a
local `docker-compose.dx.yml` stack.

Implementation checks:

- Verify `buildAgentWorkerConfig` (`core/server/plugin/agents.ts`) staging
  does not copy `evals/node_modules` into the worker `servicePath`; add an
  exclusion if it does.
- Verify how session `metadata.mode` can be set from the eve eval harness
  (config option or `t.send` options). If the harness cannot set metadata,
  mode evals fall back to driving the raw `/eve/v1/session` HTTP API inside
  `test(t)` and asserting on the event stream.

## Part 3 — Eval catalog (~28 evals)

Directory layout under `plugins/devx/agent/evals/` (file path = eval id):

- `smoke/` (3)
  - `reply.eval.ts` — basic prompt, `t.succeeded()`, reply content check.
  - `multi-turn.eval.ts` — two `t.send` turns; second answer depends on
    context from the first.
  - `persona.eval.ts` — agent introduces itself as "Code" (doubles as a
    rename regression test).
- `tools/files/` (6) — `read`, `write`, `edit`, `glob`, `grep`,
  `code-search`; each asserts `t.calledTool(...)` + a content check against
  the fixture workspace.
- `tools/git/` (3) — `git-log`, `git-diff` (read-only against fixture
  history), `git-commit` (scratch fixture repo).
- `tools/sql/` (2) — `database-schema`, `execute-sql`.
- `tools/tasks/` (2) — task create/list, cron tool.
- `tools/web/` (1) — `web-fetch` against a stable URL; documented as
  flaky/optional (external dependency).
- `modes/` (4)
  - `ask-blocks-mutation` — ask mode: no Write/Edit/agent tool calls.
  - `plan-restricted` — plan mode: only `PLAN_MODE_TOOLS` used.
  - `build-no-tools` — build mode: zero tool calls.
  - `default-allows` — no mode: tools available (framework default).
- `subagents/` (2) — dispatch to `code-explorer` and `code-reviewer` via the
  `agent` tool; assert the dispatch happened and the answer reflects
  subagent output.
- `quality/` (3, judge-based; first use of the `judge` field)
  - `explanation-quality` — explain a fixture module; judge scores accuracy
    and clarity.
  - `plan-quality` — plan-mode plan for a small feature; judge scores
    completeness/actionability.
  - `code-change-quality` — small edit request; judge scores whether the
    change is minimal and correct.
- `errors/` (2) — nonexistent-file read handled gracefully; SQL error
  surfaced sensibly (no crash, informative reply).

Browser tools are intentionally out of scope (require the browser sidecar);
can be a follow-up family.

## Verification

- Evals: boot local dx stack, run seed script, run full suite; iterate on
  flaky assertions until a clean `summary.json` (web eval may be excluded);
  commit the suite only once it passes against a live run.
- Rename: boot the stack; check portal nav shows "Code", tab title "Code",
  error boundary string, and a chat reply where the assistant self-identifies
  as "Code".

## Out of scope

- CI wiring for evals (token cost; revisit later).
- Renaming identifiers, routes, schema, package names.
- Browser-tool evals.
- Eval-result collection/storage inside trex.
