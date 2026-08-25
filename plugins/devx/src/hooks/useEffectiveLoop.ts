// task-u1: resolves the per-user devx.settings.loop flag into the actual
// loop ChatPanel.tsx should render. Thin data-fetching wrapper — the actual
// routing decision (and the rationale for forcing claude-code and
// IAM-shaped bedrock users to legacy) lives in ./effectiveLoop.ts's
// resolveEffectiveLoop, which is characterization-tested by the Deno suite
// at plugins/devx/agent/lib/effective_loop.test.ts.
import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import { resolveEffectiveLoop, SETTINGS_FETCH_FAILURE_LOOP, type EffectiveLoop } from "./effectiveLoop";

export type { EffectiveLoop };

export function useEffectiveLoop(): { loop: EffectiveLoop; resolved: boolean } {
  const [state, setState] = useState<{ loop: EffectiveLoop; resolved: boolean }>({
    loop: "legacy",
    resolved: false,
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getSettings(), api.getActiveProviderConfig()])
      .then(([settings, active]) => {
        if (cancelled) return;
        setState({
          loop: resolveEffectiveLoop({
            loop: settings?.loop,
            provider: active.provider,
            authShape: active.auth_shape,
          }),
          resolved: true,
        });
      })
      .catch((err) => {
        // A FAILED fetch is not the same as an ABSENT settings row. A user
        // with no row resolves to "agents" (resolveEffectiveLoop, matching
        // V17's column default); a user whose settings/provider we could not
        // read at all falls back to "legacy", because they may be on
        // `claude-code` — the sidecar, for which eve's resolveModel throws —
        // and we have no way to tell. See SETTINGS_FETCH_FAILURE_LOOP.
        console.error("useEffectiveLoop: failed to resolve settings/provider, defaulting to legacy:", err);
        if (!cancelled) setState({ loop: SETTINGS_FETCH_FAILURE_LOOP, resolved: true });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
