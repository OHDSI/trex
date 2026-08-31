// Which transport claw uses to talk to the coder for a given account provider.
//
// Every provider now runs on eve, claude-code included: the eve runtime hosts
// the sidecar as a delegated engine (devx/agent/lib/sidecar_engine.ts), so the
// one provider that used to force the legacy /chats/:id/stream loop no longer
// does. Nothing selects "legacy" any more — the branch survives only until the
// legacy loop's deletion, as this migration's one-line rollback.
export type CoderTransport = "legacy" | "eve";

export function chooseCoderTransport(_provider: string | null | undefined): CoderTransport {
  return "eve";
}
