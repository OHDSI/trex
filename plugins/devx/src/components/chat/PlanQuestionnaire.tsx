import { useState, useEffect, useCallback } from "react";
import { ClipboardList, Loader2, ChevronDown, ChevronUp, X, Circle, ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { QuestionnaireRequest } from "@/lib/types";
import { cn } from "@/lib/utils";

interface PlanQuestionnaireProps {
  questionnaire: QuestionnaireRequest;
  onAnswer: (answers: Record<string, unknown>) => Promise<void> | void;
  onDismiss?: () => void;
}

const AUTO_DISMISS_MS = 5 * 60 * 1000; // 5 minutes

export function PlanQuestionnaire({ questionnaire, onAnswer, onDismiss }: PlanQuestionnaireProps) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [currentStep, setCurrentStep] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [otherText, setOtherText] = useState<Record<string, string>>({});
  const [useOther, setUseOther] = useState<Record<string, boolean>>({});

  const questions = questionnaire.questions;
  const total = questions.length;
  const current = questions[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === total - 1;

  // Auto-select first radio option on mount for each question
  useEffect(() => {
    if (current?.type === "radio" && current.options?.length && answers[current.id] === undefined && !useOther[current.id]) {
      setAnswers((prev) => ({ ...prev, [current.id]: current.options![0] }));
    }
  }, [currentStep, current, answers, useOther]);

  // Auto-dismiss after 5 minutes
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss?.();
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const handleSubmit = useCallback(async () => {
    // Merge "other" text into answers
    const finalAnswers = { ...answers };
    for (const [qId, isOther] of Object.entries(useOther)) {
      if (isOther && otherText[qId]) {
        finalAnswers[qId] = otherText[qId];
      }
    }
    setSubmitting(true);
    try {
      await onAnswer(finalAnswers);
      setSubmitting(false);
      setSubmitted(true);
    } catch {
      setSubmitting(false);
    }
  }, [answers, useOther, otherText, onAnswer]);

  const handleNext = useCallback(() => {
    if (isLast) {
      handleSubmit();
    } else {
      setCurrentStep((s) => Math.min(s + 1, total - 1));
    }
  }, [isLast, handleSubmit, total]);

  const handleBack = useCallback(() => {
    setCurrentStep((s) => Math.max(s - 1, 0));
  }, []);

  // Enter key submits current answer
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleNext();
      }
    },
    [handleNext],
  );

  // After successful submission, show brief confirmation then hide
  if (submitted) {
    return (
      <div className="mx-4 my-3 p-4 border rounded-xl bg-muted/30 animate-in fade-in duration-300">
        <div className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400">
          <Check className="h-4 w-4" />
          Answers submitted
        </div>
      </div>
    );
  }

  return (
    <div className="mx-4 my-3 border rounded-xl bg-card shadow-sm overflow-hidden" onKeyDown={handleKeyDown}>
      {/* Header bar */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 bg-muted/30 border-b cursor-pointer select-none"
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {collapsed ? (
            <>
              <Circle className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="text-xs text-muted-foreground truncate">{current?.label}</span>
            </>
          ) : (
            <>
              <ClipboardList className="h-4 w-4 text-primary shrink-0" />
              <span className="text-sm font-medium">Questions</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {currentStep + 1} of {total}
          </span>
          {collapsed ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDismiss(); }}
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5 -mr-0.5"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Expandable body */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-in-out",
          collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="p-4 space-y-4">
            {/* Question */}
            {current && (
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {current.label}
                  {current.type !== "checkbox" && (
                    <span className="text-destructive ml-0.5">*</span>
                  )}
                </label>

                {current.type === "text" && (
                  <Input
                    value={(answers[current.id] as string) || ""}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [current.id]: e.target.value }))}
                    placeholder="Type your answer..."
                    className="text-sm"
                    autoFocus
                  />
                )}

                {current.type === "radio" && current.options && (
                  <div className="space-y-1.5">
                    {current.options.map((opt) => (
                      <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name={current.id}
                          checked={!useOther[current.id] && answers[current.id] === opt}
                          onChange={() => {
                            setAnswers((prev) => ({ ...prev, [current.id]: opt }));
                            setUseOther((prev) => ({ ...prev, [current.id]: false }));
                          }}
                          className="accent-primary"
                        />
                        {opt}
                      </label>
                    ))}
                    {/* Other option */}
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name={current.id}
                        checked={useOther[current.id] === true}
                        onChange={() => setUseOther((prev) => ({ ...prev, [current.id]: true }))}
                        className="accent-primary"
                      />
                      Other...
                    </label>
                    {useOther[current.id] && (
                      <Input
                        value={otherText[current.id] || ""}
                        onChange={(e) => setOtherText((prev) => ({ ...prev, [current.id]: e.target.value }))}
                        placeholder="Specify..."
                        className="text-sm ml-6"
                        autoFocus
                      />
                    )}
                  </div>
                )}

                {current.type === "checkbox" && current.options && (
                  <div className="space-y-1.5">
                    {current.options.map((opt) => {
                      const selected = (answers[current.id] as string[]) || [];
                      return (
                        <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selected.includes(opt)}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...selected, opt]
                                : selected.filter((s) => s !== opt);
                              setAnswers((prev) => ({ ...prev, [current.id]: next }));
                            }}
                            className="accent-primary"
                          />
                          {opt}
                        </label>
                      );
                    })}
                    {/* Other checkbox */}
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useOther[current.id] === true}
                        onChange={(e) => setUseOther((prev) => ({ ...prev, [current.id]: e.target.checked }))}
                        className="accent-primary"
                      />
                      Other...
                    </label>
                    {useOther[current.id] && (
                      <Input
                        value={otherText[current.id] || ""}
                        onChange={(e) => setOtherText((prev) => ({ ...prev, [current.id]: e.target.value }))}
                        placeholder="Specify..."
                        className="text-sm ml-6"
                        autoFocus
                      />
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Navigation */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={handleBack}
                disabled={isFirst}
                className="gap-1"
              >
                <ArrowLeft className="h-3 w-3" />
                Back
              </Button>
              <Button
                size="sm"
                onClick={handleNext}
                disabled={submitting}
                className="gap-1"
              >
                {submitting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : isLast ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <ArrowRight className="h-3 w-3" />
                )}
                {submitting ? "Submitting..." : isLast ? "Submit" : "Next"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
