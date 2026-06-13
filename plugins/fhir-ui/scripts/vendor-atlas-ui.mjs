import { cpSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = process.env.ATLAS_UI_DIST
  || join(here, "../../../../Atlas3/packages/atlas-ui/dist");
const dest = join(here, "../vendor/atlas-ui");

if (!existsSync(src)) {
  console.error(`atlas-ui dist not found at ${src}. Run "npm run lib:build" in Atlas3, or set ATLAS_UI_DIST.`);
  process.exit(1);
}
mkdirSync(dest, { recursive: true });
for (const f of ["atlas-ui.js", "atlas-ui.css", "atlas-ui.d.ts"]) {
  cpSync(join(src, f), join(dest, f));
}
console.log(`Vendored atlas-ui → ${dest}`);
