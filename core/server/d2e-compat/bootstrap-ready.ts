// d2e-compat/bootstrap-ready.ts
//
// Liveness beacon for downstream d2e services that cannot express a
// `depends_on: trex` healthcheck without creating a circular dependency
// (trex -> alp-logto-post-init -> alp-logto -> ... -> trex) or a second
// healthcheck condition on the trex service. Those services poll this
// listener instead of waiting on a compose edge.
//
// Started only after the trex.provision plugins have succeeded — see the call site in
// index.ts, immediately after that try/catch. It answers 200 on any path and
// method the instant it is asked: there is nothing to route, and no auth,
// because the only fact it conveys is "the roles/schemas/grants exist now".
//
// node:http, not Deno.serve: inside this runtime Deno.serve never binds a real
// TCP port, so the beacon printed its "listening" line while nothing ever
// accepted a connection. index.ts serves the main node over node:http for the
// same reason. Both work under plain `deno test`, which is why the tests here
// passed against an implementation that could not work in production.
//
// Opt-in via D2E_BOOTSTRAP_READY_PORT: unset or not a positive integer means
// the feature is off and nothing listens. A bind failure (e.g. the port is
// already taken) is logged as a warning and never thrown — unlike bootstrap
// itself, this signal is expendable and must never take down boot.

import { createServer } from "node:http";

export interface BootstrapReadySignal {
  stop: () => void;
  /** Resolves once the port is bound; rejects if it could not be. */
  listening: Promise<void>;
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
 * (stop is then a no-op). Await `listening` to know the port is actually
 * accepting connections; the call site in index.ts does not, so the rejection
 * is pre-handled here and never surfaces as an unhandled rejection.
 */
export function startBootstrapReadySignal(port: number): BootstrapReadySignal {
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ bootstrapped: true }));
  });

  const listening = new Promise<void>((resolve, reject) => {
    // node:http surfaces a bind failure as an event rather than a throw, and an
    // unhandled "error" event is fatal. Catching it is what keeps a port clash
    // from taking down a node whose bootstrap has already succeeded.
    server.once("error", (e: Error) => {
      console.error(
        `[d2e-compat] bootstrap-ready signal failed to start on :${port} (continuing without it):`,
        e?.message ?? e,
      );
      reject(e);
    });
    server.listen(port, "0.0.0.0", () => {
      // Logged from the listen callback, never beside the call: the whole point
      // of this line is to attest that the port is bound.
      console.log(`[d2e-compat] bootstrap-ready signal listening on :${port}`);
      resolve();
    });
  });
  listening.catch(() => {});

  return {
    stop: () => {
      try {
        server.close();
      } catch {
        // never bound, or already closed
      }
    },
    listening,
  };
}
