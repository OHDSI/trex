import { useState, useCallback, useEffect, useRef } from "react";
import type { SecurityReview, CodeReview, QaTestReview, DesignReview } from "@/lib/types";
import * as api from "@/lib/api";

export type ReviewType = "security" | "code" | "qa" | "design";

export interface ReviewAgent {
  type: ReviewType;
  label: string;
  running: boolean;
  progress: string;
  step: number;
  maxSteps: number;
  logs: string[];
}

export interface UseReviewAgentsReturn {
  // Individual review results (for ProblemsTab)
  secReview: SecurityReview | null;
  codeReview: CodeReview | null;
  qaReview: QaTestReview | null;
  designReview: DesignReview | null;
  // Running state
  secReviewing: boolean;
  codeReviewing: boolean;
  qaReviewing: boolean;
  designReviewing: boolean;
  // Progress messages
  secProgress: string;
  codeProgress: string;
  qaProgress: string;
  designProgress: string;
  // Run/stop actions
  runSecurityReview: () => void;
  runCodeReview: () => void;
  runQaReview: () => void;
  runDesignReview: () => void;
  stopAgent: (type: ReviewType) => void;
  // Agents list (for AgentsTab)
  agents: ReviewAgent[];
  runningCount: number;
}

const STEP_REGEX = /^Step (\d+)\/(\d+)/;

const LABELS: Record<ReviewType, string> = {
  security: "Security Review",
  code: "Code Review",
  qa: "QA Test",
  design: "Design Review",
};

const MAX_STEPS: Record<ReviewType, number> = {
  security: 20,
  code: 20,
  qa: 30,
  design: 25,
};

