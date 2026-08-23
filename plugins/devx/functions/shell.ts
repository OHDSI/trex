// @ts-nocheck - Deno edge function
/**
 * Shell execution for the edge runtime.
 *
 * The Deno edge sandbox does not allow Deno.Command, so anything needing a
 * subprocess goes through DuckDB's devx-ext `trex_devx_run_command`. That
 * function takes an argv-style string and runs it with Command::new (no shell
 * interpretation), so a command needing pipes, redirection or control flow is
 * written to a temp script and invoked as `sh <path>`.
 *
 * The only value interpolated into the SQL is the generated script path.
 */
import { duckdb, escapeSql } from "./duckdb.ts";

export interface ShellResult {
  output: string;
  exit_code: number;
}

/** Run a shell command via temp script + DuckDB devx-ext `sh` execution. */
export async function runShell(command: string): Promise<ShellResult> {
  const scriptPath = `/tmp/.devx-cmd-${crypto.randomUUID().slice(0, 8)}.sh`;
  try {
    await Deno.writeTextFile(scriptPath, command + "\n");
    const raw = await duckdb(
      `SELECT * FROM trex_devx_run_command('/tmp', 'sh ${escapeSql(scriptPath)}')`,
    );
    const result = JSON.parse(raw);
    try { await Deno.remove(scriptPath); } catch { /* best-effort */ }
    return {
      output: result.output || "",
      // A result carrying an `error` is not a success, even when the bridge
      // reports no exit_code at all.
      exit_code: result.exit_code ?? (result.error ? 1 : 0),
    };
  } catch (err) {
    try { await Deno.remove(scriptPath); } catch { /* best-effort */ }
    return { output: err?.message || String(err), exit_code: 1 };
  }
}
