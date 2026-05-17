import http from "node:http";
import fs from "node:fs";
import crypto from "node:crypto";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { kbMcpServer } from "./kb_mcp.js";

const PORT = 4322;
let lastSessionId = null;

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

    const { prompt, systemPrompt, model, maxTurns, oauthToken, cwd } = JSON.parse(body);

    if (oauthToken) process.env.CLAUDE_CODE_OAUTH_TOKEN = oauthToken;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    try {
      const opts = {
        systemPrompt: systemPrompt || undefined,
        maxTurns: maxTurns || 100,
        model: model || "sonnet",
        permissionMode: "bypassPermissions",
        cwd: cwd || undefined,
        mcpServers: { kb: kbMcpServer },
      };

      if (lastSessionId) opts.resume = lastSessionId;

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
        if (message.session_id && !lastSessionId) {
          lastSessionId = message.session_id;
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
  console.log(`[claude-code-server] listening on port ${PORT}`);
});
