import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { query, createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { kbMcpServer } from "./kb_mcp.js";
import { seedResponse, authKey, getCached, setCached } from "./models_cache.js";

const modelsCache = new Map(); // authKey -> { models, expires }

const PORT = 4322;
// Deliberately ONE MINUTE LONGER than core/server/agents/service/approval-gate.ts's
// 1_800_000ms deadline (this is plain Node and cannot import that constant), so
// eve's gate is always the side that decides. Equal windows are not enough: this
// timer starts first, so a decision landing at ~29:59 could still be lost here —
// canUseTool would already have denied, and nothing reads the decision file
// after that. Shortening this below the gate reintroduces exactly that bug; the
// gate's 30 minutes is measured, not arbitrary, so raise BOTH or neither.
const PERMISSION_WAIT_MS = 31 * 60 * 1000;

// Make the devx skills (brainstorming, writing-plans, etc.) invocable by the
// agent. The claude-agent-sdk only discovers skills from disk via
// `settingSources`, so we copy the plugin's SKILL.md files into the user-level
// skills dir (~/.claude/skills) and pass `settingSources: ['user']` per request.
// Idempotent; runs once at startup. (The DB sync + skillContext path is separate
// — that's for explicitly-activated skills; this enables autonomous invocation.)
function materializeSkills() {
  const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../skills");
  const dst = path.join(process.env.HOME || "/home/node", ".claude", "skills");
  try {
    let n = 0;
    for (const name of fs.readdirSync(src)) {
      const skillMd = path.join(src, name, "SKILL.md");
      if (!fs.existsSync(skillMd)) continue;
      fs.mkdirSync(path.join(dst, name), { recursive: true });
      fs.copyFileSync(skillMd, path.join(dst, name, "SKILL.md"));
      n++;
    }
    console.log(`[claude-code-server] materialized ${n} skill(s) to ${dst}`);
  } catch (err) {
    console.warn("[claude-code-server] skill materialization failed:", err?.message || err);
  }
}
// Per-chat claude session ids: chatId -> sessionId. Each chat resumes its OWN
// conversation, so contexts don't bleed across chats and a corrupt session can
// only affect the one chat it belongs to (not every chat, as a single global
// session id did).
//
// Persisted to ~/.claude (a mounted volume, same place the agent SDK writes its
// session transcripts) so the mapping SURVIVES a sidecar/container restart. The
// transcripts persist regardless; without this map the server would forget which
// transcript belongs to which chat and start every chat fresh after a restart,
// losing the whole conversation context (only committed git work would remain).
const SESSIONS_FILE = path.join(process.env.HOME || "/home/node", ".claude", "claw-chat-sessions.json");

function loadChatSessions() {
  try {
    return new Map(Object.entries(JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8"))));
  } catch {
    return new Map(); // no file yet / unreadable — start empty
  }
}

const chatSessions = loadChatSessions();

function persistChatSessions() {
  try {
    fs.mkdirSync(path.dirname(SESSIONS_FILE), { recursive: true });
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(Object.fromEntries(chatSessions)));
  } catch (err) {
    console.warn("[claude-code-server] could not persist chat sessions:", err?.message || err);
  }
}

// Record a chat's session id and persist the map so a restart can resume it.
function rememberSession(sessionKey, sessionId) {
  if (!sessionId || chatSessions.get(sessionKey) === sessionId) return;
  chatSessions.set(sessionKey, sessionId);
  persistChatSessions();
}

function forgetSession(sessionKey) {
  if (!chatSessions.has(sessionKey)) return;
  chatSessions.delete(sessionKey);
  persistChatSessions();
}

function sendSSE(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && req.url === "/chat") {
    let body = "";
    for await (const chunk of req) body += chunk;

    const { prompt, systemPrompt, model, maxTurns, oauthToken, cwd, chatId, figmaToken } = JSON.parse(body);
    const sessionKey = chatId || "__default__";

    if (oauthToken) process.env.CLAUDE_CODE_OAUTH_TOKEN = oauthToken;
    // Figma PAT for the pulling-figma-mockups skill's curl fallback. Cleared
    // when absent so a disconnect upstream doesn't leave a stale token behind.
    if (figmaToken) process.env.FIGMA_TOKEN = figmaToken;
    else delete process.env.FIGMA_TOKEN;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    try {
      // In-process tool the agent uses to ask the user structured questions
      // (single/multi-select or free text) and WAIT for the answer. Bridges to
      // the existing elicitation→questionnaire UI: we emit an `elicitation` SSE
      // event (claude_code_agent.ts renders it as a questionnaire and rounds the
      // answer back via POST /elicitation/:id, which writes the answer file we
      // poll here). The built-in AskUserQuestion tool can't return a result in
      // SDK mode (no client handler → auto-dismissed), so we provide this.
      const askServer = createSdkMcpServer({
        name: "ask",
        version: "1.0.0",
        tools: [
          tool(
            "ask_question",
            "Ask the user one or more clarifying questions and wait for their answer. " +
              "ALWAYS use this instead of writing a question as plain text. Provide `options` " +
              "for a single-select choice, add `multiSelect: true` for multi-select, or omit " +
              "`options` for a free-text answer. Returns the user's answer(s).",
            {
              questions: z
                .array(
                  z.object({
                    question: z.string(),
                    options: z.array(z.string()).optional(),
                    multiSelect: z.boolean().optional(),
                  }),
                )
                .min(1),
            },
            async (args) => {
              const id = crypto.randomUUID();
              const answerFile = `/tmp/.claude-elicitation-${id}.answer`;
              sendSSE(res, "elicitation", {
                id,
                question: args.questions[0]?.question,
                questions: args.questions,
              });
              const start = Date.now();
              while (Date.now() - start < 10 * 60 * 1000) {
                await new Promise((r) => setTimeout(r, 400));
                try {
                  if (fs.existsSync(answerFile)) {
                    const ans = JSON.parse(fs.readFileSync(answerFile, "utf8"));
                    try { fs.unlinkSync(answerFile); } catch { /* ignore */ }
                    if (ans.cancelled) {
                      return { content: [{ type: "text", text: "The user dismissed the question without answering." }] };
                    }
                    return { content: [{ type: "text", text: JSON.stringify(ans.content ?? ans) }] };
                  }
                } catch { /* keep polling */ }
              }
              return { content: [{ type: "text", text: "No answer received (timed out)." }] };
            },
          ),
        ],
      });

      const opts = {
        systemPrompt: systemPrompt || undefined,
        maxTurns: maxTurns || 100,
        model: model || "sonnet",
        cwd: cwd || undefined,
        mcpServers: {
          kb: kbMcpServer,
          ask: askServer,
        },
        // Discover the materialized devx skills from ~/.claude/skills so the
        // agent's Skill tool can autonomously invoke them (brainstorming, etc.).
        settingSources: ["user"],
        // Forward subagent (Task) text so consumers can render nested transcripts.
        forwardSubagentText: true,
      };

      const resumeId = chatSessions.get(sessionKey);
      if (resumeId) opts.resume = resumeId;

      // Same file round trip as onElicitation below: write a request file, emit
      // SSE, poll for a decision file, deny on timeout (fail closed). `suggestions`
      // (SDK's "always allow") is left unused — it could grant more than agreed.
      opts.canUseTool = async (toolName, input, { signal }) => {
        const id = crypto.randomUUID();
        const requestFile = `/tmp/.claude-permission-${id}.json`;
        const decisionFile = `/tmp/.claude-permission-${id}.decision`;

        fs.writeFileSync(requestFile, JSON.stringify({ toolName, input }));
        sendSSE(res, "permission", { id, toolName, input });

        const deny = (message) => {
          try { fs.unlinkSync(requestFile); } catch {}
          return { behavior: "deny", message };
        };

        const startTime = Date.now();
        while (Date.now() - startTime < PERMISSION_WAIT_MS) {
          if (signal.aborted) return deny("Turn aborted");
          // Race the poll tick against the abort signal so a cancelled turn stops
          // immediately. Named handler + explicit removal on both branches, since
          // {once:true} alone only cleans up when abort actually fires.
          const aborted = await new Promise((resolve) => {
            const onAbort = () => { clearTimeout(t); resolve(true); };
            const t = setTimeout(() => {
              signal.removeEventListener("abort", onAbort);
              resolve(false);
            }, 500);
            signal.addEventListener("abort", onAbort, { once: true });
          });
          if (aborted) return deny("Turn aborted");
          try {
            if (fs.existsSync(decisionFile)) {
              const decision = JSON.parse(fs.readFileSync(decisionFile, "utf8"));
              try { fs.unlinkSync(decisionFile); } catch {}
              try { fs.unlinkSync(requestFile); } catch {}
              if (decision.behavior === "allow") {
                return { behavior: "allow", updatedInput: decision.updatedInput || input };
              }
              return { behavior: "deny", message: decision.message || "Denied by user" };
            }
          } catch {}
        }
        return deny("Permission request timed out");
      };

      // Handle elicitations (clarifying questions) via file-based signaling
      // The Node.js server writes the question, sends SSE event, polls for answer
      opts.onElicitation = async (request) => {
        const questionId = crypto.randomUUID();
        const questionFile = `/tmp/.claude-elicitation-${questionId}.json`;
        const answerFile = `/tmp/.claude-elicitation-${questionId}.answer`;

        // Write question and notify client via SSE
        const question = request.message || request.description || "The agent has a question";
        fs.writeFileSync(questionFile, JSON.stringify({ question, schema: request.schema }));
        sendSSE(res, "elicitation", { id: questionId, question });

        // Poll for answer (user responds, edge function writes the file)
        const startTime = Date.now();
        while (Date.now() - startTime < 5 * 60 * 1000) {
          await new Promise(r => setTimeout(r, 500));
          try {
            if (fs.existsSync(answerFile)) {
              const answer = JSON.parse(fs.readFileSync(answerFile, "utf8"));
              fs.unlinkSync(questionFile);
              fs.unlinkSync(answerFile);
              if (answer.cancelled) return { action: "deny" };
              return { action: "accept", content: answer.content || {} };
            }
          } catch {}
        }
        // Timeout — deny
        try { fs.unlinkSync(questionFile); } catch {}
        return { action: "deny" };
      };

      let fullContent = "";
      let stepCount = 0;
      // Track pending tool calls so we can mark them complete
      const pendingTools = new Map(); // callId -> { name, args }

      for await (const message of query({ prompt, options: opts })) {
        if (message.session_id) rememberSession(sessionKey, message.session_id);

        if (message.type === "assistant" && message.message) {
          // When a new assistant message arrives, any pending tools from the
          // previous turn are now complete (the SDK executed them internally)
          for (const [callId, info] of pendingTools) {
            sendSSE(res, "tool_call_end", { callId, name: info.name, result: "(completed)" });
            stepCount++;
            sendSSE(res, "step", { step: stepCount, maxSteps: maxTurns || 100 });
          }
          pendingTools.clear();

          for (const block of message.message.content) {
            if (block.type === "text") {
              fullContent += block.text;
              sendSSE(res, "text", { content: block.text });
            }
            if (block.type === "tool_use") {
              const callId = block.id;
              const name = block.name || "";
              const args = block.input || {};
              pendingTools.set(callId, { name, args });
              sendSSE(res, "tool_call_start", { callId, name, args });
            }
          }
        }

        // Handle tool_progress events if available
        if (message.type === "tool_progress") {
          // Could forward partial results here
        }

        // Subagent (Task) lifecycle → forward as subagent_* SSE so the Agents
        // tab can render nested child runs. See docs note 2026-06-14-sdk-subagent-events.
        if (message.type === "system" && message.subtype === "task_started") {
          sendSSE(res, "subagent_start", {
            taskId: message.task_id,
            name: message.subagent_type || message.task_type || "subagent",
            task: message.description || message.prompt || "",
          });
        }
        if (message.type === "system" && message.subtype === "task_progress") {
          sendSSE(res, "subagent_step", {
            taskId: message.task_id,
            step: message.usage?.tool_uses || 0,
            lastTool: message.last_tool_name || null,
            summary: message.summary || null,
          });
        }
        if (message.type === "system" && (message.subtype === "task_updated" || message.subtype === "task_notification")) {
          const status = message.subtype === "task_notification" ? message.status : message.patch?.status;
          if (status === "completed" || status === "failed" || status === "killed" || status === "stopped") {
            sendSSE(res, "subagent_done", {
              taskId: message.task_id,
              status: status === "completed" ? "completed" : "failed",
              result: message.summary || message.patch?.error || "",
            });
          }
        }

        if (message.type === "result") {
          // Mark any remaining pending tools as complete
          for (const [callId, info] of pendingTools) {
            sendSSE(res, "tool_call_end", { callId, name: info.name, result: "(completed)" });
            stepCount++;
            sendSSE(res, "step", { step: stepCount, maxSteps: maxTurns || 100 });
          }
          pendingTools.clear();

          if (message.subtype === "error") {
            sendSSE(res, "error", { error: message.error || "Unknown error" });
          } else {
            if (message.result && !fullContent) fullContent = message.result;
            if (message.usage) {
              sendSSE(res, "token_usage", {
                prompt_tokens: message.usage.input_tokens,
                completion_tokens: message.usage.output_tokens,
              });
            }
          }
          break;
        }
      }

      // Self-heal stale/corrupt resumed sessions. `lastSessionId` is process-
      // global and reused for EVERY chat, so if it points at a session whose
      // transcript got truncated (e.g. a disk-full event mid-write), resuming
      // it yields an empty result (0 tokens) — and without this, every reply in
      // every chat stays empty until the sidecar restarts. On an empty resume,
      // drop the session and retry ONCE with a fresh one so the user still gets
      // an answer; subsequent messages then resume the new healthy session.
      if (!fullContent && opts.resume) {
        console.error(`[claude-code-server] empty result while resuming ${opts.resume}; clearing session and retrying fresh`);
        forgetSession(sessionKey);
        delete opts.resume;
        for await (const message of query({ prompt, options: opts })) {
          if (message.session_id) rememberSession(sessionKey, message.session_id);
          if (message.type === "assistant" && message.message) {
            for (const block of message.message.content) {
              if (block.type === "text") {
                fullContent += block.text;
                sendSSE(res, "text", { content: block.text });
              }
            }
          }
          if (message.type === "result") {
            if (message.subtype !== "error" && message.result && !fullContent) fullContent = message.result;
            if (message.usage) {
              sendSSE(res, "token_usage", {
                prompt_tokens: message.usage.input_tokens,
                completion_tokens: message.usage.output_tokens,
              });
            }
            break;
          }
        }
      }

      sendSSE(res, "done", { content: fullContent });
    } catch (err) {
      console.error("[claude-code-server] Error:", err.message);
      sendSSE(res, "error", { error: err.message || String(err) });
    }

    res.end();
    return;
  }

  // POST /elicitation/:id — submit answer to a pending elicitation
  const elicitMatch = req.url?.match(/^\/elicitation\/([^/]+)$/);
  if (req.method === "POST" && elicitMatch) {
    let body = "";
    for await (const chunk of req) body += chunk;
    const { content, cancelled } = JSON.parse(body);
    const answerFile = `/tmp/.claude-elicitation-${elicitMatch[1]}.answer`;
    fs.writeFileSync(answerFile, JSON.stringify({ content, cancelled: !!cancelled }));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && req.url === "/models") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const { oauthToken, refresh } = JSON.parse(body || "{}");

    const respond = (payload) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    };

    if (!oauthToken) return respond(seedResponse());

    const key = authKey(oauthToken);
    if (!refresh) {
      const cached = getCached(modelsCache, key, Date.now());
      if (cached) return respond({ models: cached, source: "sdk" });
    }

    process.env.CLAUDE_CODE_OAUTH_TOKEN = oauthToken;
    let q;
    try {
      q = query({
        prompt: "noop",
        options: { maxTurns: 1, permissionMode: "bypassPermissions", settingSources: ["user"] },
      });
      const models = await q.supportedModels();
      if (!Array.isArray(models) || models.length === 0) return respond(seedResponse());
      setCached(modelsCache, key, models, Date.now());
      return respond({ models, source: "sdk" });
    } catch (err) {
      console.error("[claude-code-server] /models error:", err && err.message);
      return respond(seedResponse());
    } finally {
      try { if (q && q.interrupt) await q.interrupt(); } catch (_) {}
    }
  }

  res.writeHead(404);
  res.end();
});

