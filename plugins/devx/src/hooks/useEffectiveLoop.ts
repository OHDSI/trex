// task-u1: resolves the per-user devx.settings.loop flag into the actual
// loop ChatPanel.tsx should render. Thin data-fetching wrapper — the actual
// routing decision (and the rationale for forcing claude-code and
// IAM-shaped bedrock users to legacy) lives in ./effectiveLoop.ts's
// resolveEffectiveLoop, which is characterization-tested by the Deno suite
// at plugins/devx/agent/lib/effective_loop.test.ts.
import { useEffect, useState } from "react";
import * as api from "@/lib/api";
import { resolveEffectiveLoop, type EffectiveLoop } from "./effectiveLoop";

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
        console.error("useEffectiveLoop: failed to resolve settings/provider, defaulting to legacy:", err);
        if (!cancelled) setState({ loop: "legacy", resolved: true });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
