// Starts the embedded OHDSI WebAPI that ships in the trexsql base image.
//
// This used to live inside d2e-compat's boot block. It has always had its own
// switch (WEBAPI_NATIVE_ENABLED), but sitting inside d2eBoot() meant the switch
// was unreachable unless D2E_COMPAT=true — so a deployment that wanted nothing
// else from d2e compatibility had to either turn the whole thing on or start
// WebAPI from outside the container (an init job issuing `SELECT
// webapi_start()` over pgwire). The external variant is easy to get wrong:
// `docker compose restart trex` does not re-run an init job, so the node comes
// back healthy with no WebAPI behind it.
//
// Boot must never fail because WebAPI could not start: builds without the
// extension, or arches where it will not load, still have to serve.

declare const Trex: any;

export const WEBAPI_NATIVE_ENABLED =
  (Deno.env.get("WEBAPI_NATIVE_ENABLED") ?? "true") !== "false";

/** How long to wait for the IdP's discovery document. Bounded so a deployment
 *  with no IdP still boots; the wait is skipped entirely when OIDC is off. */
const OIDC_WAIT_MS = Number(Deno.env.get("WEBAPI_OIDC_WAIT_MS") ?? 180_000);

/** Per-probe ceiling, so one unanswered request cannot consume the whole wait. */
const DEFAULT_PROBE_TIMEOUT_MS = 5_000;

/**
 * Block until the OIDC discovery document is served, or the budget runs out.
 *
 * WebAPI builds its client registration from discovery while the Spring context
 * starts (OidcAuthConfig.oidcClientRegistrationRepository). If discovery is not
 * up yet the bean fails, Tomcat never starts and nothing retries — the node then
 * reports healthy with no WebAPI behind it, and the whole cache pipeline strands
 * on "Cache not ready".
 *
 * The window is real rather than theoretical: the IdP cannot finish starting
 * until trex has provisioned the database it migrates into, so under d2e the IdP
 * is necessarily *later* than trex.
 *
 * The IdP may be this very node — trex can serve its own /oidc — so the caller
 * must already be accepting connections before this runs, and every probe is
 * bounded. A bare `await fetch` was not: the listener is bound early by the
 * trexas extension, so a connect to a not-yet-serving backend is *accepted* and
 * then hangs, the promise never settles, and the budget below is never consulted
 * again. That is a hang, not a wait, and no budget can rescue it.
 */
export async function waitForOidcDiscovery(
  log: (m: string) => void,
  err: (m: string) => void,
  env: Record<string, string | undefined> = Deno.env.toObject(),
  budgetMs: number = OIDC_WAIT_MS,
): Promise<void> {
  if (env.SECURITY_AUTH_OIDC_ENABLED !== "true") return;
  const url = env.SECURITY_AUTH_OIDC_URL;
  if (!url) return;

  const probeTimeoutMs = Number(
    env.WEBAPI_OIDC_PROBE_TIMEOUT_MS ?? DEFAULT_PROBE_TIMEOUT_MS,
  );

  const deadline = Date.now() + budgetMs;
  let announced = false;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(probeTimeoutMs) });
      // Drain the body so the connection is not left dangling.
      await res.body?.cancel();
      if (res.ok) {
        if (announced) log(`OIDC discovery ready at ${url}`);
        return;
      }
    } catch (_e) {
      // Not listening yet — same handling as a non-200.
    }
    if (!announced) {
      log(`waiting for OIDC discovery at ${url} ...`);
      announced = true;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  // Starting anyway: a stack with OIDC misconfigured should still get whatever
  // WebAPI can offer, and the error it logs is more useful than silence here.
  err(`OIDC discovery not ready after ${budgetMs}ms — starting WebAPI anyway`);
}

/**
 * Boot the embedded WebAPI on :8080. No-op when WEBAPI_NATIVE_ENABLED=false.
 * Never throws — failures are logged and the caller continues.
 */
export async function startNativeWebApi(): Promise<void> {
  if (!WEBAPI_NATIVE_ENABLED) return;

  const log = (m: string) => console.log(`[webapi] ${m}`);
  const err = (m: string) => console.error(`[webapi] ${m}`);

  await waitForOidcDiscovery(log, err);

  try {
    const conn = new Trex.TrexDB("memory");
    // trex_webapi_start is the primary name; webapi.trex builds from before the
    // trex_ rename only register webapi_start. A NEW core routinely runs
    // against an OLD extension (the e2e job rebundles this branch's core into a
    // pulled image; rolling deploys skew the same way), and without the
    // fallback WebAPI never starts and the whole cache pipeline strands on
    // "Cache not ready". Try the primary, fall back on a catalog miss.
    // Prefer the non-waiting start. The blocking one runs WebAPI's entire boot
    // before it returns, and it returns on this event loop — the same loop that
    // serves the OIDC discovery document WebAPI fetches while booting. Waiting
    // therefore deadlocks the two: WebAPI's request cannot be answered until
    // WebAPI is up, and it cannot come up until its request is answered. It
    // surfaces as "Read timed out" building the ClientRegistration bean, after
    // which Tomcat never starts and the cache pipeline strands.
    //
    // Older webapi.trex builds register neither the _nowait nor the trex_ name,
    // so fall back twice: a NEW core routinely runs against an OLD extension
    // (the e2e job rebundles this branch's core into a pulled image; rolling
    // deploys skew the same way).
    const attempts = [
      "SELECT trex_webapi_start_nowait() AS msg",
      "SELECT trex_webapi_start() AS msg",
      "SELECT webapi_start() AS msg",
    ];
    let startRows;
    let lastErr: Error | undefined;
    for (const sql of attempts) {
      try {
        startRows = await conn.execute(sql, []);
        lastErr = undefined;
        break;
      } catch (e) {
        lastErr = e as Error;
        // Only a missing catalog entry is worth trying the next name for;
        // anything else is a real failure and should surface as-is.
        if (!(lastErr.message ?? "").includes("does not exist")) throw e;
        log(`${sql.slice(7, sql.indexOf("("))} not registered — trying the next name`);
      }
    }
    if (lastErr) throw lastErr;
    log(`native WebAPI — ${startRows?.[0]?.msg}`);
  } catch (e) {
    err(`webapi_start failed: ${(e as Error).message}`);
  }
}
