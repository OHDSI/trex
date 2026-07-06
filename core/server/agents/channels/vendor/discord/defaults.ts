// Vendored from eve@0.19.0 dist/src/public/channels/discord/defaults.js (Apache-2.0).
// Modified: only the PURE `defaultDiscordAuth` is vendored (imports rewritten to
// the sibling `./inbound.ts` / `./shared.ts`); eve's `defaultEvents` and
// `defaultOnCommand` were intentionally NOT vendored — they are shaped against
// eve's runtime channel handle (`ctx.discord.post()` / `.startTyping()`), which
// is eve runtime code. The trex factory (adapters/discord.ts) supplies its own
// `events` and command default against the trex ChannelRouteArgs instead. See
// vendor/VENDOR.md.

import type { DiscordCommandInteraction } from "./inbound.ts";
import type { DiscordAuthContext } from "./shared.ts";

/**
 * Builds the default auth context for a Discord command interaction:
 * authenticator `discord-interaction`, guild-scoped issuer/principalId when
 * invoked in a guild (else user-scoped), and `principalType` `service` for bot
 * actors or `user` otherwise. Copies the channel, interaction, user, guild, and
 * member-nick attributes.
 */
export function defaultDiscordAuth(interaction: DiscordCommandInteraction): DiscordAuthContext {
  const attributes: Record<string, string> = {
    channel_id: interaction.channelId,
    interaction_id: interaction.id,
    user_id: interaction.user.id,
    username: interaction.user.username,
  };
  if (interaction.guildId !== undefined) attributes.guild_id = interaction.guildId;
  if (interaction.member?.nick !== undefined) attributes.member_nick = interaction.member.nick;
  return {
    attributes,
    authenticator: "discord-interaction",
    issuer: interaction.guildId ? `discord:${interaction.guildId}` : "discord",
    principalId: interaction.guildId
      ? `discord:${interaction.guildId}:${interaction.user.id}`
      : `discord:${interaction.user.id}`,
    principalType: interaction.user.isBot ? "service" : "user",
  };
}
