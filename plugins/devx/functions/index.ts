// @ts-nocheck - Deno edge function, not compiled by tsc
import { getMaxHistoryTurns } from "./prompts.ts";
import { buildCoderContext, DEFAULT_MAX_STEPS } from "./coder_context.ts";
import { classifyCoderError } from "./error_codes.ts";
import { createSseWriter } from "./sse.ts";
import { deriveAuthShape } from "./auth_shape.ts";
import { runsUnattended } from "./autonomy.ts";
import { maskKey, settingsKeyWriteDecision } from "./api_key_mask.ts";
import { assertEncryptionMigrated, assertProviderConfigEncryptionMigrated, readProviderKey, writeProviderKeyFields } from "./provider_key.ts";
import { isNoKeyProvider, removedProviderResponse } from "./provider_support.ts";
import { streamAgentChat, resolveConsent, clearPendingConsents } from "./agent.ts";
import { clearPendingResponses } from "./tools/plan_tools.ts";
import { ensureAppWorkspace, getAppWorkspacePath, getRunWorktreePath, ensureWorktreeParent, readProjectRules } from "./tools/workspace.ts";
import { safeJoin, EXCLUDED_DIRS, EXCLUDED_FILES } from "./tools/path_safety.ts";
import { parseBuildTags, stripBuildTags } from "./build_tag_parser.ts";
import { executeBuildTags } from "./build_tag_executor.ts";
import { devServerManager } from "./dev_server.ts";
import { duckdb, openMemoryConnection, escapeSql } from "./duckdb.ts";
import { parseCodeReviewFindings } from "./code_review_prompt.ts";
import { parseSecurityFindings } from "./security_review_prompt.ts";
import { parseQaFindings } from "./qa_review_prompt.ts";
import { parseDesignFindings } from "./design_review_prompt.ts";
import { TEMPLATES, scaffoldTemplate, injectComponentTagger } from "./templates.ts";
import { relative } from "https://deno.land/std@0.224.0/path/mod.ts";
import { gitOps } from "./git.ts";
import { ensureGitConfig, refreshUserGitConfigs } from "./git_identity.ts";
import { getGithubToken, injectToken } from "./routes/github_routes.ts";
// Phase 6: Extracted route handlers
import { handleGitRoutes } from "./routes/git_routes.ts";
import { handleGithubRoutes } from "./routes/github_routes.ts";
import { handleMcpRoutes } from "./routes/mcp_routes.ts";
import { handleTrexRoutes } from "./routes/trex_routes.ts";
import { handlePlanRoutes } from "./routes/plan_routes.ts";
import { handleProviderRoutes } from "./routes/provider_routes.ts";
import { handlePromptRoutes } from "./routes/prompt_routes.ts";
import { handleAttachmentRoutes } from "./routes/attachment_routes.ts";
import { handleSecurityRoutes } from "./routes/security_routes.ts";
import { handleSigningRoutes } from "./routes/signing_routes.ts";
import { handleVisualEditingRoutes } from "./routes/visual_editing_routes.ts";
import { handlePrototypeRoutes } from "./routes/prototype_routes.ts";
import { handleD2ERoutes } from "./routes/d2e_routes.ts";
import { detectD2E } from "./d2e/detect.ts";
import { handleSupabaseRoutes } from "./routes/supabase_routes.ts";
import { handleSkillsRoutes } from "./routes/skills_routes.ts";
import { handleClaudeCodeRoutes } from "./routes/claude_code_routes.ts";
import { handleClaudeCodeModelsRoutes } from "./routes/claude_code_models_routes.ts";
import { handleFigmaRoutes } from "./routes/figma_routes.ts";
import { handleProviderConfigRoutes } from "./routes/provider_config_routes.ts";
import { handleSupportRoutes } from "./routes/support_routes.ts";
import { syncBuiltins } from "./skills/sync.ts";
import {
  parseSlashInput,
  resolveCommand,
  buildCommandOverride,
  loadSkillMetadata,
  loadSkillsForPrompt,
  matchSkillBySlug,
  matchSkillsByIntent,
  loadSkillBody,
  enrichSkillContext,
} from "./skills/resolver.ts";

// Load bridge scripts lazily for injection into proxied HTML.
// import.meta.url resolves to the Deno sandbox compile path where .js files
// aren't copied, so we try multiple paths including the plugin mount point.
let rpcBridgeScript = "";
let selectorClientScript = "";
let visualEditorClientScript = "";
let _visualEditingScriptsLoaded = false;

// Active dev-server output SSE poll loops, keyed by `${userId}:${appId}`.
// This runtime does not deliver client-disconnect to the worker (neither
// req.signal abort, controller.desiredSize, nor stream cancel() fire), so the
// 500ms poll loop cannot detect a gone client on its own and would orphan —
// each orphan keeps leasing DuckDB pool sessions until the shared pool drains
// and the node wedges. The frontend opens a fresh stream on every mount/app
// switch (useDevServer.ts), so when a new loop starts we proactively stop any
// prior loop for the same key (supersession). A lifetime cap in the loop
// bounds the remaining cases (app switch to a different key, abandoned tab).
const devOutputStreamStops = new Map<string, () => void>();

function loadVisualEditingScripts() {
  if (_visualEditingScriptsLoaded) return;
  _visualEditingScriptsLoaded = true;
  const candidates = [
    new URL("./visual_editing/selector_client.js", import.meta.url).pathname,
    // The devx plugin is mounted at /usr/src/plugins-dx in the dx image; the
    // import.meta.url path resolves into the eszip compile dir where these .js
    // assets aren't materialized, so this concrete path is what actually works.
    // Keep the legacy plugins-dev path as a last resort. Without a working path
    // the scripts load empty and the visual-editing overlay silently no-ops.
    "/usr/src/plugins-dx/devx/functions/visual_editing/selector_client.js",
    "/usr/src/plugins-dev/devx/functions/visual_editing/selector_client.js",
  ];
  for (const path of candidates) {
    try {
      selectorClientScript = Deno.readTextFileSync(path);
      // Same directory for the editor and RPC bridge scripts
      visualEditorClientScript = Deno.readTextFileSync(
        path.replace("selector_client.js", "visual_editor_client.js"),
      );
      rpcBridgeScript = Deno.readTextFileSync(
        path.replace("selector_client.js", "rpc_bridge.js"),
      );
      break;
    } catch {
      // try next candidate
    }
  }
  if (!selectorClientScript) {
    console.warn("Failed to load visual editing scripts from any path");
  }
}

const PROTOTYPE_MIME: Record<string, string> = {
  html: "text/html; charset=utf-8", htm: "text/html; charset=utf-8",
  js: "application/javascript; charset=utf-8", mjs: "application/javascript; charset=utf-8",
  css: "text/css; charset=utf-8", json: "application/json; charset=utf-8",
  svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
  gif: "image/gif", webp: "image/webp", ico: "image/x-icon", woff: "font/woff",
  woff2: "font/woff2", ttf: "font/ttf", map: "application/json; charset=utf-8",
};

/**
 * Serve a static prototype file (<workspace>/prototypes/...) from disk.
 * Returns null when the file is absent so the caller can fall through to the
 * dev-server proxy. HTML responses get the visual-editing bridge injected so
 * the selector/editor overlay works on mockups exactly as on the live app.
 */
async function servePrototypeFile(
  userId: string,
  appId: string,
  proxyPath: string,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  let abs: string;
  try {
    abs = safeJoin(getAppWorkspacePath(userId, appId), proxyPath);
  } catch {
    return null; // path traversal / bad appId
  }
  let bytes: Uint8Array;
  try {
    bytes = await Deno.readFile(abs);
  } catch {
    return null; // not found — let the proxy handle it
  }
  const ext = abs.split(".").pop()?.toLowerCase() ?? "";
  const ct = PROTOTYPE_MIME[ext] ?? "application/octet-stream";
  const headers = new Headers(corsHeaders);
  headers.set("Content-Type", ct);
  if (ct.startsWith("text/html")) {
    loadVisualEditingScripts();
    if (selectorClientScript) {
      let html = new TextDecoder().decode(bytes);
      const injected = `<script>${rpcBridgeScript}</script><script>${selectorClientScript}</script><script>${visualEditorClientScript}</script>`;
      html = html.includes("</head>")
        ? html.replace("</head>", `${injected}</head>`)
        : html.includes("</body>")
        ? html.replace("</body>", `${injected}</body>`)
        : html + injected;
      return new Response(html, { headers });
    }
  }
  return new Response(bytes, { headers });
}

