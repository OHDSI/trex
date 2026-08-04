// Boot-time in-worker import of core-staged source markdown (H4). Core
// (mount.ts's staging step, Part A) pre-stages each declared memory's source
// markdown + a `sources/manifest.json` into the worker's OWN servicePath at
// MOUNT time — materializing via git/fs (importer.ts's `materializeSource`,
// Task 11) happens core-side, where the fs/git tooling actually lives (a
// worker's module loader only resolves file: specifiers under its own
// servicePath — see mount.ts's header comment — and it has no git binary or
// network access to a plugin's declared repo anyway). This module runs
// entirely IN the worker process, called from the generated `index.ts`
// (mount.ts) right after `engine.connect()` and before `Deno.serve`: reads
// the manifest, and imports each staged page directly against the
// already-connected engine via `dispatchToolCall`'s `put_page` — no HTTP hop
// back to core, no git-in-worker.
//
// Change tracking mirrors Task 12's refresh.ts (`shouldSkipSource(recorded,
// fresh)` / record-on-success-only) but reached via `engine.executeRaw`
// against `trexdb.memory_import_state`, fully schema-qualified — no separate
// pg client/pool is needed because the worker's `engine` is already
// connected to the SAME database as trex core (the one that owns the
// `trexdb` schema); `executeRaw` runs unscoped SQL on the engine's
// connection, so a schema-qualified statement reaches it regardless of
// whatever search_path a `withSchema` call elsewhere set up. If that query
// throws for ANY reason (migration not yet applied, permissions, transient
// network blip) it is treated as "version tracking unavailable": the source
// is imported unconditionally and the failure is logged — never thrown, so
// a version-tracking hiccup can't block `Deno.serve` from coming up (same
// non-fatal posture the whole function follows throughout).
//
// Embeddings stay OFF (v1 keyword-only, per H2/H3): `put_page` here goes
// through the same `dispatchToolCall` path the HTTP handler uses, so nothing
// in this file touches gbrain's `require()` embedding-provider sites.
import type { PostgresEngine } from "gbrain/core/postgres-engine.ts";
import { dispatchToolCall } from "gbrain/mcp/dispatch.ts";

// Kept intentionally separate from (structurally identical to) mount.ts's
// own manifest-entry shape: mount.ts runs core-side and can't import this
// file even for a type-only import without pulling in the `gbrain/` bare
// specifier that only resolves inside the staged worker's import map (see
// mount.ts's dual-path/import-map comments) — so the manifest shape is
// duplicated at this one boundary rather than shared.
export interface StagedManifestEntry {
  memory: string;
  source: string;
  version: string;
  slugs: string[];
}

export interface ImportStagedSourcesOpts {
  // Reserved for a future non-engine pg client. Unused today — see the file
  // doc comment on why the passed-in `engine` already reaches `trexdb` — but
  // kept on the signature per the brief so a caller can thread one through
  // later without a breaking change.
  // deno-lint-ignore no-explicit-any
  pool?: any;
}

async function getRecordedVersion(
  engine: PostgresEngine,
  memory: string,
  source: string,
): Promise<string | null> {
  const rows = await engine.executeRaw<{ version: string }>(
    `SELECT version FROM trexdb.memory_import_state WHERE memory = $1 AND source = $2`,
    [memory, source],
  );
  return rows[0]?.version ?? null;
}

async function recordVersion(
  engine: PostgresEngine,
  memory: string,
  source: string,
  version: string,
): Promise<void> {
  await engine.executeRaw(
    `INSERT INTO trexdb.memory_import_state (memory, source, version, imported_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (memory, source) DO UPDATE
       SET version = EXCLUDED.version, imported_at = now()`,
    [memory, source, version],
  );
}

/**
 * Reads `${sourcesRoot}/manifest.json` (written by mount.ts's staging step)
 * and imports every listed source's staged `.md` files into gbrain via
 * `put_page`, skipping a source whose version is unchanged since the last
 * successful boot import. Never throws: a missing/corrupt manifest, a
 * failed schema provision, or a failed page import are all logged and
 * skipped so one bad memory/source never prevents the worker from serving —
 * this runs before `Deno.serve` in the generated `index.ts`, and an import
 * failure must not block the worker from coming up.
 *
 * Refresh-on-change is deliberately OUT OF SCOPE here (see task-h4-report.md
 * "Refresh deferred"): the worker is created once with fixed staged
 * content, so this only ever runs once, at boot.
 */
