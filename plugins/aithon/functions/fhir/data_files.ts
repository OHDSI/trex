// Data files ship at the plugin root (<plugin>/data). import.meta.url is NOT a
// reliable disk path here: packaged workers execute from a compile-staging dir
// (file:///var/tmp/sb-compile-…) that stages only the module graph, never the
// sibling data files. Try meta-relative first (source checkouts, tests), then
// the plugin dir the engine passes as TREX_FUNCTION_PATH (packaged image) —
// same convention as core/server/plugin/agents.ts resolveAgentsRuntimeDir.
export async function readDataFile(name: string): Promise<string> {
  try {
    return await Deno.readTextFile(new URL(`../../data/${name}`, import.meta.url));
  } catch (metaErr) {
    const pluginDir = Deno.env.get("TREX_FUNCTION_PATH");
    if (!pluginDir) throw metaErr;
    return await Deno.readTextFile(`${pluginDir}/data/${name}`);
  }
}
