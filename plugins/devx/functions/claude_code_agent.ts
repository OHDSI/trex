// @ts-nocheck - Deno edge function
/**
 * Claude Code agent — starts Node.js server via duckdb process manager,
 * forwards chat to it with workspace cwd, streams SSE events back to browser.
 * SDK built-in tools (Read, Write, Edit, Bash, Glob, Grep) are enabled.
 */
import { duckdb, escapeSql } from "./duckdb.ts";
import { constructSystemPrompt } from "./prompts.ts";
import {
  ensureWorkspace,
  ensureAppWorkspace,
  ensureWorktreeParent,
  getAppWorkspacePath,
  getRunWorktreePath,
  readProjectRules,
} from "./tools/workspace.ts";
import { gitOps } from "./git.ts";
import { ensureGitConfig } from "./git_identity.ts";
import { loadHooks, runStopHooks } from "./skills/hooks.ts";
import { getValidOAuthToken } from "./routes/claude_code_routes.ts";

// Pin a chat to a stable, isolated git worktree so a feature's work persists
// across turns — each /stream turn otherwise resets the coder's cwd to the app
// root — and parallel chats on the same app don't collide on one working tree.
// Best-effort: returns null (→ caller keeps the app workspace) when the app is
// not a git repo or the worktree can't be created. The branch/worktree are keyed
// on the chat id, created once and reused thereafter.
async function ensureChatWorktree(userId: string, appId: string, chatId: string): Promise<string | null> {
  const repoRoot = getAppWorkspacePath(userId, appId);
  try {
    await Deno.stat(`${repoRoot}/.git`);
  } catch {
    return null; // not a git repo — nothing to branch from
  }
  const worktree = getRunWorktreePath(userId, appId, chatId);
  try {
    await Deno.stat(worktree);
    return worktree; // already created for this chat
  } catch { /* create below */ }
  try {
    await ensureWorktreeParent(userId, appId);
    const branch = `claw/${chatId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40)}`;
    // Base the feature worktree on the latest origin/develop so work always
    // starts from an up-to-date tree, not whatever the app workspace was left at.
    let startPoint: string | undefined;
    try {
      await gitOps.fetch(repoRoot, "origin", "develop");
      startPoint = "origin/develop";
    } catch (e) {
      console.warn("[claude_code_agent] fetch origin/develop failed; basing worktree on current HEAD:", e?.message || e);
    }
    await gitOps.worktreeAdd(repoRoot, worktree, branch, startPoint);
    return worktree;
  } catch (err) {
    console.warn("[claude_code_agent] worktree create failed, using app workspace:", err?.message || err);
    return null;
  }
}

const CLAUDE_PORT = 4322;
const CLAUDE_PROCESS = "claude-code-node-server";

// Always-on preamble: the using-skills skill content is injected into
// every session's system prompt. Loaded lazily and cached for the worker
// lifecycle (skills/sync.ts already resolves the same plugin base path).
let _skillsPreamble: string | null = null;
async function loadSkillsPreamble(): Promise<string> {
  if (_skillsPreamble !== null) return _skillsPreamble;
  try {
    const fnPath = Deno.env.get("TREX_FUNCTION_PATH") || new URL("../", import.meta.url).pathname;
    const pluginBase = fnPath.replace(/\/functions\/?$/, "").replace(/\/$/, "");
    const body = await Deno.readTextFile(`${pluginBase}/skills/using-skills/SKILL.md`);
    // Strip frontmatter so the body reads as a system-prompt section, not a skill file.
    const stripped = body.replace(/^---\n[\s\S]*?\n---\n+/, "");
    _skillsPreamble = stripped.trim();
  } catch (err) {
    console.warn("[claude_code_agent] using-skills preamble not loaded:", err?.message || err);
    _skillsPreamble = "";
  }
  return _skillsPreamble;
}

