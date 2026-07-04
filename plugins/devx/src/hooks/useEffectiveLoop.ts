// task-u1: resolves the per-user devx.settings.loop flag into the actual
// loop ChatPanel.tsx should render, applying the one override the brief
// calls out: claude-code/copilot providers force legacy regardless of the
// flag, because plugins/devx/agent/agent.ts's resolveModel throws for them
// ("sidecar providers use the legacy endpoint") and /chat has no try/catch
// around that setup-phase call — an uncaught throw there surfaces as a bare
// 500 with no parseable error shape (confirmed against
// core/server/agents/service/handler.ts's /chat route), not something a
// frontend can gracefully detect and fall back from. So: never send those
// users down this path in the first place.
import { useEffect, useState } from "react";
import * as api from "@/lib/api";

export type EffectiveLoop = "legacy" | "agents";

export function useEffectiveLoop(): { loop: EffectiveLoop; resolved: boolean } {
  const [state, setState] = useState<{ loop: EffectiveLoop; resolved: boolean }>({
    loop: "legacy",
    resolved: false,
  });

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getSettings(), api.getActiveProvider()])
      .then(([settings, provider]) => {
        if (cancelled) return;
        const wantsAgents = settings?.loop === "agents";
        const providerForcesLegacy = provider === "claude-code" || provider === "copilot";
        setState({ loop: wantsAgents && !providerForcesLegacy ? "agents" : "legacy", resolved: true });
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
