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

/**
 * Boot the embedded WebAPI on :8080. No-op when WEBAPI_NATIVE_ENABLED=false.
 * Never throws — failures are logged and the caller continues.
 */
export async function startNativeWebApi(): Promise<void> {
  if (!WEBAPI_NATIVE_ENABLED) return;

  const log = (m: string) => console.log(`[webapi] ${m}`);
  const err = (m: string) => console.error(`[webapi] ${m}`);

  try {
    const conn = new Trex.TrexDB("memory");
    // trex_webapi_start is the primary name; webapi.trex builds from before the
    // trex_ rename only register webapi_start. A NEW core routinely runs
    // against an OLD extension (the e2e job rebundles this branch's core into a
    // pulled image; rolling deploys skew the same way), and without the
    // fallback WebAPI never starts and the whole cache pipeline strands on
    // "Cache not ready". Try the primary, fall back on a catalog miss.
    let startRows;
    try {
      startRows = await conn.execute("SELECT trex_webapi_start() AS msg", []);
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (!msg.includes("trex_webapi_start does not exist")) throw e;
      log("trex_webapi_start not registered (pre-rename webapi.trex) — falling back to webapi_start()");
      startRows = await conn.execute("SELECT webapi_start() AS msg", []);
    }
    log(`native WebAPI — ${startRows[0]?.msg}`);
  } catch (e) {
    err(`webapi_start failed: ${(e as Error).message}`);
  }
}
