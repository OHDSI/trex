const http = require("http");
const { CopilotClient } = require("@github/copilot-sdk");
const registerDevxTools = require("./tools.js");

const PORT = 4321;
let sharedClient = null;

async function ensureClient() {
  if (sharedClient) return sharedClient;
  sharedClient = new CopilotClient();
  await sharedClient.start();
  return sharedClient;
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

    const { prompt, systemPrompt, model, cwd } = JSON.parse(body);

    // Register our filesystem tools (once per workspace)
    if (cwd) registerDevxTools(cwd);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    let stepCount = 0;

    try {
      const client = await ensureClient();

      const session = await client.createSession({
        model: model || "gpt-4o",
        streaming: true,
        systemMessage: systemPrompt ? { content: systemPrompt } : undefined,
        onPermissionRequest: () => true,
        cwd: cwd || undefined,
      });

      let fullContent = "";
      // Track pending tool calls
      const pendingTools = new Map();

      session.on("assistant.message_delta", (event) => {
        const text = event.data?.deltaContent || "";
        if (text) {
          fullContent += text;
          sendSSE(res, "text", { content: text });
        }
      });

      session.on("tool.execution_start", (event) => {
        const callId = event.id || crypto.randomUUID();
        const name = event.data?.toolName || "";
        pendingTools.set(callId, { name, args: event.data?.toolInput || {} });
        sendSSE(res, "tool_call_start", { callId, name, args: event.data?.toolInput || {} });
      });

      session.on("tool.execution_complete", (event) => {
        const callId = event.id || "";
        const name = event.data?.toolName || "";
        const result = typeof event.data?.result === "string"
          ? event.data.result
          : JSON.stringify(event.data?.result || "");
        pendingTools.delete(callId);
        sendSSE(res, "tool_call_end", { callId, name, result: result.slice(0, 500) });
        stepCount++;
        sendSSE(res, "step", { step: stepCount, maxSteps: 25 });
      });

      session.on("assistant.usage", (event) => {
        if (event.data) {
          sendSSE(res, "token_usage", {
            prompt_tokens: event.data.promptTokens,
            completion_tokens: event.data.completionTokens,
          });
        }
      });

      const done = new Promise((resolve, reject) => {
        session.on("assistant.turn_end", () => {
          // Mark any remaining pending tools as complete
          for (const [callId, info] of pendingTools) {
            sendSSE(res, "tool_call_end", { callId, name: info.name, result: "(completed)" });
            stepCount++;
            sendSSE(res, "step", { step: stepCount, maxSteps: 25 });
          }
          pendingTools.clear();
          resolve();
        });
        session.on("session.error", (event) =>
          reject(new Error(event.data?.message || "Copilot session error")));
      });

      await session.send({ prompt });

      // Timeout after 2 minutes to prevent hanging
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Copilot session timed out")), 120000));

      await Promise.race([done, timeout]);

      session.disconnect();
      sendSSE(res, "done", { content: fullContent });
    } catch (err) {
      console.error("[copilot-server] Error:", err.message);
      sendSSE(res, "error", { error: err.message || String(err) });
    }

    res.end();
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, async () => {
  console.log(`[copilot-server] listening on port ${PORT}`);
  try {
    await ensureClient();
    console.log(`[copilot-server] CopilotClient pre-started`);
  } catch (err) {
    console.error(`[copilot-server] Failed to pre-start client:`, err.message);
  }
});
