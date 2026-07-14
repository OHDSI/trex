// The reference adapter tokenizes on interaction.id (unique per interaction),
// which would mint a new agent session per slash command. claw pins the
// conversation to the channel so all interactions in a channel share one session.
export function stableConversationId(x: { channelId: string; interactionId: string }): string {
  return x.channelId;
}
