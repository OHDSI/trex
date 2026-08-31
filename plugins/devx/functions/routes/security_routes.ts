// @ts-nocheck - Deno edge function
import { getAppWorkspacePath } from "../tools/workspace.ts";
import { createSseWriter } from "../sse.ts";
import { duckdb, escapeSql } from "../duckdb.ts";
import { SECURITY_REVIEW_SYSTEM_PROMPT, parseSecurityFindings } from "../security_review_prompt.ts";
import { CODE_REVIEW_SYSTEM_PROMPT, parseCodeReviewFindings } from "../code_review_prompt.ts";
import { QA_REVIEW_SYSTEM_PROMPT, parseQaFindings } from "../qa_review_prompt.ts";
import { DESIGN_REVIEW_SYSTEM_PROMPT, parseDesignFindings } from "../design_review_prompt.ts";
import { DOCS_UPDATE_SYSTEM_PROMPT, parseDocsUpdateFindings } from "../docs_update_prompt.ts";
import { gitOps } from "../git.ts";
import { devServerManager } from "../dev_server.ts";
import { assertEncryptionMigrated, assertProviderConfigEncryptionMigrated, readProviderKey } from "../provider_key.ts";
import { isNoKeyProvider, removedProviderResponse } from "../provider_support.ts";
import { classifyCoderError } from "../error_codes.ts";
import { bearerFromRequest, denialSummary, runOnEve } from "../lib/eve_run.ts";
import {
  browserlessRefusal,
  CODE_REVIEW_TOOLS,
  DESIGN_REVIEW_TOOLS,
  DOCS_UPDATE_TOOLS,
  QA_REVIEW_TOOLS,
  SECURITY_REVIEW_TOOLS,
} from "./review_tools.ts";

const EXCLUDED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".next", ".venv", "venv",
  "__pycache__", ".cache", ".turbo", ".nuxt", "coverage",
]);

