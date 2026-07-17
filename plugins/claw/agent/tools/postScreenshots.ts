// postScreenshots — relay screenshot PNGs the coder captured (with Playwright)
// into the Discord channel as native image attachments. The coder and claw share
// the container filesystem, so claw reads the files straight from the task's app
// workspace; the coder just reports the workspace-relative paths it wrote.
import { defineTool } from "eve/tools";
import { postChannelMessage, type AttachmentUpload } from "../lib/discord-rest.ts";
import { readOrchestration } from "../lib/state.ts";
import { workspaceRoot, safeRelative } from "../lib/workspace.ts";
import { effectiveUserId } from "./askCodeAgent.ts";
import { isEvalMode, evalStubs } from "../lib/eval-stubs.ts";

interface Input { channelId: string; paths: string[]; caption?: string }

export default defineTool({
  description:
    "Post screenshot PNGs (that the coder captured with Playwright and saved in the app " +
    "workspace) to the Discord channel as inline image attachments, so the team sees the " +
    "result. Call this AFTER the coder reports it wrote screenshots. Pass the current " +
    "channelId and the workspace-relative paths the coder listed (e.g. trex/screenshots/home.png). " +
    "Up to 10 images per call.",
  inputSchema: {
    type: "object",
    properties: {
      channelId: { type: "string", description: "The current channel id (same one fetchChannelHistory uses)." },
      paths: {
        type: "array",
        items: { type: "string" },
        description: "Workspace-relative PNG paths the coder saved, e.g. ['trex/screenshots/home.png'].",
      },
      caption: { type: "string", description: "Optional short caption posted with the images." },
    },
    required: ["channelId", "paths"],
  },
  execute: async (input, ctx) => {
    if (isEvalMode(ctx)) return evalStubs.postScreenshots();
    const { channelId, paths, caption } = input as Input;
    const token = (globalThis as any).Deno?.env?.get?.("DISCORD_BOT_TOKEN");
    if (!token) throw new Error("postScreenshots: DISCORD_BOT_TOKEN not set");
    const userId = effectiveUserId(ctx?.userId, (k) => Deno.env.get(k));
    if (!userId) throw new Error("postScreenshots: no user id (set CLAW_CODE_USER_ID)");
    if (!ctx?.sql) throw new Error("postScreenshots: ctx.sql unavailable");

    // The coder's app is fixed per task and stored on the orchestration row.
    const prior = await readOrchestration(ctx.sql, ctx.sessionId);
    const root = workspaceRoot(userId, prior?.appId ?? null);

    const files: AttachmentUpload[] = [];
    const skipped: string[] = [];
    for (const p of paths.slice(0, 10)) {
      const rel = safeRelative(p);
      if (!rel) { skipped.push(p); continue; }
      try {
        const bytes = await Deno.readFile(`${root}/${rel}`);
        files.push({ name: rel.split("/").pop() || "screenshot.png", bytes, contentType: "image/png" });
      } catch {
        skipped.push(p);
      }
    }
    if (files.length === 0) {
      throw new Error(`postScreenshots: no readable screenshots found (looked under ${root}); paths=${JSON.stringify(paths)}`);
    }
    await postChannelMessage(fetch, { botToken: token, channelId, content: caption, files });
    return { posted: files.map((f) => f.name), skipped };
  },
});
