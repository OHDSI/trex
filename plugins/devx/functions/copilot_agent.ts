// @ts-nocheck - Deno edge function
/**
 * Copilot agent — starts Node.js server via duckdb process manager,
 * forwards chat to it with workspace cwd, streams SSE events back to browser.
 * SDK built-in tools are enabled.
 */
import { duckdb, escapeSql } from "./duckdb.ts";
import { constructSystemPrompt } from "./prompts.ts";
import { ensureWorkspace, ensureAppWorkspace } from "./tools/workspace.ts";
import { loadHooks, runStopHooks } from "./skills/hooks.ts";

const COPILOT_PORT = 4321;
const COPILOT_PROCESS = "copilot-node-server";

async function ensureCopilotServer() {
  try {
    const raw = await duckdb(`SELECT * FROM trex_devx_process_status('${COPILOT_PROCESS}', '')`);
    const s = JSON.parse(raw);
    if (s.status === "running" || s.status === "starting") return;
  } catch {}

  const serverPath = "/usr/src/plugins-dev/devx/fn-copilot/server.js";
  const config = JSON.stringify({
    path: "/usr/src/plugins-dev/devx/fn-copilot",
    command: `node ${serverPath}`,
    port: COPILOT_PORT,
  });
  await duckdb(`SELECT * FROM trex_devx_process_start('${COPILOT_PROCESS}', '${escapeSql(config)}')`);

  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 1000));
    try {
      const resp = await fetch(`http://localhost:${COPILOT_PORT}/health`);
      if (resp.ok) return;
    } catch {}
  }
  throw new Error("Copilot Node.js server failed to start");
}

export async function streamCopilotChat({
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
  if (hasComponentSelection) {
    systemPrompt += "\nThe user has selected specific components for editing. Focus your modifications on those components.";
  }

  const messages = history
    .filter((m) => m.content && (typeof m.content === "string" ? m.content.trim() !== "" : m.content.length > 0))
    .map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }));
  const lastUserMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  const prompt = lastUserMsg?.role === "user" ? lastUserMsg.content : "";

  let fullContent = "";
  const collectedToolCalls = [];

  try {
    await ensureCopilotServer();

    const response = await fetch(`http://localhost:${COPILOT_PORT}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        systemPrompt,
        model: effectiveSettings.model,
        cwd: workspacePath,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(err || `Copilot server returned ${response.status}`);
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
                send({ type: "chunk", content: `\n<!--tool:${callId}-->\n` });
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
    console.error("[copilot-agent] Error:", err);
    throw new Error(err.message || String(err));
  }

  try {
    const stopHooks = await loadHooks(userId, "Stop", sqlFn);
    if (stopHooks.length > 0) await runStopHooks(stopHooks, { chatId, content: fullContent });
  } catch {}

  return { content: fullContent, toolCalls: collectedToolCalls };
}