export async function ensureClaudeCodeServer() {
  try {
    const raw = await duckdb(`SELECT * FROM trex_devx_process_status('${CLAUDE_PROCESS}', '')`);
    const s = JSON.parse(raw);
    if (s.status === "running" || s.status === "starting") return;
  } catch {}

  // The devx plugin lives at /usr/src/plugins-dx/devx in the consolidated
  // (TREX_DX_ENABLED) image and at /usr/src/plugins-dev/devx in source/bind
  // layouts. Resolve whichever fn-claude-code actually exists.
  let claudeDir = "/usr/src/plugins-dx/devx/fn-claude-code";
  try {
    await Deno.stat(`${claudeDir}/server.js`);
  } catch {
    claudeDir = "/usr/src/plugins-dev/devx/fn-claude-code";
  }
  const serverPath = `${claudeDir}/server.js`;
  const config = JSON.stringify({
    path: claudeDir,
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

// Materialize channel attachments (screenshots etc., relayed by claw as
// name/url metadata) into `<workspace>/attachments/` so the coder can Read
// them — images render multimodally through the Read tool, so nothing is ever
// inlined into a prompt. Returns the workspace-relative paths written; failures
// are per-file and non-fatal (the turn still runs, the miss is logged).
const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024; // 20MB per file
async function materializeAttachments(
  workspacePath,
  attachments,
) {
  const saved = [];
  const dir = `${workspacePath}/attachments`;
  for (const a of attachments) {
    // Basename only, conservative charset — the name is remote input.
    const base = String(a.name).split(/[\\/]/).pop() || "file";
    const safe = base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    try {
      const res = await fetch(a.url);
      if (!res.ok) throw new Error(`fetch ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength > ATTACHMENT_MAX_BYTES) throw new Error(`too large (${bytes.byteLength} bytes)`);
      await Deno.mkdir(dir, { recursive: true });
      // Prefix with an index to keep same-named files from clobbering.
      const rel = `attachments/${saved.length}-${safe}`;
      await Deno.writeFile(`${workspacePath}/${rel}`, bytes);
      saved.push({ path: rel, contentType: a.contentType });
    } catch (err) {
      console.warn(`[claude-code] attachment '${safe}' skipped:`, err?.message || err);
    }
  }
  return saved;
}

export async function streamClaudeCodeChat({
  chatId, userId, appId, chatMode, settings, history, send, sqlFn,
  skillContext, commandOverride, hasComponentSelection, workspacePathOverride, useWorktree, remoteChannel, attachments,
}) {
  const mode = chatMode || "agent";
  const maxSteps = settings.max_steps || 100;
  const effectiveSettings = commandOverride?.model
    ? { ...settings, model: commandOverride.model }
    : settings;

  // Optional isolated workspace (git worktree for an agent-driven run).
  let workspacePath = workspacePathOverride
    ? workspacePathOverride
    : appId
    ? await ensureAppWorkspace(userId, appId)
    : await ensureWorkspace(userId);
  // Per-user git identity/signing: sync the MAIN repo's devx include file at
  // the start of every coder turn. Worktrees share the main repo's
  // .git/config, so this also covers commits the coder makes inside the
  // per-chat worktree below; local repo config beats the sidecar's global
  // gh-derived identity.
  if (appId) {
    try {
      await ensureGitConfig(workspacePath, userId, sqlFn);
    } catch (e) {
      console.warn("[claude-code] git identity setup failed:", e?.message || e);
    }
  }
  // Facilitated (claw) sessions pin to a stable per-chat worktree so feature
  // work stays isolated and survives the cwd reset between turns.
  if (!workspacePathOverride && useWorktree && appId && chatId) {
    const wt = await ensureChatWorktree(userId, appId, chatId);
    if (wt) workspacePath = wt;
  }

  let aiRules = effectiveSettings.ai_rules || undefined;
  if (appId) {
    const rules = await readProjectRules(workspacePath);
    if (rules !== undefined) aiRules = rules;
  }

  let systemPrompt = constructSystemPrompt(mode, aiRules, skillContext);
  const skillsPreamble = await loadSkillsPreamble();
  if (skillsPreamble) {
    const skillUsageRule = `<skill-usage>\nThe skills above are real and invocable via the Skill tool. When the user asks you to build a feature, component, app, or mockups, FIRST invoke the appropriate skill (e.g. the brainstorming skill to explore the idea and present design options) BEFORE writing app code. Do not jump straight to implementation, and do not write throwaway mockups into the user's app.\n</skill-usage>`;
    const askQuestionRule = `<asking-questions>\nWhenever you need to ask the user ANYTHING — a clarifying question, a choice between options, or a confirmation — you MUST use the \`mcp__ask__ask_question\` tool. Pass \`options\` for a single choice, add \`multiSelect: true\` for multiple, or omit \`options\` for free text. This applies everywhere, not only during brainstorming. NEVER write a question as plain text in your reply: plain-text questions do NOT render as an interactive prompt and the user may not answer them.\n</asking-questions>`;
    // Belt-and-braces with the sidecar's includeCoAuthoredBy=false (server.js
    // disableCoderAttribution): that suppresses the SDK's automatic trailer/
    // footer; this stops the model from MENTIONING the tooling in text it
    // writes itself.
    const commitHygieneRule = `<commit-pr-hygiene>\nCommits, branch names, and pull-request text belong to the user, not the tooling. Never mention Claude, Anthropic, AI, or that the work was generated/assisted, anywhere in a commit message, commit trailer (no Co-Authored-By: Claude or similar), branch name, PR title, or PR description. Write them exactly as the human author of the change would. Branch names always follow <github-username>/<topic> (the connected GitHub account's username, short kebab-case topic, e.g. p-hoffmann/fix-filter-race).\n</commit-pr-hygiene>`;
    systemPrompt = `<skills-protocol>\n${skillsPreamble}\n</skills-protocol>\n\n${skillUsageRule}\n\n${askQuestionRule}\n\n${commitHygieneRule}\n\n${systemPrompt}`;
  }
  if (hasComponentSelection) {
    systemPrompt += "\nThe user has selected specific components for editing. Focus your modifications on those components.";
  }
  if (remoteChannel) {
    // Chat-channel-driven turn (claw): the requester cannot execute anything on
    // this machine — tell the coder it must do/verify everything itself.
    const { REMOTE_CHANNEL_SYSTEM_PROMPT } = await import("./prompts.ts");
    systemPrompt += `\n${REMOTE_CHANNEL_SYSTEM_PROMPT}`;
  }

  const messages = history
    .filter((m) => m.content && (typeof m.content === "string" ? m.content.trim() !== "" : m.content.length > 0))
    .map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }));
  const lastUserMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  let prompt = lastUserMsg?.role === "user" ? lastUserMsg.content : "";

  // Channel attachments (claw relay): download into the resolved workspace —
  // AFTER worktree resolution so they land where the coder actually runs —
  // and point the coder at the paths. Only paths enter the prompt, never
  // content; the coder Reads images multimodally on its own.
  if (attachments?.length) {
    const saved = await materializeAttachments(workspacePath, attachments);
    if (saved.length > 0) {
      const listing = saved
        .map((s) => `- ${s.path}${s.contentType ? ` (${s.contentType})` : ""}`)
        .join("\n");
      prompt += `\n\n<user_attachments>\nThe user attached files with this request; they are saved in the workspace:\n${listing}\nView them with the Read tool (images render visually) when they are relevant to the task.\n</user_attachments>`;
    }
  }

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
              case "subagent_start":
                send({ type: "subagent_start", taskId: data.taskId, name: data.name, task: data.task });
                break;
              case "subagent_step":
                send({ type: "subagent_step", taskId: data.taskId, step: data.step, lastTool: data.lastTool, summary: data.summary });
                break;
              case "subagent_done":
                send({ type: "subagent_done", taskId: data.taskId, status: data.status, result: data.result });
                break;
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
