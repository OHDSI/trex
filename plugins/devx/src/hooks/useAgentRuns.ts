import { useState, useEffect, useCallback, useRef } from "react";
import type { SubagentRun, SubagentMessage } from "@/lib/types";
import * as api from "@/lib/api";

export interface AgentRunState {
  run: SubagentRun;
  messages: SubagentMessage[];
  streamContent: string;
  loaded: boolean;
  step: number;
  maxSteps: number;
}

export function useAgentRuns(appId: string | null) {
  const [runs, setRuns] = useState<SubagentRun[]>([]);
  const [runStates, setRunStates] = useState<Map<string, AgentRunState>>(new Map());
  const controllersRef = useRef<Map<string, AbortController>>(new Map());

  // Poll for runs
  useEffect(() => {
    if (!appId) { setRuns([]); return; }
    let cancelled = false;

    const load = async () => {
      try {
        const data = await api.listAgentRuns(appId);
        if (!cancelled) setRuns(data);
      } catch { /* ignore */ }
    };

    load();
    const interval = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [appId]);

  // Auto-start any "running" runs that haven't been started yet
  useEffect(() => {
    for (const run of runs) {
      if (run.status === "running" && !controllersRef.current.has(run.id)) {
        startRun(run.id);
      }
      // Initialize state for new runs
      setRunStates((prev) => {
        if (prev.has(run.id)) {
          // Update run status
          const existing = prev.get(run.id)!;
          if (existing.run.status !== run.status) {
            const next = new Map(prev);
            next.set(run.id, { ...existing, run });
            return next;
          }
          return prev;
        }
        const next = new Map(prev);
        next.set(run.id, { run, messages: [], streamContent: "", loaded: false, step: 0, maxSteps: 0 });
        return next;
      });
    }
  }, [runs]);

  const startRun = useCallback((runId: string) => {
    if (controllersRef.current.has(runId)) return;

    const controller = api.startAgentRun(runId, {
      onChunk(content) {
        setRunStates((prev) => {
          const state = prev.get(runId);
          if (!state) return prev;
          const next = new Map(prev);
          next.set(runId, { ...state, streamContent: state.streamContent + content });
          return next;
        });
      },
      onStep(step, maxSteps) {
        setRunStates((prev) => {
          const state = prev.get(runId);
          if (!state) return prev;
          const next = new Map(prev);
          next.set(runId, { ...state, step, maxSteps });
          return next;
        });
      },
      onToolCall(name, args) {
        setRunStates((prev) => {
          const state = prev.get(runId);
          if (!state) return prev;
          const msg: SubagentMessage = {
            id: `tool-${Date.now()}`,
            role: "tool",
            content: JSON.stringify(args),
            tool_name: name,
            created_at: new Date().toISOString(),
          };
          const next = new Map(prev);
          next.set(runId, { ...state, messages: [...state.messages, msg] });
          return next;
        });
      },
      onDone(content) {
        controllersRef.current.delete(runId);
        setRunStates((prev) => {
          const state = prev.get(runId);
          if (!state) return prev;
          const next = new Map(prev);
          next.set(runId, {
            ...state,
            run: { ...state.run, status: "completed", result: content },
            streamContent: content,
          });
          return next;
        });
      },
      onError(error) {
        controllersRef.current.delete(runId);
        setRunStates((prev) => {
          const state = prev.get(runId);
          if (!state) return prev;
          const next = new Map(prev);
          next.set(runId, {
            ...state,
            run: { ...state.run, status: "failed", result: error },
            streamContent: state.streamContent + `\n\nError: ${error}`,
          });
          return next;
        });
      },
    });

    controllersRef.current.set(runId, controller);
  }, []);

  const loadMessages = useCallback(async (runId: string) => {
    try {
      const messages = await api.getAgentMessages(runId);
      setRunStates((prev) => {
        const state = prev.get(runId);
        if (!state) return prev;
        const next = new Map(prev);
        next.set(runId, { ...state, messages, loaded: true });
        return next;
      });
    } catch { /* ignore */ }
  }, []);

  const stopRun = useCallback(async (runId: string) => {
    try {
      const controller = controllersRef.current.get(runId);
      if (controller) controller.abort();
      controllersRef.current.delete(runId);
      await api.stopAgentRun(runId);
      setRunStates((prev) => {
        const state = prev.get(runId);
        if (!state) return prev;
        const next = new Map(prev);
        next.set(runId, { ...state, run: { ...state.run, status: "failed", result: "Stopped by user" } });
        return next;
      });
    } catch { /* ignore */ }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const controller of controllersRef.current.values()) {
        controller.abort();
      }
    };
  }, []);

  return { runs, runStates, startRun, loadMessages, stopRun };
}
