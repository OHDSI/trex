import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { query, createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { kbMcpServer } from "./kb_mcp.js";

const PORT = 4322;

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
const chatSessions = new Map();

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

    const { prompt, systemPrompt, model, maxTurns, oauthToken, cwd, chatId } = JSON.parse(body);
    const sessionKey = chatId || "__default__";

    if (oauthToken) process.env.CLAUDE_CODE_OAUTH_TOKEN = oauthToken;

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
        permissionMode: "bypassPermissions",
        cwd: cwd || undefined,
        mcpServers: { kb: kbMcpServer, ask: askServer },
        // Discover the materialized devx skills from ~/.claude/skills so the
        // agent's Skill tool can autonomously invoke them (brainstorming, etc.).
        settingSources: ["user"],
      };

      const resumeId = chatSessions.get(sessionKey);
      if (resumeId) opts.resume = resumeId;

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
        if (message.session_id && !chatSessions.get(sessionKey)) {
          chatSessions.set(sessionKey, message.session_id);
        }

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
        chatSessions.delete(sessionKey);
        delete opts.resume;
        for await (const message of query({ prompt, options: opts })) {
          if (message.session_id && !chatSessions.get(sessionKey)) chatSessions.set(sessionKey, message.session_id);
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

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => {
  materializeSkills();
  console.log(`[claude-code-server] listening on port ${PORT}`);
});
