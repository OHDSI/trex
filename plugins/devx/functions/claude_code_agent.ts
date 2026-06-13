// @ts-nocheck - Deno edge function
/**
 * Claude Code agent — starts Node.js server via duckdb process manager,
 * forwards chat to it with workspace cwd, streams SSE events back to browser.
 * SDK built-in tools (Read, Write, Edit, Bash, Glob, Grep) are enabled.
 */
import { duckdb, escapeSql } from "./duckdb.ts";
import { constructSystemPrompt } from "./prompts.ts";
import { ensureWorkspace, ensureAppWorkspace } from "./tools/workspace.ts";
import { loadHooks, runStopHooks } from "./skills/hooks.ts";
import { getValidOAuthToken } from "./routes/claude_code_routes.ts";

const CLAUDE_PORT = 4322;
const CLAUDE_PROCESS = "claude-code-node-server";

// Always-on preamble: the using-superpowers skill content is injected into
// every session's system prompt. Loaded lazily and cached for the worker
// lifecycle (skills/sync.ts already resolves the same plugin base path).
let _superpowersPreamble: string | null = null;
async function loadSuperpowersPreamble(): Promise<string> {
  if (_superpowersPreamble !== null) return _superpowersPreamble;
  try {
    const fnPath = Deno.env.get("TREX_FUNCTION_PATH") || new URL("../", import.meta.url).pathname;
    const pluginBase = fnPath.replace(/\/functions\/?$/, "").replace(/\/$/, "");
    const body = await Deno.readTextFile(`${pluginBase}/skills/using-superpowers/SKILL.md`);
    // Strip frontmatter so the body reads as a system-prompt section, not a skill file.
    const stripped = body.replace(/^---\n[\s\S]*?\n---\n+/, "");
    _superpowersPreamble = stripped.trim();
  } catch (err) {
    console.warn("[claude_code_agent] using-superpowers preamble not loaded:", err?.message || err);
    _superpowersPreamble = "";
  }
  return _superpowersPreamble;
}

async function ensureClaudeCodeServer() {
  try {
    const raw = await duckdb(`SELECT * FROM trex_devx_process_status('${CLAUDE_PROCESS}', '')`);
    const s = JSON.parse(raw);
    if (s.status === "running" || s.status === "starting") return;
  } catch {}

  const serverPath = "/usr/src/plugins-dev/devx/fn-claude-code/server.js";
  const config = JSON.stringify({
    path: "/usr/src/plugins-dev/devx/fn-claude-code",
    command: `node ${serverPath}`,
    port: CLAUDE_PORT,
  });
  await duckdb(`SELECT * FROM trex_devx_process_start('${CLAUDE_PROCESS}', '${escapeSql(config)}')`);

  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const resp = await fetch(`http://localhost:${CLAUDE_PORT}/health`);
      if (resp.ok) return;
    } catch {}
  }
  throw new Error("Claude Code Node.js server failed to start");
}