// Repo policy: the coder's commits and PRs must NOT carry any tool co-author
// trailer or generated-by footer. The agent SDK adds those by default;
// settingSources:["user"] makes it read the user settings dir, so setting
// includeCoAuthoredBy=false there suppresses both the commit trailer and the PR
// footer.
function disableCoderAttribution() {
  try {
    const dir = path.join(process.env.HOME || "/home/node", ".claude");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "settings.json");
    let settings = {};
    try { settings = JSON.parse(fs.readFileSync(file, "utf8")); } catch { /* none yet */ }
    if (settings.includeCoAuthoredBy !== false) {
      settings.includeCoAuthoredBy = false;
      fs.writeFileSync(file, JSON.stringify(settings, null, 2));
      console.log("[coder-server] disabled commit/PR co-author attribution");
    }
  } catch (err) {
    console.warn("[claude-code-server] could not disable co-authored-by:", err?.message || err);
  }
}

// When the container's gh is authenticated (volume-backed /root/.config/gh),
// wire it in as git's credential helper so the coder's `git push` authenticates
// non-interactively, and attribute commits to the connected GitHub user rather
// than the container's default `root`. ~/.gitconfig is not on a volume, so this
// re-applies on every sidecar start. Best-effort: no gh auth → no-op.
function setupGitCredentials() {
  try {
    execSync("gh auth status", { stdio: "ignore" });
  } catch {
    return;
  }
  try {
    execSync("gh auth setup-git", { stdio: "ignore" });
    try {
      const user = JSON.parse(execSync("gh api user", { encoding: "utf8" }));
      if (user && user.login) {
        const name = user.name || user.login;
        // GitHub no-reply email keeps commits linked to the account without
        // exposing a private address.
        const email = `${user.id}+${user.login}@users.noreply.github.com`;
        execSync(`git config --global user.name ${JSON.stringify(name)}`);
        execSync(`git config --global user.email ${JSON.stringify(email)}`);
      }
    } catch (e) {
      console.warn("[claude-code-server] could not set git identity from gh user:", e?.message || e);
    }
    console.log("[claude-code-server] git configured (credentials + identity)");
  } catch (err) {
    console.warn("[claude-code-server] gh auth setup-git failed:", err?.message || err);
  }
}

server.listen(PORT, () => {
  materializeSkills();
  disableCoderAttribution();
  setupGitCredentials();
  console.log(`[claude-code-server] listening on port ${PORT}`);
});
