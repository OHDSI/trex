# devx (Code) agent evals

Eve-convention eval suite (`core/server/agents/README.md` §Evals). One eval
per `*.eval.ts` file; the file path is the eval id.

## Prerequisites

1. A running dx stack: `docker compose -f docker-compose.dx.yml up -d`
   (from the repo root). The trex container needs `ANTHROPIC_API_KEY` set
   (default model resolution falls back to env when no `devx.settings`
   row exists for the calling user).
2. Fixture seeding: `./seed.sh` (see below) — resets the fixture workspace.
   Run it before every full suite run.

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
- The `tools/git/` family is order-sensitive within itself; always re-run
  `./seed.sh` between full runs.

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