export async function streamClaudeCodeChat({
  chatId, userId, appId, chatMode, settings, history, send, sqlFn,
  skillContext, commandOverride, hasComponentSelection,
}) {
  const mode = chatMode || "agent";
  const maxSteps = settings.max_steps || 100;
  const effectiveSettings = commandOverride?.model
    ? { ...settings, model: commandOverride.model }
    : settings;

  const workspacePath = appId
    ? await ensureAppWorkspace(userId, appId)
    : await ensureWorkspace(userId);

  let aiRules = effectiveSettings.ai_rules || undefined;
  if (appId) {
    try { aiRules = await Deno.readTextFile(`${workspacePath}/AI_RULES.md`); } catch {}
  }

  let systemPrompt = constructSystemPrompt(mode, aiRules, skillContext);
  const superpowersPreamble = await loadSuperpowersPreamble();
  if (superpowersPreamble) {
    const namingRule = `<naming>\nDo NOT use the word "Superpowers" in user-facing text — not in chat replies, not in commit messages, not in titles, not in code comments you author for the user, not on visual companion screens. Refer to the skill system generically as "skills" and to specific skills by their slug (e.g., "the brainstorming skill", "the writing-plans skill"). When citing a doc path that contains the word, just give the path — do not narrate the brand name. This applies even though the system prompt below uses the term internally.\n</naming>`;
    const skillUsageRule = `<skill-usage>\nThe skills above are real and invocable via the Skill tool. When the user asks you to build a feature, component, app, or mockups, FIRST invoke the appropriate skill (e.g. the brainstorming skill to explore the idea and present design options) BEFORE writing app code. Do not jump straight to implementation, and do not write throwaway mockups into the user's app.\n</skill-usage>`;
    const askQuestionRule = `<asking-questions>\nWhenever you need to ask the user ANYTHING — a clarifying question, a choice between options, or a confirmation — you MUST use the \`mcp__ask__ask_question\` tool. Pass \`options\` for a single choice, add \`multiSelect: true\` for multiple, or omit \`options\` for free text. This applies everywhere, not only during brainstorming. NEVER write a question as plain text in your reply: plain-text questions do NOT render as an interactive prompt and the user may not answer them.\n</asking-questions>`;
    systemPrompt = `${namingRule}\n\n<skills-protocol>\n${superpowersPreamble}\n</skills-protocol>\n\n${skillUsageRule}\n\n${askQuestionRule}\n\n${systemPrompt}`;
  }
  if (hasComponentSelection) {
    systemPrompt += "\nThe user has selected specific components for editing. Focus your modifications on those components.";
  }

  const messages = history
    .filter((m) => m.content && (typeof m.content === "string" ? m.content.trim() !== "" : m.content.length > 0))
    .map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }));
  const lastUserMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  const prompt = lastUserMsg?.role === "user" ? lastUserMsg.content : "";

  // Refreshes the token in-place when expired (it lives ~1h) so long-lived
  // sessions don't start sending a stale token and 401-ing.
  const oauthToken = await getValidOAuthToken();

  let fullContent = "";
  const collectedToolCalls = [];

  try {
    await ensureClaudeCodeServer();

    const response = await fetch(`http://localhost:${CLAUDE_PORT}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        systemPrompt,
        model: effectiveSettings.model,
        maxTurns: maxSteps,
        oauthToken,
        cwd: workspacePath,
        // Resume each chat's OWN claude session — a single global session would
        // bleed context across chats and let one bad session break all of them.
        chatId,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(err || `Claude Code server returned ${response.status}`);
    }

    // Read SSE stream and forward to browser
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      let eventType = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) {
          eventType = line.slice(7).trim();
        } else if (line.startsWith("data: ") && eventType) {
          try {
            const data = JSON.parse(line.slice(6));
            switch (eventType) {
              case "text":
                fullContent += data.content || "";
                send({ type: "chunk", content: data.content || "" });
                break;
              case "tool_call_start": {
                const callId = data.callId;
                // Append the marker to fullContent (not just the live stream) so the
                // persisted message records WHERE the tool was invoked — otherwise the
                // reloaded message has no marker and the UI appends tool cards at the end.
                const marker = `\n<!--tool:${callId}-->\n`;
                fullContent += marker;
                send({ type: "chunk", content: marker });
                send({ type: "tool_call_start", callId, name: data.name, args: data.args || {} });
                break;
              }
              case "tool_call_end":
                collectedToolCalls.push({ callId: data.callId, name: data.name || "", result: data.result });
                send({ type: "tool_call_end", callId: data.callId, name: data.name || "", result: data.result || "" });
                break;
              case "step":
                send({ type: "step", step: data.step, maxSteps: data.maxSteps || maxSteps });
                break;
              case "token_usage":
                send({ type: "token_usage", ...data });
                break;
              case "elicitation": {
                // Use the existing questionnaire UI to ask the user
                const requestId = data.id;

                // Render structured questions (from the ask_question tool) as
                // radio/checkbox/text; fall back to a single text question for
                // plain MCP elicitations.
                const structured = Array.isArray(data.questions) ? data.questions : null;
                const questions = structured
                  ? structured.map((q, i) => ({
                      id: String(i),
                      type: q.options?.length ? (q.multiSelect ? "checkbox" : "radio") : "text",
                      label: q.question || "The agent has a question",
                      options: q.options?.length ? q.options : undefined,
                    }))
                  : [{
                      id: "response",
                      type: "text",
                      label: data.question || "The agent has a question",
                    }];
                send({ type: "questionnaire", requestId, questions });

                // Insert pending response and poll (same mechanism as plan_tools)
                await sqlFn(
                  `INSERT INTO devx.pending_responses (request_id, chat_id, user_id, kind) VALUES ($1, $2, $3, 'elicitation')`,
                  [requestId, chatId, userId],
                );

                const answer = await new Promise((resolve) => {
                  const startTime = Date.now();
                  const poll = async () => {
                    const result = await sqlFn(
                      `SELECT answer FROM devx.pending_responses WHERE request_id = $1`, [requestId],
                    );
                    const row = result.rows[0];
                    if (row?.answer) { resolve(row.answer); return; }
                    if (Date.now() - startTime > 5 * 60 * 1000) { resolve(null); return; }
                    setTimeout(poll, 500);
                  };
                  poll();
                });
                await sqlFn(`DELETE FROM devx.pending_responses WHERE request_id = $1`, [requestId]);

                // Forward answer to Node.js server
                const userResponse = answer ? (typeof answer === "string" ? answer : JSON.stringify(answer)) : "";
                await fetch(`http://localhost:${CLAUDE_PORT}/elicitation/${requestId}`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    content: { response: userResponse },
                    cancelled: !answer,
                  }),
                }).catch(() => {});
                break;
              }
              case "error":
                throw new Error(data.error);
              case "done":
                break;
            }
          } catch (e) {
            if (e.message && !e.message.includes("Unexpected")) throw e;
          }
          eventType = "";
        }
      }
    }
  } catch (err) {
    console.error("[claude-code-agent] Error:", err);
    throw new Error(err.message || String(err));
  }

  try {
    const stopHooks = await loadHooks(userId, "Stop", sqlFn);
    if (stopHooks.length > 0) await runStopHooks(stopHooks, { chatId, content: fullContent });
  } catch {}

  return { content: fullContent, toolCalls: collectedToolCalls };
}
