// THREAD === SESSION (adapter default). The allow callback is the DB-backed
// allowlist managed in devx settings; the context line gives the model the
// slack routing it must pass to forwardToClaw/postSlackReply.
import { slackChannel } from "eve/channels/slack";
import { isAllowedSlackUser } from "../lib/allowlist.ts";

export default slackChannel({
  // Once a support thread exists (user @mentioned the agent), every human
  // reply in it reaches the agent without re-mentioning (join-only).
  threads: true,
  allow: (id) => isAllowedSlackUser(id.userId),
  onCommand: (message) => ({
    context: [
      `[slack] channel=${message.channelId} thread=${message.threadTs ?? ""} user=${message.author?.userId ?? ""}`,
    ],
  }),
});
