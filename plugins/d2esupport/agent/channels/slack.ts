// THREAD === SESSION (adapter default). The allow callback is the DB-backed
// allowlist managed in devx settings; the context line gives the model the
// slack routing it must pass to forwardToClaw/postSlackReply.
import { slackChannel } from "eve/channels/slack";
import { isAllowedSlackUser } from "../lib/allowlist.ts";

export default slackChannel({
  allow: (id) => isAllowedSlackUser(id.userId),
  onCommand: (message) => ({
    context: [
      `[slack] channel=${message.channelId} thread=${message.threadTs ?? ""} user=${message.author?.userId ?? ""}`,
    ],
  }),
});
