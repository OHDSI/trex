import { useEffect, useMemo, useState } from "react";
import { useQuery } from "urql";
import { useNavigate } from "react-router-dom";
import { DataTable, type Column } from "@/components/DataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCwIcon } from "lucide-react";

const AGENT_SESSIONS_QUERY = `
  query AgentSessions($limit: Int, $status: String) {
    agentSessions(limit: $limit, status: $status) {
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
  }
`;

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

const STATUS_OPTIONS = ["All", "active", "failed", "closed"];

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "success" {
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

function formatTimestamp(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function AgentRuns() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("All");

  const [result, reexecute] = useQuery({
    query: AGENT_SESSIONS_QUERY,
    variables: {
      limit: 100,
      status: statusFilter === "All" ? null : statusFilter,
    },
  });

  function refetch() {
    reexecute({ requestPolicy: "network-only" });
  }

  useEffect(() => {
    const interval = setInterval(refetch, 30_000);
    return () => clearInterval(interval);
  }, [statusFilter]);

  const rows: AgentSessionRow[] = useMemo(() => result.data?.agentSessions ?? [], [result.data]);

  const columns: Column<AgentSessionRow>[] = [
    {
      header: "Agent",
      cell: (row) => (
        <div className="flex flex-col">
          <span className="text-sm font-medium">{row.agent}</span>
          <span className="text-xs text-muted-foreground">{row.plugin}</span>
        </div>
      ),
    },
    {
      header: "Status",
      cell: (row) => <Badge variant={statusBadgeVariant(row.status)}>{row.status}</Badge>,
    },
    {
      header: "Turns",
      cell: (row) => <span className="text-sm">{row.turnCount}</span>,
    },
    {
      header: "Created By",
      cell: (row) => <span className="text-sm">{row.createdBy ?? "—"}</span>,
    },
    {
      header: "Last Activity",
      cell: (row) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {formatTimestamp(row.lastActivity)}
        </span>
      ),
    },
    {
      header: "Updated",
      cell: (row) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">
          {formatTimestamp(row.updatedAt)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold">Agent Runs</h2>
          <p className="text-muted-foreground">
            {rows.length} session{rows.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="border-input bg-transparent flex h-9 rounded-md border px-3 py-1 text-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt === "All" ? "All Statuses" : opt}
              </option>
            ))}
          </select>
          <Button variant="outline" onClick={refetch}>
            <RefreshCwIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {result.error ? (
        <div className="text-center py-20">
          <p className="text-destructive">
            Failed to load agent runs: {result.error.message}
          </p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          loading={result.fetching}
          emptyMessage="No agent sessions found."
          onRowClick={(row) => navigate(`/admin/agent-runs/${row.id}`)}
        />
      )}
    </div>
  );
}
