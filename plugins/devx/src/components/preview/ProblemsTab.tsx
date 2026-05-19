import { useState, useCallback } from "react";
import {
  FileCode,
  Shield,
  Eye,
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  Wand2,
  TestTube2,
  Palette,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import type { Problem } from "@/lib/types";
import type { UseReviewAgentsReturn } from "@/hooks/useReviewAgents";
import * as api from "@/lib/api";

interface ProblemsTabProps {
  appId: string;
  onOpenFile: (path: string) => void;
  onFixPrompt?: (prompt: string) => void;
  reviewAgents: UseReviewAgentsReturn;
}

// ── Severity helpers ────────────────────────────────────────────────

function getSeverityColor(level: string) {
  switch (level) {
    case "critical":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800";
    case "high":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 border-orange-200 dark:border-orange-800";
    case "medium":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800";
    case "low":
      return "bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400 border-gray-200 dark:border-gray-700";
    default:
      return "bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400";
  }
}

function SeverityIcon({ level }: { level: string }) {
  switch (level) {
    case "critical":
      return <AlertTriangle className="h-3.5 w-3.5" />;
    case "high":
      return <AlertCircle className="h-3.5 w-3.5" />;
    case "medium":
      return <AlertCircle className="h-3.5 w-3.5" />;
    default:
      return <Info className="h-3.5 w-3.5" />;
  }
}

function severityChipColor(level: string) {
  switch (level) {
    case "critical":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
    case "high":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300";
    case "medium":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
    case "low":
      return "bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function severityLabel(level: string) {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

function SeverityCountChip({ level, count }: { level: string; count: number }) {
  return (
    <span
      title={`${count} ${severityLabel(level)}`}
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0 text-[10px] font-semibold leading-4 ${severityChipColor(level)}`}
    >
      {count}
    </span>
  );
}

function SeverityBadge({ level }: { level: string }) {
  return (
    <Badge
      variant="outline"
      className={`${getSeverityColor(level)} uppercase text-[10px] font-semibold flex items-center gap-1 w-fit shrink-0`}
    >
      <SeverityIcon level={level} />
      <span>{level}</span>
    </Badge>
  );
}

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function formatTimeAgo(input: string): string {
  const diffMs = Math.max(0, Date.now() - new Date(input).getTime());
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Reusable AI Review Section ──────────────────────────────────────

interface ReviewFinding {
  title: string;
  level: "critical" | "high" | "medium" | "low";
  description: string;
}

interface ReviewData {
  id: string;
  findings: ReviewFinding[];
  created_at: string;
}

function ReviewSection({
  label,
  emptyDescription,
  review,
  isRunning,
  progress,
  onFix,
}: {
  icon: React.ElementType;
  label: string;
  emptyDescription: string;
  review: ReviewData | null;
  isRunning: boolean;
  progress: string;
  onFix?: (prompt: string) => void;
  onRun: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggleFinding = (idx: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const sortedFindings = review
    ? [...review.findings].sort((a, b) => (SEVERITY_ORDER[a.level] ?? 4) - (SEVERITY_ORDER[b.level] ?? 4))
    : [];

  return (
    <div>
      {/* Running state */}
      {isRunning && (
        <div className="flex items-center gap-3 px-4 py-6 justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{progress || `Running ${label.toLowerCase()}...`}</span>
        </div>
      )}

      {/* No review yet */}
      {!review && !isRunning && (
        <div className="px-4 py-4 text-center">
          <p className="text-xs text-muted-foreground">{emptyDescription}</p>
        </div>
      )}

      {/* No issues found */}
      {review && review.findings.length === 0 && !isRunning && (
        <div className="flex items-center gap-2 px-4 py-4 justify-center">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span className="text-xs text-muted-foreground">No issues found · {formatTimeAgo(review.created_at)}</span>
        </div>
      )}

      {/* Findings list */}
      {review && sortedFindings.length > 0 && !isRunning && (
        <div>
          {sortedFindings.map((finding, i) => {
            const isExpanded = expanded.has(i);
            const preview = finding.description.length > 150
              ? finding.description.substring(0, 150) + "..."
              : finding.description;

            return (
              <div key={i} className="border-b last:border-b-0 hover:bg-muted/20 transition-colors">
                <div
                  className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer"
                  onClick={() => toggleFinding(i)}
                >
                  {isExpanded
                    ? <ChevronDown className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                    : <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                  }
                  <SeverityBadge level={finding.level} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium">{finding.title}</p>
                    {!isExpanded && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{preview}</p>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-3 pb-3 pl-[3.25rem]">
                    <div className="text-xs text-foreground whitespace-pre-wrap leading-relaxed space-y-1">
                      {finding.description.split("\n").map((line, j) => {
                        if (line.startsWith("**") && line.includes("**:")) {
                          const [label, ...rest] = line.split("**:");
                          return (
                            <p key={j}>
                              <strong>{label.replace(/\*\*/g, "")}:</strong>
                              {rest.join("**:")}
                            </p>
                          );
                        }
                        return <p key={j}>{line}</p>;
                      })}
                    </div>
                    {onFix && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-xs gap-1 mt-2"
                        onClick={() => onFix(`Fix this ${finding.level} issue: ${finding.title}\n\n${finding.description}`)}
                      >
                        <Wand2 className="h-3 w-3" />
                        Fix
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────

export function ProblemsTab({ appId, onOpenFile, onFixPrompt, reviewAgents }: ProblemsTabProps) {
  const {
    secReview, codeReview, qaReview, designReview,
    secReviewing, codeReviewing, qaReviewing, designReviewing,
    secProgress, codeProgress, qaProgress, designProgress,
    runSecurityReview, runCodeReview, runQaReview, runDesignReview,
  } = reviewAgents;

  // Type check state
  const [problems, setProblems] = useState<Problem[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Quick scan state
  const [quickFindings, setQuickFindings] = useState<{ severity: string; title: string; description: string; file?: string }[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);

  const runCheck = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.checkApp(appId);
      setProblems(result.problems);
      setSummary(result.summary);
      setSelected(new Set(result.problems.map((_: Problem, i: number) => i)));
    } catch (err) {
      setSummary(`Check failed: ${err}`);
      setProblems([]);
    } finally {
      setLoading(false);
    }
  }, [appId]);

  const runQuickScan = useCallback(async () => {
    setScanning(true);
    try {
      const result = await api.securityScan(appId);
      setQuickFindings((result.findings || []) as any[]);
      setScanned(true);
    } catch { /* ignore */ } finally {
      setScanning(false);
    }
  }, [appId]);

  const toggleSelect = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };


  // Section summary helpers
  const typeCount = problems.length;
  const scanCount = quickFindings.length;
  const codeCount = codeReview?.findings?.length ?? 0;
  const secCount = secReview?.findings?.length ?? 0;
  const qaCount = qaReview?.findings?.length ?? 0;
  const designCount = designReview?.findings?.length ?? 0;

  const sectionStatus = (running: boolean, count: number, hasResult: boolean, review?: ReviewData | null) => {
    if (running) return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
    if (!hasResult) return null;
    if (count === 0) return <span title="No issues"><CheckCircle2 className="h-3 w-3 text-green-500" /></span>;
    if (review && review.findings.length > 0) {
      const counts: Record<string, number> = {};
      for (const f of review.findings) counts[f.level] = (counts[f.level] || 0) + 1;
      return (
        <span className="flex items-center gap-1">
          {(["critical", "high", "medium", "low"] as const).map((level) =>
            counts[level] ? <SeverityCountChip key={level} level={level} count={counts[level]} /> : null,
          )}
        </span>
      );
    }
    return <span className="text-[10px] font-medium text-muted-foreground">{count}</span>;
  };

  return (
    <div className="flex flex-col h-full overflow-auto">
      <Accordion type="single" collapsible defaultValue="code-review">
        {/* Type Check */}
        <AccordionItem value="type-check">
          <AccordionTrigger>
            <FileCode className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs">Type Check</span>
            {sectionStatus(loading, typeCount, summary !== null)}
            <Button
              size="sm" variant="ghost" className="h-5 text-[10px] px-1.5 gap-1 ml-auto mr-1"
              onClick={(e) => { e.stopPropagation(); runCheck(); }}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileCode className="h-3 w-3" />}
              {loading ? "Running..." : "Run"}
            </Button>
          </AccordionTrigger>
          <AccordionContent>
            {loading && (
              <div className="flex items-center gap-2 px-4 py-4 justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Running type check...</span>
              </div>
            )}
            {!loading && summary === null && (
              <div className="px-4 py-4 text-center">
                <p className="text-xs text-muted-foreground">Checks for TypeScript type errors</p>
              </div>
            )}
            {!loading && summary !== null && problems.length === 0 && (
              <div className="flex items-center gap-2 px-4 py-4 justify-center">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-xs text-muted-foreground">No type errors</span>
              </div>
            )}
            {!loading && problems.length > 0 && (
              <div>
                {problems.map((p, i) => {
                  const isExp = selected.has(i);
                  return (
                    <div key={`problem-${i}`} className="border-b last:border-b-0 hover:bg-muted/20 transition-colors">
                      <div
                        className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer"
                        onClick={() => toggleSelect(i)}
                      >
                        {isExp
                          ? <ChevronDown className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                          : <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                        }
                        <SeverityBadge level={p.severity === "error" ? "high" : "medium"} />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium">{p.message}</p>
                          {!isExp && (
                            <p className="text-xs text-muted-foreground mt-0.5">{p.file}:{p.line}:{p.col}</p>
                          )}
                        </div>
                      </div>
                      {isExp && (
                        <div className="px-3 pb-3 pl-[3.25rem]">
                          <p className="text-xs text-muted-foreground">
                            <span className="font-mono cursor-pointer hover:underline" onClick={() => onOpenFile(p.file)}>
                              {p.file}:{p.line}:{p.col}
                            </span>
                          </p>
                          {onFixPrompt && (
                            <Button
                              size="sm" variant="outline" className="h-6 text-xs gap-1 mt-2"
                              onClick={() => onFixPrompt(`Fix this type error in ${p.file}:${p.line}:${p.col}: ${p.message}`)}
                            >
                              <Wand2 className="h-3 w-3" />
                              Fix
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Quick Scan */}
        <AccordionItem value="quick-scan">
          <AccordionTrigger>
            <Shield className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs">Quick Scan</span>
            {sectionStatus(scanning, scanCount, scanned)}
            <Button
              size="sm" variant="ghost" className="h-5 text-[10px] px-1.5 gap-1 ml-auto mr-1"
              onClick={(e) => { e.stopPropagation(); runQuickScan(); }}
              disabled={scanning}
            >
              {scanning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Shield className="h-3 w-3" />}
              {scanning ? "Scanning..." : "Run"}
            </Button>
          </AccordionTrigger>
          <AccordionContent>
            {scanning && (
              <div className="flex items-center gap-2 px-4 py-4 justify-center">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Scanning for secrets and vulnerabilities...</span>
              </div>
            )}
            {!scanning && !scanned && (
              <div className="px-4 py-4 text-center">
                <p className="text-xs text-muted-foreground">Scans for hardcoded secrets and dependency vulnerabilities</p>
              </div>
            )}
            {!scanning && scanned && quickFindings.length === 0 && (
              <div className="flex items-center gap-2 px-4 py-4 justify-center">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-xs text-muted-foreground">No issues found</span>
              </div>
            )}
            {quickFindings.length > 0 && (
              <div>
                {quickFindings.map((f, i) => (
                  <div
                    key={`quick-${i}`}
                    className="border-b last:border-b-0 hover:bg-muted/20 transition-colors"
                  >
                    <div
                      className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer"
                      onClick={() => f.file && onOpenFile(f.file)}
                    >
                      <SeverityBadge level={f.severity} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium">{f.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{f.description}</p>
                        {f.file && <p className="text-xs text-muted-foreground font-mono mt-0.5">{f.file}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Code Review */}
        <AccordionItem value="code-review">
          <AccordionTrigger>
            <Eye className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs">Code Review</span>
            {sectionStatus(codeReviewing, codeCount, codeReview !== null, codeReview)}
            <span className="flex items-center gap-1 ml-auto mr-1">
              {onFixPrompt && codeReview && codeCount > 0 && (
                <Button
                  size="sm" variant="ghost" className="h-5 text-[10px] px-1.5 gap-1"
                  title="Fix all issues"
                  onClick={(e) => {
                    e.stopPropagation();
                    const summary = codeReview.findings.map((f: any) => `[${f.level}] ${f.title}: ${f.description}`).join("\n\n");
                    onFixPrompt(`Fix the following code review issues:\n\n${summary}`);
                  }}
                >
                  <Wand2 className="h-3 w-3" />
                  Fix All
                </Button>
              )}
              <Button
                size="sm" variant="ghost" className="h-5 text-[10px] px-1.5 gap-1"
                onClick={(e) => { e.stopPropagation(); runCodeReview(); }}
                disabled={codeReviewing}
              >
                {codeReviewing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                {codeReviewing ? "Reviewing..." : "Review"}
              </Button>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <ReviewSection
              icon={Eye}
              label="Code Review"
              emptyDescription="AI-powered code review. Finds bugs, logic errors, and quality issues."
              review={codeReview}
              isRunning={codeReviewing}
              progress={codeProgress}
              onRun={runCodeReview}
              onFix={onFixPrompt}
            />
          </AccordionContent>
        </AccordionItem>

        {/* Security Review */}
        <AccordionItem value="security-review">
          <AccordionTrigger>
            <Shield className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs">Security Review</span>
            {sectionStatus(secReviewing, secCount, secReview !== null, secReview)}
            <span className="flex items-center gap-1 ml-auto mr-1">
              {onFixPrompt && secReview && secCount > 0 && (
                <Button
                  size="sm" variant="ghost" className="h-5 text-[10px] px-1.5 gap-1"
                  title="Fix all issues"
                  onClick={(e) => {
                    e.stopPropagation();
                    const summary = secReview.findings.map((f: any) => `[${f.level}] ${f.title}: ${f.description}`).join("\n\n");
                    onFixPrompt(`Fix the following security review issues:\n\n${summary}`);
                  }}
                >
                  <Wand2 className="h-3 w-3" />
                  Fix All
                </Button>
              )}
              <Button
                size="sm" variant="ghost" className="h-5 text-[10px] px-1.5 gap-1"
                onClick={(e) => { e.stopPropagation(); runSecurityReview(); }}
                disabled={secReviewing}
              >
                {secReviewing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Shield className="h-3 w-3" />}
                {secReviewing ? "Reviewing..." : "Review"}
              </Button>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <ReviewSection
              icon={Shield}
              label="Security Review"
              emptyDescription="AI-powered security review. Analyzes your code for vulnerabilities."
              review={secReview}
              isRunning={secReviewing}
              progress={secProgress}
              onRun={runSecurityReview}
              onFix={onFixPrompt}
            />
          </AccordionContent>
        </AccordionItem>

        {/* QA Test */}
        <AccordionItem value="qa-test">
          <AccordionTrigger>
            <TestTube2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs">QA Test</span>
            {sectionStatus(qaReviewing, qaCount, qaReview !== null, qaReview)}
            <span className="flex items-center gap-1 ml-auto mr-1">
              {onFixPrompt && qaReview && qaCount > 0 && (
                <Button
                  size="sm" variant="ghost" className="h-5 text-[10px] px-1.5 gap-1"
                  title="Fix all issues"
                  onClick={(e) => {
                    e.stopPropagation();
                    const summary = qaReview.findings.map((f: any) => `[${f.level}] ${f.title}: ${f.description}`).join("\n\n");
                    onFixPrompt(`Fix the following QA test issues:\n\n${summary}`);
                  }}
                >
                  <Wand2 className="h-3 w-3" />
                  Fix All
                </Button>
              )}
              <Button
                size="sm" variant="ghost" className="h-5 text-[10px] px-1.5 gap-1"
                onClick={(e) => { e.stopPropagation(); runQaReview(); }}
                disabled={qaReviewing}
              >
                {qaReviewing ? <Loader2 className="h-3 w-3 animate-spin" /> : <TestTube2 className="h-3 w-3" />}
                {qaReviewing ? "Testing..." : "Test"}
              </Button>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <ReviewSection
              icon={TestTube2}
              label="QA Test"
              emptyDescription="AI-powered functional testing. Uses Playwright to interact with your running app and find broken flows, edge cases, and bugs."
              review={qaReview}
              isRunning={qaReviewing}
              progress={qaProgress}
              onRun={runQaReview}
              onFix={onFixPrompt}
            />
          </AccordionContent>
        </AccordionItem>

        {/* Design Review */}
        <AccordionItem value="design-review">
          <AccordionTrigger>
            <Palette className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs">Design Review</span>
            {sectionStatus(designReviewing, designCount, designReview !== null, designReview)}
            <span className="flex items-center gap-1 ml-auto mr-1">
              {onFixPrompt && designReview && designCount > 0 && (
                <Button
                  size="sm" variant="ghost" className="h-5 text-[10px] px-1.5 gap-1"
                  title="Fix all issues"
                  onClick={(e) => {
                    e.stopPropagation();
                    const summary = designReview.findings.map((f: any) => `[${f.level}] ${f.title}: ${f.description}`).join("\n\n");
                    onFixPrompt(`Fix the following design review issues:\n\n${summary}`);
                  }}
                >
                  <Wand2 className="h-3 w-3" />
                  Fix All
                </Button>
              )}
              <Button
                size="sm" variant="ghost" className="h-5 text-[10px] px-1.5 gap-1"
                onClick={(e) => { e.stopPropagation(); runDesignReview(); }}
                disabled={designReviewing}
              >
                {designReviewing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Palette className="h-3 w-3" />}
                {designReviewing ? "Reviewing..." : "Review"}
              </Button>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <ReviewSection
              icon={Palette}
              label="Design Review"
              emptyDescription="AI-powered design review. Screenshots your running app and checks layout, styling, and visual consistency."
              review={designReview}
              isRunning={designReviewing}
              progress={designProgress}
              onRun={runDesignReview}
              onFix={onFixPrompt}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