export function useReviewAgents(appId: string): UseReviewAgentsReturn {
  // Review results
  const [secReview, setSecReview] = useState<SecurityReview | null>(null);
  const [codeReview, setCodeReview] = useState<CodeReview | null>(null);
  const [qaReview, setQaReview] = useState<QaTestReview | null>(null);
  const [designReview, setDesignReview] = useState<DesignReview | null>(null);

  // Running state
  const [secReviewing, setSecReviewing] = useState(false);
  const [codeReviewing, setCodeReviewing] = useState(false);
  const [qaReviewing, setQaReviewing] = useState(false);
  const [designReviewing, setDesignReviewing] = useState(false);

  // Progress
  const [secProgress, setSecProgress] = useState("");
  const [codeProgress, setCodeProgress] = useState("");
  const [qaProgress, setQaProgress] = useState("");
  const [designProgress, setDesignProgress] = useState("");

  // Steps
  const [secStep, setSecStep] = useState(0);
  const [secMaxSteps, setSecMaxSteps] = useState(MAX_STEPS.security);
  const [codeStep, setCodeStep] = useState(0);
  const [codeMaxSteps, setCodeMaxSteps] = useState(MAX_STEPS.code);
  const [qaStep, setQaStep] = useState(0);
  const [qaMaxSteps, setQaMaxSteps] = useState(MAX_STEPS.qa);
  const [designStep, setDesignStep] = useState(0);
  const [designMaxSteps, setDesignMaxSteps] = useState(MAX_STEPS.design);

  // Logs
  const [secLogs, setSecLogs] = useState<string[]>([]);
  const [codeLogs, setCodeLogs] = useState<string[]>([]);
  const [qaLogs, setQaLogs] = useState<string[]>([]);
  const [designLogs, setDesignLogs] = useState<string[]>([]);

  // Abort controllers
  const secController = useRef<AbortController | null>(null);
  const codeController = useRef<AbortController | null>(null);
  const qaController = useRef<AbortController | null>(null);
  const designController = useRef<AbortController | null>(null);

  // Load latest reviews on mount
  useEffect(() => {
    if (!appId) return;
    api.getLatestSecurityReview(appId).then((r) => { if (r) setSecReview(r); }).catch(() => {});
    api.getLatestCodeReview(appId).then((r) => { if (r) setCodeReview(r); }).catch(() => {});
    api.getLatestQaReview(appId).then((r) => { if (r) setQaReview(r); }).catch(() => {});
    api.getLatestDesignReview(appId).then((r) => { if (r) setDesignReview(r); }).catch(() => {});
  }, [appId]);

  // Helper to parse step info from progress message and append to logs
  function makeProgressHandler(
    setProgress: (msg: string) => void,
    setStep: (s: number) => void,
    setMax: (s: number) => void,
    setLogs: React.Dispatch<React.SetStateAction<string[]>>,
  ) {
    return (msg: string) => {
      setProgress(msg);
      const stepMatch = STEP_REGEX.exec(msg);
      if (stepMatch) {
        setStep(parseInt(stepMatch[1], 10));
        setMax(parseInt(stepMatch[2], 10));
      }
      setLogs((prev) => {
        const next = [...prev, msg];
        return next.length > 200 ? next.slice(-200) : next;
      });
    };
  }

  const runSecurityReview = useCallback(() => {
    if (secReviewing) return;
    setSecReviewing(true);
    setSecProgress("Starting security review...");
    setSecStep(0);
    setSecLogs(["Starting security review..."]);
    secController.current = api.streamSecurityReview(appId, {
      onProgress: makeProgressHandler(setSecProgress, setSecStep, setSecMaxSteps, setSecLogs),
      onDone: (r) => { setSecReview(r); setSecReviewing(false); setSecProgress(""); secController.current = null; },
      onError: (err) => { setSecReviewing(false); setSecProgress(`Error: ${err}`); setSecLogs((p) => [...p, `Error: ${err}`]); secController.current = null; },
    });
  }, [appId, secReviewing]);

  const runCodeReview = useCallback(() => {
    if (codeReviewing) return;
    setCodeReviewing(true);
    setCodeProgress("Starting code review...");
    setCodeStep(0);
    setCodeLogs(["Starting code review..."]);
    codeController.current = api.streamCodeReview(appId, {
      onProgress: makeProgressHandler(setCodeProgress, setCodeStep, setCodeMaxSteps, setCodeLogs),
      onDone: (r) => { setCodeReview(r); setCodeReviewing(false); setCodeProgress(""); codeController.current = null; },
      onError: (err) => { setCodeReviewing(false); setCodeProgress(`Error: ${err}`); setCodeLogs((p) => [...p, `Error: ${err}`]); codeController.current = null; },
    });
  }, [appId, codeReviewing]);

  const runQaReview = useCallback(() => {
    if (qaReviewing) return;
    setQaReviewing(true);
    setQaProgress("Starting QA test...");
    setQaStep(0);
    setQaLogs(["Starting QA test..."]);
    qaController.current = api.streamQaReview(appId, {
      onProgress: makeProgressHandler(setQaProgress, setQaStep, setQaMaxSteps, setQaLogs),
      onDone: (r) => { setQaReview(r); setQaReviewing(false); setQaProgress(""); qaController.current = null; },
      onError: (err) => { setQaReviewing(false); setQaProgress(`Error: ${err}`); setQaLogs((p) => [...p, `Error: ${err}`]); qaController.current = null; },
    });
  }, [appId, qaReviewing]);

  const runDesignReview = useCallback(() => {
    if (designReviewing) return;
    setDesignReviewing(true);
    setDesignProgress("Starting design review...");
    setDesignStep(0);
    setDesignLogs(["Starting design review..."]);
    designController.current = api.streamDesignReview(appId, {
      onProgress: makeProgressHandler(setDesignProgress, setDesignStep, setDesignMaxSteps, setDesignLogs),
      onDone: (r) => { setDesignReview(r); setDesignReviewing(false); setDesignProgress(""); designController.current = null; },
      onError: (err) => { setDesignReviewing(false); setDesignProgress(`Error: ${err}`); setDesignLogs((p) => [...p, `Error: ${err}`]); designController.current = null; },
    });
  }, [appId, designReviewing]);

  const stopAgent = useCallback((type: ReviewType) => {
    switch (type) {
      case "security":
        secController.current?.abort();
        setSecReviewing(false);
        setSecProgress("");
        setSecLogs((p) => [...p, "Stopped by user"]);
        secController.current = null;
        break;
      case "code":
        codeController.current?.abort();
        setCodeReviewing(false);
        setCodeProgress("");
        setCodeLogs((p) => [...p, "Stopped by user"]);
        codeController.current = null;
        break;
      case "qa":
        qaController.current?.abort();
        setQaReviewing(false);
        setQaProgress("");
        setQaLogs((p) => [...p, "Stopped by user"]);
        qaController.current = null;
        break;
      case "design":
        designController.current?.abort();
        setDesignReviewing(false);
        setDesignProgress("");
        setDesignLogs((p) => [...p, "Stopped by user"]);
        designController.current = null;
        break;
    }
  }, []);

  // Build agents list
  const agents: ReviewAgent[] = [
    { type: "security" as const, label: LABELS.security, running: secReviewing, progress: secProgress, step: secStep, maxSteps: secMaxSteps, logs: secLogs },
    { type: "code" as const, label: LABELS.code, running: codeReviewing, progress: codeProgress, step: codeStep, maxSteps: codeMaxSteps, logs: codeLogs },
    { type: "qa" as const, label: LABELS.qa, running: qaReviewing, progress: qaProgress, step: qaStep, maxSteps: qaMaxSteps, logs: qaLogs },
    { type: "design" as const, label: LABELS.design, running: designReviewing, progress: designProgress, step: designStep, maxSteps: designMaxSteps, logs: designLogs },
  ];

  const runningCount = agents.filter((a) => a.running).length;

  return {
    secReview, codeReview, qaReview, designReview,
    secReviewing, codeReviewing, qaReviewing, designReviewing,
    secProgress, codeProgress, qaProgress, designProgress,
    runSecurityReview, runCodeReview, runQaReview, runDesignReview,
    stopAgent,
    agents,
    runningCount,
  };
}
