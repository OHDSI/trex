// task-u1: resolves the per-user devx.settings.loop flag into the actual
// loop ChatPanel.tsx should render. Thin data-fetching wrapper — the actual
// routing decision (and the rationale for forcing claude-code users to
// legacy) lives in ./effectiveLoop.ts's resolveEffectiveLoop, which is
// characterization-tested by the Deno suite at
// plugins/devx/agent/lib/effective_loop.test.ts.
import { useCallback, useEffect, useState } from "react";
import * as api from "@/lib/api";
import {
  resolveEffectiveLoop,
  SETTINGS_FETCH_FAILED,
  stateForLoading,
  stateForSettingsFailure,
  type EffectiveLoop,
} from "./effectiveLoop";

export type { EffectiveLoop };

// Three states, not two: a failed settings/provider fetch is neither "still
// loading" nor "resolved to a loop" — it must not guess a loop (see
// SETTINGS_FETCH_FAILED). `retry` re-runs the fetch without a page reload.
// The non-resolved variants are built via stateForLoading/
// stateForSettingsFailure (effectiveLoop.ts) rather than inline, so a Deno
// test pins their shape — see that file's comment for what this does and
// does not cover.
export type EffectiveLoopState =
  | ReturnType<typeof stateForLoading>
  | (ReturnType<typeof stateForSettingsFailure> & { retry: () => void; message: string })
  | { status: "resolved"; loop: EffectiveLoop };

export function useEffectiveLoop(): EffectiveLoopState {
  const [state, setState] = useState<EffectiveLoopState>(stateForLoading());
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setState(stateForLoading());
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
        // Same extraction ChatPanel's sibling D2ESubAppPanel.tsx uses for its
        // own retryable error state.
        const message = err instanceof Error ? err.message : "Failed to load settings";
        if (!cancelled) setState({ ...stateForSettingsFailure(), retry, message });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, retry]);

  return state;
}
