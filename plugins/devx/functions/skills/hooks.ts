// @ts-nocheck - Deno edge function
/**
 * Hook dispatcher for the DevX agent pipeline.
 * Handles PreToolUse, PostToolUse, and Stop hooks.
 */

import type { Hook, HookEvent, HookResult } from "./types.ts";

type SqlFn = (query: string, params?: unknown[]) => Promise<{ rows: any[] }>;

// Surfaces a hook that failed to run/decide (crashed, disallowed executable,
// unknown hook_type, or a script that exited non-zero) to the caller, in
// addition to the console.error logging that already happens at each site
// below -- callers (agent.ts) turn this into a `hook.failed` session event.
// Never fired for a hook that ran and legitimately produced no output/deny.
export type HookFailureReporter = (info: { event: HookEvent; error: string }) => void;

/**
 * Load all enabled hooks for a given event type, ordered by sort_order.
 */
export async function loadHooks(
  userId: string,
  event: string,
  sqlFn: SqlFn,
): Promise<Hook[]> {
  const result = await sqlFn(
    `SELECT * FROM devx.hooks
     WHERE event = $1 AND enabled = true
       AND (user_id = $2 OR (is_builtin = true AND user_id IS NULL))
     ORDER BY sort_order ASC`,
    [event, userId],
  );
  return result.rows;
}

/**
 * Run PreToolUse hooks for a specific tool call.
 * Returns whether the tool call is allowed and any modifications to args.
 */
export async function runPreToolHooks(
  toolName: string,
  toolArgs: Record<string, unknown>,
  hooks: Hook[],
  onFailure?: HookFailureReporter,
): Promise<{ allow: boolean; modifiedArgs?: Record<string, unknown> }> {
  const matchingHooks = hooks.filter((h) => matchesToolName(h.matcher, toolName));

  if (matchingHooks.length === 0) {
    return { allow: true };
  }

  let currentArgs = { ...toolArgs };

  for (const hook of matchingHooks) {
    try {
      const result = await executeHook(hook, {
        event: "PreToolUse",
        toolName,
        toolArgs: currentArgs,
      }, onFailure);

      if (result.action === "deny") {
        return { allow: false };
      }

      if (result.action === "modify" && result.modifications) {
        currentArgs = { ...currentArgs, ...result.modifications };
      }
    } catch (err) {
      // Trust boundary: a hook that was supposed to decide allow/deny and
      // threw must not be treated as approval -- deny, don't just log.
      console.error(`[hooks] PreToolUse hook error:`, err);
      onFailure?.({ event: "PreToolUse", error: err instanceof Error ? err.message : String(err) });
      return { allow: false };
    }
  }

  const argsChanged = JSON.stringify(currentArgs) !== JSON.stringify(toolArgs);
  return { allow: true, modifiedArgs: argsChanged ? currentArgs : undefined };
}

/**
 * Run PostToolUse hooks after a tool has executed.
 * Can modify the tool result string.
 */
export async function runPostToolHooks(
  toolName: string,
  toolArgs: Record<string, unknown>,
  toolResult: string,
  hooks: Hook[],
  onFailure?: HookFailureReporter,
): Promise<string> {
  const matchingHooks = hooks.filter((h) => matchesToolName(h.matcher, toolName));

  if (matchingHooks.length === 0) {
    return toolResult;
  }

  let currentResult = toolResult;

  for (const hook of matchingHooks) {
    try {
      const result = await executeHook(hook, {
        event: "PostToolUse",
        toolName,
        toolArgs,
        toolResult: currentResult,
      }, onFailure);

      if (result.modifiedResult) {
        currentResult = result.modifiedResult;
      }
    } catch (err) {
      // Advisory: PostToolUse has no allow/deny concept, so a crash just
      // leaves the result untouched -- the turn continues either way.
      console.error(`[hooks] PostToolUse hook error:`, err);
      onFailure?.({ event: "PostToolUse", error: err instanceof Error ? err.message : String(err) });
    }
  }

  return currentResult;
}

/**
 * Run Stop hooks when the agent loop finishes.
 */
