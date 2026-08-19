// postPlan — display a plan (or brainstorm/options) in the channel as a rich
// Discord embed instead of a wall of text, and attach the full markdown file
// when the coder wrote one. Keeps the gate readable: a titled, colored card the
// team can scan, with the complete plan one click away.
import { defineTool } from "eve/tools";
import { postChannelMessage, type AttachmentUpload } from "../lib/discord-rest.ts";
import { readOrchestration } from "../lib/state.ts";
import { readCoderFile } from "../lib/workspace.ts";
import { markdownTablesToCodeBlocks } from "../lib/discord-format.ts";
import { effectiveUserId } from "./askCodeAgent.ts";
import { isEvalMode, evalStubs } from "../lib/eval-stubs.ts";

// Discord hard limits: embed title 256, embed description 4096.
const TITLE_MAX = 256;
const DESC_MAX = 4096;
const BLURPLE = 0x5865F2;

interface Input { channelId: string; title: string; text: string; attachPath?: string }

export default defineTool({
  // This tool's own execute() posts to the channel directly — see postUpdate.ts.
  postsToChannel: true,
  description:
    "Display a plan, brainstorm, or set of options in the Discord channel as a rich embed " +
    "(titled, formatted) instead of plain text — use this at each planning gate so the team " +
    "can read it clearly. `text` is the markdown to show (headings, lists, and code render). " +
    "For a PLAN, ALWAYS also pass `attachPath` — the workspace-relative path to the full " +
    "plan .md the coder saved (e.g. trex/plans/foo.md) — so the complete plan is attached " +
    "as a file alongside the embed; the embed text may be a summary, but the whole plan " +
    "must always go up as an attachment. Post the approval buttons separately with awaitApproval. " +
    "The server overrides channelId with the session's thread channel when available.",
  inputSchema: {
    type: "object",
    properties: {
      channelId: { type: "string", description: "The current channel id (the server overrides this with the session thread channel)." },
      title: { type: "string", description: "Short heading for the embed, e.g. 'Plan: dashboard filters' or 'Design options'." },
      text: { type: "string", description: "The plan/options as markdown. Truncated to Discord's 4096-char embed limit (attach the file for the full version)." },
      attachPath: { type: "string", description: "Workspace-relative path to the full plan .md to attach, e.g. 'trex/plans/filters.md'. REQUIRED when posting a plan (always attach the whole plan); optional only for a brainstorm/options post with no saved file." },
    },
    required: ["channelId", "title", "text"],
  },
  execute: async (input, ctx) => {
    if (isEvalMode(ctx)) return evalStubs.postPlan();
    const { title, text, attachPath } = input as Input;
    const channelId = (ctx?.metadata as any)?.channelId ?? (input as Input).channelId;
    const token = (globalThis as any).Deno?.env?.get?.("DISCORD_BOT_TOKEN");
    if (!token) throw new Error("postPlan: DISCORD_BOT_TOKEN not set");

    // Discord won't render Markdown tables; convert them to aligned code blocks.
    const rendered = markdownTablesToCodeBlocks(text);
    const truncated = rendered.length > DESC_MAX;
    const description = truncated ? `${rendered.slice(0, DESC_MAX - 40)}\n\n… (full plan attached)` : rendered;
    const embed = {
      title: title.slice(0, TITLE_MAX),
      description,
      color: BLURPLE,
    };

    // Attach the full markdown when a path is given (and always when the embed
    // had to be truncated, so nothing is lost).
    let files: AttachmentUpload[] | undefined;
    if (attachPath) {
      const userId = effectiveUserId(ctx?.userId, (k) => Deno.env.get(k));
      if (userId && ctx?.sql) {
        const prior = await readOrchestration(ctx.sql, ctx.sessionId);
        const found = await readCoderFile(userId, prior?.appId ?? null, prior?.codeSessionId ?? null, attachPath);
        if (found) {
          files = [{ name: found.path.split("/").pop() || "plan.md", bytes: found.bytes, contentType: "text/markdown" }];
        } else {
          // Don't silently drop the plan file: a worktree/path miss used to post
          // the embed with NO attachment and no trace (the coder writes inside a
          // per-chat worktree the old workspaceRoot read never looked in). Warn
          // loudly; the embed itself still posts.
          console.warn(
            `postPlan: could not read attachPath ${JSON.stringify(attachPath)} for session ${ctx.sessionId} ` +
              `(app=${prior?.appId ?? "none"}, code-session=${prior?.codeSessionId ?? "none"}); ` +
              `posting the embed WITHOUT the attachment`,
          );
        }
      }
    }

    await postChannelMessage(fetch, { botToken: token, channelId, embeds: [embed], files });
    return { posted: true, attached: files ? files[0].name : null, truncated };
  },
});
