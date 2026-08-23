// d2e-compat/bootstrap-ready.ts
//
// Liveness beacon for downstream d2e services that cannot express a
// `depends_on: trex` healthcheck without creating a circular dependency
// (trex -> alp-logto-post-init -> alp-logto -> ... -> trex) or a second
// healthcheck condition on the trex service. Those services poll this
// listener instead of waiting on a compose edge.
//
// Started only after runD2eBootstrap() has succeeded — see the call site in
// index.ts, immediately after that try/catch. It answers 200 on any path and
// method the instant it is asked: there is nothing to route, and no auth,
// because the only fact it conveys is "the roles/schemas/grants exist now".
//
// Opt-in via D2E_BOOTSTRAP_READY_PORT: unset or not a positive integer means
// the feature is off and nothing listens. A bind failure (e.g. the port is
// already taken) is logged as a warning and never thrown — unlike bootstrap
// itself, this signal is expendable and must never take down boot.

export interface BootstrapReadySignal {
  stop: () => void;
}

/** Positive integer only; anything else (missing, "0", "-1", "abc", "3.5") disables the feature. */
export function parseReadyPort(value: string | undefined): number | null {
  if (!value) return null;
  if (!/^[0-9]+$/.test(value)) return null;
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
  return port;
}

/**
 * Starts the readiness listener on `port`. Returns a handle whose `stop()`
 * shuts the listener down; safe to call even if the listener failed to bind
 * (stop is then a no-op).
 */
export function startBootstrapReadySignal(port: number): BootstrapReadySignal {
  try {
    const server = Deno.serve(
      { port, hostname: "0.0.0.0", onListen: () => {} },
      () => new Response(JSON.stringify({ bootstrapped: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    console.log(`[d2e-compat] bootstrap-ready signal listening on :${port}`);
    return { stop: () => server.shutdown() };
  } catch (e) {
    console.error(
      `[d2e-compat] bootstrap-ready signal failed to start on :${port} (continuing without it):`,
      (e as Error)?.message ?? e,
    );
    return { stop: () => {} };
  }
}