export async function runStopHooks(
  hooks: Hook[],
  context: { chatId: string; content: string },
  onFailure?: HookFailureReporter,
): Promise<void> {
  for (const hook of hooks) {
    try {
      await executeHook(hook, {
        event: "Stop",
        chatId: context.chatId,
        content: context.content.slice(0, 5000), // Limit context size
      }, onFailure);
    } catch (err) {
      console.error(`[hooks] Stop hook error:`, err);
      onFailure?.({ event: "Stop", error: err instanceof Error ? err.message : String(err) });
    }
  }
}

// --- Hook execution ---

async function executeHook(
  hook: Hook,
  input: Record<string, unknown>,
  onFailure?: HookFailureReporter,
): Promise<HookResult> {
  if (hook.hook_type === "command") {
    return executeCommandHook(hook, input, onFailure);
  }

  if (hook.hook_type === "prompt") {
    // Prompt hooks return the prompt text for the caller to handle.
    // In the agent pipeline, this would be injected as a system message.
    return { action: "approve" };
  }

  // Row's hook_type is neither "command" nor "prompt" -- the schema
  // requires one of the two, so this means the row is malformed, not a
  // legitimate no-op. Deny rather than silently approve: only PreToolUse
  // reads `.action`, so this is inert for Post/Stop beyond the onFailure.
  const error = `unknown hook_type: ${String((hook as { hook_type?: unknown }).hook_type)}`;
  console.error(`[hooks] ${error}`);
  onFailure?.({ event: hook.event, error });
  return { action: "deny" };
}

// Executables allowed for hook commands
const ALLOWED_EXECUTABLES = new Set([
  "node", "deno", "python", "python3", "bash", "sh", "bun", "npx", "uvx",
]);

import { duckdb, escapeSql } from "../duckdb.ts";

