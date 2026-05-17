// @ts-nocheck - Deno edge function
import { getAppWorkspacePath } from "../tools/workspace.ts";
import { duckdb, escapeSql } from "../duckdb.ts";
import { SECURITY_REVIEW_SYSTEM_PROMPT, parseSecurityFindings } from "../security_review_prompt.ts";
import { CODE_REVIEW_SYSTEM_PROMPT, parseCodeReviewFindings } from "../code_review_prompt.ts";
import { QA_REVIEW_SYSTEM_PROMPT, parseQaFindings } from "../qa_review_prompt.ts";
import { DESIGN_REVIEW_SYSTEM_PROMPT, parseDesignFindings } from "../design_review_prompt.ts";
import { gitOps } from "../git.ts";
import { devServerManager } from "../dev_server.ts";

const EXCLUDED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", ".venv", "venv",
  "__pycache__", ".cache", ".turbo", ".nuxt", "coverage",
]);

const CODE_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|json|env|yaml|yml|py|sql|html|css|vue|svelte)$/;

// Tool allowlists per review type
const CODE_REVIEW_TOOLS = [
  "Read", "Glob", "Grep", "CodeSearch", "GitDiff", "GitLog", "GitStatus",
];
const SECURITY_REVIEW_TOOLS = [
  "Read", "Glob", "Grep", "CodeSearch", "GitDiff", "GitLog", "GitStatus",
];
const QA_REVIEW_TOOLS = [
  "BrowserNavigate", "BrowserClick", "BrowserFill", "BrowserGetText", "BrowserEvaluate",
  "Read", "Glob", "Grep", "GitDiff",
];
const DESIGN_REVIEW_TOOLS = [
  "BrowserNavigate", "BrowserClick", "BrowserScreenshot", "BrowserGetText",
  "Read", "Glob", "Grep", "GitDiff",
];

