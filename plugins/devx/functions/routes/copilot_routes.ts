// @ts-nocheck - Deno edge function
/**
 * GitHub Copilot authentication routes.
 * Uses DuckDB devx-ext (trex_devx_run_command) to run CLI commands since
 * the Deno edge runtime sandbox doesn't allow Deno.Command directly.
 */
import { duckdb, escapeSql } from "../duckdb.ts";

/** Run a shell command via temp script + DuckDB devx-ext `sh` execution. */
async function runShell(command: string): Promise<{ output: string; exit_code: number }> {
  const scriptPath = `/tmp/.devx-cmd-${crypto.randomUUID().slice(0, 8)}.sh`;
  try {
    await Deno.writeTextFile(scriptPath, command + "\n");
    const raw = await duckdb(
      `SELECT * FROM trex_devx_run_command('/tmp', 'sh ${escapeSql(scriptPath)}')`
    );
    const result = JSON.parse(raw);
    try { await Deno.remove(scriptPath); } catch {}
    return {
      output: result.output || "",
      exit_code: result.exit_code ?? (result.error ? 1 : 0),
    };
  } catch (err) {
    try { await Deno.remove(scriptPath); } catch {}
    return { output: err.message || String(err), exit_code: 1 };
  }
}

/** Parse a URL from command output */
function parseLoginUrl(text: string): string | null {
  const urlMatch = text.match(/https:\/\/[^\s"'<>]+/);
  return urlMatch ? urlMatch[0] : null;
}

/** Parse a device code (e.g. ABCD-1234) from command output */
function parseUserCode(text: string): string | null {
  const codeMatch = text.match(/\b[A-Z0-9]{4,}-[A-Z0-9]{4,}\b/);
  return codeMatch ? codeMatch[0] : null;
}

export async function handleCopilotRoutes(path, method, req, userId, sql, corsHeaders) {
  // GET /copilot/auth-status
  if (path.endsWith("/copilot/auth-status") && method === "GET") {
    try {
      const ghVersion = await runShell("gh --version 2>&1");
      if (ghVersion.exit_code !== 0 && !ghVersion.output.includes("gh version")) {
        return Response.json({
          installed: false, authenticated: false, version: null, account: null,
        }, { headers: corsHeaders });
      }

      const authStatus = await runShell("gh auth status 2>&1");
      let authenticated = false;
      let account = null;

      if (authStatus.exit_code === 0) {
        authenticated = true;
        const userMatch = authStatus.output.match(/account\s+(\S+)/i) ||
                         authStatus.output.match(/Logged in to github\.com as (\S+)/i);
        if (userMatch) account = userMatch[1];
      }

      const copilotCheck = await runShell("gh copilot --version 2>&1");
      const copilotInstalled = copilotCheck.exit_code === 0;

      return Response.json({
        installed: copilotInstalled,
        authenticated,
        version: ghVersion.output.trim().split("\n")[0],
        account,
      }, { headers: corsHeaders });
    } catch (err) {
      return Response.json({
        installed: false, authenticated: false, version: null, account: null, error: err.message,
      }, { headers: corsHeaders });
    }
  }

  // POST /copilot/login
  if (path.endsWith("/copilot/login") && method === "POST") {
    try {
      const authCheck = await runShell("gh auth status 2>&1");
      if (authCheck.exit_code === 0) {
        return Response.json({
          status: "already_authenticated",
          message: "GitHub Copilot is already authenticated.",
        }, { headers: corsHeaders });
      }

      // Run login in background, capture output
      await runShell("BROWSER=false DISPLAY= NO_COLOR=1 GH_PROMPT_DISABLED=1 gh auth login --hostname github.com --scopes copilot > /tmp/.gh-login-out 2>&1 &");
      await runShell("sleep 3");
      const login = await runShell("cat /tmp/.gh-login-out 2>/dev/null || echo ''");

      const url = parseLoginUrl(login.output);
      const code = parseUserCode(login.output);

      if (url) {
        return Response.json({
          status: "pending",
          login_url: url,
          user_code: code,
          message: "Open the URL and enter the code to authenticate.",
        }, { headers: corsHeaders });
      }

      return Response.json({
        status: "error",
        message: "Could not start login flow. Ensure `gh` CLI is installed.",
        output: login.output.slice(0, 500),
      }, { status: 500, headers: corsHeaders });
    } catch (err) {
      return Response.json({
        status: "error", message: err.message || "Failed to start login",
      }, { status: 500, headers: corsHeaders });
    }
  }

  // POST /copilot/logout
  if (path.endsWith("/copilot/logout") && method === "POST") {
    try {
      const result = await runShell("echo y | gh auth logout --hostname github.com 2>&1");
      return Response.json({
        ok: true,
        message: result.output.trim() || "Logged out successfully",
      }, { headers: corsHeaders });
    } catch (err) {
      return Response.json({ ok: false, message: err.message }, { status: 500, headers: corsHeaders });
    }
  }

  return null;
}
