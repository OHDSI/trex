// Thread-per-task: a /trex command in a regular channel spawns a public
// thread and the session is keyed to the THREAD id — one task per thread,
// parallel threads are independent sessions (each with its own Code-agent
// session). A /trex inside a thread continues that thread's session.
//
// The conversationId override below is the FALLBACK path (thread creation
// failed, DMs): it pins the conversation id to the channel id via the
// adapter's real `conversationId` override so claw's multi-gate flow
// (plan -> approve -> build -> ship) still lands on ONE stable session
// instead of minting a new one per interaction (the reference adapter
// tokenizes on interaction.id, unique per slash command).
import { discordChannel } from "eve/channels/discord";
import { stableConversationId } from "../lib/discord-channel.ts";

export default discordChannel({
  // credentials (publicKey / applicationId / botToken) fall back to DISCORD_*
  // env, same as the reference adapter default.
  threads: true,
  // Gateway-only: @trex mentions + plain messages in claw task threads
  // (requires DISCORD_GATEWAY=1 + DISCORD_MESSAGES=1 + the portal's
  // MESSAGE CONTENT intent). Inert in webhook mode.
  messages: true,
  conversationId: (interaction) =>
    stableConversationId({ channelId: interaction.channelId, interactionId: interaction.id }),
});
