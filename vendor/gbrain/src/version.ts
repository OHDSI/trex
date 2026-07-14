// Deno requires an explicit `with { type: 'json' }` import attribute on JSON
// imports (Bun infers it, so both forms had to be checked against `bun test`
// before landing — see vendor/gbrain/PATCHES.md P5).
import pkg from '../package.json' with { type: 'json' };
export const VERSION = pkg.version;
