// Stream event vocabulary. Provisional names — Task 9 reconciles these with
// eve's actual session-stream event names so `eve eval --url` can consume our
// stream, and updates this file plus dependent tests in a single commit.
export type AgentEvent =
  | { type: "turn-start"; turnId: string; seq: number }
  | { type: "text-delta"; delta: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; input: unknown; clientOnly?: boolean }
  | { type: "tool-result"; toolCallId: string; toolName: string; output: unknown }
  | { type: "approval-request"; requestId: string; toolName: string; input: unknown }
  | { type: "turn-finish"; usage: { inputTokens?: number; outputTokens?: number }; finishReason: string }
  | { type: "error"; message: string };
