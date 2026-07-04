// task-u1: resolves the per-user devx.settings.loop flag into the actual
// loop ChatPanel.tsx should render, applying the overrides the brief calls
// out: claude-code/copilot providers force legacy regardless of the flag,
// because plugins/devx/agent/agent.ts's resolveModel throws for them
// ("sidecar providers use the legacy endpoint") and /chat has no try/catch
// around that setup-phase call — an uncaught throw there surfaces as a bare
// 500 with no parseable error shape (confirmed against
// core/server/agents/service/handler.ts's /chat route), not something a
// frontend can gracefully detect and fall back from. So: never send those
// users down this path in the first place.
//
// final-007 review finding #4 (bedrock IAM parity): resolveModel ALSO throws
// for a bedrock row whose api_key JSON is IAM-shaped (accessKeyId/
// secretAccessKey, no bearerToken) — the agents loop only implements
// bearer-token bedrock auth (see agent.ts's resolveModel comment). Same
// "gate it before /chat ever sees it" posture as claude-code/copilot.
// Detection uses the server-derived `auth_shape` hint (merge-gate re-review:
// every GET response MASKS api_key — LEFT(...,8)||'...'||RIGHT(...,4) — so
// client-side JSON sniffing of it can never match; the server computes the
// shape from the RAW key before masking, see functions/auth_shape.ts). The
// server-side resolveModel throw remains the backstop for anything that
// slips past this gate (e.g. an older server build that doesn't emit
// auth_shape yet, where this hook can't detect IAM and falls through).
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
    Promise.all([api.getSettings(), api.getActiveProviderConfig()])
      .then(([settings, active]) => {
        if (cancelled) return;
        const wantsAgents = settings?.loop === "agents";
        const providerForcesLegacy =
          active.provider === "claude-code" ||
          active.provider === "copilot" ||
          (active.provider === "bedrock" && active.auth_shape === "iam");
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
