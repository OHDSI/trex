// The reference adapter tokenizes the continuation on interaction.id, which is
// unique per Discord slash command — every command would otherwise mint a new
// agent session. claw's multi-gate flow (plan -> approve -> build -> ship)
// needs all interactions in a channel to land on ONE stable session, so this
// pins the conversation id to the channel id via the adapter's real
// `conversationId` override (core/server/agents/channels/adapters/discord.ts).
import { discordChannel } from "eve/channels/discord";
import { stableConversationId } from "../lib/discord-channel.ts";

export default discordChannel({
  // credentials (publicKey / applicationId / botToken) fall back to DISCORD_*
  // env, same as the reference adapter default.
  conversationId: (interaction) =>
    stableConversationId({ channelId: interaction.channelId, interactionId: interaction.id }),
});