const VALID_MODES = ["build", "ask", "agent", "plan"];

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const GOOGLE_GENERATE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  const origin = req.headers.get("origin") || "";
  const corsHeaders = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true",
  };

  if (method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get user from auth (passed via header by trex proxy)
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    }

    // Health check
    if (path.endsWith("/health")) {
      return Response.json({ status: "ok", plugin: "@trex/devx" }, { headers: corsHeaders });
    }


    // Built-in skills/commands/agents sync (once per worker, module-guarded).
    // Not awaited on the hot path — only skill/command/agent routes block on it;
    // apps/chats/files must not pay it on a cold worker.
    const fnPath = Deno.env.get("TREX_FUNCTION_PATH") || new URL("../", import.meta.url).pathname;
    const pluginBase = fnPath.replace(/\/functions\/?$/, "").replace(/\/$/, "");
    const builtinSync = syncBuiltins(pluginBase, sql);
    if (/\/(skills|commands|agents)(\/|$|\?)/.test(path)) {
      await builtinSync;
    }

    // Phase 6: Dispatch to extracted route handlers
    const routeResult =
      await handleGitRoutes(path, method, req, userId, sql, corsHeaders) ||
      await handleGithubRoutes(path, method, req, userId, sql, corsHeaders) ||
      await handleSigningRoutes(path, method, req, userId, sql, corsHeaders) ||
      await handleClaudeCodeRoutes(path, method, req, userId, sql, corsHeaders) ||
      await handleClaudeCodeModelsRoutes(path, method, req, userId, sql, corsHeaders) ||
      await handleFigmaRoutes(path, method, req, userId, sql, corsHeaders) ||
      await handleProviderConfigRoutes(path, method, req, userId, sql, corsHeaders) ||
      await handleMcpRoutes(path, method, req, userId, sql, corsHeaders) ||
      await handleSupabaseRoutes(path, method, req, userId, sql, corsHeaders) ||
      await handleTrexRoutes(path, method, req, userId, sql, corsHeaders) ||
      await handlePlanRoutes(path, method, req, userId, sql, corsHeaders) ||
      await handleProviderRoutes(path, method, req, userId, sql, corsHeaders) ||
      await handlePromptRoutes(path, method, req, userId, sql, corsHeaders) ||
      await handleAttachmentRoutes(path, method, req, userId, sql, corsHeaders) ||
      await handleSecurityRoutes(path, method, req, userId, sql, corsHeaders) ||
      await handleVisualEditingRoutes(path, method, req, userId, sql, corsHeaders) ||
      await handlePrototypeRoutes(path, method, req, userId, sql, corsHeaders) ||
      await handleD2ERoutes(path, method, req, userId, sql, corsHeaders) ||
      await handleSkillsRoutes(path, method, req, userId, sql, corsHeaders) ||
      await handleSupportRoutes(path, method, req, userId, sql, corsHeaders);
    if (routeResult) return routeResult;

    // --- Chat CRUD ---

    // GET /chats - list chats (optionally scoped by app_id)
    if (path.endsWith("/chats") && method === "GET") {
      const appIdParam = url.searchParams.get("app_id");
      const result = appIdParam
        ? await sql(
            `SELECT id, user_id, title, mode, app_id, created_at, updated_at
             FROM devx.chats
             WHERE user_id = $1 AND app_id = $2
             ORDER BY updated_at DESC`,
            [userId, appIdParam],
          )
        : await sql(
            `SELECT id, user_id, title, mode, app_id, created_at, updated_at
             FROM devx.chats
             WHERE user_id = $1 AND app_id IS NULL
             ORDER BY updated_at DESC`,
            [userId],
          );
      return Response.json(result.rows, { headers: corsHeaders });
    }

    // POST /chats - create chat
    if (path.endsWith("/chats") && method === "POST") {
      const body = await req.json();
      const title = body.title || "New Chat";
      const mode = body.mode || "build";
      if (!VALID_MODES.includes(mode)) {
        return Response.json({ error: "Invalid mode" }, { status: 400, headers: corsHeaders });
      }
      const appId = body.app_id || null;
      const result = await sql(
        `INSERT INTO devx.chats (user_id, title, mode, app_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id, user_id, title, mode, app_id, created_at, updated_at`,
        [userId, title, mode, appId],
      );
      return Response.json(result.rows[0], { headers: corsHeaders });
    }

    // PATCH /chats/:id - update chat (title and/or mode)
    const chatPatchMatch = path.match(/\/chats\/([^/]+)$/);
    if (chatPatchMatch && method === "PATCH") {
      const chatId = chatPatchMatch[1];
      const body = await req.json();
      const sets = [];
      const params = [];
      let paramIdx = 1;
      if (body.title !== undefined) {
        sets.push(`title = $${paramIdx++}`);
        params.push(body.title);
      }
      if (body.mode !== undefined) {
        if (!VALID_MODES.includes(body.mode)) {
          return Response.json({ error: "Invalid mode" }, { status: 400, headers: corsHeaders });
        }
        sets.push(`mode = $${paramIdx++}`);
        params.push(body.mode);
      }
      if (sets.length === 0) {
        return Response.json({ error: "No fields to update" }, { status: 400, headers: corsHeaders });
      }
      sets.push("updated_at = NOW()");
      params.push(chatId, userId);
      const result = await sql(
        `UPDATE devx.chats SET ${sets.join(", ")}
         WHERE id = $${paramIdx++} AND user_id = $${paramIdx}
         RETURNING id, user_id, title, mode, app_id, created_at, updated_at`,
        params,
      );
      if (result.rows.length === 0) {
        return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
      }
      return Response.json(result.rows[0], { headers: corsHeaders });
    }

    // DELETE /chats/:id - delete chat
    const chatDeleteMatch = path.match(/\/chats\/([^/]+)$/);
    if (chatDeleteMatch && method === "DELETE") {
      const chatId = chatDeleteMatch[1];
      await sql(
        `DELETE FROM devx.chats WHERE id = $1 AND user_id = $2`,
        [chatId, userId],
      );
      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    // GET /chats/:id/messages - list messages
    const messagesMatch = path.match(/\/chats\/([^/]+)\/messages$/);
    if (messagesMatch && method === "GET") {
      const chatId = messagesMatch[1];
      // Verify chat belongs to user
      const chatCheck = await sql(
        `SELECT id FROM devx.chats WHERE id = $1 AND user_id = $2`,
        [chatId, userId],
      );
      if (chatCheck.rows.length === 0) {
        return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
      }
      const result = await sql(
        `SELECT id, chat_id, role, content, model, tool_calls, created_at
         FROM devx.messages
         WHERE chat_id = $1
         ORDER BY created_at ASC`,
        [chatId],
      );
      return Response.json(result.rows, { headers: corsHeaders });
    }

    // POST /chats/:id/messages - persist a message (task-u1: the eve/agents
    // runtime's stateless /chat endpoint never writes to devx.messages
    // itself — history is client-provided on every request, and
    // agents.sessions/turns records the run for the dashboard in parallel,
    // not devx's own chat history. This is the client-side persistence call
    // the new agents-loop chat client makes after each turn so devx.messages
    // (read by GET above, shared by both loops) stays complete regardless of
    // which loop produced the turn. Same insert shape the legacy /stream
    // handler already writes server-side (chat_id, role, content, model,
    // tool_calls) — additive only, the legacy route above is untouched.
    if (messagesMatch && method === "POST") {
      const chatId = messagesMatch[1];
      const chatCheck = await sql(
        `SELECT id FROM devx.chats WHERE id = $1 AND user_id = $2`,
        [chatId, userId],
      );
      if (chatCheck.rows.length === 0) {
        return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
      }
      const body = await req.json();
      if (body.role !== "user" && body.role !== "assistant") {
        return Response.json({ error: "role must be 'user' or 'assistant'" }, { status: 400, headers: corsHeaders });
      }
      if (typeof body.content !== "string") {
        return Response.json({ error: "content must be a string" }, { status: 400, headers: corsHeaders });
      }
      if (body.content.length > 200_000) {
        return Response.json({ error: "content too long" }, { status: 400, headers: corsHeaders });
      }
      const result = await sql(
        `INSERT INTO devx.messages (chat_id, role, content, model, tool_calls)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, chat_id, role, content, model, tool_calls, created_at`,
        [chatId, body.role, body.content, body.model || null, body.tool_calls ? JSON.stringify(body.tool_calls) : null],
      );
      await sql(`UPDATE devx.chats SET updated_at = NOW() WHERE id = $1`, [chatId]);
      return Response.json(result.rows[0], { status: 201, headers: corsHeaders });
    }

    // POST /chats/:id/stream - stream chat completion
    const streamMatch = path.match(/\/chats\/([^/]+)\/stream$/);
    if (streamMatch && method === "POST") {
      const chatId = streamMatch[1];
      const body = await req.json();
      const prompt = body.prompt;
      const streamContext = body.context;
      // claw sets this so the coder works in a stable per-chat git worktree
      // (isolated feature branch) instead of the shared app working tree.
      const streamUseWorktree = body.useWorktree === true;
      // claw also sets this: the request originates from a chat channel whose
      // participants cannot execute anything on this machine. Appends the
      // remote-channel sandbox context to the system prompt (all providers);
      // the devx browser UI never sends it.
      const streamRemoteChannel = body.remoteChannel === true;
      // Channel attachments (metadata only: name/url/contentType), relayed by
      // claw. Downloaded into the coder's workspace before the turn so the
      // coder can Read them (images render multimodally); never inlined into
      // any prompt. Capped defensively — the urls are remote input.
      const streamAttachments = Array.isArray(body.attachments)
        ? body.attachments
          .filter((a) => a && typeof a.url === "string" && typeof a.name === "string")
          .slice(0, 10)
        : [];

      // Verify chat belongs to user
      const chatCheck = await sql(
        `SELECT id, mode, app_id FROM devx.chats WHERE id = $1 AND user_id = $2`,
        [chatId, userId],
      );
      if (chatCheck.rows.length === 0) {
        return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
      }

      // Get active provider config (multi-provider) with user-level prefs from settings.
      // Probe before selecting the encrypted columns: if V15 never applied,
      // this fails with a one-line diagnosis instead of a raw "column does
      // not exist" thrown outside any try/catch below.
      await assertProviderConfigEncryptionMigrated(sql);
      const activeProviderResult = await sql(
        `SELECT pc.provider, pc.model, pc.api_key, pc.api_key_encrypted, pc.api_key_iv, pc.base_url
         FROM devx.provider_configs pc
         WHERE pc.user_id = $1 AND pc.is_active = true
         LIMIT 1`,
        [userId],
      );
      const userPrefsResult = await sql(
        `SELECT ai_rules, auto_approve, max_steps, max_tool_steps, auto_fix_problems FROM devx.settings WHERE user_id = $1`,
        [userId],
      );
      const providerConfig = activeProviderResult.rows[0];
      const userPrefs = userPrefsResult.rows[0] || {};

      // Fall back to devx.settings if no provider_configs row exists (backward compat)
      let settings;
      if (providerConfig) {
        // Resolve through the encryption helper — never let the raw
        // api_key_encrypted/api_key_iv columns leak into `settings.api_key`
        // unresolved. A decryption failure (rotated/corrupt key) must fail
        // this turn loudly, not silently fall back to a stale plaintext
        // column, so it is not swallowed here.
        let resolvedApiKey;
        try {
          resolvedApiKey = await readProviderKey(providerConfig);
        } catch (err) {
          // classifyCoderError's `safe` string is deliberately generic ("Invalid
          // API key...") for the UI — log the actual cause (e.g. a rotated
          // DEVX_ENCRYPTION_KEY) so an operator can diagnose it from the server
          // log instead of only seeing the misleading UI message.
          console.error("[devx] provider key read failed for chat stream:", err instanceof Error ? err.message : err);
          const classified = classifyCoderError(err instanceof Error ? err.message : String(err));
          return Response.json(
            { error: classified.safe, code: classified.code },
            { status: 401, headers: corsHeaders },
          );
        }
        // Ciphertext has no business riding along into the engine settings
        // object — destructure it out rather than spreading it through.
        const { api_key_encrypted: _providerConfigEnc, api_key_iv: _providerConfigIv, ...providerConfigNoCiphertext } = providerConfig;
        settings = {
          ...providerConfigNoCiphertext,
          api_key: resolvedApiKey,
          ai_rules: userPrefs.ai_rules || null,
          auto_approve: userPrefs.auto_approve ?? false,
          max_steps: userPrefs.max_steps ?? 100,
          max_tool_steps: userPrefs.max_tool_steps ?? 10,
          auto_fix_problems: userPrefs.auto_fix_problems ?? false,
        };
      } else {
        // Legacy fallback. devx.settings carries the same encrypted-pair
        // columns as provider_configs (V16) now — probe and resolve the same
        // way, not a second, differently-shaped resolution.
        await assertEncryptionMigrated("settings", sql);
        const legacyResult = await sql(
          `SELECT provider, model, api_key, api_key_encrypted, api_key_iv, base_url, ai_rules, auto_approve, max_steps, max_tool_steps, auto_fix_problems FROM devx.settings WHERE user_id = $1`,
          [userId],
        );
        const legacyRow = legacyResult.rows[0];
        // No silent model fallback (kept in sync with agent.ts's resolveModel):
        // the former hardcoded anthropic/claude-sonnet default row always died
        // on the api_key check below anyway — error explicitly instead.
        if (!legacyRow) {
          return Response.json(
            { error: "No provider configured. Please set up your provider in Settings." },
            { status: 400, headers: corsHeaders },
          );
        }
        let resolvedLegacyApiKey;
        try {
          resolvedLegacyApiKey = await readProviderKey(legacyRow);
        } catch (err) {
          console.error("[devx] settings key read failed for chat stream:", err instanceof Error ? err.message : err);
          const classified = classifyCoderError(err instanceof Error ? err.message : String(err));
          return Response.json(
            { error: classified.safe, code: classified.code },
            { status: 401, headers: corsHeaders },
          );
        }
        // Ciphertext has no business riding along into the engine settings
        // object — destructure it out rather than spreading it through.
        const { api_key_encrypted: _legacyEnc, api_key_iv: _legacyIv, ...legacyNoCiphertext } = legacyRow;
        settings = { ...legacyNoCiphertext, api_key: resolvedLegacyApiKey };
      }

      // Single authority for the channel rule: both branches above carry
      // their own plain auto_approve preference through, so it is applied
      // exactly once, here, to whichever settings object resulted —
      // otherwise a remote channel could stall on every consent.
      settings = {
        ...settings,
        auto_approve: runsUnattended({
          remoteChannel: streamRemoteChannel,
          userAutoApprove: settings.auto_approve ?? false,
        }),
      };

      // Rows naming a removed engine are still in the database (the
      // provider_configs/settings tables were deliberately left unmigrated).
      // Reject them on the provider NAME, not on the missing key: the key gate
      // below catches today's rows only because the Settings UI happens to
      // write an empty api_key for them, but POST /provider-configs accepts any
      // provider string with any key, so such a row WITH a key would sail
      // through it into createModel's OpenAI-compatible branch and spend one
      // provider's credential as an OpenAI one. Keying on the provider makes
      // the guarantee structural, matching what agent.ts's resolveModel already
      // does on the other loop — and says what actually happened, which "No API
      // key configured" does not. See provider_support.ts.
      const removedProviderRejection = removedProviderResponse(settings.provider, corsHeaders);
      if (removedProviderRejection) return removedProviderRejection;

      // Subscription-based and Bedrock providers don't require an API key.
      // The membership is shared (provider_support.ts) so this waiver
      // cannot drift between read sites: waiving the key gate for a provider
      // that has no engine behind it lets the row fall through to the
      // OpenAI-compatible branch below, whose client resolves an absent key
      // from the worker's own OPENAI_API_KEY — one user's turn billed to, and
      // authenticated as, the operator.
      if (!settings.api_key && !isNoKeyProvider(settings.provider)) {
        return Response.json(
          { error: "No API key configured. Please set up your provider in Settings." },
          { status: 400, headers: corsHeaders },
        );
      }

      // Build enriched prompt for AI (with component snippets) and clean
      // display prompt for DB/chat history (Dyad-inspired approach)
      const displayPrompt = prompt;
      let aiPrompt = prompt;
      const hasComponentSelection = !!(streamContext?.visualEdit ||
        (streamContext?.selectedComponents && streamContext.selectedComponents.length > 0));

      if (hasComponentSelection && chatCheck.rows[0].app_id) {
        const wsPath = getAppWorkspacePath(userId, chatCheck.rows[0].app_id);
        const components = [];

        if (streamContext?.visualEdit) {
          components.push({
            name: streamContext.visualEdit.componentName,
            filePath: streamContext.visualEdit.filePath,
            line: streamContext.visualEdit.line,
          });
        }
        if (streamContext?.selectedComponents) {
          for (const c of streamContext.selectedComponents) {
            components.push({ name: c.devxName, filePath: c.filePath, line: c.line });
          }
        }

        let snippetBlock = components.length === 1 && streamContext?.visualEdit
          ? "\n\nVisual edit target:\n"
          : "\n\nSelected components:\n";

        for (let i = 0; i < components.length; i++) {
          const comp = components[i];
          let snippet = "[snippet not available]";
          try {
            const sourceContent = await Deno.readTextFile(`${wsPath}/${comp.filePath}`);
            const lines = sourceContent.split("\n");
            const targetIdx = comp.line - 1; // 0-indexed
            const startIdx = Math.max(0, targetIdx - 1);
            const endIdx = Math.min(lines.length, targetIdx + 4);
            const snippetLines = lines.slice(startIdx, endIdx).map((l, j) => {
              const lineNum = startIdx + j + 1;
              const marker = (startIdx + j === targetIdx) ? " // <-- EDIT HERE" : "";
              return `${lineNum} | ${l}${marker}`;
            });
            snippet = snippetLines.join("\n");
          } catch { /* file read failed */ }

          const prefix = components.length > 1 ? `${i + 1}. ` : "";
          snippetBlock += `\n${prefix}Component: ${comp.name} (file: ${comp.filePath})\n\nSnippet:\n\`\`\`tsx\n${snippet}\n\`\`\`\n`;
        }

        aiPrompt = prompt + snippetBlock;
      }

      // --- Skill/Command resolution ---
      let skillContext = undefined;
      let commandOverride = undefined;
      // Skills listing for SKILL_USAGE_RULE ("The skills above are real and
      // invocable") — resolved inside the try below so a devx.skills failure
      // degrades the same way every other skill/command read here does
      // (logged, request proceeds without it) rather than hard-failing the
      // turn.
      let skills = [];
      const streamAppId = chatCheck.rows[0].app_id;

      try {
        // Independent of slash-command/intent matching below; resolved
        // first so every branch (including the early-return meta-commands)
        // still has a best-effort listing if reached later.
        skills = await loadSkillsForPrompt(userId, sql);

        // --- Meta-commands: respond inline without AI ---
        const slashInput = parseSlashInput(prompt);

        // /agent <skill> — spawn a background subagent with its own context
        if (slashInput && slashInput.slug === "agent") {
          const encoder = new TextEncoder();

          // Helper to return a quick inline response
          const quickResponse = async (msg: string) => {
            await sql(`INSERT INTO devx.messages (chat_id, role, content) VALUES ($1, 'user', $2)`, [chatId, displayPrompt]);
            await sql(`INSERT INTO devx.messages (chat_id, role, content) VALUES ($1, 'assistant', $2)`, [chatId, msg]);
            const stream = new ReadableStream({
              start(c) {
                c.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: msg })}\n\n`));
                c.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", content: msg })}\n\n`));
                c.close();
              },
            });
            return new Response(stream, { headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
          };

          if (!streamAppId) {
            return quickResponse("Select an app first to run an agent.");
          }

          const innerArg = (slashInput.args || "").trim().replace(/^\//, "");
          const skills = await loadSkillMetadata(userId, sql);
          const matchedSkill = innerArg ? matchSkillBySlug(innerArg, skills) : null;

          if (!innerArg || !matchedSkill) {
            const available = skills.filter(s => s.slug).map(s => {
              const aliases = (s.aliases || []).map(a => `\`${a}\``).join(", ");
              return `- \`/agent /${s.slug}\`${aliases ? ` (or ${aliases})` : ""} — ${s.description?.split(".")[0] || s.name}`;
            }).join("\n");
            return quickResponse(innerArg
              ? `Unknown skill: \`${innerArg}\`. Available skills:\n\n${available}`
              : `Usage: \`/agent /<skill>\`\n\nAvailable skills:\n\n${available}`);
          }

          // Create subagent run
          const runResult = await sql(
            `INSERT INTO devx.subagent_runs (parent_chat_id, agent_name, task, user_id, app_id, skill_name)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [chatId, matchedSkill.name, `Run ${matchedSkill.name}`, userId, streamAppId, matchedSkill.slug],
          );
          const runId = runResult.rows[0].id;

          // Return immediately with a confirmation — agent runs in background via /agents/:id/start
          return quickResponse(`Started **${matchedSkill.name}** agent. Check the Agents tab to follow progress.\n\n_Agent run: ${runId}_`);
        }

        if (slashInput && ["commands", "skills", "help"].includes(slashInput.slug)) {
          // Save user message
          await sql(
            `INSERT INTO devx.messages (chat_id, role, content) VALUES ($1, 'user', $2)`,
            [chatId, displayPrompt],
          );

          let listing = "";
          if (slashInput.slug === "commands" || slashInput.slug === "help") {
            const cmds = await sql(
              `SELECT slug, description, argument_hint FROM devx.commands
               WHERE enabled = true AND (user_id = $1 OR (is_builtin = true AND user_id IS NULL))
               ORDER BY slug`,
              [userId],
            );
            const skills = await sql(
              `SELECT slug, description FROM devx.skills
               WHERE slug IS NOT NULL AND enabled = true
                 AND (user_id = $1 OR (is_builtin = true AND user_id IS NULL))
               ORDER BY slug`,
              [userId],
            );
            listing = "## Available Commands\n\n";
            listing += "| Command | Description |\n|---------|-------------|\n";
            listing += `| \`/agent /<skill>\` | Run a skill as an autonomous agent |\n`;
            listing += `| \`/commands\` | List all available commands |\n`;
            listing += `| \`/skills\` | List all available skills |\n`;
            listing += `| \`/help\` | Show this help |\n`;
            for (const c of cmds.rows) {
              const hint = c.argument_hint ? ` ${c.argument_hint}` : "";
              listing += `| \`/${c.slug}${hint}\` | ${c.description || "—"} |\n`;
            }
            if (skills.rows.length > 0) {
              listing += "\n## Available Skills\n\n";
              listing += "| Skill | Description |\n|-------|-------------|\n";
              for (const s of skills.rows) {
                listing += `| \`/${s.slug}\` | ${s.description || "—"} |\n`;
              }
            }
          } else if (slashInput.slug === "skills") {
            const skills = await sql(
              `SELECT slug, name, description FROM devx.skills
               WHERE enabled = true AND (user_id = $1 OR (is_builtin = true AND user_id IS NULL))
               ORDER BY slug`,
              [userId],
            );
            listing = "## Available Skills\n\n";
            if (skills.rows.length === 0) {
              listing += "No skills registered yet.";
            } else {
              listing += "| Skill | Description |\n|-------|-------------|\n";
              for (const s of skills.rows) {
                const slug = s.slug ? `\`/${s.slug}\`` : s.name;
                listing += `| ${slug} | ${s.description || "—"} |\n`;
              }
            }
          }

          // Save and stream as assistant message
          await sql(
            `INSERT INTO devx.messages (chat_id, role, content) VALUES ($1, 'assistant', $2)`,
            [chatId, listing],
          );
          const encoder = new TextEncoder();
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", content: listing })}\n\n`));
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", content: listing })}\n\n`));
              controller.close();
            },
          });
          return new Response(stream, {
            headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
          });
        }

        if (slashInput) {
          // Try as command first, then as skill slug
          const cmd = await resolveCommand(slashInput.slug, userId, sql);
          if (cmd) {
            commandOverride = buildCommandOverride(cmd, slashInput.args);
          } else {
            const skills = await loadSkillMetadata(userId, sql);
            const matchedSkill = matchSkillBySlug(slashInput.slug, skills);
            if (matchedSkill) {
              let body = await loadSkillBody(matchedSkill.id, sql);
              if (body) {
                const wsPath = streamAppId ? getAppWorkspacePath(userId, streamAppId) : "";
                body = await enrichSkillContext(matchedSkill.name, body, streamAppId, userId, wsPath, sql);
                skillContext = body;
                if (matchedSkill.mode === "agent") {
                  commandOverride = { allowed_tools: matchedSkill.allowed_tools, model: null };
                }
              }
            }
          }
        } else {
          // No slash command — try intent matching
          const skills = await loadSkillMetadata(userId, sql);
          const matchedSkill = matchSkillsByIntent(prompt, skills);
          if (matchedSkill) {
            let body = await loadSkillBody(matchedSkill.id, sql);
            if (body) {
              const wsPath = streamAppId ? getAppWorkspacePath(userId, streamAppId) : "";
              body = await enrichSkillContext(matchedSkill.name, body, streamAppId, userId, wsPath, sql);
              skillContext = body;
            }
          }
        }
      } catch (err) {
        console.error("[index] Skill/command resolution error:", err);
        // Don't block the request — proceed without skill/command
      }

      // Save user message
      await sql(
        `INSERT INTO devx.messages (chat_id, role, content) VALUES ($1, 'user', $2)`,
        [chatId, displayPrompt],
      );

      // Build system prompt based on chat mode
      let chatMode = chatCheck.rows[0].mode || "build";
      // Skills run in agent mode (interactive, with consent) in the current chat
      if (skillContext && chatMode !== "agent" && chatMode !== "plan") {
        chatMode = "agent";
      }

      // Read project rules (TREX.md, legacy AI_RULES.md) from the app
      // workspace, fall back to DB settings.
      let aiRules = settings.ai_rules || undefined;
      if (streamAppId) {
        const wsPath = getAppWorkspacePath(userId, streamAppId);
        const rules = await readProjectRules(wsPath);
        if (rules !== undefined) aiRules = rules;
      }

      // `skills` was already resolved above, inside the Skill/Command
      // resolution try/catch — degrades to [] on a devx.skills failure
      // rather than failing the turn.
      const { systemPrompt } = await buildCoderContext({
        mode: chatMode,
        aiRules,
        skillContext,
        remoteChannel: streamRemoteChannel,
        hasComponentSelection,
        settings,
        // Raw providers (anthropic/google/bedrock/openai) are called directly
        // below with a single fetch, not through the tool-calling registries —
        // none of them register mcp__ask__ask_question.
        askToolAvailable: false,
        skills,
      });
      const maxHistory = getMaxHistoryTurns(chatMode);

      // Get most recent messages for context (subquery to get newest, then order ascending)
      const historyResult = await sql(
        `SELECT role, content FROM (
           SELECT role, content, created_at FROM devx.messages
           WHERE chat_id = $1
           ORDER BY created_at DESC
           LIMIT $2
         ) sub ORDER BY created_at ASC`,
        [chatId, maxHistory],
      );
      let history = historyResult.rows;

      // Swap the last user message with the AI-enriched version (with component snippets)
      // so the AI sees code context inline while the DB keeps the clean display prompt
      if (aiPrompt !== displayPrompt && history.length > 0) {
        const lastMsg = history[history.length - 1];
        if (lastMsg.role === "user" && lastMsg.content === displayPrompt) {
          lastMsg.content = aiPrompt;
        }
      }

      // Prepend compacted context summary if available
      const compactResult = await sql(
        `SELECT summary FROM devx.compacted_contexts WHERE chat_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [chatId],
      );
      if (compactResult.rows.length > 0) {
        history = [{ role: "user", content: `[Previous conversation summary]: ${compactResult.rows[0].summary}` }, ...history];
      }

      // Auto-title on first message
      if (history.length === 1) {
        const shortTitle = prompt.length > 50 ? prompt.substring(0, 50) + "..." : prompt;
        await sql(
          `UPDATE devx.chats SET title = $1, updated_at = NOW() WHERE id = $2`,
          [shortTitle, chatId],
        );
      }

      // Stream the AI response
      const stream = new ReadableStream({
        async start(controller) {
          // See functions/sse.ts: writing to a dead stream must never throw, and
          // close() must be idempotent — an unguarded send() in the catch below
          // once skipped its own close() and stranded claw's runCodeTurn on the
          // fetch for 65 minutes after a recoverable rate limit.
          const writer = createSseWriter(controller);
          const { send, sendRaw } = writer;
          const closeStream = () => writer.close();

          // SSE heartbeat keeps the connection alive during long waits (e.g. questionnaires)
          const heartbeat = setInterval(() => { sendRaw(": heartbeat\n\n"); }, 15000);

          try {
            let fullContent = "";

            let savedToolCalls: any[] | null = null;
            if (chatMode === "agent" || chatMode === "plan") {
              // Agent/plan mode: use AI SDK with tool calling
              const agentResult = await streamAgentChat({
                chatId,
                userId,
                appId: chatCheck.rows[0].app_id,
                chatMode,
                settings,
                history,
                send,
                sqlFn: sql,
                skillContext,
                commandOverride,
                hasComponentSelection,
                useWorktree: streamUseWorktree,
                remoteChannel: streamRemoteChannel,
                attachments: streamAttachments,
              });
              fullContent = agentResult.content;
              if (agentResult.toolCalls.length > 0) savedToolCalls = agentResult.toolCalls;
            } else if (settings.provider === "claude-code") {
              const { streamClaudeCodeChat } = await import("./claude_code_agent.ts");
              const agentResult = await streamClaudeCodeChat({
                chatId,
                userId,
                appId: chatCheck.rows[0].app_id,
                chatMode,
                settings,
                history,
                send,
                sqlFn: sql,
                skillContext,
                commandOverride,
                hasComponentSelection,
                useWorktree: streamUseWorktree,
                remoteChannel: streamRemoteChannel,
                attachments: streamAttachments,
              });
              fullContent = agentResult.content;
              if (agentResult.toolCalls?.length > 0) savedToolCalls = agentResult.toolCalls;
            } else if (settings.provider === "anthropic") {
              fullContent = await streamAnthropic(settings, history, send, systemPrompt);
            } else if (settings.provider === "google") {
              fullContent = await streamGoogle(settings, history, send, systemPrompt);
            } else if (settings.provider === "bedrock") {
              fullContent = await streamBedrockViaSdk(settings, history, send, systemPrompt);
            } else {
              // OpenAI and OpenAI-compatible
              fullContent = await streamOpenAI(settings, history, send, systemPrompt);
            }

            // Execute build tags if in build mode with an app
            const appId = chatCheck.rows[0].app_id;
            if (chatMode === "build" && appId) {
              const tags = parseBuildTags(fullContent);
              if (tags.length > 0) {
                const wsPath = await ensureAppWorkspace(userId, appId);
                await executeBuildTags(tags, { workspacePath: wsPath, chatId, userId, send, sql });
                fullContent = stripBuildTags(fullContent);
              }
            }

            // Save assistant message (with tool calls if any)
            const saveResult = await sql(
              `INSERT INTO devx.messages (chat_id, role, content, model, tool_calls)
               VALUES ($1, 'assistant', $2, $3, $4)
               RETURNING id, chat_id, role, content, model, tool_calls, created_at`,
              [chatId, fullContent, settings.model, savedToolCalls ? JSON.stringify(savedToolCalls) : null],
            );

            send({ type: "done", message: saveResult.rows[0], content: saveResult.rows[0]?.content ?? "" });
            sendRaw("data: [DONE]\n\n");
            clearInterval(heartbeat);
            closeStream();
          } catch (err) {
            clearInterval(heartbeat);
            console.error("Stream error:", err);
            const msg = err instanceof Error ? err.message : String(err);
            const classified = classifyCoderError(msg);
            send({
              type: "error",
              error: classified.safe,
              code: classified.code,
              // claw is an internal caller with no end-user reading it: give it the real
              // message so the channel gets something actionable instead of "unknown".
              ...(streamRemoteChannel ? { raw: msg } : {}),
            });
            // Unconditional: whether or not the error frame made it onto the
            // wire, the response MUST terminate or the caller blocks on a
            // stream that will never produce another byte.
            closeStream();
          }
        },
        cancel() {
          clearInterval(heartbeat);
          clearPendingConsents(chatId, sql);
          clearPendingResponses(chatId, sql);
        },
      });

      return new Response(stream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // --- Consent ---

    // POST /chats/:id/consent - respond to a consent request
    const consentMatch = path.match(/\/chats\/([^/]+)\/consent$/);
    if (consentMatch && method === "POST") {
      const body = await req.json();
      const { requestId, decision } = body;
      if (!requestId || !decision) {
        return Response.json({ error: "requestId and decision required" }, { status: 400, headers: corsHeaders });
      }
      const resolved = await resolveConsent(requestId, decision, userId, sql);
      if (!resolved) {
        return Response.json({ error: "Consent request not found or unauthorized" }, { status: 404, headers: corsHeaders });
      }
      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    // --- Todos ---

    // GET /chats/:id/todos - list todos for a chat
    const todosMatch = path.match(/\/chats\/([^/]+)\/todos$/);
    if (todosMatch && method === "GET") {
      const chatId = todosMatch[1];
      // Verify chat belongs to user
      const chatCheck = await sql(
        `SELECT id FROM devx.chats WHERE id = $1 AND user_id = $2`,
        [chatId, userId],
      );
      if (chatCheck.rows.length === 0) {
        return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
      }
      const result = await sql(
        `SELECT todo_id as id, content, status FROM devx.todos
         WHERE chat_id = $1 ORDER BY created_at ASC`,
        [chatId],
      );
      return Response.json(result.rows, { headers: corsHeaders });
    }

    // --- Subagent Runs ---

    // GET /agents - list subagent runs for the user (optionally by app_id)
    if (path.endsWith("/agent-runs") && method === "GET") {
      const appIdParam = url.searchParams.get("app_id");
      const result = appIdParam
        ? await sql(
            `SELECT id, parent_chat_id, parent_run_id, run_kind, branch, agent_name, skill_name, task, status, created_at, completed_at
             FROM devx.subagent_runs WHERE user_id = $1 AND app_id = $2
             ORDER BY created_at DESC LIMIT 50`,
            [userId, appIdParam],
          )
        : await sql(
            `SELECT id, parent_chat_id, parent_run_id, run_kind, branch, agent_name, skill_name, task, status, created_at, completed_at
             FROM devx.subagent_runs WHERE user_id = $1
             ORDER BY created_at DESC LIMIT 50`,
            [userId],
          );
      return Response.json(result.rows, { headers: corsHeaders });
    }

    // POST /agents/:id/start - start a subagent run (SSE stream)
    const agentStartMatch = path.match(/\/agent-runs\/([^/]+)\/start$/);
    if (agentStartMatch && method === "POST") {
      const runId = agentStartMatch[1];
      const runResult = await sql(
        `SELECT * FROM devx.subagent_runs WHERE id = $1 AND user_id = $2`,
        [runId, userId],
      );
      if (runResult.rows.length === 0) {
        return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
      }
      const run = runResult.rows[0];
      if (run.status !== "running") {
        return Response.json({ error: "Agent already completed" }, { status: 400, headers: corsHeaders });
      }

      // Load skill
      const skills = await loadSkillMetadata(userId, sql);
      const matchedSkill = skills.find(s => s.slug === run.skill_name || s.name === run.agent_name);
      let skillBody = "";
      if (matchedSkill) {
        skillBody = await loadSkillBody(matchedSkill.id, sql) || "";
        if (skillBody && run.app_id) {
          const wsPath = getAppWorkspacePath(userId, run.app_id);
          skillBody = await enrichSkillContext(matchedSkill.name, skillBody, run.app_id, userId, wsPath, sql);
        }
      }

      // Resolve the active provider (multi-provider) with legacy fallback,
      // mirroring POST /chats/:id/stream, so plan runs can use claude-code.
      // Same pre-select probe as that site — see comment there.
      await assertProviderConfigEncryptionMigrated(sql);
      const activeProvider = (await sql(
        `SELECT pc.provider, pc.model, pc.api_key, pc.api_key_encrypted, pc.api_key_iv, pc.base_url
         FROM devx.provider_configs pc WHERE pc.user_id = $1 AND pc.is_active = true LIMIT 1`,
        [userId],
      )).rows[0];
      const agentPrefs = (await sql(
        `SELECT ai_rules, auto_approve, max_steps, max_tool_steps, auto_fix_problems FROM devx.settings WHERE user_id = $1`,
        [userId],
      )).rows[0] || {};
      let agentSettings;
      if (activeProvider) {
        // Same "resolve, don't leak, fail loudly" posture as the /stream
        // read site above.
        let resolvedApiKey;
        try {
          resolvedApiKey = await readProviderKey(activeProvider);
        } catch (err) {
          // See the /stream read site's comment above — log the raw cause,
          // the UI only gets classifyCoderError's generic message.
          console.error("[devx] provider key read failed for agent run:", err instanceof Error ? err.message : err);
          const classified = classifyCoderError(err instanceof Error ? err.message : String(err));
          return Response.json(
            { error: classified.safe, code: classified.code },
            { status: 401, headers: corsHeaders },
          );
        }
        // Same "no ciphertext in the settings object" posture as the
        // /stream read site above (index.ts:451's fix — the identical
        // pattern existed here too).
        const { api_key_encrypted: _activeProviderEnc, api_key_iv: _activeProviderIv, ...activeProviderNoCiphertext } = activeProvider;
        agentSettings = {
          ...activeProviderNoCiphertext,
          api_key: resolvedApiKey,
          ai_rules: agentPrefs.ai_rules || null,
          max_steps: agentPrefs.max_steps ?? 100,
          max_tool_steps: agentPrefs.max_tool_steps ?? 10,
          auto_fix_problems: agentPrefs.auto_fix_problems ?? false,
        };
      } else {
        // Legacy fallback, same resolve-don't-leak posture as the
        // provider_configs branch above (devx.settings carries the same
        // encrypted-pair columns as of V16).
        await assertEncryptionMigrated("settings", sql);
        const legacyRow = (await sql(
          `SELECT provider, model, api_key, api_key_encrypted, api_key_iv, base_url, ai_rules, auto_approve, max_steps, max_tool_steps, auto_fix_problems FROM devx.settings WHERE user_id = $1`,
          [userId],
        )).rows[0];
        if (legacyRow) {
          let resolvedLegacyApiKey;
          try {
            resolvedLegacyApiKey = await readProviderKey(legacyRow);
          } catch (err) {
            console.error("[devx] settings key read failed for agent run:", err instanceof Error ? err.message : err);
            const classified = classifyCoderError(err instanceof Error ? err.message : String(err));
            return Response.json(
              { error: classified.safe, code: classified.code },
              { status: 401, headers: corsHeaders },
            );
          }
          const { api_key_encrypted: _legacyEnc, api_key_iv: _legacyIv, ...legacyNoCiphertext } = legacyRow;
          agentSettings = { ...legacyNoCiphertext, api_key: resolvedLegacyApiKey };
        } else {
          agentSettings = undefined;
        }
      }
      // Removed-engine rows are rejected on the provider name here too — see
      // the /stream read site's comment for why the key gate below is not
      // enough on its own.
      const removedAgentProviderRejection = removedProviderResponse(agentSettings?.provider, corsHeaders);
      if (removedAgentProviderRejection) return removedAgentProviderRejection;
      // Same shared membership as the /stream read site above — only providers
      // that genuinely authenticate without a stored key belong in it, or the
      // row reaches createModel's OpenAI-compatible fallback on the worker's
      // own credentials.
      if (!agentSettings || (!agentSettings.api_key && !isNoKeyProvider(agentSettings.provider))) {
        return Response.json({ error: "AI provider not configured" }, { status: 400, headers: corsHeaders });
      }
      // Agent-driven runs are autonomous.
      agentSettings = { ...agentSettings, auto_approve: true };

      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          const send = (data: unknown) => {
            try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)); } catch { /* closed */ }
          };
          const heartbeat = setInterval(() => {
            try { controller.enqueue(encoder.encode(": heartbeat\n\n")); } catch { /* closed */ }
          }, 15000);

          try {
            const { streamAgentChat } = await import("./agent.ts");

            // Map SDK Task ids → child subagent_runs ids (for nested display).
            const childRuns = new Map<string, string>();

            // Log tool calls as subagent messages; bridge SDK Task subagents
            // into child subagent_runs rows (parent_run_id = this run).
            const agentSend = (data: any) => {
              send(data); // Forward to SSE
              if (data.type === "tool_call_start") {
                sql(
                  `INSERT INTO devx.subagent_messages (run_id, role, content, tool_name, tool_call_id)
                   VALUES ($1, 'tool', $2, $3, $4)`,
                  [runId, JSON.stringify(data.args || {}), data.name, data.callId],
                ).catch(() => {});
              } else if (data.type === "subagent_start" && data.taskId) {
                sql(
                  `INSERT INTO devx.subagent_runs
                     (parent_chat_id, parent_run_id, agent_name, task, user_id, app_id, run_kind, status)
                   VALUES ($1, $2, $3, $4, $5, $6, 'subagent', 'running') RETURNING id`,
                  [run.parent_chat_id, runId, (data.name || "subagent").slice(0, 200), (data.task || "").slice(0, 4000), userId, run.app_id],
                ).then((r) => { if (r.rows[0]) childRuns.set(data.taskId, r.rows[0].id); }).catch(() => {});
              } else if (data.type === "subagent_step" && data.taskId && data.lastTool) {
                const cid = childRuns.get(data.taskId);
                if (cid) {
                  sql(
                    `INSERT INTO devx.subagent_messages (run_id, role, content, tool_name) VALUES ($1, 'tool', $2, $3)`,
                    [cid, (data.summary || "").slice(0, 4000), data.lastTool],
                  ).catch(() => {});
                }
              } else if (data.type === "subagent_done" && data.taskId) {
                const cid = childRuns.get(data.taskId);
                if (cid) {
                  sql(
                    `UPDATE devx.subagent_runs SET status = $1, result = $2, completed_at = NOW() WHERE id = $3`,
                    [data.status === "completed" ? "completed" : "failed", (data.result || "").slice(0, 50000), cid],
                  ).catch(() => {});
                }
              }
            };

            // Plan-execution runs get a directive prompt that pre-decides
            // subagent-driven execution (so the skill won't re-ask), and run on
            // the claude-code path where the devx skills are invocable.
            const isPlanRun = run.run_kind === "agent" && !!run.plan_id;
            const runPrompt = isPlanRun
              ? `Execute the following implementation plan using the subagent-driven-development skill. Do not ask which execution strategy to use — use subagent-driven execution. Implement everything end-to-end with your tools.\n\nPLAN:\n${run.task}`
              : run.task + ". Use your tools to thoroughly analyze the project.";

            // Isolate agent-driven plan runs in a dedicated git worktree on a
            // run/<id> branch, so concurrent runs don't collide and the work is
            // reviewable/mergeable from the Git tab. Non-fatal on failure.
            let cwdOverride: string | undefined;
            if (isPlanRun && run.app_id) {
              try {
                const repoRoot = getAppWorkspacePath(userId, run.app_id);
                await ensureWorktreeParent(userId, run.app_id);
                const wtPath = getRunWorktreePath(userId, run.app_id, runId);
                const branch = `run/${runId.slice(0, 8)}`;
                await gitOps.worktreeAdd(repoRoot, wtPath, branch);
                cwdOverride = wtPath;
                await sql(
                  `UPDATE devx.subagent_runs SET branch = $1, worktree_path = $2 WHERE id = $3`,
                  [branch, wtPath, runId],
                );
                agentSend({ type: "chunk", content: `\n> 🌿 Isolated worktree \`${branch}\` created — review/merge it from the Git tab.\n\n` });
              } catch (e) {
                agentSend({ type: "chunk", content: `\n> ⚠️ Could not create an isolated worktree (${e.message}); running in the main tree.\n\n` });
              }
            }

            const baseArgs = {
              chatId: `agent-run-${runId}`,
              userId,
              appId: run.app_id,
              chatMode: "agent" as const,
              settings: { ...agentSettings, max_steps: 100, auto_approve: true },
              history: [{ role: "user", content: runPrompt }],
              send: agentSend,
              sqlFn: sql,
              skillContext: skillBody,
              commandOverride: matchedSkill?.allowed_tools
                ? { allowed_tools: matchedSkill.allowed_tools, model: null, body: "" }
                : undefined,
              workspacePathOverride: cwdOverride,
            };

            let result;
            if (isPlanRun && agentSettings.provider === "claude-code") {
              const { streamClaudeCodeChat } = await import("./claude_code_agent.ts");
              result = await streamClaudeCodeChat(baseArgs);
            } else {
              if (isPlanRun && agentSettings.provider !== "claude-code") {
                agentSend({ type: "chunk", content: "\n> ⚠️ Subagent-driven execution needs the Claude Code provider; running in basic autonomous mode.\n\n" });
              }
              result = await streamAgentChat(baseArgs);
            }

            const fullContent = result.content || "";
            await sql(
              `UPDATE devx.subagent_runs SET status = 'completed', result = $1, completed_at = NOW() WHERE id = $2`,
              [fullContent.slice(0, 50000), runId],
            );
            // Plan-execution runs mark their plan implemented on success.
            if (run.plan_id) {
              await sql(
                `UPDATE devx.plans SET status = 'implemented', updated_at = NOW() WHERE id = $1`,
                [run.plan_id],
              ).catch(() => {});
            }
            // Save final assistant message
            await sql(
              `INSERT INTO devx.subagent_messages (run_id, role, content) VALUES ($1, 'assistant', $2)`,
              [runId, fullContent],
            );

            // Parse and store review findings based on skill type
            try {
              const skillName = run.skill_name || run.agent_name;
              let findings = null;
              let resultType = null;
              if (skillName === "code-review" || skillName === "review") {
                findings = parseCodeReviewFindings(fullContent);
                resultType = "code-review";
              } else if (skillName === "security-review" || skillName === "security") {
                findings = parseSecurityFindings(fullContent);
                resultType = "security-review";
              } else if (skillName === "qa-test" || skillName === "qa") {
                findings = parseQaFindings(fullContent);
                resultType = "qa-test";
              } else if (skillName === "design-review" || skillName === "design") {
                findings = parseDesignFindings(fullContent);
                resultType = "design-review";
              }
              if (findings && findings.length > 0 && resultType && run.app_id) {
                await sql(
                  `INSERT INTO devx.agent_results (app_id, user_id, run_id, result_type, findings)
                   VALUES ($1, $2, $3, $4, $5)`,
                  [run.app_id, userId, runId, resultType, JSON.stringify(findings)],
                );
              }
            } catch { /* parsing failed, not critical */ }

            send({ type: "done", content: fullContent });
          } catch (err) {
            await sql(
              `UPDATE devx.subagent_runs SET status = 'failed', result = $1, completed_at = NOW() WHERE id = $2`,
              [err.message, runId],
            );
            const classifiedRun = classifyCoderError(err.message ?? String(err));
            // Note: `remoteChannel` is not plumbed into this handler (subagent runs
            // don't originate from claw), so we omit `raw` here rather than invent
            // new plumbing — see error_codes.ts for the vocabulary this maps through.
            send({ type: "error", error: classifiedRun.safe, code: classifiedRun.code });
          } finally {
            clearInterval(heartbeat);
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
      });
    }

    // GET /agents/:id/messages - get subagent messages
    const agentMsgsMatch = path.match(/\/agent-runs\/([^/]+)\/messages$/);
    if (agentMsgsMatch && method === "GET") {
      const runId = agentMsgsMatch[1];
      const runCheck = await sql(
        `SELECT id FROM devx.subagent_runs WHERE id = $1 AND user_id = $2`,
        [runId, userId],
      );
      if (runCheck.rows.length === 0) {
        return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
      }
      const result = await sql(
        `SELECT id, role, content, tool_name, tool_call_id, created_at
         FROM devx.subagent_messages WHERE run_id = $1 ORDER BY created_at ASC`,
        [runId],
      );
      return Response.json(result.rows, { headers: corsHeaders });
    }

    // POST /agents/:id/stop - stop a running subagent
    const agentStopMatch = path.match(/\/agent-runs\/([^/]+)\/stop$/);
    if (agentStopMatch && method === "POST") {
      const runId = agentStopMatch[1];
      const result = await sql(
        `UPDATE devx.subagent_runs SET status = 'failed', result = 'Stopped by user', completed_at = NOW()
         WHERE id = $1 AND user_id = $2 AND status = 'running' RETURNING id`,
        [runId, userId],
      );
      if (result.rows.length === 0) {
        return Response.json({ error: "Not found or already completed" }, { status: 404, headers: corsHeaders });
      }
      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    // --- Settings ---

    // GET /settings
    if (path.endsWith("/settings") && method === "GET") {
      // Probe before selecting the encrypted columns — see provider_key.ts's
      // assertEncryptionMigrated header comment.
      await assertEncryptionMigrated("settings", sql);
      const result = await sql(
        `SELECT id, user_id, provider, model, api_key, api_key_encrypted, api_key_iv, base_url, ai_rules,
                auto_approve, max_steps, max_tool_steps, auto_fix_problems,
                loop, git_author_name, git_author_email, created_at, updated_at
         FROM devx.settings WHERE user_id = $1`,
        [userId],
      );
      if (result.rows.length === 0) {
        return Response.json(null, { headers: corsHeaders });
      }
      const row = result.rows[0];
      // Resolve through the encryption helper before masking/auth_shape —
      // once a row is encrypted the plaintext api_key column alone is NULL,
      // so deriving those straight from SQL would silently show "no key" for
      // a row that has one (auth_shape "iam" gates the bedrock legacy-loop
      // fallback in useEffectiveLoop.ts, so this isn't just cosmetic). Unlike
      // the coder-turn read sites above, a row this can't decrypt must not
      // take down the whole Settings page — degrade to "unknown" and log,
      // same posture as GET /provider-configs' resolveForDisplay.
      // Captured before the columns are stripped below — tells the client
      // whether this row's credential still sits in the legacy plaintext
      // column, so the Settings page can offer the encrypt-existing backfill
      // to a user whose ONLY plaintext key is here (they have no
      // provider_configs row to raise the flag for them). Exposes no key
      // material itself.
      const settingsIsPlaintext = row.api_key != null && row.api_key_encrypted == null;
      let resolvedApiKey: string | null;
      // "ok" vs "undecryptable" — a decrypt failure and "no key configured"
      // both end up as api_key null / auth_shape "none", which are very
      // different claims: one means nothing was ever set, the other means a
      // credential exists that this server currently cannot open (rotated or
      // missing DEVX_ENCRYPTION_KEY). Same signal GET /provider-configs
      // returns, so the page can say which one it is instead of showing a
      // configured user "not configured".
      let keyStatus: "ok" | "undecryptable" = "ok";
      try {
        resolvedApiKey = await readProviderKey(row);
      } catch (err) {
        console.error("[devx] settings key read failed for GET /settings display:", err instanceof Error ? err.message : err);
        resolvedApiKey = null;
        keyStatus = "undecryptable";
      }
      delete row.api_key_encrypted;
      delete row.api_key_iv;
      // Mask API key. auth_shape is a derived, NON-SECRET hint (bearer/iam/
      // plain/none) computed from the raw key BEFORE masking — the masked
      // api_key is never valid JSON, so a client cannot derive the shape
      // itself (useEffectiveLoop.ts gates bedrock-IAM users onto the legacy
      // loop with it; see functions/auth_shape.ts).
      row.auth_shape = deriveAuthShape(resolvedApiKey);
      row.api_key = maskKey(resolvedApiKey);
      row.key_status = keyStatus;
      row.is_plaintext = settingsIsPlaintext;
      return Response.json(row, { headers: corsHeaders });
    }

    // PUT /settings
    if (path.endsWith("/settings") && method === "PUT") {
      // Probe before the INSERT below, which always references the
      // encrypted columns regardless of whether this request updates them —
      // see provider_key.ts's assertEncryptionMigrated header comment.
      await assertEncryptionMigrated("settings", sql);
      const body = await req.json();
      // Enforce max length on ai_rules to prevent context flooding
      if (body.ai_rules && body.ai_rules.length > 4000) {
        return Response.json({ error: "AI rules must be under 4000 characters" }, { status: 400, headers: corsHeaders });
      }
      // Everything this route decides about the three key columns lives in
      // settingsKeyWriteDecision (api_key_mask.ts), where it is unit-tested:
      // which payloads count as "not an update" (a field that wasn't sent, an
      // empty string, the mask this row's key is displayed as, a re-packed
      // empty credential blob), which count as an explicit clear (JSON null,
      // and only that), and which are a real credential. GET /settings hands
      // clients a mask — or a null when the stored key can't be read — so a
      // client that echoes its loaded form back on save posts one of those
      // non-credentials here, and with encryption configured we would
      // faithfully store it over the real key. The current Settings page sends
      // no api_key at all; bundles already cached in browsers do, which is why
      // this decision is made server-side.
      const keyWrite = await settingsKeyWriteDecision(body.api_key, sql, userId);
      if (keyWrite.reason) {
        console.warn(`[devx] PUT /settings: ignoring the api_key it was sent because ${keyWrite.reason} — keeping the stored credential`);
      }
      const hasApiKeyUpdate = keyWrite.apply;
      // task-u1 (V11__loop_flag.sql): same "only touch it if the caller
      // actually sent it" posture as api_key above. SettingsPage.tsx now
      // sends `loop` on every save, but any OTHER caller of this endpoint
      // (or an older cached frontend bundle) that omits it must not
      // silently reset a user's flag back to the column default.
      if (body.loop !== undefined && body.loop !== "legacy" && body.loop !== "agents") {
        return Response.json({ error: "loop must be 'legacy' or 'agents'" }, { status: 400, headers: corsHeaders });
      }
      const hasLoopUpdate = body.loop !== undefined;
      // Git author identity (V13): same "only touch it if sent" posture. Light
      // validation only — git itself accepts nearly anything, but cap length
      // and require an @ so an obvious paste error fails loud.
      const hasGitNameUpdate = body.git_author_name !== undefined;
      const hasGitEmailUpdate = body.git_author_email !== undefined;
      if (hasGitNameUpdate && body.git_author_name && String(body.git_author_name).length > 200) {
        return Response.json({ error: "git author name too long" }, { status: 400, headers: corsHeaders });
      }
      if (hasGitEmailUpdate && body.git_author_email && !/^[^\s@]+@[^\s@]+$/.test(String(body.git_author_email))) {
        return Response.json({ error: "git author email must be a valid email address" }, { status: 400, headers: corsHeaders });
      }
      // All three key columns are written together, only when the decision
      // above says to (hasApiKeyUpdate) — a save that leaves the key alone
      // (an omitted field, an echoed non-credential, flipping auto_approve)
      // must leave the existing credential, encrypted or plaintext, completely
      // untouched rather than nulling it. When hasApiKeyUpdate is false this
      // still needs a value for the plain INSERT-new-row branch:
      // writeProviderKeyFields(null) yields an all-null triple, so a brand new
      // row is unaffected — and a declined payload is never even encrypted
      // into the VALUES list.
      const keyFields = await writeProviderKeyFields(keyWrite.apply ? keyWrite.plaintext : null);
      const result = await sql(
        `INSERT INTO devx.settings (user_id, provider, model, api_key, api_key_encrypted, api_key_iv, base_url, ai_rules, auto_approve, max_steps, max_tool_steps, auto_fix_problems, loop, git_author_name, git_author_email)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, COALESCE($13, 'agents'), $14, $15)
         ON CONFLICT (user_id) DO UPDATE SET
           provider = EXCLUDED.provider,
           model = EXCLUDED.model,
           api_key = ${hasApiKeyUpdate ? "EXCLUDED.api_key" : "devx.settings.api_key"},
           api_key_encrypted = ${hasApiKeyUpdate ? "EXCLUDED.api_key_encrypted" : "devx.settings.api_key_encrypted"},
           api_key_iv = ${hasApiKeyUpdate ? "EXCLUDED.api_key_iv" : "devx.settings.api_key_iv"},
           base_url = EXCLUDED.base_url,
           ai_rules = EXCLUDED.ai_rules,
           auto_approve = EXCLUDED.auto_approve,
           max_steps = EXCLUDED.max_steps,
           max_tool_steps = EXCLUDED.max_tool_steps,
           auto_fix_problems = EXCLUDED.auto_fix_problems,
           loop = ${hasLoopUpdate ? "EXCLUDED.loop" : "devx.settings.loop"},
           git_author_name = ${hasGitNameUpdate ? "EXCLUDED.git_author_name" : "devx.settings.git_author_name"},
           git_author_email = ${hasGitEmailUpdate ? "EXCLUDED.git_author_email" : "devx.settings.git_author_email"},
           updated_at = NOW()
         RETURNING id, user_id, provider, model, base_url, ai_rules, auto_approve, max_steps, max_tool_steps, auto_fix_problems, loop, git_author_name, git_author_email, created_at, updated_at`,
        [userId, body.provider, body.model, keyFields.api_key, keyFields.api_key_encrypted, keyFields.api_key_iv, body.base_url || null, body.ai_rules || null, body.auto_approve ?? false, body.max_steps ?? DEFAULT_MAX_STEPS, body.max_tool_steps ?? 10, body.auto_fix_problems ?? false, body.loop ?? null, body.git_author_name || null, body.git_author_email || null],
      );
      // Re-sync existing repos so a changed identity takes effect immediately.
      if (hasGitNameUpdate || hasGitEmailUpdate) {
        refreshUserGitConfigs(userId, sql).catch((e) => console.warn("[devx] git config refresh failed:", e?.message || e));
      }
      return Response.json(result.rows[0], { headers: corsHeaders });
    }

    // --- Apps CRUD ---

    // GET /apps - list apps
    if (path.endsWith("/apps") && method === "GET") {
      const result = await sql(
        `SELECT id, user_id, name, path, tech_stack, dev_command, install_command, build_command, dev_port, config, created_at, updated_at
         FROM devx.apps WHERE user_id = $1 ORDER BY updated_at DESC`,
        [userId],
      );
      return Response.json(result.rows, { headers: corsHeaders });
    }

    // POST /apps - create app (from a template, or by cloning a git URL)
    if (path.endsWith("/apps") && method === "POST") {
      const body = await req.json();
      const gitUrl = typeof body.git_url === "string" ? body.git_url.trim() : "";

      // --- Import from a git URL: clone the repo into the workspace ---
      if (gitUrl) {
        if (!gitUrl.startsWith("https://")) {
          return Response.json({ error: "Only https:// git URLs are supported" }, { status: 400, headers: corsHeaders });
        }
        // Derive a name from the repo path if none was given.
        const repoName = gitUrl.replace(/\.git$/, "").split("/").pop() || "Imported App";
        const name = (body.name && body.name.trim()) || repoName;

        const result = await sql(
          `INSERT INTO devx.apps (user_id, name, path, tech_stack, dev_command, install_command, build_command, git_remote_url)
           VALUES ($1, $2, '', '', '', '', '', $3)
           RETURNING id, user_id, name, path, tech_stack, dev_command, install_command, build_command, dev_port, config, created_at, updated_at`,
          [userId, name, gitUrl],
        );
        const app = result.rows[0];
        const wsPath = getAppWorkspacePath(userId, app.id);
        const relPath = `${userId}/${app.id}`;
        await sql(`UPDATE devx.apps SET path = $1 WHERE id = $2`, [relPath, app.id]);
        app.path = relPath;

        try {
          // `git clone` creates the leaf dir itself but needs the parent to
          // exist — ensure the per-user workspace dir is present first.
          const parentDir = wsPath.substring(0, wsPath.lastIndexOf("/"));
          await Deno.mkdir(parentDir, { recursive: true });

          // Clone with the user's token injected so private repos work. The
          // clean URL stays in git_remote_url; the token is only used here.
          const token = await getGithubToken(userId, sql);
          await gitOps.clone(injectToken(gitUrl, token), wsPath);

          // Apply the user's git identity/signing config to the fresh clone.
          try {
            await ensureGitConfig(wsPath, userId, sql);
          } catch (e) { console.warn("[devx] git identity setup failed:", e?.message || e); }

          // Fetch git submodules so workspace installs can resolve them — e.g.
          // d2e-ui declares libs/react-notebook as a submodule, and bun/yarn
          // fail with "workspace dependency not found" without it. Best-effort.
          try {
            await duckdb(`SELECT * FROM trex_devx_run_command('${escapeSql(wsPath)}', 'git submodule update --init --recursive')`);
          } catch (e) { console.error("[devx] submodule init failed:", e); }

          // Best-effort tech-stack / dev-command detection from package.json.
          try {
            const pkg = JSON.parse(await Deno.readTextFile(`${wsPath}/package.json`));
            const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
            const scripts = pkg.scripts || {};
            let techStack = "";
            if (deps.next) techStack = "Next.js";
            else if (deps.vue) techStack = "Vue";
            else if (deps.react) techStack = "React";
            else if (pkg.name) techStack = "Node";
            const devCommand = scripts.dev ? "npm run dev" : (scripts.start ? "npm start" : "");
            const buildCommand = scripts.build ? "npm run build" : "";
            const installCommand = "npm install";
            await sql(
              `UPDATE devx.apps SET tech_stack = $1, dev_command = $2, build_command = $3, install_command = $4 WHERE id = $5`,
              [techStack, devCommand, buildCommand, installCommand, app.id],
            );
            app.tech_stack = techStack;
            app.dev_command = devCommand;
            app.build_command = buildCommand;
            app.install_command = installCommand;
          } catch { /* no package.json — leave fields blank */ }

          // Inject the component tagger so visual-edit/inspect works on the clone.
          try { await injectComponentTagger(wsPath); } catch { /* non-fatal */ }

          // Data2Evidence: detect runnable sub-apps and persist the registry.
          if (body.kind === "d2e") {
            try {
              const d2e = await detectD2E(wsPath, gitUrl);
              const cfg = { ...(app.config || {}), d2e };
              await sql(`UPDATE devx.apps SET config = $1, tech_stack = 'd2e' WHERE id = $2`,
                [JSON.stringify(cfg), app.id]);
              app.config = cfg;
              app.tech_stack = "d2e";
            } catch (e) {
              console.error("[d2e] detection failed:", e);
            }
          }
        } catch (err) {
          // Roll back the half-created app so the user can retry cleanly.
          console.error("Git clone error:", err);
          await sql(`DELETE FROM devx.apps WHERE id = $1`, [app.id]);
          try { await Deno.remove(wsPath, { recursive: true }); } catch { /* may not exist */ }
          return Response.json({ error: `Failed to clone repository: ${err.message}` }, { status: 502, headers: corsHeaders });
        }

        return Response.json(app, { headers: corsHeaders });
      }

      // --- Create from a template ---
      const name = body.name || "New App";
      const templateId = body.template || "blank";
      const template = TEMPLATES.find((t) => t.id === templateId) || TEMPLATES.find((t) => t.id === "blank");

      // Create DB record first to get the ID
      const result = await sql(
        `INSERT INTO devx.apps (user_id, name, path, tech_stack, dev_command, install_command, build_command)
         VALUES ($1, $2, '', $3, $4, $5, $6)
         RETURNING id, user_id, name, path, tech_stack, dev_command, install_command, build_command, dev_port, config, created_at, updated_at`,
        [userId, name, template.tech_stack, template.dev_command, template.install_command, template.build_command],
      );
      const app = result.rows[0];

      // Create workspace and update path
      const wsPath = await ensureAppWorkspace(userId, app.id);
      const relPath = `${userId}/${app.id}`;
      await sql(`UPDATE devx.apps SET path = $1 WHERE id = $2`, [relPath, app.id]);
      app.path = relPath;

      // Scaffold template files and inject component tagger for inspect support
      try {
        await scaffoldTemplate(templateId, wsPath, app.id);
        await injectComponentTagger(wsPath);
      } catch (err) {
        console.error("Template scaffold error:", err);
        // App is created even if scaffold fails — user can add files manually
      }

      return Response.json(app, { headers: corsHeaders });
    }

    // GET /apps/:id - get single app
    const appSingleMatch = path.match(/\/apps\/([^/]+)$/);
    if (appSingleMatch && method === "GET") {
      const appId = appSingleMatch[1];
      const result = await sql(
        `SELECT id, user_id, name, path, tech_stack, dev_command, install_command, build_command, dev_port, config, created_at, updated_at
         FROM devx.apps WHERE id = $1 AND user_id = $2`,
        [appId, userId],
      );
      if (result.rows.length === 0) {
        return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
      }
      return Response.json(result.rows[0], { headers: corsHeaders });
    }

    // PATCH /apps/:id - update app
    const appPatchMatch = path.match(/\/apps\/([^/]+)$/);
    if (appPatchMatch && method === "PATCH") {
      const appId = appPatchMatch[1];
      const body = await req.json();
      const sets = [];
      const params = [];
      let idx = 1;
      // Only allow safe fields — exclude dev_command/install_command/build_command from user edits
      for (const field of ["name", "tech_stack", "dev_port", "config"]) {
        if (body[field] !== undefined) {
          sets.push(`${field} = $${idx++}`);
          params.push(body[field]);
        }
      }
      if (sets.length === 0) {
        return Response.json({ error: "No fields to update" }, { status: 400, headers: corsHeaders });
      }
      sets.push("updated_at = NOW()");
      params.push(appId, userId);
      const result = await sql(
        `UPDATE devx.apps SET ${sets.join(", ")}
         WHERE id = $${idx++} AND user_id = $${idx}
         RETURNING id, user_id, name, path, tech_stack, dev_command, install_command, build_command, dev_port, config, created_at, updated_at`,
        params,
      );
      if (result.rows.length === 0) {
        return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
      }

      // If config was updated, write .env file in the workspace so Vite picks up the values
      if (body.config && typeof body.config === "object") {
        try {
          const wsPath = getAppWorkspacePath(userId, appId);
          const envLines: string[] = [];
          for (const [key, value] of Object.entries(body.config)) {
            if (value && typeof value === "string") {
              envLines.push(`${key}=${value}`);
            }
          }
          if (envLines.length > 0) {
            // Read existing .env and merge (preserve non-config keys)
            let existingEnv = "";
            try { existingEnv = await Deno.readTextFile(`${wsPath}/.env`); } catch { /* no .env yet */ }
            const configKeys = new Set(Object.keys(body.config));
            const preserved = existingEnv.split("\n").filter((line) => {
              const eqIdx = line.indexOf("=");
              if (eqIdx < 0) return true; // keep comments/empty
              const key = line.substring(0, eqIdx).trim();
              return !configKeys.has(key);
            });
            const merged = [...preserved.filter(Boolean), ...envLines].join("\n") + "\n";
            await Deno.writeTextFile(`${wsPath}/.env`, merged);
          }
        } catch (err) {
          console.warn("Failed to write .env for config update:", err);
        }
      }

      return Response.json(result.rows[0], { headers: corsHeaders });
    }

    // DELETE /apps/:id - delete app
    const appDeleteMatch = path.match(/\/apps\/([^/]+)$/);
    if (appDeleteMatch && method === "DELETE") {
      const appId = appDeleteMatch[1];
      // Stop dev server if running
      devServerManager.stop(userId, appId);
      // Delete workspace directory
      try {
        const wsPath = getAppWorkspacePath(userId, appId);
        await Deno.remove(wsPath, { recursive: true });
      } catch { /* workspace may not exist */ }
      await sql(`DELETE FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    // POST /apps/:id/duplicate - duplicate app
    const appDuplicateMatch = path.match(/\/apps\/([^/]+)\/duplicate$/);
    if (appDuplicateMatch && method === "POST") {
      const appId = appDuplicateMatch[1];
      // Get source app
      const srcResult = await sql(
        `SELECT id, user_id, name, path, tech_stack, dev_command, install_command, build_command, dev_port
         FROM devx.apps WHERE id = $1 AND user_id = $2`,
        [appId, userId],
      );
      if (srcResult.rows.length === 0) {
        return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
      }
      const srcApp = srcResult.rows[0];

      // Create new app record
      const newName = `Copy of ${srcApp.name}`;
      const newResult = await sql(
        `INSERT INTO devx.apps (user_id, name, path, tech_stack, dev_command, install_command, build_command)
         VALUES ($1, $2, '', $3, $4, $5, $6)
         RETURNING id, user_id, name, path, tech_stack, dev_command, install_command, build_command, dev_port, config, created_at, updated_at`,
        [userId, newName, srcApp.tech_stack, srcApp.dev_command, srcApp.install_command, srcApp.build_command],
      );
      const newApp = newResult.rows[0];

      // Create workspace and update path
      const newWsPath = await ensureAppWorkspace(userId, newApp.id);
      const relPath = `${userId}/${newApp.id}`;
      await sql(`UPDATE devx.apps SET path = $1 WHERE id = $2`, [relPath, newApp.id]);
      newApp.path = relPath;

      // Copy all files from source workspace to new workspace
      try {
        const srcWsPath = getAppWorkspacePath(userId, appId);
        async function copyDir(src: string, dest: string) {
          for await (const entry of Deno.readDir(src)) {
            const srcPath = `${src}/${entry.name}`;
            const destPath = `${dest}/${entry.name}`;
            if (entry.isDirectory) {
              if (entry.name === "node_modules" || entry.name === ".git") continue;
              await Deno.mkdir(destPath, { recursive: true });
              await copyDir(srcPath, destPath);
            } else if (entry.isFile) {
              await Deno.copyFile(srcPath, destPath);
            }
          }
        }
        await copyDir(srcWsPath, newWsPath);
      } catch (err) {
        console.error("Error copying workspace files:", err);
        // App is created even if copy fails
      }

      return Response.json(newApp, { headers: corsHeaders });
    }

    // --- App Files ---

    // GET /apps/:id/files - list file tree
    const appFilesMatch = path.match(/\/apps\/([^/]+)\/files$/);
    if (appFilesMatch && method === "GET") {
      const appId = appFilesMatch[1];
      // Verify ownership
      const appCheck = await sql(`SELECT id, tech_stack FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
      if (appCheck.rows.length === 0) {
        return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
      }
      const wsPath = getAppWorkspacePath(userId, appId);
      // Ensure workspace exists and re-scaffold if empty (e.g. after container restart)
      try {
        await Deno.stat(wsPath);
      } catch {
        try {
          await ensureAppWorkspace(userId, appId);
          const techStack = appCheck.rows[0].tech_stack;
          const templateId = TEMPLATES.find((t) => t.tech_stack === techStack)?.id || "blank";
          console.log(`[devx] Workspace missing for app ${appId}, re-scaffolding template ${templateId}...`);
          await scaffoldTemplate(templateId, wsPath, appId);
        } catch (err) {
          console.error("[devx] Re-scaffold on file list failed:", err);
        }
      }
      try {
        const tree = await buildFileTree(wsPath, wsPath);
        return Response.json(tree, { headers: corsHeaders });
      } catch {
        return Response.json([], { headers: corsHeaders });
      }
    }

    // GET /apps/:id/files/* - read single file
    const appFileReadMatch = path.match(/\/apps\/([^/]+)\/files\/(.+)$/);
    if (appFileReadMatch && method === "GET") {
      const appId = appFileReadMatch[1];
      const filePath = decodeURIComponent(appFileReadMatch[2]);
      const appCheck = await sql(`SELECT id, tech_stack FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
      if (appCheck.rows.length === 0) {
        return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
      }
      try {
        const wsPath = getAppWorkspacePath(userId, appId);
        const fullPath = safeJoin(wsPath, filePath);
        // Try reading directly first — skip expensive workspace check for the common case
        try {
          const content = await Deno.readTextFile(fullPath);
          return new Response(content, {
            headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
          });
        } catch {
          // File not found — workspace may be missing (TmpFs is ephemeral), try re-scaffold
          await ensureAppWorkspace(userId, appId);
          const techStack = appCheck.rows[0].tech_stack;
          const templateId = TEMPLATES.find((t) => t.tech_stack === techStack)?.id || "blank";
          await scaffoldTemplate(templateId, wsPath, appId);
          const content = await Deno.readTextFile(fullPath);
          return new Response(content, {
            headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
          });
        }
      } catch (err) {
        return Response.json({ error: err.message }, { status: 404, headers: corsHeaders });
      }
    }

    // PUT /apps/:id/files/* - write file content
    const appFileWriteMatch = path.match(/\/apps\/([^/]+)\/files\/(.+)$/);
    if (appFileWriteMatch && method === "PUT") {
      const appId = appFileWriteMatch[1];
      const filePath = decodeURIComponent(appFileWriteMatch[2]);
      const appCheck = await sql(`SELECT id, tech_stack FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
      if (appCheck.rows.length === 0) {
        return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
      }
      try {
        const wsPath = getAppWorkspacePath(userId, appId);
        // Ensure workspace exists (TmpFs is ephemeral per-worker)
        await ensureAppWorkspace(userId, appId);
        const fullPath = safeJoin(wsPath, filePath);
        // Ensure parent directory exists for nested paths
        const parentDir = filePath.includes("/") ? filePath.substring(0, filePath.lastIndexOf("/")) : null;
        if (parentDir) {
          await Deno.mkdir(`${wsPath}/${parentDir}`, { recursive: true });
        }
        const content = await req.text();
        await Deno.writeTextFile(fullPath, content);
        return Response.json({ ok: true }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // DELETE /apps/:id/files/* - delete file or directory
    const appFileDeleteMatch = path.match(/\/apps\/([^/]+)\/files\/(.+)$/);
    if (appFileDeleteMatch && method === "DELETE") {
      const appId = appFileDeleteMatch[1];
      const filePath = decodeURIComponent(appFileDeleteMatch[2]);
      const appCheck = await sql(`SELECT id FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
      if (appCheck.rows.length === 0) {
        return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
      }
      try {
        const wsPath = getAppWorkspacePath(userId, appId);
        const fullPath = safeJoin(wsPath, filePath);
        await Deno.remove(fullPath, { recursive: true });
        return Response.json({ ok: true }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // POST /apps/:id/files-rename - rename/move a file
    const filesRenameMatch = path.match(/\/apps\/([^/]+)\/files-rename$/);
    if (filesRenameMatch && method === "POST") {
      const appId = filesRenameMatch[1];
      const appCheck = await sql(`SELECT id FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
      if (appCheck.rows.length === 0) {
        return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
      }
      const body = await req.json();
      if (!body.from || !body.to) {
        return Response.json({ error: "from and to required" }, { status: 400, headers: corsHeaders });
      }
      try {
        const wsPath = getAppWorkspacePath(userId, appId);
        const fromPath = safeJoin(wsPath, body.from);
        const toPath = safeJoin(wsPath, body.to);
        // Ensure target parent directory exists
        const toDir = body.to.includes("/") ? body.to.substring(0, body.to.lastIndexOf("/")) : null;
        if (toDir) await Deno.mkdir(`${wsPath}/${toDir}`, { recursive: true });
        await Deno.rename(fromPath, toPath);
        return Response.json({ ok: true }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // POST /apps/:id/files-mkdir - create directory
    const filesMkdirMatch = path.match(/\/apps\/([^/]+)\/files-mkdir$/);
    if (filesMkdirMatch && method === "POST") {
      const appId = filesMkdirMatch[1];
      const appCheck = await sql(`SELECT id FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
      if (appCheck.rows.length === 0) {
        return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
      }
      const body = await req.json();
      if (!body.path) {
        return Response.json({ error: "path required" }, { status: 400, headers: corsHeaders });
      }
      try {
        const wsPath = getAppWorkspacePath(userId, appId);
        const fullPath = safeJoin(wsPath, body.path);
        await Deno.mkdir(fullPath, { recursive: true });
        return Response.json({ ok: true }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // POST /apps/:id/search - search file contents
    const searchMatch = path.match(/\/apps\/([^/]+)\/search$/);
    if (searchMatch && method === "POST") {
      const appId = searchMatch[1];
      const appCheck = await sql(`SELECT id FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
      if (appCheck.rows.length === 0) {
        return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
      }
      const body = await req.json();
      const query = body.query || "";
      if (!query) {
        return Response.json({ results: [] }, { headers: corsHeaders });
      }
      try {
        const wsPath = getAppWorkspacePath(userId, appId);
        const results = [];
        const BINARY_EXTS = new Set(["png","jpg","jpeg","gif","svg","ico","woff","woff2","ttf","eot","mp3","mp4","webm","webp","pdf","zip","tar","gz"]);

        async function searchDir(dir, depth = 0) {
          if (depth > 5 || results.length >= 200) return;
          try {
            for await (const entry of Deno.readDir(dir)) {
              if (results.length >= 200) break;
              if (entry.name.startsWith(".")) continue;
              const fullPath = `${dir}/${entry.name}`;
              if (entry.isDirectory) {
                if (EXCLUDED_DIRS.has(entry.name)) continue;
                await searchDir(fullPath, depth + 1);
              } else if (entry.isFile) {
                const ext = entry.name.split(".").pop()?.toLowerCase() || "";
                if (BINARY_EXTS.has(ext)) continue;
                try {
                  const content = await Deno.readTextFile(fullPath);
                  const lines = content.split("\n");
                  const lowerQuery = query.toLowerCase();
                  for (let i = 0; i < lines.length && results.length < 200; i++) {
                    const col = lines[i].toLowerCase().indexOf(lowerQuery);
                    if (col !== -1) {
                      results.push({
                        file: fullPath.replace(wsPath + "/", ""),
                        line: i + 1,
                        col: col + 1,
                        text: lines[i].trim().slice(0, 200),
                        before: i > 0 ? lines[i - 1].trim().slice(0, 100) : null,
                        after: i < lines.length - 1 ? lines[i + 1].trim().slice(0, 100) : null,
                      });
                    }
                  }
                } catch { /* skip unreadable files */ }
              }
            }
          } catch { /* skip unreadable dirs */ }
        }

        await searchDir(wsPath);
        return Response.json({ results }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
      }
    }

    // --- Dev Server ---

    // POST /apps/:id/server/start
    const serverStartMatch = path.match(/\/apps\/([^/]+)\/server\/start$/);
    if (serverStartMatch && method === "POST") {
      const appId = serverStartMatch[1];
      const appResult = await sql(
        `SELECT id, dev_command, install_command, tech_stack, config FROM devx.apps WHERE id = $1 AND user_id = $2`,
        [appId, userId],
      );
      if (appResult.rows.length === 0) {
        return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
      }
      const app = appResult.rows[0];
      const wsPath = getAppWorkspacePath(userId, appId);

      // Re-scaffold if workspace is missing package.json (previous scaffold may have failed)
      try {
        await Deno.stat(`${wsPath}/package.json`);
      } catch {
        console.log(`[devx] No package.json in workspace for app ${appId}, re-scaffolding...`);
        try {
          await ensureAppWorkspace(userId, appId);
          const templateId = TEMPLATES.find((t) => t.tech_stack === app.tech_stack)?.id || "blank";
          await scaffoldTemplate(templateId, wsPath, appId);
        } catch (err) {
          console.error("[devx] Re-scaffold failed:", err);
        }
      }

      // d2e: run the active sub-app instead of the workspace root.
      let startDevCmd = app.dev_command;
      let startInstallCmd = app.install_command;
      let override = {};
      if (app.tech_stack === "d2e" && app.config?.d2e?.activeSubApp) {
        const d2e = app.config.d2e;
        const sa = d2e.subApps?.find((s) => s.key === d2e.activeSubApp);
        if (sa) {
          // sa.run.devCwd/installCwd come from owner-PATCH-able config; clamp them to
          // the workspace with safeJoin (throws on traversal/absolute/empty). On any
          // unsafe value, skip the d2e override entirely and fall back to app defaults.
          let devCwdAbs: string | null = null;
          let installCwdAbs: string | null = null;
          try {
            devCwdAbs = safeJoin(wsPath, sa.run.devCwd);
            installCwdAbs = safeJoin(wsPath, sa.run.installCwd);
          } catch {
            console.error("[d2e] unsafe sub-app cwd, skipping run override");
            devCwdAbs = null;
            installCwdAbs = null;
          }
          if (devCwdAbs && installCwdAbs) {
            startInstallCmd = sa.run.installCommand;
            startDevCmd = sa.run.devCommand;
            // Custom env is delivered via files (the Rust process manager can't take inline env).
            // portStyle "cra" gets no --base flag (react-scripts ignores it), so the dev
            // server would emit its package.json `homepage` base (e.g. <base href="/d2e/portal">)
            // and the preview iframe would pull assets from the BAKED app instead of the dev
            // server. PUBLIC_URL is CRA's equivalent of vite's --base, so point it at the proxy.
            const envLines: string[] = [];
            if (d2e.externalApiBase) {
              envLines.push(`D2E_API_BASE=${d2e.externalApiBase}`, `VITE_D2E_API_BASE=${d2e.externalApiBase}`);
            }
            if (sa.run.portStyle === "cra") {
              envLines.push(`PUBLIC_URL=/plugins/trex/devx-api/apps/${appId}/proxy`);
            }
            if (envLines.length) {
              try {
                await Deno.writeTextFile(`${devCwdAbs}/.env.local`, envLines.join("\n") + "\n");
              } catch (e) { console.error("[d2e] .env.local write failed", e); }
            }
            if (sa.run.needsGithubToken) {
              const tok = await getGithubToken(userId, sql).catch(() => null);
              if (tok) {
                try {
                  await Deno.writeTextFile(`${installCwdAbs}/.npmrc`,
                    `//npm.pkg.github.com/:_authToken=${tok}\n@portal:registry=https://npm.pkg.github.com\n`);
                } catch (e) { console.error("[d2e] .npmrc write failed", e); }
              }
            }
            override = { installCwd: installCwdAbs, devCwd: devCwdAbs, portStyle: sa.run.portStyle, nxApp: sa.key.split(":")[1] };
          }
        }
      }

      // A d2e app must run a specific sub-app. Without an active selection the
      // fallback command is the repo-root script, which boots the ENTIRE d2e
      // platform (every service + UI) at once — refuse and ask the user to pick.
      if (app.tech_stack === "d2e" && !app.config?.d2e?.activeSubApp) {
        return Response.json(
          { error: "Select a Data2Evidence sub-app to run first." },
          { status: 400, headers: corsHeaders },
        );
      }

      const status = await devServerManager.start(userId, appId, wsPath, startDevCmd, startInstallCmd, override);

      // Register backend functions for this app (idempotent)
      try {
        const registerUrl = `http://localhost:8000${Deno.env.get("BASE_PATH") || "/trex"}/api/plugins/register`;
        await fetch(registerUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: wsPath }),
        });
      } catch { /* best-effort */ }

      return Response.json(status, { headers: corsHeaders });
    }

    // POST /apps/:id/server/stop
    const serverStopMatch = path.match(/\/apps\/([^/]+)\/server\/stop$/);
    if (serverStopMatch && method === "POST") {
      const appId = serverStopMatch[1];
      const appCheck = await sql(`SELECT id FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
      if (appCheck.rows.length === 0) {
        return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
      }
      devServerManager.stop(userId, appId);
      return Response.json({ status: "stopped" }, { headers: corsHeaders });
    }

    // POST /apps/:id/server/restart
    const serverRestartMatch = path.match(/\/apps\/([^/]+)\/server\/restart$/);
    if (serverRestartMatch && method === "POST") {
      const appId = serverRestartMatch[1];
      const appResult = await sql(
        `SELECT id, dev_command, install_command FROM devx.apps WHERE id = $1 AND user_id = $2`,
        [appId, userId],
      );
      if (appResult.rows.length === 0) {
        return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
      }
      const app = appResult.rows[0];
      const wsPath = getAppWorkspacePath(userId, appId);
      devServerManager.stop(userId, appId);
      const status = await devServerManager.start(userId, appId, wsPath, app.dev_command, app.install_command);

      // Re-register backend functions after restart (picks up code changes)
      try {
        const registerUrl = `http://localhost:8000${Deno.env.get("BASE_PATH") || "/trex"}/api/plugins/register`;
        await fetch(registerUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: wsPath }),
        });
      } catch { /* best-effort */ }

      return Response.json(status, { headers: corsHeaders });
    }

    // GET /apps/:id/server/status
    const serverStatusMatch = path.match(/\/apps\/([^/]+)\/server\/status$/);
    if (serverStatusMatch && method === "GET") {
      const appId = serverStatusMatch[1];
      const appCheck = await sql(`SELECT id FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
      if (appCheck.rows.length === 0) {
        return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
      }
      const status = await devServerManager.getStatus(userId, appId);
      return Response.json(status, { headers: corsHeaders });
    }

    // GET /apps/:id/server/output - SSE stream
    const serverOutputMatch = path.match(/\/apps\/([^/]+)\/server\/output$/);
    if (serverOutputMatch && method === "GET") {
      const appId = serverOutputMatch[1];
      const appCheck = await sql(`SELECT id FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
      if (appCheck.rows.length === 0) {
        return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
      }
      const k = `${userId}:${appId}`;
      // Supersede any prior output loop for this app: the client only ever
      // consumes the newest stream (it reopens on every mount/app switch), so
      // an earlier loop for the same key is already abandoned and must be
      // stopped or it orphans (see devOutputStreamStops above).
      const prevStop = devOutputStreamStops.get(k);
      if (prevStop) { try { prevStop(); } catch { /* already gone */ } }

      // `stop` is hoisted so it can be reached from outside start().
      let stop = () => {};
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          let aborted = false;
          let unsubscribe = () => {};
          // One reused DuckDB connection for the whole stream — leases a single
          // pool session instead of one per 500ms poll (see openMemoryConnection).
          let memConn: ReturnType<typeof openMemoryConnection> | null = null;
          // Single idempotent teardown. Every termination path routes here.
          stop = () => {
            if (aborted) return;
            aborted = true;
            if (devOutputStreamStops.get(k) === stop) devOutputStreamStops.delete(k);
            try { memConn?.close(); } catch { /* already gone */ }
            try { unsubscribe(); } catch { /* already gone */ }
            try { controller.close(); } catch { /* already closed */ }
          };
          devOutputStreamStops.set(k, stop);

          // Returns false once the stream can no longer accept data
          // (controller closed → desiredSize is null): our signal that the
          // client disconnected even if `req.signal` never fired (e.g. the
          // connection was severed without a clean close).
          const send = (event) => {
            if (aborted) return false;
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
              return controller.desiredSize !== null;
            } catch {
              return false;
            }
          };

          // Send buffered output first
          const entry = devServerManager.getEntry(userId, appId);
          if (entry) {
            for (const line of entry.outputBuffer) {
              send(line);
            }
          }

          // Subscribe to new output from in-memory events
          unsubscribe = devServerManager.subscribe(userId, appId, send);

          // Poll Rust process manager for output and status
          // (background setTimeout polling doesn't work in edge workers)
          let lastLineId = 0;
          let lastStatus = "";
          let consecutiveErrors = 0;
          // Hard lifetime cap: final backstop for orphans this runtime can't
          // signal (app switch to a different key, abandoned tab). 30 min is
          // far longer than any interactive log-watching session; the frontend
          // reopens the stream on its next mount, so a capped loop is invisible
          // in normal use and simply bounds the worst case.
          const deadline = Date.now() + 30 * 60 * 1000;
          try { memConn = openMemoryConnection(); } catch { /* falls back to stop on first poll */ }
          const poll = async () => {
            if (aborted) return;
            // Stream closed (rare in this runtime) or lifetime exceeded — stop
            // and return the pooled session.
            if (!memConn || controller.desiredSize === null || Date.now() > deadline) { stop(); return; }
            try {
              // Get new output lines (reuses the one leased session)
              const outputResult = JSON.parse(await memConn.query(
                `SELECT * FROM trex_devx_process_output('${escapeSql(k)}', '${lastLineId}')`
              ));
              if (outputResult.lines && outputResult.lines.length > 0) {
                for (const line of outputResult.lines) {
                  const clean = line.text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
                  if (!clean.trim()) continue;
                  if (send({ type: line.stream === "stderr" ? "stderr" : "stdout", data: clean, timestamp: line.timestamp_ms || Date.now() }) === false) { stop(); return; }
                }
                lastLineId = outputResult.last_id;
              }

              // Check status
              const statusResult = JSON.parse(await memConn.query(
                `SELECT * FROM trex_devx_process_status('${escapeSql(k)}', '')`
              ));
              if (statusResult.status !== lastStatus) {
                lastStatus = statusResult.status;
                send({ type: "status_change", data: statusResult.status, timestamp: Date.now() });
                // Update in-memory entry
                const entry = devServerManager.getEntry(userId, appId);
                if (entry && statusResult.status === "running") {
                  entry.status = "running";
                  if (statusResult.url) entry.detectedUrl = statusResult.url;
                }
              }
              consecutiveErrors = 0;
            } catch {
              // A persistent failure (e.g. pool pressure) must not spin
              // forever — retrying a lease every 500ms perpetuates the
              // exhaustion and blocks recovery. Give up after a short streak
              // so the pool can drain and the node self-heals.
              if (++consecutiveErrors >= 10) { stop(); return; }
            }
            if (!aborted) setTimeout(poll, 500);
          };
          poll();

          // Belt-and-suspenders: also stop on abort if the runtime ever fires it.
          req.signal.addEventListener("abort", stop);
        },
        // Fired when the consumer (the HTTP response) cancels the body —
        // i.e. the client disconnected. The reliable teardown trigger here.
        cancel() { stop(); },
      });
      return new Response(stream, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // POST /apps/:id/check - run type checks
    const appCheckMatch = path.match(/\/apps\/([^/]+)\/check$/);
    if (appCheckMatch && method === "POST") {
      const appId = appCheckMatch[1];
      const appCheck = await sql(`SELECT id FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
      if (appCheck.rows.length === 0) {
        return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
      }
      const wsPath = getAppWorkspacePath(userId, appId);
      try {
        const result = JSON.parse(await duckdb(
          `SELECT * FROM trex_devx_tsc_check('${escapeSql(wsPath)}')`
        ));

        if (result.ok) {
          return Response.json({ problems: [], summary: "No errors found" }, { headers: corsHeaders });
        }

        // Parse tsc output: "src/App.tsx(15,3): error TS2322: ..."
        const raw = result.message || "";
        const problems = [];
        const lines = raw.split("\n");
        for (const line of lines) {
          const m = line.match(/^(.+)\((\d+),(\d+)\):\s+(error|warning)\s+\w+:\s+(.+)$/);
          if (m) {
            problems.push({ file: m[1], line: parseInt(m[2]), col: parseInt(m[3]), severity: m[4], message: m[5] });
          }
        }
        return Response.json({
          problems,
          summary: `Found ${problems.length} error${problems.length === 1 ? "" : "s"}`,
        }, { headers: corsHeaders });
      } catch (err) {
        return Response.json({ problems: [], summary: `Check failed: ${err.message}` }, { headers: corsHeaders });
      }
    }

    // GET /apps/:id/proxy/** - reverse proxy to dev server
    const proxyMatch = path.match(/\/apps\/([^/]+)\/proxy(?:\/(.*))?$/);
    if (proxyMatch && method === "GET") {
      const appId = proxyMatch[1];
      const proxyPath = proxyMatch[2] || "";
      // Prototypes are static HTML produced by the visual-prototyping skill
      // (<workspace>/prototypes/<name>/index.html and their relative assets).
      // Serve them straight from disk so mockups preview without a running dev
      // server — required for sub-apps (e.g. d2e) whose dev server can't run
      // in-container, and simply faster for every other app.
      if (proxyPath.startsWith("prototypes/")) {
        const staticRes = await servePrototypeFile(userId, appId, proxyPath, corsHeaders);
        if (staticRes) return staticRes;
      }
      // Check Rust process manager for status (entry may not exist in this worker)
      const status = await devServerManager.getStatus(userId, appId);
      const entry = devServerManager.getEntry(userId, appId);
      if (status.status !== "running") {
        return new Response("Dev server not running", { status: 503, headers: corsHeaders });
      }
      // Use detected URL port (from process stdout) or fall back to allocated port
      const proxyPort = status.url ? new URL(status.url).port : String(status.port || entry?.port);
      // Vite is configured with --base matching the proxy path, so forward with the full base
      const proxyBase = path.replace(/\/proxy(\/.*)?$/, "/proxy/");
      // Dev servers may be HTTP or self-signed HTTPS (e.g. d2e vite basicSsl).
      // Try HTTP, then fall back to HTTPS trusting the dev server's own cert
      // (basicSsl writes it under the active sub-app's .devServer/cert).
      const reqHeaders = { "Accept": req.headers.get("Accept") || "*/*" };
      const buildUrl = (scheme: string) => `${scheme}://localhost:${proxyPort}${proxyBase}${proxyPath}${url.search}`;
      const getHttpsClient = async (): Promise<Deno.HttpClient | undefined> => {
        const cache: Map<string, Deno.HttpClient> = ((globalThis as any).__devxHttpsClients ??= new Map());
        // Resolve the ACTIVE sub-app first: a d2e app has many sub-apps and each
        // vite dev server mints its own basicSsl cert, so the client must be keyed
        // per sub-app. Keying by appId alone reuses the first sub-app's CA for every
        // later one, which fails TLS validation and surfaces as a 502 preview.
        let devAbs: string | undefined;
        try {
          const cfgRes = await sql(`SELECT config FROM devx.apps WHERE id = $1 AND user_id = $2`, [appId, userId]);
          const d2e = cfgRes.rows[0]?.config?.d2e;
          const sa = d2e?.subApps?.find((s: any) => s.key === d2e.activeSubApp);
          if (sa?.run?.devCwd) devAbs = safeJoin(getAppWorkspacePath(userId, appId), sa.run.devCwd);
        } catch { /* best-effort */ }
        const cacheKey = `${appId}:${devAbs ?? ""}`;
        if (cache.has(cacheKey)) return cache.get(cacheKey);
        const caCerts: string[] = [];
        if (devAbs) {
          for (const certDir of [`${devAbs}/.devServer/cert`, `${devAbs}/node_modules/.vite/basic-ssl`]) {
            try {
              for await (const e of Deno.readDir(certDir)) {
                if (e.isFile && e.name.endsWith(".pem")) {
                  try { caCerts.push(await Deno.readTextFile(`${certDir}/${e.name}`)); } catch { /* skip */ }
                }
              }
            } catch { /* dir absent */ }
          }
        }
        if (!caCerts.length) return undefined;
        const client = Deno.createHttpClient({ caCerts });
        cache.set(cacheKey, client);
        return client;
      };
      try {
        let proxyRes: Response;
        try {
          proxyRes = await fetch(buildUrl("http"), { headers: reqHeaders });
        } catch {
          const client = await getHttpsClient();
          proxyRes = await fetch(buildUrl("https"), client ? { headers: reqHeaders, client } : { headers: reqHeaders });
        }
        const responseHeaders = new Headers(corsHeaders);
        // Forward content-type from dev server
        const ct = proxyRes.headers.get("Content-Type");
        if (ct) responseHeaders.set("Content-Type", ct);

        // Inject visual editing bridge scripts into HTML responses
        loadVisualEditingScripts();
        if (ct && ct.includes("text/html") && selectorClientScript) {
          const html = await proxyRes.text();
          const injectedScripts = `<script>${rpcBridgeScript}</script><script>${selectorClientScript}</script><script>${visualEditorClientScript}</script>`;
          const finalHtml = html.includes("</head>")
            ? html.replace("</head>", `${injectedScripts}</head>`)
            : html.includes("</body>")
            ? html.replace("</body>", `${injectedScripts}</body>`)
            : html + injectedScripts;
          return new Response(finalHtml, {
            status: proxyRes.status,
            headers: responseHeaders,
          });
        }

        return new Response(proxyRes.body, {
          status: proxyRes.status,
          headers: responseHeaders,
        });
      } catch {
        return new Response("Failed to connect to dev server", { status: 502, headers: corsHeaders });
      }
    }

    return Response.json(
      { error: "Not found", path },
      { status: 404, headers: corsHeaders },
    );
  } catch (err) {
    console.error("DevX API error:", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders },
    );
  }
});

// --- Provider streaming implementations ---

async function streamAnthropic(
  settings: { model: string; api_key: string },
  history: { role: string; content: string }[],
  send: (data: unknown) => void,
  systemPrompt: string,
): Promise<string> {
  const messages = history.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": settings.api_key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: 8192,
      stream: true,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errBody}`);
  }

  let fullContent = "";
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const event = JSON.parse(data);
          if (event.type === "content_block_delta" && event.delta?.text) {
            fullContent += event.delta.text;
            send({ type: "chunk", content: event.delta.text });
          }
        } catch {
          // skip
        }
      }
    }
  }

  return fullContent;
}

async function streamOpenAI(
  settings: { model: string; api_key: string; base_url?: string },
  history: { role: string; content: string }[],
  send: (data: unknown) => void,
  systemPrompt: string,
): Promise<string> {
  const chatUrl = settings.base_url
    ? `${settings.base_url.replace(/\/$/, "")}/chat/completions`
    : OPENAI_CHAT_URL;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  const response = await fetch(chatUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${settings.api_key}`,
    },
    body: JSON.stringify({
      model: settings.model,
      stream: true,
      messages,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errBody}`);
  }

  let fullContent = "";
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const event = JSON.parse(data);
          const delta = event.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            send({ type: "chunk", content: delta });
          }
        } catch {
          // skip
        }
      }
    }
  }

  return fullContent;
}

async function streamGoogle(
  settings: { model: string; api_key: string },
  history: { role: string; content: string }[],
  send: (data: unknown) => void,
  systemPrompt: string,
): Promise<string> {
  const googleUrl = `${GOOGLE_GENERATE_URL}/${settings.model}:streamGenerateContent?alt=sse`;

  const contents = history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const response = await fetch(googleUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": settings.api_key,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents,
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Google API error ${response.status}: ${errBody}`);
  }

  let fullContent = "";
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const event = JSON.parse(data);
          const text = event.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            fullContent += text;
            send({ type: "chunk", content: text });
          }
        } catch {
          // skip
        }
      }
    }
  }

  return fullContent;
}

