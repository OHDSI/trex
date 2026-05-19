import { useRef, useEffect } from "react";
import {
  Loader2,
  CheckCircle2,
  Square,
  Shield,
  Eye,
  TestTube2,
  Palette,
  XCircle,
  Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import type { ReviewAgent, ReviewType } from "@/hooks/useReviewAgents";
import type { AgentRunState } from "@/hooks/useAgentRuns";

interface AgentsTabProps {
  agents: ReviewAgent[];
  onStop: (type: ReviewType) => void;
  agentRuns: Map<string, AgentRunState>;
  onExpandRun: (runId: string) => void;
  onStopRun: (runId: string) => void;
}

const ICONS: Record<ReviewType, React.ElementType> = {
  security: Shield,
  code: Eye,
  qa: TestTube2,
  design: Palette,
};

function StatusBadge({ status }: { status: "running" | "completed" | "failed" | "idle" }) {
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
        <Loader2 className="h-3 w-3 animate-spin" />
        Running
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
        <XCircle className="h-3 w-3" />
        Failed
      </span>
    );
  }
  if (status === "completed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
        <CheckCircle2 className="h-3 w-3" />
        Done
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
      Idle
    </span>
  );
}

function ReviewAgentBadge({ agent }: { agent: ReviewAgent }) {
  if (agent.running) return <StatusBadge status="running" />;
  if (agent.logs.length > 0 && agent.logs[agent.logs.length - 1].startsWith("Error:")) return <StatusBadge status="failed" />;
  if (agent.logs.length > 0 && agent.logs[agent.logs.length - 1] === "Stopped by user") return <StatusBadge status="failed" />;
  if (agent.logs.length > 0) return <StatusBadge status="completed" />;
  return <StatusBadge status="idle" />;
}

function StepProgress({ step, maxSteps }: { step: number; maxSteps: number }) {
  if (step === 0) return null;
  const pct = maxSteps > 0 ? Math.min(100, Math.round((step / maxSteps) * 100)) : 0;
  return (
    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
      <span>{step}/{maxSteps}</span>
      <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden min-w-[60px]">
        <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function LogViewer({ logs }: { logs: string[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [logs.length]);

  if (logs.length === 0) {
    return <div className="px-3 py-4 text-center text-xs text-muted-foreground">No activity yet.</div>;
  }

  return (
    <div className="max-h-48 overflow-y-auto font-mono text-[11px] leading-relaxed bg-muted/30 rounded-md mx-3 mb-3">
      {logs.map((log, i) => (
        <div
          key={i}
          className={`px-2 py-0.5 border-b border-border/30 last:border-b-0 ${
            log.startsWith("Error:") ? "text-red-500" : log === "Stopped by user" ? "text-yellow-600" : "text-muted-foreground"
          }`}
        >
          {log}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

function StreamViewer({ content }: { content: string }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [content]);

  if (!content) {
    return <div className="px-3 py-4 text-center text-xs text-muted-foreground">Waiting for output...</div>;
  }

  return (
    <div className="max-h-64 overflow-y-auto font-mono text-[11px] leading-relaxed bg-muted/30 rounded-md mx-3 mb-3 whitespace-pre-wrap">
      <div className="px-2 py-1 text-muted-foreground">{content}</div>
      <div ref={endRef} />
    </div>
  );
}

function ToolCallList({ messages }: { messages: { tool_name?: string | null; created_at: string }[] }) {
  const toolCalls = messages.filter(m => m.tool_name);
  if (toolCalls.length === 0) return null;
  return (
    <div className="px-3 pb-2">
      <div className="text-[10px] text-muted-foreground font-medium mb-1">Tool calls:</div>
      <div className="flex flex-wrap gap-1">
        {toolCalls.slice(-10).map((tc, i) => (
          <span key={i} className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {tc.tool_name}
          </span>
        ))}
        {toolCalls.length > 10 && (
          <span className="text-[10px] text-muted-foreground">+{toolCalls.length - 10} more</span>
        )}
      </div>
    </div>
  );
}

export function AgentsTab({ agents, onStop, agentRuns, onExpandRun, onStopRun }: AgentsTabProps) {
  const reviewsWithActivity = agents.filter(a => a.running || a.logs.length > 0);
  const subagentEntries = Array.from(agentRuns.values()).sort(
    (a, b) => new Date(b.run.created_at).getTime() - new Date(a.run.created_at).getTime(),
  );

  const hasActivity = reviewsWithActivity.length > 0 || subagentEntries.length > 0;

  if (!hasActivity) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center space-y-2">
          <Bot className="h-8 w-8 mx-auto opacity-30" />
          <p className="text-xs">No agents running.</p>
          <p className="text-xs">Use <code className="bg-muted px-1 rounded">/agent /review</code> to start one.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Accordion
        type="multiple"
        defaultValue={[
          ...reviewsWithActivity.filter(a => a.running).map(a => `review-${a.type}`),
          ...subagentEntries.filter(s => s.run.status === "running").map(s => s.run.id),
        ]}
        onValueChange={(values) => {
          // Load messages when expanding a subagent run
          for (const v of values) {
            const state = agentRuns.get(v);
            if (state && !state.loaded && state.run.status !== "running") {
              onExpandRun(v);
            }
          }
        }}
      >
        {/* Subagent runs */}
        {subagentEntries.map((state) => (
          <AccordionItem key={state.run.id} value={state.run.id}>
            <AccordionTrigger>
              <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs font-medium truncate">{state.run.agent_name}</span>
              <StatusBadge status={state.run.status} />
              <div className="flex-1 mx-2">
                {(state.step > 0 || state.run.status === "running") && (
                  <StepProgress step={state.step} maxSteps={state.maxSteps} />
                )}
              </div>
              {state.run.status === "running" && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 text-[10px] px-1.5 gap-1 mr-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                  onClick={(e) => { e.stopPropagation(); onStopRun(state.run.id); }}
                >
                  <Square className="h-3 w-3" />
                  Stop
                </Button>
              )}
            </AccordionTrigger>
            <AccordionContent>
              <ToolCallList messages={state.messages} />
              <StreamViewer content={state.streamContent || state.run.result || ""} />
            </AccordionContent>
          </AccordionItem>
        ))}

        {/* Review agents */}
        {reviewsWithActivity
          .sort((a, b) => (b.running ? 1 : 0) - (a.running ? 1 : 0))
          .map((agent) => {
            const Icon = ICONS[agent.type];
            return (
              <AccordionItem key={`review-${agent.type}`} value={`review-${agent.type}`}>
                <AccordionTrigger>
                  <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs font-medium">{agent.label}</span>
                  <ReviewAgentBadge agent={agent} />
                  <div className="flex-1 mx-2">
                    <StepProgress step={agent.step} maxSteps={agent.maxSteps} />
                  </div>
                  {agent.running && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 text-[10px] px-1.5 gap-1 mr-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                      onClick={(e) => { e.stopPropagation(); onStop(agent.type); }}
                    >
                      <Square className="h-3 w-3" />
                      Stop
                    </Button>
                  )}
                </AccordionTrigger>
                <AccordionContent>
                  {agent.running && agent.progress && (
                    <div className="flex items-center gap-2 px-3 pb-2">
                      <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
                      <span className="text-xs text-muted-foreground">{agent.progress}</span>
                    </div>
                  )}
                  <LogViewer logs={agent.logs} />
                </AccordionContent>
              </AccordionItem>
            );
          })}
      </Accordion>
    </div>
  );
}