export async function handleSecurityRoutes(path, method, req, userId, sql, corsHeaders) {
  // POST /apps/:id/security/scan — fast npm audit + secret scan (unchanged)
  const scanMatch = path.match(/\/apps\/([^/]+)\/security\/scan$/);
  if (scanMatch && method === "POST") {
    const appId = scanMatch[1];
    const appCheck = await sql(`SELECT id FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
    if (appCheck.rows.length === 0) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }

    const wsPath = getAppWorkspacePath(userId, appId);
    const findings = [];

    // Run npm audit
    try {
      const result = JSON.parse(await duckdb(
        `SELECT * FROM trex_devx_run_command('${escapeSql(wsPath)}', 'npm audit --json')`
      ));
      const output = result.output || "";
      try {
        const audit = JSON.parse(output);
        if (audit.vulnerabilities) {
          for (const [name, vuln] of Object.entries(audit.vulnerabilities)) {
            findings.push({
              severity: vuln.severity || "moderate",
              title: `Vulnerable dependency: ${name}`,
              description: `${vuln.via?.[0]?.title || vuln.via?.[0] || "Known vulnerability"}. Fix: ${vuln.fixAvailable ? "Update available" : "No fix available"}`,
            });
          }
        }
      } catch { /* not valid JSON */ }
    } catch { /* npm audit not available */ }

    // Basic secret scanning
    const secretPatterns = [
      { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["'][a-zA-Z0-9]{20,}["']/i, title: "Hardcoded API key" },
      { pattern: /(?:password|passwd|pwd)\s*[:=]\s*["'][^"']{4,}["']/i, title: "Hardcoded password" },
      { pattern: /(?:secret|token)\s*[:=]\s*["'][a-zA-Z0-9]{20,}["']/i, title: "Hardcoded secret/token" },
      { pattern: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, title: "Private key in source" },
    ];

    async function scanDir(dir, depth = 0) {
      if (depth > 3) return;
      try {
        for await (const entry of Deno.readDir(dir)) {
          if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
          const fullPath = `${dir}/${entry.name}`;
          if (entry.isDirectory) {
            await scanDir(fullPath, depth + 1);
          } else if (entry.isFile && /\.(ts|tsx|js|jsx|json|env|yaml|yml)$/.test(entry.name)) {
            try {
              const content = await Deno.readTextFile(fullPath);
              const relPath = fullPath.replace(wsPath + "/", "");
              for (const sp of secretPatterns) {
                if (sp.pattern.test(content)) {
                  findings.push({
                    severity: "high",
                    title: sp.title,
                    description: `Potential ${sp.title.toLowerCase()} found`,
                    file: relPath,
                  });
                }
              }
            } catch { /* skip unreadable files */ }
          }
        }
      } catch { /* skip unreadable dirs */ }
    }

    await scanDir(wsPath);

    return Response.json({ findings }, { headers: corsHeaders });
  }

  // ── Agent-powered review (shared logic) ────────────────────────────

  async function runAgentReview(opts: {
    appId: string;
    systemPrompt: string;
    userMessage: string;
    parseFindings: (text: string) => { title: string; level: string; description: string }[];
    table: string;
    eventPrefix: string;
    allowedTools: string[];
    maxSteps?: number;
  }) {
    // Read active provider config, fall back to legacy settings
    const activePC = await sql(
      `SELECT provider, model, api_key, base_url FROM devx.provider_configs WHERE user_id = $1 AND is_active = true LIMIT 1`,
      [userId],
    );
    const prefsResult = await sql(
      `SELECT ai_rules, auto_approve, max_steps FROM devx.settings WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    const providerRow = activePC.rows[0];
    const prefs = prefsResult.rows[0] || {};

    if (!providerRow) {
      // Legacy fallback
      const legacyResult = await sql(
        `SELECT provider, model, api_key, base_url, ai_rules, auto_approve, max_steps FROM devx.settings WHERE user_id = $1 LIMIT 1`,
        [userId],
      );
      if (legacyResult.rows.length === 0 || !legacyResult.rows[0].api_key) {
        return Response.json(
          { error: "AI provider not configured. Set your API key in Settings." },
          { status: 400, headers: corsHeaders },
        );
      }
      var settings = legacyResult.rows[0];
    } else {
      const noKeyProviders = new Set(["claude-code", "copilot", "bedrock"]);
      if (!providerRow.api_key && !noKeyProviders.has(providerRow.provider)) {
        return Response.json(
          { error: "AI provider not configured. Set your API key in Settings." },
          { status: 400, headers: corsHeaders },
        );
      }
      var settings = { ...providerRow, ...prefs };
    }

    // Fetch previous review for context
    let previousContext = "";
    try {
      const prevResult = await sql(
        `SELECT findings, created_at FROM devx.agent_results WHERE app_id = $1 AND user_id = $2 AND result_type = $3 ORDER BY created_at DESC LIMIT 1`,
        [opts.appId, userId, opts.table],
      );
      if (prevResult.rows.length > 0) {
        const prevFindings = typeof prevResult.rows[0].findings === "string"
          ? JSON.parse(prevResult.rows[0].findings)
          : prevResult.rows[0].findings;
        if (prevFindings && prevFindings.length > 0) {
          const prevList = prevFindings.map((f: any) =>
            `- [${f.level}] ${f.title}: ${f.description.substring(0, 200)}`
          ).join("\n");
          previousContext = `\n\n---\n\nIMPORTANT: A previous review found these issues (from ${prevResult.rows[0].created_at}):\n\n${prevList}\n\nFor each previous finding, check if it is still present. If it is still present, include it again in your findings. If it has been fixed, do NOT include it. Do NOT drop previous findings just because you want to report new ones — if the issue still exists, it MUST appear in your output. New findings should also be reported.`;
        }
      }
    } catch { /* ignore — first review */ }

    const fullUserMessage = `${opts.userMessage}${previousContext}`;

    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: any) => {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          send({ type: `${opts.eventPrefix}_progress`, message: "Starting review agent..." });

          // Import streamAgentChat dynamically to avoid circular deps
          const { streamAgentChat } = await import("../agent.ts");

          // Create a send wrapper that forwards agent events as review progress
          let lastProgressTime = 0;
          const agentSend = (data: any) => {
            if (data.type === "chunk") {
              // Throttle progress updates to avoid overwhelming the client
              const now = Date.now();
              if (now - lastProgressTime > 2000) {
                send({ type: `${opts.eventPrefix}_progress`, message: "Analyzing..." });
                lastProgressTime = now;
              }
            } else if (data.type === "tool_call_start") {
              // Show which tool the agent is using
              const toolMessages: Record<string, string> = {
                Read: "Reading file...",
                Glob: "Exploring project structure...",
                Grep: "Searching codebase...",
                CodeSearch: "Searching code...",
                GitDiff: "Checking recent changes...",
                GitLog: "Reading git history...",
                GitStatus: "Checking git status...",
                BrowserNavigate: "Navigating to app...",
                BrowserClick: "Interacting with app...",
                BrowserFill: "Filling form...",
                BrowserGetText: "Reading page content...",
                BrowserScreenshot: "Taking screenshot...",
                BrowserEvaluate: "Running browser check...",
              };
              const msg = toolMessages[data.name] || `Using ${data.name}...`;
              send({ type: `${opts.eventPrefix}_progress`, message: msg });
            } else if (data.type === "step") {
              send({ type: `${opts.eventPrefix}_progress`, message: `Step ${data.step}/${data.maxSteps}...` });
            }
          };

          // Run the agent
          const result = await streamAgentChat({
            // Synthetic chatId — not a real chat row. Safe because auto_approve
            // bypasses consent (which uses chatId for resolution), and hooks
            // query by userId, not chatId.
            chatId: `review-${opts.appId}-${Date.now()}`,
            userId,
            appId: opts.appId,
            chatMode: "agent",
            settings: {
              ...settings,
              max_steps: opts.maxSteps || 20,
              auto_approve: true, // Auto-approve all tool calls for reviews
            },
            history: [{ role: "user", content: fullUserMessage }],
            send: agentSend,
            sqlFn: sql,
            skillContext: opts.systemPrompt,
            commandOverride: {
              allowed_tools: opts.allowedTools,
              model: null,
              body: "",
            },
          });

          // Parse findings from the agent's final response
          const agentResponse = result.content || "";
          const findings = opts.parseFindings(agentResponse);

          // Store in DB
          const insertResult = await sql(
            `INSERT INTO devx.agent_results (app_id, user_id, result_type, findings)
             VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
            [opts.appId, userId, opts.table, JSON.stringify(findings)],
          );

          send({
            type: `${opts.eventPrefix}_done`,
            review: { id: insertResult.rows[0].id, findings, created_at: insertResult.rows[0].created_at },
          });
        } catch (err) {
          send({ type: `${opts.eventPrefix}_error`, error: err.message });
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  }

  // Helper: check app ownership
  async function checkApp(appId: string) {
    const appCheck = await sql(`SELECT id FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
    return appCheck.rows.length > 0;
  }

  // Helper: get latest review by result type
  async function getLatestReview(appId: string, resultType: string) {
    const result = await sql(
      `SELECT id, findings, created_at FROM devx.agent_results WHERE app_id = $1 AND user_id = $2 AND result_type = $3 ORDER BY created_at DESC LIMIT 1`,
      [appId, userId, resultType],
    );
    return result.rows.length === 0 ? null : result.rows[0];
  }

  // Helper: build code context user message
  async function buildCodeReviewMessage(appId: string, prefix: string) {
    const wsPath = getAppWorkspacePath(userId, appId);
    const files = await collectCodeFiles(wsPath);
    if (files.length === 0) {
      return null;
    }
    return `${prefix}\n\nThe project has ${files.length} code files. Use your tools (Read, Grep, GitDiff, Glob) to explore the codebase in depth. Here is a summary of the files for context:\n\n${files.map((f) => `- ${f.path} (${f.content.length} chars)`).join("\n")}`;
  }

  // Helper: build QA/Design review message with git diff and app URL.
  // Returns { error } on failure or { message, appUrl } on success.
  async function buildBrowserReviewMessage(appId: string, prefix: string): Promise<{ error: string } | { message: string; appUrl: string }> {
    const wsPath = getAppWorkspacePath(userId, appId);

    // Get dev server status - require it to be running
    const serverStatus = await devServerManager.getStatus(userId, appId);
    if (serverStatus.status !== "running" || !serverStatus.port) {
      return { error: "Dev server must be running to perform this review. Start the dev server first." };
    }

    const appUrl = `http://localhost:${serverStatus.port}`;

    // Get git diff for change context
    let gitDiff = "";
    try {
      gitDiff = await gitOps.diff(wsPath);
    } catch { /* no git */ }

    // Get file list for context
    const files = await collectCodeFiles(wsPath);
    const fileList = files.map((f) => `- ${f.path}`).join("\n");

    let message = `${prefix}\n\n**App URL**: ${appUrl}\n\n`;
    if (gitDiff) {
      message += `**Recent Changes (git diff)**:\n\`\`\`\n${gitDiff.slice(0, 20000)}\n\`\`\`\n\n`;
    }
    message += `**Project Files**:\n${fileList}\n\nStart by navigating to ${appUrl} and testing the application.`;

    return { message, appUrl };
  }

  // ── POST /apps/:id/security/review ─────────────────────────────────

  const secReviewMatch = path.match(/\/apps\/([^/]+)\/security\/review$/);
  if (secReviewMatch && method === "POST") {
    const appId = secReviewMatch[1];
    if (!await checkApp(appId)) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    const userMessage = await buildCodeReviewMessage(appId, "Perform a thorough security review of this codebase. Use your tools to explore files, search for patterns, and check git history.");
    if (!userMessage) {
      return Response.json({ error: "No code files found to review" }, { status: 400, headers: corsHeaders });
    }
    return runAgentReview({
      appId,
      systemPrompt: SECURITY_REVIEW_SYSTEM_PROMPT,
      userMessage,
      parseFindings: parseSecurityFindings,
      table: "security-review",
      eventPrefix: "review",
      allowedTools: SECURITY_REVIEW_TOOLS,
      maxSteps: 20,
    });
  }

  // ── GET /apps/:id/security/reviews ─────────────────────────────────

  const secReviewsMatch = path.match(/\/apps\/([^/]+)\/security\/reviews$/);
  if (secReviewsMatch && method === "GET") {
    const appId = secReviewsMatch[1];
    if (!await checkApp(appId)) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    return Response.json(await getLatestReview(appId, "security-review"), { headers: corsHeaders });
  }

  // ── POST /apps/:id/code/review ─────────────────────────────────────

  const codeReviewMatch = path.match(/\/apps\/([^/]+)\/code\/review$/);
  if (codeReviewMatch && method === "POST") {
    const appId = codeReviewMatch[1];
    if (!await checkApp(appId)) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    const userMessage = await buildCodeReviewMessage(appId, "Perform a thorough code review of this codebase. Use your tools to explore files, search for patterns, and check git history for recent changes.");
    if (!userMessage) {
      return Response.json({ error: "No code files found to review" }, { status: 400, headers: corsHeaders });
    }
    return runAgentReview({
      appId,
      systemPrompt: CODE_REVIEW_SYSTEM_PROMPT,
      userMessage,
      parseFindings: parseCodeReviewFindings,
      table: "code-review",
      eventPrefix: "code_review",
      allowedTools: CODE_REVIEW_TOOLS,
      maxSteps: 20,
    });
  }

  // ── GET /apps/:id/code/reviews ─────────────────────────────────────

  const codeReviewsMatch = path.match(/\/apps\/([^/]+)\/code\/reviews$/);
  if (codeReviewsMatch && method === "GET") {
    const appId = codeReviewsMatch[1];
    if (!await checkApp(appId)) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    return Response.json(await getLatestReview(appId, "code-review"), { headers: corsHeaders });
  }

  // ── POST /apps/:id/qa/review ───────────────────────────────────────

  const qaReviewMatch = path.match(/\/apps\/([^/]+)\/qa\/review$/);
  if (qaReviewMatch && method === "POST") {
    const appId = qaReviewMatch[1];
    if (!await checkApp(appId)) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    const result = await buildBrowserReviewMessage(appId, "Perform functional QA testing on the running web application. Use Playwright browser tools to navigate, click, fill forms, and verify behavior.");
    if (result.error) {
      return Response.json({ error: result.error }, { status: 400, headers: corsHeaders });
    }
    return runAgentReview({
      appId,
      systemPrompt: QA_REVIEW_SYSTEM_PROMPT,
      userMessage: result.message,
      parseFindings: parseQaFindings,
      table: "qa-test",
      eventPrefix: "qa_review",
      allowedTools: QA_REVIEW_TOOLS,
      maxSteps: 30,
    });
  }

  // ── GET /apps/:id/qa/reviews ───────────────────────────────────────

  const qaReviewsMatch = path.match(/\/apps\/([^/]+)\/qa\/reviews$/);
  if (qaReviewsMatch && method === "GET") {
    const appId = qaReviewsMatch[1];
    if (!await checkApp(appId)) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    return Response.json(await getLatestReview(appId, "qa-test"), { headers: corsHeaders });
  }

  // ── POST /apps/:id/design/review ───────────────────────────────────

  const designReviewMatch = path.match(/\/apps\/([^/]+)\/design\/review$/);
  if (designReviewMatch && method === "POST") {
    const appId = designReviewMatch[1];
    if (!await checkApp(appId)) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    const result = await buildBrowserReviewMessage(appId, "Perform a visual design review of the running web application. Use Playwright browser tools to navigate and take screenshots for analysis.");
    if (result.error) {
      return Response.json({ error: result.error }, { status: 400, headers: corsHeaders });
    }
    return runAgentReview({
      appId,
      systemPrompt: DESIGN_REVIEW_SYSTEM_PROMPT,
      userMessage: result.message,
      parseFindings: parseDesignFindings,
      table: "design-review",
      eventPrefix: "design_review",
      allowedTools: DESIGN_REVIEW_TOOLS,
      maxSteps: 25,
    });
  }

  // ── GET /apps/:id/design/reviews ───────────────────────────────────

  const designReviewsMatch = path.match(/\/apps\/([^/]+)\/design\/reviews$/);
  if (designReviewsMatch && method === "GET") {
    const appId = designReviewsMatch[1];
    if (!await checkApp(appId)) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    return Response.json(await getLatestReview(appId, "design-review"), { headers: corsHeaders });
  }

  return null;
}

// ── Shared Helpers ────────────────────────────────────────────────

const MAX_CONTEXT_SIZE = 200_000;

async function collectCodeFiles(wsPath: string): Promise<{ path: string; content: string }[]> {
  const files: { path: string; content: string }[] = [];
  let totalSize = 0;

  async function walk(dir: string, depth = 0) {
    if (depth > 5 || totalSize > MAX_CONTEXT_SIZE) return;
    try {
      for await (const entry of Deno.readDir(dir)) {
        if (totalSize > MAX_CONTEXT_SIZE) return;
        if (entry.name.startsWith(".")) continue;
        if (entry.isDirectory && EXCLUDED_DIRS.has(entry.name)) continue;

        const fullPath = `${dir}/${entry.name}`;
        if (entry.isDirectory) {
          await walk(fullPath, depth + 1);
        } else if (entry.isFile && CODE_EXTENSIONS.test(entry.name)) {
          try {
            const content = await Deno.readTextFile(fullPath);
            if (content.length > 50_000) continue;
            const relPath = fullPath.replace(wsPath + "/", "");
            files.push({ path: relPath, content });
            totalSize += content.length;
          } catch { /* skip unreadable */ }
        }
      }
    } catch { /* skip unreadable dirs */ }
  }

  await walk(wsPath);
  return files;
}
