export interface ScannedPlugin {
  shortName: string;
  dir: string;
  pkg: any;
}

export async function scanPluginDirectory(
  baseDir: string,
): Promise<ScannedPlugin[]> {
  const results: ScannedPlugin[] = [];

  async function scanLevel(scanDir: string) {
    try {
      for await (const entry of Deno.readDir(scanDir)) {
        if (!entry.isDirectory) continue;
        if (entry.name.startsWith("@")) {
          await scanLevel(`${scanDir}/${entry.name}`);
          continue;
        }
        try {
          const pkgJsonPath = `${scanDir}/${entry.name}/package.json`;
          const pkg = JSON.parse(await Deno.readTextFile(pkgJsonPath));
          const shortName = pkg.name?.includes("/")
            ? pkg.name.split("/").pop()
            : pkg.name || entry.name;
          results.push({
            shortName,
            dir: `${scanDir}/${entry.name}`,
            pkg,
          });
        } catch {
          // no valid package.json
        }
      }
    } catch {
      // not readable
    }
  }

  await scanLevel(baseDir);
  return results;
}

export function scopeUrlPrefix(fullName: string): string {
  if (!fullName.startsWith("@") || !fullName.includes("/")) return "";
  return "/" + fullName.slice(1, fullName.indexOf("/"));
}

export async function waitfor(url: string): Promise<string> {
  let reachable = false;
  while (!reachable) {
    try {
      await fetch(url);
      reachable = true;
    } catch (_e) {
      console.log(`${url} not reachable. waiting ...`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  return "OK";
}

/**
 * Split a PATH-style, colon-separated list of directories
 * (e.g. "/usr/src/plugins-dev:/usr/src/plugins-dx").
 */
export function splitPathList(val: string): string[] {
  return val.split(":").map((s) => s.trim()).filter(Boolean);
}

// `skipNames`, when given, is applied only at THIS call's own level (never
// forwarded into the recursive calls for subdirectories) — it exists so
// callers can exclude specific top-level entries (see agents.ts's `evals`
// exclusion) without accidentally skipping a same-named dir nested deeper in
// the tree.
export async function copyDirRecursive(src: string, dest: string, skipNames?: ReadonlySet<string>): Promise<void> {
  await Deno.mkdir(dest, { recursive: true });
  for await (const entry of Deno.readDir(src)) {
    if (skipNames?.has(entry.name)) continue;
    const s = `${src}/${entry.name}`;
    const d = `${dest}/${entry.name}`;
    // Deno.stat follows symlinks, so linked files/dirs are copied as content.
    const info = entry.isSymlink ? await Deno.stat(s) : entry;
    if (info.isDirectory) await copyDirRecursive(s, d);
    else if (info.isFile) await Deno.copyFile(s, d);
  }
}
