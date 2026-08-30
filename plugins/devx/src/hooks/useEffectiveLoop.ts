// task-u1: resolves the per-user devx.settings.loop flag into the actual
// loop ChatPanel.tsx should render. Thin data-fetching wrapper — the actual
// routing decision (and the rationale for forcing claude-code users to
// legacy) lives in ./effectiveLoop.ts's resolveEffectiveLoop, which is
// characterization-tested by the Deno suite at
// plugins/devx/agent/lib/effective_loop.test.ts.
import { useCallback, useEffect, useState } from "react";
import * as api from "@/lib/api";
import { resolveEffectiveLoop, SETTINGS_FETCH_FAILED, type EffectiveLoop } from "./effectiveLoop";

export type { EffectiveLoop };

// Three states, not two: a failed settings/provider fetch is neither "still
// loading" nor "resolved to a loop" — it must not guess a loop (see
// SETTINGS_FETCH_FAILED). `retry` re-runs the fetch without a page reload.
export type EffectiveLoopState =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | { status: "resolved"; loop: EffectiveLoop };

export function useEffectiveLoop(): EffectiveLoopState {
  const [state, setState] = useState<EffectiveLoopState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getSettings(), api.getActiveProviderConfig()])
      .then(([settings, active]) => {
        if (cancelled) return;
        setState({
          status: "resolved",
          loop: resolveEffectiveLoop({
            loop: settings?.loop,
            provider: active.provider,
          }),
        });
      })
      .catch((err) => {
        // A FAILED fetch is not the same as an ABSENT settings row. A user
        // with no row resolves to "agents" (resolveEffectiveLoop, matching
        // V17's column default); a user whose settings/provider we could not
        // read at all gets no guess at all — see SETTINGS_FETCH_FAILED.
        console.error(`useEffectiveLoop: failed to resolve settings/provider (${SETTINGS_FETCH_FAILED}):`, err);
        if (!cancelled) setState({ status: "error", retry });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, retry]);

  return state;
}
