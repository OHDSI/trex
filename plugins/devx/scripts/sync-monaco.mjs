#!/usr/bin/env node
// Copies monaco-editor's AMD distribution from node_modules into public/monaco/vs.
// Runs on npm install (postinstall), before npm run dev (predev), and before
// npm run build (prebuild). Idempotent — destination is cleared first.
//
// Why this exists: the previous vendored bundle (16 MB, 121 files) was a
// Vite-rolled-up custom build of monaco-editor 0.42.0-dev with no checked-in
// build script. We replaced it with a copy of the standard AMD distribution
// shipped by the monaco-editor npm package, so any developer can reproduce it
// with `npm install`.

import { cp, mkdir, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");
const src = resolve(pkgRoot, "node_modules/monaco-editor/min/vs");
const dst = resolve(pkgRoot, "public/monaco/vs");

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function main() {
  if (!(await exists(src))) {
    console.error(
      `[sync-monaco] source missing: ${src}\n` +
      `[sync-monaco] run \`npm install\` first, or check that monaco-editor is a dependency.`
    );
    process.exit(1);
  }
  await rm(dst, { recursive: true, force: true });
  await mkdir(dirname(dst), { recursive: true });
  await cp(src, dst, { recursive: true });
  console.log(`[sync-monaco] copied monaco-editor AMD bundle → ${dst}`);
}

main().catch((err) => {
  console.error("[sync-monaco] failed:", err);
  process.exit(1);
});
