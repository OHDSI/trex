// @ts-nocheck - Deno edge function, not compiled by tsc
import { constructSystemPrompt, getMaxHistoryTurns } from "./prompts.ts";
import { streamAgentChat, resolveConsent, clearPendingConsents } from "./agent.ts";
import { clearPendingResponses } from "./tools/plan_tools.ts";
import { ensureAppWorkspace, getAppWorkspacePath } from "./tools/workspace.ts";
import { safeJoin, EXCLUDED_DIRS, EXCLUDED_FILES } from "./tools/path_safety.ts";
import { parseBuildTags, stripBuildTags } from "./build_tag_parser.ts";
import { executeBuildTags } from "./build_tag_executor.ts";
import { devServerManager } from "./dev_server.ts";
import { duckdb, escapeSql } from "./duckdb.ts";
import { parseCodeReviewFindings } from "./code_review_prompt.ts";
import { parseSecurityFindings } from "./security_review_prompt.ts";
import { parseQaFindings } from "./qa_review_prompt.ts";
import { parseDesignFindings } from "./design_review_prompt.ts";
import { TEMPLATES, scaffoldTemplate, injectComponentTagger } from "./templates.ts";
import { relative } from "https://deno.land/std@0.224.0/path/mod.ts";
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
import { handleVisualEditingRoutes } from "./routes/visual_editing_routes.ts";
import { handlePrototypeRoutes } from "./routes/prototype_routes.ts";
import { handleSupabaseRoutes } from "./routes/supabase_routes.ts";
import { handleSkillsRoutes } from "./routes/skills_routes.ts";
import { handleClaudeCodeRoutes } from "./routes/claude_code_routes.ts";
import { handleCopilotRoutes } from "./routes/copilot_routes.ts";
import { handleProviderConfigRoutes } from "./routes/provider_config_routes.ts";
import { syncBuiltins } from "./skills/sync.ts";
import {
  parseSlashInput,
  resolveCommand,
  buildCommandOverride,
  loadSkillMetadata,
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

function loadVisualEditingScripts() {
  if (_visualEditingScriptsLoaded) return;
  _visualEditingScriptsLoaded = true;
  const candidates = [
    new URL("./visual_editing/selector_client.js", import.meta.url).pathname,
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


    // Ensure built-in skills/commands/agents are synced (runs once per worker lifecycle)
    // TREX_FUNCTION_PATH points to the actual function dir; go up one level to get the plugin root
    const fnPath = Deno.env.get("TREX_FUNCTION_PATH") || new URL("../", import.meta.url).pathname;
    const pluginBase = fnPath.replace(/\/functions\/?$/, "").replace(/\/$/, "");
    await syncBuiltins(pluginBase, sql);

    // Phase 6: Dispatch to extracted route handlers
    const routeResult =
      await handleGitRoutes(path, method, req, userId, sql, corsHeaders) ||
      await handleGithubRoutes(path, method, req, userId, sql, corsHeaders) ||
      await handleClaudeCodeRoutes(path, method, req, userId, sql, corsHeaders) ||
      await handleCopilotRoutes(path, method, req, userId, sql, corsHeaders) ||
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
      await handleSkillsRoutes(path, method, req, userId, sql, corsHeaders);
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

    // POST /chats/:id/stream - stream chat completion
    const streamMatch = path.match(/\/chats\/([^/]+)\/stream$/);
    if (streamMatch && method === "POST") {
      const chatId = streamMatch[1];
      const body = await req.json();
      const prompt = body.prompt;
      const streamContext = body.context;

      // Verify chat belongs to user
      const chatCheck = await sql(
        `SELECT id, mode, app_id FROM devx.chats WHERE id = $1 AND user_id = $2`,
        [chatId, userId],
      );
      if (chatCheck.rows.length === 0) {
        return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
      }

      // Get active provider config (multi-provider) with user-level prefs from settings
      const activeProviderResult = await sql(
        `SELECT pc.provider, pc.model, pc.api_key, pc.base_url
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
        settings = {
          ...providerConfig,
          ai_rules: userPrefs.ai_rules || null,
          auto_approve: userPrefs.auto_approve ?? false,
          max_steps: userPrefs.max_steps ?? 100,
          max_tool_steps: userPrefs.max_tool_steps ?? 10,
          auto_fix_problems: userPrefs.auto_fix_problems ?? false,
        };
      } else {
        // Legacy fallback
        const legacyResult = await sql(
          `SELECT provider, model, api_key, base_url, ai_rules, auto_approve, max_steps, max_tool_steps, auto_fix_problems FROM devx.settings WHERE user_id = $1`,
          [userId],
        );
        settings = legacyResult.rows[0] || {
          provider: "anthropic",
          model: "claude-sonnet-4-20250514",
          api_key: null,
          base_url: null,
          ai_rules: null,
          auto_approve: false,
          max_steps: 100,
          max_tool_steps: 10,
          auto_fix_problems: false,
        };
      }

      // Subscription-based and Bedrock providers don't require an API key
      const noKeyProviders = new Set(["claude-code", "copilot", "bedrock"]);
      if (!settings.api_key && !noKeyProviders.has(settings.provider)) {
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
      const streamAppId = chatCheck.rows[0].app_id;

      try {
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

      // Read AI_RULES.md from app workspace (like Dyad), fall back to DB settings
      let aiRules = settings.ai_rules || undefined;
      if (streamAppId) {
        try {
          const wsPath = getAppWorkspacePath(userId, streamAppId);
          aiRules = await Deno.readTextFile(`${wsPath}/AI_RULES.md`);
        } catch { /* no AI_RULES.md, use DB setting or default */ }
      }

      let systemPrompt = constructSystemPrompt(chatMode, aiRules);
      const maxHistory = getMaxHistoryTurns(chatMode);

      // Add minimal behavioral hint when components are selected
      // (actual code snippets are now inline in the user message via aiPrompt)
      if (hasComponentSelection) {
        systemPrompt += "\nThe user has selected specific components for editing. Component details and code snippets are in the user's message. Focus your modifications on those components.";
      }

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
          const encoder = new TextEncoder();
          const send = (data: unknown) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          };

          // SSE heartbeat keeps the connection alive during long waits (e.g. questionnaires)
          const heartbeat = setInterval(() => {
            try { controller.enqueue(encoder.encode(": heartbeat\n\n")); } catch { /* stream closed */ }
          }, 15000);

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
              });
              fullContent = agentResult.content;
            } else if (settings.provider === "copilot") {
              // Copilot SDK: use agent-style streaming even in build/ask mode
              const { streamCopilotChat } = await import("./copilot_agent.ts");
              const agentResult = await streamCopilotChat({
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
              });
              fullContent = agentResult.content;
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

            send({ type: "done", message: saveResult.rows[0] });
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            clearInterval(heartbeat);
            controller.close();
          } catch (err) {
            clearInterval(heartbeat);
            console.error("Stream error:", err);
            const msg = err instanceof Error ? err.message : String(err);
            // Pass through actionable error messages from the agent, fall back to generic
            const lower = msg.toLowerCase();
            let safeMsg: string;
            if (msg.startsWith("Invalid API key")
              || msg.startsWith("API key does not")
              || msg.startsWith("Model \"")
              || msg.startsWith("Rate limit")
              || msg.startsWith("API quota")) {
              safeMsg = msg;
            } else if (lower.includes("401") || lower.includes("authentication") || lower.includes("invalid") && lower.includes("key")) {
              safeMsg = "Invalid API key. Please check your API key in Settings.";
            } else if (lower.includes("404") || lower.includes("not_found") || lower.includes("not found")) {
              safeMsg = "Model not found. Check the model name in Settings.";
            } else if (lower.includes("429") || lower.includes("rate limit")) {
              safeMsg = "Rate limit exceeded. Please wait and try again.";
            } else {
              safeMsg = "An error occurred while generating a response. Check the server logs for details.";
            }
            send({ type: "error", error: safeMsg });
            controller.close();
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
            `SELECT id, parent_chat_id, agent_name, skill_name, task, status, created_at, completed_at
             FROM devx.subagent_runs WHERE user_id = $1 AND app_id = $2
             ORDER BY created_at DESC LIMIT 20`,
            [userId, appIdParam],
          )
        : await sql(
            `SELECT id, parent_chat_id, agent_name, skill_name, task, status, created_at, completed_at
             FROM devx.subagent_runs WHERE user_id = $1
             ORDER BY created_at DESC LIMIT 20`,
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

      const agentSettingsResult = await sql(
        `SELECT provider, model, api_key, base_url, ai_rules, auto_approve, max_steps, max_tool_steps, auto_fix_problems
         FROM devx.settings WHERE user_id = $1`,
        [userId],
      );
      const agentSettings = agentSettingsResult.rows[0];
      if (!agentSettings?.api_key) {
        return Response.json({ error: "AI provider not configured" }, { status: 400, headers: corsHeaders });
      }

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

            // Log tool calls and chunks as subagent messages
            const agentSend = (data: any) => {
              send(data); // Forward to SSE
              if (data.type === "tool_call_start") {
                sql(
                  `INSERT INTO devx.subagent_messages (run_id, role, content, tool_name, tool_call_id)
                   VALUES ($1, 'tool', $2, $3, $4)`,
                  [runId, JSON.stringify(data.args || {}), data.name, data.callId],
                ).catch(() => {});
              }
            };

            const result = await streamAgentChat({
              chatId: `agent-run-${runId}`,
              userId,
              appId: run.app_id,
              chatMode: "agent",
              settings: {
                ...agentSettings,
                max_steps: matchedSkill?.allowed_tools ? 100 : 100,
                auto_approve: true,
              },
              history: [{ role: "user", content: run.task + ". Use your tools to thoroughly analyze the project." }],
              send: agentSend,
              sqlFn: sql,
              skillContext: skillBody,
              commandOverride: matchedSkill?.allowed_tools
                ? { allowed_tools: matchedSkill.allowed_tools, model: null, body: "" }
                : undefined,
            });

            const fullContent = result.content || "";
            await sql(
              `UPDATE devx.subagent_runs SET status = 'completed', result = $1, completed_at = NOW() WHERE id = $2`,
              [fullContent.slice(0, 50000), runId],
            );
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
            send({ type: "error", error: err.message });
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
      const result = await sql(
        `SELECT id, user_id, provider, model, api_key, base_url, ai_rules,
                auto_approve, max_steps, max_tool_steps, auto_fix_problems,
                created_at, updated_at
         FROM devx.settings WHERE user_id = $1`,
        [userId],
      );
      if (result.rows.length === 0) {
        return Response.json(null, { headers: corsHeaders });
      }
      // Mask API key
      const row = result.rows[0];
      if (row.api_key) {
        row.api_key = row.api_key.substring(0, 8) + "..." + row.api_key.slice(-4);
      }
      return Response.json(row, { headers: corsHeaders });
    }

    // PUT /settings
    if (path.endsWith("/settings") && method === "PUT") {
      const body = await req.json();
      // Enforce max length on ai_rules to prevent context flooding
      if (body.ai_rules && body.ai_rules.length > 4000) {
        return Response.json({ error: "AI rules must be under 4000 characters" }, { status: 400, headers: corsHeaders });
      }
      // Distinguish between "not provided" (undefined) and "explicitly cleared" (empty string)
      const apiKey = body.api_key === undefined ? undefined : (body.api_key || null);
      const hasApiKeyUpdate = body.api_key !== undefined;
      const result = await sql(
        `INSERT INTO devx.settings (user_id, provider, model, api_key, base_url, ai_rules, auto_approve, max_steps, max_tool_steps, auto_fix_problems)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (user_id) DO UPDATE SET
           provider = EXCLUDED.provider,
           model = EXCLUDED.model,
           api_key = ${hasApiKeyUpdate ? "EXCLUDED.api_key" : "devx.settings.api_key"},
           base_url = EXCLUDED.base_url,
           ai_rules = EXCLUDED.ai_rules,
           auto_approve = EXCLUDED.auto_approve,
           max_steps = EXCLUDED.max_steps,
           max_tool_steps = EXCLUDED.max_tool_steps,
           auto_fix_problems = EXCLUDED.auto_fix_problems,
           updated_at = NOW()
         RETURNING id, user_id, provider, model, base_url, ai_rules, auto_approve, max_steps, max_tool_steps, auto_fix_problems, created_at, updated_at`,
        [userId, body.provider, body.model, apiKey ?? null, body.base_url || null, body.ai_rules || null, body.auto_approve ?? false, body.max_steps ?? 25, body.max_tool_steps ?? 10, body.auto_fix_problems ?? false],
      );
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

    // POST /apps - create app
    if (path.endsWith("/apps") && method === "POST") {
      const body = await req.json();
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
        `SELECT id, dev_command, install_command, tech_stack FROM devx.apps WHERE id = $1 AND user_id = $2`,
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

      const status = await devServerManager.start(userId, appId, wsPath, app.dev_command, app.install_command);

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
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          const send = (event) => {
            try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`)); } catch { /* closed */ }
          };

          // Send buffered output first
          const entry = devServerManager.getEntry(userId, appId);
          if (entry) {
            for (const line of entry.outputBuffer) {
              send(line);
            }
          }

          // Subscribe to new output from in-memory events
          const unsubscribe = devServerManager.subscribe(userId, appId, send);

          // Poll Rust process manager for output and status
          // (background setTimeout polling doesn't work in edge workers)
          let lastLineId = 0;
          let lastStatus = "";
          let aborted = false;
          const poll = async () => {
            if (aborted) return;
            try {
              // Get new output lines
              const outputResult = JSON.parse(await duckdb(
                `SELECT * FROM trex_devx_process_output('${escapeSql(k)}', '${lastLineId}')`
              ));
              if (outputResult.lines && outputResult.lines.length > 0) {
                for (const line of outputResult.lines) {
                  const clean = line.text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
                  if (!clean.trim()) continue;
                  send({ type: line.stream === "stderr" ? "stderr" : "stdout", data: clean, timestamp: line.timestamp_ms || Date.now() });
                }
                lastLineId = outputResult.last_id;
              }

              // Check status
              const statusResult = JSON.parse(await duckdb(
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
            } catch { /* query error */ }
            if (!aborted) setTimeout(poll, 500);
          };
          poll();

          // Clean up on abort
          req.signal.addEventListener("abort", () => {
            aborted = true;
            unsubscribe();
            try { controller.close(); } catch { /* already closed */ }
          });
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
      try {
        const targetUrl = `http://localhost:${proxyPort}${proxyBase}${proxyPath}${url.search}`;
        const proxyRes = await fetch(targetUrl, {
          headers: { "Accept": req.headers.get("Accept") || "*/*" },
        });
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
