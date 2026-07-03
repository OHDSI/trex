import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "urql";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ArrowLeftIcon, ChevronDownIcon, ChevronRightIcon, RefreshCwIcon } from "lucide-react";

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
    </div>
  );
}