// Shared shell composition + devx-ext bridge dispatch for executeCommandHook
// AND runContextHook below -- both must run through trex_devx_run_command so
// the child gets Task 4's filtered_env (ANTHROPIC_API_KEY/DATABASE_URL/the
// DEK/Discord/Logto secrets never reach a hook's command), and both refuse
// anything outside ALLOWED_EXECUTABLES before ever reaching the bridge.
// Returns undefined for a missing command or a disallowed executable
// (already logged in both cases); otherwise the parsed exit code + trimmed
// stdout, for the caller to interpret.
async function runHookCommand(
  hook: Hook,
  input: Record<string, unknown>,
  onFailure?: HookFailureReporter,
): Promise<{ exitCode: number; output: string } | undefined> {
  if (!hook.command) return undefined;

  // Parse command to validate executable against allow-list
  const parts = hook.command.split(/\s+/);
  const executable = parts[0];
  if (!ALLOWED_EXECUTABLES.has(executable)) {
    const error = `disallowed executable: ${executable}`;
    console.error(`[hooks] Blocked disallowed executable: ${executable}`);
    onFailure?.({ event: hook.event, error });
    return undefined;
  }

  // Run command via DuckDB devx-ext, piping input JSON via echo
  const inputJson = JSON.stringify(input).replace(/'/g, "'\\''");
  const envVars = `DEVX_HOOK_EVENT='${escapeSql(String(input.event || ""))}' DEVX_TOOL_NAME='${escapeSql(String(input.toolName || ""))}'`;
  const shellCmd = `echo '${escapeSql(inputJson)}' | ${envVars} ${hook.command} 2>&1`;
  const timeoutSec = Math.ceil((hook.timeout_ms || 10000) / 1000);
  const fullCmd = `timeout ${timeoutSec} bash -c '${escapeSql(shellCmd)}'`;

  const raw = await duckdb(
    `SELECT * FROM trex_devx_run_command('/tmp', '${escapeSql(fullCmd)}')`
  );
  const result = JSON.parse(raw);
  return { exitCode: result.exit_code ?? 0, output: (result.output || "").trim() };
}

async function executeCommandHook(
  hook: Hook,
  input: Record<string, unknown>,
  onFailure?: HookFailureReporter,
): Promise<HookResult> {
  if (!hook.command) return { action: "approve" };

  try {
    const ran = await runHookCommand(hook, input, onFailure);
    // A disallowed executable means the hook never ran at all -- it could
    // not render a verdict, so (unlike the non-zero-exit case below, where
    // the hook DID run) this is fail-closed. onFailure already fired inside
    // runHookCommand.
    if (!ran) return { action: "deny" };
    const { exitCode, output } = ran;

    // Claude Code hook convention: exit code 2 means "block" -- a
    // conventional blocking hook script relies on this, so it must produce
    // the same deny shape the stdout {"action":"deny"} path below does (same
    // downstream handling, one deny shape). Any OTHER non-zero exit code is
    // treated as a non-blocking hook failure (bad script, transient error,
    // etc.) and still approves -- only exit 2 is a deliberate block signal.
    // Pinned by agent_hooks.test.ts: this stays approve, but now also
    // reports the failure for visibility.
    if (exitCode === 2) {
      console.error(`[hooks] Command hook blocked the call (exit 2):`, output);
      return { action: "deny" };
    }
    if (exitCode && exitCode !== 0) {
      console.error(`[hooks] Command hook failed:`, output);
      onFailure?.({ event: hook.event, error: `hook exited with code ${exitCode}` });
      return { action: "approve" }; // non-blocking failure -- log and continue
    }

    if (!output) return { action: "approve" };

    // Parse JSON response from hook
    try {
      const parsed = JSON.parse(output);
      return {
        action: parsed.action || "approve",
        modifications: parsed.modifications,
        modifiedResult: parsed.modifiedResult,
      };
    } catch {
      // If output is just "deny" or "approve" as plain text
      if (output === "deny") return { action: "deny" };
      return { action: "approve" };
    }
  } catch (err) {
    // The hook crashed before producing any verdict -- same fail-closed
    // reasoning as the disallowed-executable branch above.
    console.error(`[hooks] Command hook execution error:`, err);
    onFailure?.({ event: hook.event, error: err instanceof Error ? err.message : String(err) });
    return { action: "deny" };
  }
}

/**
 * Run a context-injection hook (UserPromptSubmit) through the same
 * allowlisted devx-ext bridge as executeCommandHook, so it inherits Task 4's
 * filtered_env and the ALLOWED_EXECUTABLES gate -- a direct Deno.Command from
 * the worker would bypass both. Unlike executeCommandHook there is no
 * allow/deny verdict, only stdout to contribute, so a disallowed executable,
 * a non-zero exit, or empty output all resolve to "" (no injection). Fails
 * open: this is not a trust-boundary control, a broken hook here must never
 * fail the turn.
 */
export async function runContextHook(
  hook: Hook,
  input: Record<string, unknown>,
  onFailure?: HookFailureReporter,
): Promise<string> {
  try {
    const ran = await runHookCommand(hook, input, onFailure);
    if (!ran) return "";
    if (ran.exitCode !== 0) {
      console.error(`[hooks] Context hook failed:`, ran.output);
      onFailure?.({ event: hook.event, error: `hook exited with code ${ran.exitCode}` });
      return "";
    }
    return ran.output;
  } catch (err) {
    console.error(`[hooks] Context hook execution error:`, err);
    onFailure?.({ event: hook.event, error: err instanceof Error ? err.message : String(err) });
    return "";
  }
}

// --- Helpers ---

/**
 * Check if a tool name matches a hook's matcher pattern.
 * Matcher is a pipe-separated list of tool name patterns, or null (matches all).
 */
function matchesToolName(matcher: string | null, toolName: string): boolean {
  // No matcher = matches all tools
  if (!matcher || matcher === "*") return true;

  const patterns = matcher.split("|").map((p) => p.trim());

  for (const pattern of patterns) {
    // Exact match
    if (pattern === toolName) return true;

    // Simple glob: "write_*" matches "write_file"
    if (pattern.endsWith("*")) {
      const prefix = pattern.slice(0, -1);
      if (toolName.startsWith(prefix)) return true;
    }

    // Case-insensitive exact match
    if (pattern.toLowerCase() === toolName.toLowerCase()) return true;
  }

  return false;
}
