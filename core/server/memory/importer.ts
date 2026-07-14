// Materializes `memory` plugin sources (git repos + inline package dirs)
// into on-disk markdown + a version string, for mount.ts's `stageMemorySources`
// to copy into the worker's own servicePath (see that file's header comment
// for why staging, not an HTTP import, is the actual delivery path post the
// subprocess->worker pivot).
//
// This module is deliberately narrow: materialize only. Provisioning a
// brain and driving refresh-on-change are the caller's job.
import type { MemorySource } from "../plugin/memory.ts";

export interface MaterializedFile {
  slug: string;
  content: string;
}

async function run(cmd: string[], cwd?: string): Promise<string> {
  const p = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    cwd,
    stdout: "piped",
    stderr: "piped",
  });
  const { success, stdout, stderr } = await p.output();
  if (!success) {
    throw new Error(
      `${cmd.join(" ")} failed: ${new TextDecoder().decode(stderr)}`,
    );
  }
  return new TextDecoder().decode(stdout);
}

// Recursively collects *.md files under root, slug = path relative to root
// minus the .md extension (nested dirs -> "sub/name").
async function readMarkdown(root: string): Promise<MaterializedFile[]> {
  const out: MaterializedFile[] = [];
  async function walk(dir: string, prefix: string) {
    for await (const e of Deno.readDir(dir)) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory) {
        await walk(p, `${prefix}${e.name}/`);
      } else if (e.isFile && e.name.endsWith(".md")) {
        out.push({
          slug: `${prefix}${e.name.slice(0, -3)}`,
          content: await Deno.readTextFile(p),
        });
      }
    }
  }
  await walk(root, "");
  return out;
}

// Deterministic content hash used as the inline source's "version": sorted
// so file iteration order (readDir gives no ordering guarantee) never
// changes the hash.
async function contentHash(files: MaterializedFile[]): Promise<string> {
  const joined = files
    .map((f) => `${f.slug}\n${f.content}`)
    .sort()
    .join("\0");
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(joined),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Manifest `dir` is operator/tpm-controlled (trusted-scope plugins only),
// but this is cheap defense-in-depth: reject any `..` path segment so a
// source can never resolve outside the plugin package (inline sources) or
// outside the cloned checkout (git sources). Covers every joinDir call site
// (materializeSource's git + inline branches) in one place.
function assertNoParentTraversal(dir: string): void {
  if (dir.split("/").some((segment) => segment === "..")) {
    throw new Error(`memory source dir must not contain a '..' segment: ${dir}`);
  }
}

function joinDir(base: string, sub?: string): string {
  if (!sub) return base.replace(/\/+$/, "");
  assertNoParentTraversal(sub);
  return `${base}/${sub}`.replace(/\/+/g, "/").replace(/\/+$/, "");
}

// Clones (first time) or fetches+resets (subsequent calls) a shallow git
// checkout of src.repo at src.ref into `${workRoot}/${src.name}`, returning
// the resolved HEAD SHA.
async function syncGitCheckout(
  src: MemorySource,
  workRoot: string,
): Promise<{ dest: string; sha: string }> {
  if (!src.repo) throw new Error(`memory source ${src.name}: not a git source`);
  const ref = src.ref ?? "main";
  const dest = `${workRoot}/${src.name}`;

  const alreadyCloned = await Deno.stat(`${dest}/.git`).then(
    () => true,
    () => false,
  );
  if (alreadyCloned) {
    await run(["git", "-C", dest, "fetch", "--depth", "1", "origin", ref]);
    await run(["git", "-C", dest, "reset", "--hard", "FETCH_HEAD"]);
  } else {
    await Deno.mkdir(workRoot, { recursive: true });
    await run([
      "git",
      "clone",
      "--depth",
      "1",
      "--branch",
      ref,
      src.repo,
      dest,
    ]);
  }
  const sha = (await run(["git", "-C", dest, "rev-parse", "HEAD"])).trim();
  return { dest, sha };
}

// git: shallow clone/pull at src.ref, resolve HEAD SHA (= version), read
// *.md under src.dir. inline: read *.md under `${pluginDir}/${src.dir}`,
// version = content hash.
export async function materializeSource(
  src: MemorySource,
  pluginDir: string,
  workRoot: string,
): Promise<{ files: MaterializedFile[]; version: string }> {
  if (src.repo) {
    const { dest, sha } = await syncGitCheckout(src, workRoot);
    const files = await readMarkdown(joinDir(dest, src.dir));
    return { files, version: sha };
  }
  const root = joinDir(pluginDir, src.dir);
  const files = await readMarkdown(root);
  const version = await contentHash(files);
  return { files, version };
}