export async function importStagedSources(
  engine: PostgresEngine,
  sourcesRoot: string,
  _opts: ImportStagedSourcesOpts = {},
): Promise<void> {
  let manifest: StagedManifestEntry[];
  try {
    const raw = await Deno.readTextFile(`${sourcesRoot}/manifest.json`);
    manifest = JSON.parse(raw);
  } catch (e) {
    console.error(
      `memory: self-import: no staged manifest at ${sourcesRoot}/manifest.json (nothing to import):`,
      e,
    );
    return;
  }

  const memories = [...new Set(manifest.map((m) => m.memory))];
  for (const memory of memories) {
    try {
      await engine.provisionSchema(memory);
    } catch (e) {
      console.error(
        `memory ${memory}: self-import: provisionSchema failed, skipping this memory's sources:`,
        e,
      );
      continue;
    }

    const schema = `memory_${memory}`;
    for (const entry of manifest.filter((m) => m.memory === memory)) {
      try {
        let recorded: string | null = null;
        try {
          recorded = await getRecordedVersion(engine, memory, entry.source);
        } catch (e) {
          // Version tracking unavailable (table missing/unreachable) — fall
          // through and import unconditionally rather than skip blind.
          console.error(
            `memory ${memory}/${entry.source}: self-import: version lookup failed, importing unconditionally:`,
            e,
          );
        }

        if (recorded !== null && recorded === entry.version) {
          console.log(
            `memory ${memory}/${entry.source}: unchanged (${entry.version}), skipping`,
          );
          continue;
        }

        let ok = 0;
        let failed = 0;
        for (const slug of entry.slugs) {
          const path = `${sourcesRoot}/${memory}/${entry.source}/${slug}.md`;
          try {
            const content = await Deno.readTextFile(path);
            // Lowercase the page slug before writing. gbrain's put_page
            // lowercases the slug in validateSlug, but upsertChunks' raw SELECT
            // does not — a mixed-case slug (e.g. from an UpperCase.md filename)
            // makes the two disagree and rolls the write back. Sending an
            // already-lowercased slug matches gbrain's own canonical form and
            // avoids that. (Source names are lowercase-regex'd already; this
            // guards the file-derived slug segment.)
            const pageSlug = `${entry.source}/${slug}`.toLowerCase();
            const result = await engine.withSchema(
              schema,
              (s) =>
                dispatchToolCall(s, "put_page", {
                  slug: pageSlug,
                  content,
                }, {
                  schema,
                  sourceId: "default",
                }),
            );
            if ((result as { isError?: boolean })?.isError) {
              failed++;
              console.error(
                `memory ${memory}/${entry.source}: put_page ${slug} failed`,
                result,
              );
            } else {
              ok++;
            }
          } catch (e) {
            failed++;
            console.error(
              `memory ${memory}/${entry.source}: put_page ${slug} threw`,
              e,
            );
          }
        }

        console.log(
          `memory ${memory}/${entry.source}: imported ${ok} page(s), ${failed} failed (version ${entry.version})`,
        );

        // Only record the new version when the import fully succeeded —
        // same record-on-success-only rule as Task 12's refresh.ts, so a
        // partial import retries in full on the next boot rather than being
        // marked done.
        if (failed === 0) {
          try {
            await recordVersion(engine, memory, entry.source, entry.version);
          } catch (e) {
            console.error(
              `memory ${memory}/${entry.source}: self-import: failed to record version (will re-import next boot):`,
              e,
            );
          }
        } else {
          console.error(
            `memory ${memory}/${entry.source}: ${failed} page(s) failed — not recording version ${entry.version}, will retry next boot`,
          );
        }
      } catch (e) {
        console.error(
          `memory ${memory}/${entry.source}: self-import: source import failed (non-fatal):`,
          e,
        );
      }
    }
  }
}