const CODE_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|json|env|yaml|yml|py|sql|html|css|vue|svelte)$/;

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
    allowedTools: readonly string[];
  }) {
    // Pre-flight provider gate. The model itself is now resolved inside the
    // eve devx agent (agent.ts's resolveModel, off the same rows) — this is
    // kept so a misconfigured provider fails the REQUEST with a usable message
    // instead of failing the turn halfway through a stream.
    await assertProviderConfigEncryptionMigrated(sql);
    const activePC = await sql(
      `SELECT provider, model, api_key, api_key_encrypted, api_key_iv, base_url FROM devx.provider_configs WHERE user_id = $1 AND is_active = true LIMIT 1`,
      [userId],
    );
    const providerRow = activePC.rows[0];
    // Which loop this review will run on — the refusal below turns on it.
    let resolvedProvider = providerRow?.provider;

    if (!providerRow) {
      // Legacy fallback. devx.settings carries the same encrypted-pair
      // columns as provider_configs (V16) now — resolved through
      // readProviderKey below, the same shape as the providerRow branch,
      // not a second, differently-shaped resolution.
      await assertEncryptionMigrated("settings", sql);
      const legacyResult = await sql(
        `SELECT provider, model, api_key, api_key_encrypted, api_key_iv, base_url, ai_rules, auto_approve, max_steps FROM devx.settings WHERE user_id = $1 LIMIT 1`,
        [userId],
      );
      const legacyRow = legacyResult.rows[0];
      if (!legacyRow) {
        return Response.json(
          { error: "AI provider not configured. Set your API key in Settings." },
          { status: 400, headers: corsHeaders },
        );
      }
      let resolvedLegacyApiKey;
      try {
        resolvedLegacyApiKey = await readProviderKey(legacyRow);
      } catch (err) {
        console.error("[devx] settings key read failed for agent review:", err instanceof Error ? err.message : err);
        const classified = classifyCoderError(err instanceof Error ? err.message : String(err));
        return Response.json(
          { error: classified.safe, code: classified.code },
          { status: 401, headers: corsHeaders },
        );
      }
      // Removed-engine rows are rejected on the provider NAME, ahead of the key
      // gate, exactly as in the providerRow branch below. The legacy row needs
      // its own gate call because it resolves its provider independently — a
      // devx.settings row still naming a deleted engine reaches this branch
      // whenever the user has no active provider_configs row.
      const removedLegacyProviderRejection = removedProviderResponse(legacyRow.provider, corsHeaders);
      if (removedLegacyProviderRejection) return removedLegacyProviderRejection;
      resolvedProvider = legacyRow.provider;
      // Only providers that genuinely authenticate without a stored key belong
      // in the shared waiver — see the providerRow branch below for why a removed
      // engine must never be waived past the key gate.
      if (!resolvedLegacyApiKey && !isNoKeyProvider(legacyRow.provider)) {
        return Response.json(
          { error: "AI provider not configured. Set your API key in Settings." },
          { status: 400, headers: corsHeaders },
        );
      }
    } else {
      // Resolve through the encryption helper before the no-key check, which
      // must run on the RESOLVED value (same as index.ts): api_key is NULL once
      // a row is encrypted, and a key gate reading the raw column would wave a
      // keyless row through to the agent's own resolveModel. A decrypt failure
      // must fail the request, never continue with an absent key.
      let resolvedApiKey;
      try {
        resolvedApiKey = await readProviderKey(providerRow);
      } catch (err) {
        // classifyCoderError's `safe` string is generic for the UI — log
        // the actual cause (e.g. a rotated DEVX_ENCRYPTION_KEY) so it's
        // diagnosable from the server log, not just a misleading UI message.
        console.error("[devx] provider key read failed for agent review:", err instanceof Error ? err.message : err);
        const classified = classifyCoderError(err instanceof Error ? err.message : String(err));
        return Response.json(
          { error: classified.safe, code: classified.code },
          { status: 401, headers: corsHeaders },
        );
      }
      // Removed-engine rows are rejected on the provider NAME, ahead of the key
      // gate — see index.ts's /stream read site for why the key gate alone is
      // not a structural guarantee (such a row WITH a key would pass it).
      const removedProviderRejection = removedProviderResponse(providerRow.provider, corsHeaders);
      if (removedProviderRejection) return removedProviderRejection;
      // Only providers that genuinely authenticate without a stored key belong
      // in the shared waiver (provider_support.ts, one definition for every
      // read site). A provider whose engine no longer exists must NOT be waived:
      // the model builder would route it to the OpenAI-compatible client, which
      // resolves an absent key from the worker's own OPENAI_API_KEY.
      if (!resolvedApiKey && !isNoKeyProvider(providerRow.provider)) {
        return Response.json(
          { error: "AI provider not configured. Set your API key in Settings." },
          { status: 400, headers: corsHeaders },
        );
      }
    }

    // Backstop for the routes' own early refusal above: a browser-dependent
    // review must never reach eve on the delegated path, whichever route added
    // it. Free here — the provider is already resolved.
    const refusal = browserlessRejection(opts.table, resolvedProvider);
    if (refusal) return refusal;

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
        // See ../sse.ts: enqueue on a closed controller throws, and this send is
        // called from the catch below whose controller.close() would then be
        // skipped, leaving the caller on a stream that never terminates.
        const writer = createSseWriter(controller, "devx review");
        const send = (data: any) => writer.send(data);

        try {
          send({ type: `${opts.eventPrefix}_progress`, message: "Starting review agent..." });

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
            }
          };

          // An unattended eve session with no approver: the review's tools are
          // read-only, and anything in the hard escalate tier is denied outright
          // rather than parked on a gate nobody is watching. runOnEve declares
          // opts.allowedTools on the session row BEFORE the turn, which is what
          // makes the per-review allowlist actually restrict the tool set.
          const result = await runOnEve({
            userId,
            appId: opts.appId,
            prompt: fullUserMessage,
            skillContext: opts.systemPrompt,
            allowedTools: opts.allowedTools,
            send: agentSend,
            sql,
            bearerToken: bearerFromRequest(req),
          });

          const findings = opts.parseFindings(result.content || "");
          // Deliberately NOT a _progress frame: onDone clears the progress line
          // the moment it arrives, so a denial sent that way is never displayed.
          // It rides the review object instead, which is also what reloads.
          const denialNotice = denialSummary(result.denials);
          if (denialNotice) console.warn(`[devx] ${opts.table} review: ${denialNotice}`);

          // Stored WITH the denials (V21): on the live wire alone, a reload
          // shows a clean-looking review that never had the tools it needed.
          const insertResult = await sql(
            `INSERT INTO devx.agent_results (app_id, user_id, result_type, findings, denials)
             VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
            [opts.appId, userId, opts.table, JSON.stringify(findings), JSON.stringify(result.denials)],
          );

          send({
            type: `${opts.eventPrefix}_done`,
            review: {
              id: insertResult.rows[0].id,
              findings,
              created_at: insertResult.rows[0].created_at,
              denials: result.denials,
            },
          });
        } catch (err) {
          send({ type: `${opts.eventPrefix}_error`, error: err.message });
        }

        writer.close();
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
      `SELECT id, findings, denials, created_at FROM devx.agent_results WHERE app_id = $1 AND user_id = $2 AND result_type = $3 ORDER BY created_at DESC LIMIT 1`,
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
    // Include the agreed plan when the workspace has one. Without it the reviewer cannot
    // tell "built what was asked" from "built something that compiles", so scope creep and
    // silently dropped requirements are invisible to it.
    let planSection = "";
    try {
      const plan = await findPlanDoc(wsPath);
      if (plan) {
        planSection = `\n\n## Agreed plan (${plan.path})\n\nCheck the change against this before reviewing quality.\n\n${plan.content.slice(0, 12000)}`;
      }
    } catch {
      // no plan available — review proceeds without the scope check
    }
    return `${prefix}${planSection}\n\nThe project has ${files.length} code files. Use your tools (Read, Grep, GitDiff, Glob) to explore the codebase in depth. Here is a summary of the files for context:\n\n${files.map((f) => `- ${f.path} (${f.content.length} chars)`).join("\n")}`;
  }

  // Helper: build QA/Design review message with git diff and app URL.
  // Returns { error } on failure or { message, appUrl } on success.
  function browserlessRejection(reviewType: string, provider: string | null | undefined): Response | null {
    const refusal = browserlessRefusal(reviewType, provider);
    if (!refusal) return null;
    return Response.json({ error: refusal, code: "browser_tools_unavailable" }, { status: 400, headers: corsHeaders });
  }

  // Refuse BEFORE any precondition the refusal makes irrelevant. A browserless
  // QA review behind a stopped dev server otherwise answers "start the dev
  // server", and the user learns the real reason only on the retry. Reads the
  // provider NAME alone — the key gate still runs later, in runAgentReview.
  async function refuseBrowserlessReview(reviewType: string): Promise<Response | null> {
    const active = await sql(
      `SELECT provider FROM devx.provider_configs WHERE user_id = $1 AND is_active = true LIMIT 1`,
      [userId],
    );
    let provider = active.rows[0]?.provider;
    if (provider === undefined) {
      const legacy = await sql(`SELECT provider FROM devx.settings WHERE user_id = $1 LIMIT 1`, [userId]);
      provider = legacy.rows[0]?.provider;
    }
    return browserlessRejection(reviewType, provider);
  }

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
    const browserless = await refuseBrowserlessReview("qa-test");
    if (browserless) return browserless;
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
    const browserless = await refuseBrowserlessReview("design-review");
    if (browserless) return browserless;
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

  // ── POST /apps/:id/docs/review ─────────────────────────────────────
  // "review" in the path for uniformity with the other four kinds (claw's
  // runReview builds /apps/:id/<kind>/review), but this agent WRITES docs;
  // its findings are the pages it added/updated.

  const docsReviewMatch = path.match(/\/apps\/([^/]+)\/docs\/review$/);
  if (docsReviewMatch && method === "POST") {
    const appId = docsReviewMatch[1];
    if (!await checkApp(appId)) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    const userMessage = await buildCodeReviewMessage(
      appId,
      "Document the recently implemented feature in this project's documentation website (d2e apps: docs/website). Read the plan and git diff to understand what was built, then add or update the documentation pages.",
    );
    if (!userMessage) {
      return Response.json({ error: "No code files found to document" }, { status: 400, headers: corsHeaders });
    }
    return runAgentReview({
      appId,
      systemPrompt: DOCS_UPDATE_SYSTEM_PROMPT,
      userMessage,
      parseFindings: parseDocsUpdateFindings,
      table: "docs-update",
      eventPrefix: "docs_review",
      allowedTools: DOCS_UPDATE_TOOLS,
    });
  }

  // ── GET /apps/:id/docs/reviews ─────────────────────────────────────

  const docsReviewsMatch = path.match(/\/apps\/([^/]+)\/docs\/reviews$/);
  if (docsReviewsMatch && method === "GET") {
    const appId = docsReviewsMatch[1];
    if (!await checkApp(appId)) {
      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    }
    return Response.json(await getLatestReview(appId, "docs-update"), { headers: corsHeaders });
  }

  return null;
}

// ── Shared Helpers ────────────────────────────────────────────────

const MAX_CONTEXT_SIZE = 200_000;

// The agreed plan the coder worked from. `docs/plans/<feature>.md` is where the
// facilitated flow writes it; take the most recently modified when a workspace has
// several, since that is the one the current task used.
async function findPlanDoc(wsPath: string): Promise<{ path: string; content: string } | null> {
  const dir = `${wsPath}/docs/plans`;
  let newest: { path: string; content: string; mtime: number } | null = null;
  try {
    for await (const entry of Deno.readDir(dir)) {
      if (!entry.isFile || !entry.name.endsWith(".md")) continue;
      const full = `${dir}/${entry.name}`;
      const stat = await Deno.stat(full);
      const mtime = stat.mtime?.getTime() ?? 0;
      if (!newest || mtime > newest.mtime) {
        newest = { path: `docs/plans/${entry.name}`, content: await Deno.readTextFile(full), mtime };
      }
    }
  } catch {
    return null; // no docs/plans dir — not every workspace is plan-driven
  }
  return newest ? { path: newest.path, content: newest.content } : null;
}

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
