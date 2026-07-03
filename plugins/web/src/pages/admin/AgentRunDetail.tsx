import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "urql";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowLeftIcon, ChevronDownIcon, ChevronRightIcon, RadioIcon, RefreshCwIcon } from "lucide-react";
import { authClient } from "@/lib/auth-client";

const AGENT_SESSION_QUERY = `
  query AgentSession($id: ID!) {
    agentSession(id: $id) {
      session {
        id
        plugin
        agent
        createdBy
        status
        createdAt
        updatedAt
        turnCount
        lastActivity
      }
      turns {
        id
        seq
        message
        status
        error
        startedAt
        finishedAt
        steps {
          seq
          kind
          name
          payload
          usage
          startedAt
          finishedAt
        }
      }
    }
  }
`;

interface AgentStepRow {
  seq: number;
  kind: string;
  name: string | null;
  payload: string | null;
  usage: string | null;
  startedAt: string;
  finishedAt: string | null;
}

interface AgentTurnRow {
  id: string;
  seq: number;
  message: string | null;
  status: string;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  steps: AgentStepRow[];
}

interface AgentSessionRow {
  id: string;
  plugin: string;
  agent: string;
  createdBy: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  turnCount: number;
  lastActivity: string | null;
}

interface AgentSessionDetail {
  session: AgentSessionRow;
  turns: AgentTurnRow[];
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatDuration(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return "running…";
  try {
    const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
    if (!Number.isFinite(ms) || ms < 0) return "—";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  } catch {
    return "—";
  }
}

function formatMessage(raw: string | null): string {
  if (!raw) return "—";
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string") return parsed;
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.content === "string") return parsed.content;
      if (typeof parsed.text === "string") return parsed.text;
      return JSON.stringify(parsed, null, 2);
    }
    return String(parsed);
  } catch {
    return raw;
  }
}

function prettyJson(raw: string | null): string {
  if (!raw) return "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function parseUsage(raw: string | null): { inputTokens?: number; outputTokens?: number } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
    return null;
  } catch {
    return null;
  }
}

// Wire event shape from GET /eve/v1/session/:id/stream (NDJSON, one object
// per line). Vocabulary documented in core/server/agents/COMPAT.md.
interface LiveStreamEvent {
  type: string;
  [key: string]: unknown;
}

// A turn's live tail ends at one of these — see COMPAT.md's note that
// session.waiting/session.failed (not these) are what a *replaying* eve
// client keys off, but turn.completed/turn.failed are sufficient here since
// we stop the live tail and fall back to a full GraphQL refetch, which is
// itself authoritative for session/turn status.
const TERMINAL_EVENT_TYPES = new Set(["turn.completed", "turn.failed"]);

function pluginScope(plugin: string): string {
  const match = /^@([^/]+)\//.exec(plugin);
  return match ? match[1] : plugin;
}

// Payload fields live under `event.data` on the wire (see the AgentEvent
// union in core/server/agents/service/events.ts and the recorded traces in
// plugins-dev/toy-agent/.eve/evals/*/evals/echo.events.ndjson, e.g.
// {"type":"message.appended","data":{"turnId":...,"messageDelta":...}}).
// Fall back to top-level fields defensively for forward compat.
function eventField(event: LiveStreamEvent, key: string): unknown {
  const data = event.data;
  if (data && typeof data === "object" && key in (data as Record<string, unknown>)) {
    return (data as Record<string, unknown>)[key];
  }
  return event[key];
}

function eventString(event: LiveStreamEvent, key: string): string | null {
  const value = eventField(event, key);
  return typeof value === "string" ? value : null;
}

function summarizeLiveEvent(event: LiveStreamEvent): string {
  switch (event.type) {
    case "message.appended": {
      const delta = eventString(event, "messageDelta");
      return delta && delta.length > 0 ? delta : "…";
    }
    case "message.completed":
      return eventString(event, "message") ?? "message completed";
    case "actions.requested": {
      // data.actions: ActionRequestItem[] — each { toolName, callId, input }
      const actions = eventField(event, "actions");
      if (Array.isArray(actions) && actions.length > 0) {
        const names = actions
          .map((a) =>
            a && typeof a === "object" && typeof (a as Record<string, unknown>).toolName === "string"
              ? ((a as Record<string, unknown>).toolName as string)
              : "tool",
          )
          .join(", ");
        return `requested ${names}`;
      }
      return "requested tool";
    }
    case "action.result": {
      // data.result: ActionResultData — { toolName, callId, output }; data.status: completed|failed
      const result = eventField(event, "result");
      const toolName =
        result && typeof result === "object" && typeof (result as Record<string, unknown>).toolName === "string"
          ? ((result as Record<string, unknown>).toolName as string)
          : "tool";
      const status = eventString(event, "status");
      return `${toolName} result${status === "failed" ? " (failed)" : ""}`;
    }
    case "input.requested":
      return "waiting for input";
    case "turn.completed":
      return "turn completed";
    case "turn.failed":
      // events.ts: turn.failed carries data.message (not data.error)
      return eventString(event, "message") ?? eventString(event, "error") ?? "turn failed";
    case "session.waiting":
      return "session waiting";
    case "session.failed":
      return eventString(event, "message") ?? "session failed";
    default:
      return event.type;
  }
}

function sessionStatusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "success" {
  switch (status) {
    case "active":
      return "success";
    case "failed":
      return "destructive";
    case "closed":
      return "secondary";
    default:
      return "default";
  }
}

function turnStatusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "success" {
  switch (status) {
    case "completed":
      return "success";
    case "failed":
      return "destructive";
    case "running":
      return "secondary";
    default:
      return "default";
  }
}

function stepKindBadgeVariant(kind: string): "default" | "secondary" | "destructive" | "success" | "warning" | "outline" {
  switch (kind) {
    case "finish":
      return "success";
    case "error":
      return "destructive";
    case "approval-request":
      return "warning";
    case "model":
      return "secondary";
    case "tool-call":
    case "tool-result":
    case "client-tool-call":
      return "outline";
    default:
      return "default";
  }
}

function StepRow({ step }: { step: AgentStepRow }) {
  const [expanded, setExpanded] = useState(false);
  const usage = step.kind === "finish" ? parseUsage(step.usage) : null;
  const hasPayload = !!step.payload;

  return (
    <div className="rounded-md border bg-background/40 p-2">
      <div
        className={`flex items-center gap-2 ${hasPayload ? "cursor-pointer" : ""}`}
        onClick={() => hasPayload && setExpanded((v) => !v)}
      >
        {hasPayload ? (
          expanded ? (
            <ChevronDownIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRightIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <Badge variant={stepKindBadgeVariant(step.kind)}>{step.kind}</Badge>
        {step.name && <span className="text-sm font-mono">{step.name}</span>}
        <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
          {formatDuration(step.startedAt, step.finishedAt)}
        </span>
        {usage && (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {usage.inputTokens ?? 0} in / {usage.outputTokens ?? 0} out
          </span>
        )}
      </div>
      {hasPayload && expanded && (
        <pre className="mt-2 rounded-md border bg-muted p-3 text-xs font-mono overflow-auto max-h-96">
          {prettyJson(step.payload)}
        </pre>
      )}
    </div>
  );
}

function TurnCard({ turn }: { turn: AgentTurnRow }) {
  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Turn {turn.seq}</span>
            <Badge variant={turnStatusBadgeVariant(turn.status)}>{turn.status}</Badge>
          </div>
          <p className="text-sm mt-1 whitespace-pre-wrap break-words">{formatMessage(turn.message)}</p>
          {turn.error && (
            <p className="text-sm text-destructive mt-1">{turn.error}</p>
          )}
        </div>
        <div className="text-xs text-muted-foreground text-right shrink-0">
          <div>{formatDuration(turn.startedAt, turn.finishedAt)}</div>
          <div>{formatTimestamp(turn.startedAt)}</div>
        </div>
      </div>

      {turn.steps.length > 0 && (
        <div className="space-y-1.5 pl-2">
          {turn.steps.map((step) => (
            <StepRow key={step.seq} step={step} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AgentRunDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [result, reexecute] = useQuery({
    query: AGENT_SESSION_QUERY,
    variables: { id },
    pause: !id,
  });

  function refetch() {
    reexecute({ requestPolicy: "network-only" });
  }

  const detail: AgentSessionDetail | null = result.data?.agentSession ?? null;

  const shouldPoll = useMemo(() => {
    if (!detail) return false;
    if (detail.session.status !== "active") return false;
    const lastTurn = detail.turns[detail.turns.length - 1];
    return lastTurn?.status === "running";
  }, [detail]);

  useEffect(() => {
    if (!shouldPoll) return;
    const interval = setInterval(refetch, 5000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldPoll]);

  // Live tail (Task D4, stretch): while a turn is running, attach to the
  // agent's own NDJSON stream for near-real-time events, in addition to (not
  // instead of) the 5s poll above — belt and braces. Auth: same Bearer token
  // graphql-client.ts uses (authClient.getAccessToken()); the stream route
  // goes through the same authContext + pluginAuthz middleware as GraphQL
  // (core/server/plugin/function.ts _addFunction for @trex-scoped plugins),
  // and pluginAuthz has no registered scope requirement for this path, so
  // any authenticated user's bearer token passes. Same-origin (PLUGINS_BASE_PATH
  // "/plugins" is proxied alongside BASE_PATH in dev, same host in prod), so
  // no CORS wrinkle either.
  const [liveEvents, setLiveEvents] = useState<LiveStreamEvent[]>([]);
  const [liveTailActive, setLiveTailActive] = useState(false);
  const sessionKey = detail ? `${detail.session.id}:${detail.session.plugin}:${detail.session.agent}` : null;

  useEffect(() => {
    if (!shouldPoll || !detail) return;
    const { session } = detail;
    const scope = pluginScope(session.plugin);
    const url = `${window.location.origin}/plugins/${scope}/${session.agent}/eve/v1/session/${session.id}/stream`;
    const controller = new AbortController();
    let stopped = false;
    // Set only by this effect instance's cleanup. Under React StrictMode the
    // effect mounts, is torn down, and mounts again immediately — the first
    // (aborted) instance's async `finally` would otherwise run AFTER the
    // second instance set liveTailActive(true) and wrongly clear its badge.
    // A superseded instance must not touch shared state anymore.
    let superseded = false;

    setLiveEvents([]);
    setLiveTailActive(true);

    (async () => {
      try {
        const token = authClient.getAccessToken();
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch(url, {
          method: "GET",
          headers,
          credentials: "include",
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          throw new Error(`live tail request failed (${res.status})`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!stopped) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            let parsed: unknown;
            try {
              parsed = JSON.parse(trimmed);
            } catch {
              continue;
            }
            if (!parsed || typeof parsed !== "object" || typeof (parsed as LiveStreamEvent).type !== "string") {
              continue;
            }
            const event = parsed as LiveStreamEvent;
            if (superseded) break;
            setLiveEvents((prev) => {
              const next = [...prev, event];
              return next.length > 300 ? next.slice(next.length - 300) : next;
            });
            if (TERMINAL_EVENT_TYPES.has(event.type)) {
              stopped = true;
              controller.abort();
              refetch();
              break;
            }
          }
        }
      } catch (err) {
        // Graceful fallback: any stream error (auth hiccup, network drop,
        // non-ok response) just leaves the 5s poll above as the source of
        // truth — no retry/backoff machinery here by design.
        if ((err as Error)?.name !== "AbortError") {
          console.warn("agent session live tail unavailable, falling back to polling", err);
        }
      } finally {
        // Only this instance may clear the badge — if it was superseded, a
        // newer instance owns liveTailActive now (StrictMode double-mount).
        if (!superseded) setLiveTailActive(false);
      }
    })();

    return () => {
      superseded = true;
      stopped = true;
      controller.abort();
      setLiveTailActive(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldPoll, sessionKey]);

  if (result.fetching && !detail) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (result.error) {
    return (
      <div className="text-center py-20">
        <p className="text-destructive">
          Failed to load agent session: {result.error.message}
        </p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Agent session not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/admin/agent-runs")}>
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Agent Runs
        </Button>
      </div>
    );
  }

  const { session, turns } = detail;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon-sm" onClick={() => navigate("/admin/agent-runs")}>
          <ArrowLeftIcon />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold truncate">{session.agent}</h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant={sessionStatusBadgeVariant(session.status)}>{session.status}</Badge>
            <span>{session.plugin}</span>
            <span>·</span>
            <span>by {session.createdBy ?? "unknown"}</span>
            <span>·</span>
            <span>created {formatTimestamp(session.createdAt)}</span>
          </div>
        </div>
        <Button variant="outline" onClick={refetch}>
          <RefreshCwIcon className="h-4 w-4" />
        </Button>
      </div>

      <Separator />

      <div className="space-y-4">
        {turns.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No turns recorded for this session.</p>
        ) : (
          turns.map((turn) => <TurnCard key={turn.id} turn={turn} />)
        )}
      </div>

      {(liveTailActive || liveEvents.length > 0) && (
        <div className="rounded-lg border p-4 space-y-2">
          <div className="flex items-center gap-2">
            <RadioIcon className={`h-3.5 w-3.5 ${liveTailActive ? "text-green-500 animate-pulse" : "text-muted-foreground"}`} />
            <span className="text-sm font-semibold">Live tail</span>
            {liveTailActive && <Badge variant="success">streaming</Badge>}
          </div>
          <div className="space-y-1 max-h-72 overflow-auto font-mono text-xs">
            {liveEvents.map((event, i) => (
              <div key={i} className="flex items-start gap-2 rounded border bg-background/40 px-2 py-1">
                <span className="text-muted-foreground shrink-0">{event.type}</span>
                <span className="truncate">{summarizeLiveEvent(event)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
