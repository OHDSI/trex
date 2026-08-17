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

/** Tables the seeding SQL reads from or writes to. `webapi.sec_role` is created
 *  by WebAPI's Flyway (which runs after trex_webapi_start returns, hence the
 *  wait); `logto.users` by Logto's own migrations. */
export const REQUIRED_TABLES: TableRef[] = [
  { schema: "webapi", table: "sec_role" },
  { schema: "logto", table: "users" },
];

export interface AtlasDbInitDeps {
  readDir: (dir: string) => Promise<string[]>;
  readFile: (path: string) => Promise<string>;
  exec: (sql: string) => Promise<unknown>;
  tableExists: (t: TableRef) => Promise<boolean>;
  dir: string;
  log: (m: string) => void;
  err: (m: string) => void;
  wait?: WaitOptions;
}

/** Returns the number of SQL files applied. Never throws — the caller runs
 *  inside d2eBoot(), where a failure must not take down boot. */
export async function applyAtlasDbInit(deps: AtlasDbInitDeps): Promise<number> {
  let names: string[];
  try {
    names = await deps.readDir(deps.dir);
  } catch {
    deps.log(`atlas-db-init skipped — ${deps.dir} not present`);
    return 0;
  }

  const files = names.filter((n) => n.endsWith(".sql")).sort();
  if (files.length === 0) {
    deps.log(`atlas-db-init skipped — no .sql files in ${deps.dir}`);
    return 0;
  }

  const ready = await waitForTables(deps.tableExists, REQUIRED_TABLES, deps.wait);
  if (!ready) {
    deps.err(
      "atlas-db-init skipped — webapi.sec_role / logto.users not ready before timeout; will retry on next boot",
    );
    return 0;
  }

  let applied = 0;
  for (const name of files) {
    const path = `${deps.dir}/${name}`;
    try {
      await deps.exec(await deps.readFile(path));
      applied++;
    } catch (e) {
      deps.err(`atlas-db-init ${name} failed: ${(e as Error).message}`);
    }
  }
  deps.log(`atlas-db-init applied ${applied}/${files.length} file(s)`);
  return applied;
}
