import { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ClipboardList, CheckCircle2, Circle, Play, Sparkles, Loader2, Check, X, ThumbsUp, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import type { Plan } from "@/lib/types";
import * as api from "@/lib/api";

interface PlanTabProps {
  appId: string | null;
  /** Live plan content from the current chat's SSE stream (plan mode) */
  livePlanContent?: string | null;
  /** Send a prompt to the current chat */
  onFixPrompt?: (prompt: string) => void;
}

function statusBadge(plan: Plan) {
  if (plan.source === "file") {
    const kind = plan.id.startsWith("file:spec:") ? "Spec" : "Plan";
    return (
      <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-800 text-[10px] gap-1 shrink-0">
        <FileText className="h-3 w-3" />
        File · {kind}
      </Badge>
    );
  }
  switch (plan.status) {
    case "implemented":
      return (
        <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800 text-[10px] gap-1 shrink-0">
          <CheckCircle2 className="h-3 w-3" />
          Implemented
        </Badge>
      );
    case "accepted":
      return (
        <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800 text-[10px] gap-1 shrink-0">
          <Check className="h-3 w-3" />
          Accepted
        </Badge>
      );
    case "draft":
      return (
        <Badge variant="outline" className="bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400 border-gray-200 dark:border-gray-700 text-[10px] gap-1 shrink-0">
          <Circle className="h-3 w-3" />
          Draft
        </Badge>
      );
    case "rejected":
      return (
        <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800 text-[10px] gap-1 shrink-0">
          Rejected
        </Badge>
      );
  }
}

function PlanMarkdown({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none break-words text-sm">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children, ...props }) {
            return (
              <pre className="overflow-x-auto rounded-md bg-zinc-100 dark:bg-zinc-900 p-3 text-xs text-zinc-800 dark:text-zinc-200" {...props}>
                {children}
              </pre>
            );
          },
          code({ children, className, ...props }) {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="rounded bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 text-xs text-zinc-800 dark:text-zinc-200" {...props}>
                  {children}
                </code>
              );
            }
            return <code className={className} {...props}>{children}</code>;
          },
          table({ children, ...props }) {
            return (
              <div className="overflow-x-auto my-4">
                <table className="min-w-full border-collapse text-xs" {...props}>
                  {children}
                </table>
              </div>
            );
          },
          th({ children, ...props }) {
            return (
              <th className="border border-border bg-muted px-3 py-1.5 text-left font-medium" {...props}>
                {children}
              </th>
            );
          },
          td({ children, ...props }) {
            return (
              <td className="border border-border px-3 py-1.5" {...props}>
                {children}
              </td>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function planTitle(plan: Plan): string {
  // Extract first heading from content, or use chat title, or fallback
  const headingMatch = plan.content.match(/^#\s+(.+)$/m);
  if (headingMatch) return headingMatch[1];
  if (plan.chat_title && plan.chat_title !== "New Chat") return plan.chat_title;
  return "Untitled Plan";
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

export function PlanTab({ appId, livePlanContent, onFixPrompt }: PlanTabProps) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    if (!appId) return;
    setLoading(true);
    try {
      const data = await api.listAppPlans(appId);
      setPlans(data);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  // Refresh when live plan content changes (new plan being written)
  useEffect(() => {
    if (livePlanContent) loadPlans();
  }, [livePlanContent, loadPlans]);

  const markImplemented = async (plan: Plan) => {
    setMarkingId(plan.id);
    try {
      await api.updatePlanStatus(plan.id, "implemented");
      setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, status: "implemented" } : p)));
    } catch {
      /* ignore */
    } finally {
      setMarkingId(null);
    }
  };

  const acceptPlan = async (plan: Plan) => {
    setMarkingId(plan.id);
    try {
      await api.updatePlanStatus(plan.id, "accepted");
      setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, status: "accepted" } : p)));
    } catch { /* ignore */ }
    finally { setMarkingId(null); }
  };

  const rejectPlan = async (plan: Plan) => {
    setMarkingId(plan.id);
    try {
      await api.updatePlanStatus(plan.id, "rejected");
      setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, status: "rejected" } : p)));
    } catch { /* ignore */ }
    finally { setMarkingId(null); }
  };

  const implementInChat = (plan: Plan) => {
    const title = planTitle(plan);
    onFixPrompt?.(`Implement the following plan: "${title}"\n\n${plan.content}`);
  };

  const implementAsAgent = (plan: Plan) => {
    const title = planTitle(plan);
    onFixPrompt?.(`Implement the following plan autonomously, using your tools to create and modify all necessary files: "${title}"\n\n${plan.content}`);
  };

  if (!appId) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center space-y-2">
          <ClipboardList className="h-10 w-10 mx-auto opacity-30" />
          <p className="text-sm">Select an app to view plans</p>
        </div>
      </div>
    );
  }

  if (loading && plans.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center space-y-2">
          <ClipboardList className="h-10 w-10 mx-auto opacity-30" />
          <p className="text-sm">No plans yet</p>
          <p className="text-xs text-muted-foreground">
            Switch to Plan mode and start a conversation to generate a plan.
          </p>
        </div>
      </div>
    );
  }

  // Default open the first non-implemented plan, or the most recent
  const defaultOpen = plans.find((p) => p.status !== "implemented")?.id || plans[0]?.id;

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Accordion type="single" collapsible defaultValue={defaultOpen}>
        {plans.map((plan) => (
          <AccordionItem key={plan.id} value={plan.id}>
            <AccordionTrigger>
              <ClipboardList className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs truncate flex-1 text-left">{planTitle(plan)}</span>
              {statusBadge(plan)}
              <span className="text-[10px] text-muted-foreground shrink-0 ml-1">{formatDate(plan.updated_at)}</span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="px-4 pb-3">
                {/* File-backed: read-only notice + implement-prompt buttons */}
                {plan.source === "file" && (
                  <div className="flex items-center gap-2 mb-3 pb-3 border-b">
                    <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <FileText className="h-3 w-3" />
                      Read-only — edit the markdown file directly
                    </span>
                    {onFixPrompt && (
                      <div className="flex items-center gap-2 ml-auto">
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 text-xs gap-1.5"
                          onClick={() => implementInChat(plan)}
                        >
                          <Play className="h-3 w-3" />
                          Implement in Chat
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1.5"
                          onClick={() => implementAsAgent(plan)}
                        >
                          <Sparkles className="h-3 w-3" />
                          Run as Agent
                        </Button>
                      </div>
                    )}
                  </div>
                )}
                {/* Draft: Accept/Reject buttons (DB plans only) */}
                {plan.source !== "file" && plan.status === "draft" && (
                  <div className="flex items-center gap-2 mb-3 pb-3 border-b">
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 text-xs gap-1.5"
                      onClick={() => acceptPlan(plan)}
                      disabled={markingId === plan.id}
                    >
                      <ThumbsUp className="h-3 w-3" />
                      Accept Plan
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1.5 text-destructive"
                      onClick={() => rejectPlan(plan)}
                      disabled={markingId === plan.id}
                    >
                      <X className="h-3 w-3" />
                      Reject
                    </Button>
                  </div>
                )}
                {/* Accepted: Implement/Mark done buttons (DB plans only) */}
                {plan.source !== "file" && plan.status === "accepted" && (
                  <div className="flex items-center gap-2 mb-3 pb-3 border-b">
                    {onFixPrompt && (
                      <>
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 text-xs gap-1.5"
                          onClick={() => implementInChat(plan)}
                        >
                          <Play className="h-3 w-3" />
                          Implement in Chat
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1.5"
                          onClick={() => implementAsAgent(plan)}
                        >
                          <Sparkles className="h-3 w-3" />
                          Run as Agent
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs gap-1.5 ml-auto"
                      onClick={() => markImplemented(plan)}
                      disabled={markingId === plan.id}
                    >
                      {markingId === plan.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3" />
                      )}
                      Mark Implemented
                    </Button>
                  </div>
                )}

                {plan.source !== "file" && plan.status === "implemented" && (
                  <div className="flex items-center gap-2 mb-3 pb-3 border-b text-green-600 dark:text-green-400">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-xs">This plan has been implemented</span>
                  </div>
                )}

                <PlanMarkdown content={plan.content} />
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