async function streamBedrockViaSdk(
  settings: { model: string; api_key?: string; base_url?: string },
  history: { role: string; content: string }[],
  send: (data: unknown) => void,
  systemPrompt: string,
): Promise<string> {
  const region = settings.base_url || Deno.env.get("AWS_REGION") || "us-east-1";

  // Parse credentials
  let bearerToken = "";
  if (settings.api_key) {
    try {
      const creds = JSON.parse(settings.api_key);
      if (creds.bearerToken) bearerToken = creds.bearerToken;
    } catch { /* ignore */ }
  }
  if (!bearerToken) bearerToken = Deno.env.get("AWS_BEARER_TOKEN_BEDROCK") || "";

  if (!bearerToken) {
    throw new Error("AWS Bearer Token not configured.");
  }

  // Use Bedrock converse-stream API
  const host = `bedrock-runtime.${region}.amazonaws.com`;
  const url = `https://${host}/model/${settings.model}/converse-stream`;

  const messages = history
    .filter((m) => m.content && m.content.trim())
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: [{ text: m.content }],
    }));

  const body = JSON.stringify({
    system: [{ text: systemPrompt }],
    messages,
    inferenceConfig: { maxTokens: 8192 },
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${bearerToken}`,
    },
    body,
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Bedrock API error ${response.status}: ${errBody}`);
  }

  // converse-stream returns application/vnd.amazon.eventstream in binary framing
  // Read as bytes and parse the AWS event stream binary protocol
  let fullContent = "";
  const reader = response.body!.getReader();
  let buf = new Uint8Array(0);

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // Append new data to buffer
    const newBuf = new Uint8Array(buf.length + value.length);
    newBuf.set(buf);
    newBuf.set(value, buf.length);
    buf = newBuf;

    // Parse AWS event stream frames: each frame is:
    //   4 bytes total length | 4 bytes headers length | 4 bytes prelude CRC
    //   headers | payload | 4 bytes message CRC
    while (buf.length >= 12) {
      const view = new DataView(buf.buffer, buf.byteOffset);
      const totalLen = view.getUint32(0);
      if (buf.length < totalLen) break; // need more data

      const headersLen = view.getUint32(4);
      // prelude CRC at offset 8 (4 bytes)
      const payloadOffset = 12 + headersLen;
      const payloadLen = totalLen - payloadOffset - 4; // subtract message CRC

      if (payloadLen > 0) {
        const payloadBytes = buf.slice(payloadOffset, payloadOffset + payloadLen);
        try {
          const payloadStr = new TextDecoder().decode(payloadBytes);
          const payload = JSON.parse(payloadStr);
          // converse-stream: delta.text at top level or nested under contentBlockDelta
          const text = payload.delta?.text ?? payload.contentBlockDelta?.delta?.text;
          if (text) {
            fullContent += text;
            send({ type: "chunk", content: text });
          }
        } catch {
          // Not JSON or unexpected format — skip
        }
      }

      // Advance buffer past this frame
      buf = buf.slice(totalLen);
    }
  }

  return fullContent;
}

