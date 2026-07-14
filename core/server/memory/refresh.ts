// Boot provisioner + change-driven refresh driver for the `memory` plugin
// type. Ties together the gbrain subprocess supervisor (Task 9,
// gbrain-process.ts) and the source materialize/import primitives (Task 11,
// importer.ts): on boot (and periodically thereafter), it starts gbrain
// scoped to the declared memory names, warms up each memory's MCP endpoint
// so gbrain auto-provisions its schema (loud failure — design §8), and then
// imports each source's markdown pages, skipping any source whose content
// hasn't changed since the last successful import.
//
// Change tracking lives trex-side in trexdb.memory_import_state (see
// core/schema/V6__memory_import_state.sql) rather than inside gbrain: it
// keeps import bookkeeping queryable and independent of gbrain internals.
import { startGbrain } from "./gbrain-process.ts";
import { importSource, materializeSource, sourceVersion } from "./importer.ts";
import type { MemoryEntry } from "../plugin/memory.ts";
import { pool } from "../db.ts";

const IMPORT_TOKEN = Deno.env.get("GBRAIN_IMPORT_TOKEN") ?? "";

// Pure decision helper (unit-testable without DB/network): a source is
// skipped only when we have a previously recorded version AND it matches
// the freshly computed one. `null` (never imported) always proceeds.
export function shouldSkipSource(
  recordedVersion: string | null,
  freshVersion: string,
): boolean {
  return recordedVersion !== null && recordedVersion === freshVersion;
}

async function getRecordedVersion(
  memory: string,
  source: string,
): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT version FROM trexdb.memory_import_state WHERE memory = $1 AND source = $2`,
    [memory, source],
  );
  return rows[0]?.version ?? null;
}

async function recordVersion(
  memory: string,
  source: string,
  version: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO trexdb.memory_import_state (memory, source, version, imported_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (memory, source) DO UPDATE
       SET version = EXCLUDED.version, imported_at = now()`,
    [memory, source, version],
  );
}

// Starts (or reuses) the shared gbrain subprocess scoped to `entries`' names
// (the security-gate allowlist — see gbrain-process.ts), warms up each
// memory so gbrain auto-provisions its schema, and imports every source
// whose version has changed since the last successful import. Per-source
// git-fetch/import failures are caught and logged, keeping the last-good
// import in place; a warmup failure is loud (throws) per design §8, since
// it means the memory's schema/proxy path is unusable.
export async function provisionAndImport(
  entries: MemoryEntry[],
  pluginDirs: Map<string, string>,
): Promise<void> {
  const { baseUrl } = await startGbrain({
    allowlist: entries.map((e) => e.name),
  });
  const workRoot = await Deno.makeTempDir({ prefix: "memory-import-" });

  for (const mem of entries) {
    // Warmup → auto-provision. Loud failure per design §8: an unprovisioned
    // memory means every request to it will fail, so surface this now
    // rather than deferring the error to first client use.
    const res = await fetch(`${baseUrl}/memory/${mem.name}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${IMPORT_TOKEN}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }),
    });
    if (!res.ok) {
      throw new Error(
        `memory ${mem.name}: provisioning failed (${res.status})`,
      );
    }

    const pluginDir = pluginDirs.get(mem.name) ?? Deno.cwd();
    for (const src of mem.sources) {
      try {
        const recorded = await getRecordedVersion(mem.name, src.name);
        const fresh = await sourceVersion(src, pluginDir, workRoot);
        if (shouldSkipSource(recorded, fresh)) {
          console.log(
            `memory ${mem.name}/${src.name}: unchanged (${fresh}), skipping`,
          );
          continue;
        }

        const { files, version } = await materializeSource(
          src,
          pluginDir,
          workRoot,
        );
        const r = await importSource(mem.name, src, files, {
          baseUrl,
          token: IMPORT_TOKEN,
        });
        await recordVersion(mem.name, src.name, version);
        console.log(
          `memory ${mem.name}/${src.name}: imported ${r.ok} page(s), ${r.failed} failed (version ${version})`,
        );
      } catch (e) {
        // Git fetch/import failure keeps last-good; surfaced, retried on
        // the next refresh tick.
        console.error(
          `memory ${mem.name}/${src.name}: import skipped (kept last-good):`,
          e,
        );
      }
    }
  }
}

// Periodic change-driven refresh: re-runs provisionAndImport on an interval
// (default 5 minutes, override via MEMORY_REFRESH_MS or opts.intervalMs).
// Never throws out of the tick — boot/refresh must never take the server
// down because a source is temporarily unreachable.
export function startRefreshLoop(
  entries: MemoryEntry[],
  pluginDirs: Map<string, string>,
  opts?: { intervalMs?: number },
): void {
  const interval = opts?.intervalMs ??
    Number(Deno.env.get("MEMORY_REFRESH_MS") ?? String(5 * 60_000));
  const tick = async () => {
    try {
      await provisionAndImport(entries, pluginDirs);
    } catch (e) {
      console.error("memory: refresh tick failed (non-fatal):", e);
    }
  };
  setInterval(() => {
    void tick();
  }, interval);
}
