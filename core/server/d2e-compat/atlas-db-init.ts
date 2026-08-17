// d2e-compat/atlas-db-init.ts
// Replaces the d2e `webapi-init` container: applies services/atlas-db-init/*.sql
// after WebAPI's Flyway migrations and Logto's own migrations have landed.
// Runs from d2eBoot(), which is invoked after startNativeWebApi().

export interface TableRef {
  schema: string;
  table: string;
}

export interface WaitOptions {
  attempts?: number;
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Poll until every table exists. Bounded — returns false on exhaustion rather
 *  than looping forever, so a missing dependency can never hang trex's boot. */
export async function waitForTables(
  exists: (t: TableRef) => Promise<boolean>,
  tables: TableRef[],
  opts: WaitOptions = {},
): Promise<boolean> {
  const attempts = opts.attempts ?? 60;
  const intervalMs = opts.intervalMs ?? 2000;
  const sleep = opts.sleep ?? defaultSleep;

  for (let attempt = 0; attempt < attempts; attempt++) {
    let allPresent = true;
    for (const t of tables) {
      let present = false;
      try {
        present = await exists(t);
      } catch {
        present = false; // treat a probe failure as not-ready
      }
      if (!present) {
        allPresent = false;
        break; // no point probing the rest of this pass
      }
    }
    if (allPresent) return true;
    if (attempt < attempts - 1) await sleep(intervalMs);
  }
  return false;
}