// --- File tree helper ---

async function buildFileTree(dir, baseDir, depth = 0) {
  if (depth > 5) return [];
  // Collect all entries first, then recurse directories in parallel
  const rawEntries = [];
  for await (const entry of Deno.readDir(dir)) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory && EXCLUDED_DIRS.has(entry.name)) continue;
    if (EXCLUDED_FILES.has(entry.name)) continue;
    rawEntries.push(entry);
  }

  const entries = await Promise.all(
    rawEntries.map(async (entry) => {
      const fullPath = `${dir}/${entry.name}`;
      const relPath = relative(baseDir, fullPath);
      if (entry.isDirectory) {
        const children = await buildFileTree(fullPath, baseDir, depth + 1);
        return { name: entry.name, path: relPath, type: "directory", children };
      }
      return { name: entry.name, path: relPath, type: "file" };
    }),
  );

  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

// SQL helper - uses Trex's built-in SQL execution
async function sql(query: string, params: unknown[] = []) {
  // Trex edge functions have access to the database via globalThis.Trex.sql
  // or via the pg connection string in environment
  const pgUrl = Deno.env.get("DATABASE_URL") || Deno.env.get("PG_URL");

  if (typeof globalThis.Trex?.sql === "function") {
    return await globalThis.Trex.sql(query, params);
  }

  // Fallback: direct pg connection
  if (!pgUrl) {
    console.error("[devx-sql] No DATABASE_URL or PG_URL env var, and Trex.sql not available");
    throw new Error("No database connection available");
  }

  try {
    // Use Deno's postgres
    const { Client } = await import("https://deno.land/x/postgres@v0.19.3/mod.ts");
    const client = new Client(pgUrl);
    await client.connect();
    try {
      const result = await client.queryObject(query, params);
      return { rows: result.rows };
    } finally {
      await client.end();
    }
  } catch (err) {
    console.error("[devx-sql] Query failed:", err.message, "SQL:", query.substring(0, 100));
    throw err;
  }
}
