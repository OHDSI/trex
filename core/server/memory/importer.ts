// Materializes `memory` plugin sources (git repos + inline package dirs) and
// imports their markdown pages into gbrain via the put_page MCP tool.
//
// This module is deliberately narrow: materialize (resolve on-disk markdown
// + a version string) and import (POST each page) only. Provisioning a
// brain, choosing an import token, and driving refresh-on-change are the
// caller's job (Task 12/13).
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

function joinDir(base: string, sub?: string): string {
  if (!sub) return base.replace(/\/+$/, "");
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

// Cheap change-probe used by the refresh driver (Task 12): avoids a full
// clone/read cycle just to check whether anything changed. git: ls-remote
// SHA for the ref, no checkout needed. inline: same content hash as
// materializeSource (there's no cheaper probe for local files).
export async function sourceVersion(
  src: MemorySource,
  pluginDir: string,
  workRoot: string,
): Promise<string> {
  if (src.repo) {
    const ref = src.ref ?? "main";
    const out = await run(["git", "ls-remote", src.repo, ref]);
    const sha = out.split(/\s+/)[0];
    if (sha) return sha;
    // Ref didn't resolve via ls-remote (e.g. a commit SHA, not a branch/tag)
    // — fall back to an actual sync to resolve it.
    const { sha: resolved } = await syncGitCheckout(src, workRoot);
    return resolved;
  }
  const root = joinDir(pluginDir, src.dir);
  const files = await readMarkdown(root);
  return await contentHash(files);
}

export interface ImportOpts {
  baseUrl: string;
  token: string;
}

// POSTs one tools/call put_page per file to <baseUrl>/memory/<memoryName>/mcp,
// namespacing the slug as <src.name>/<file-slug>. Per-page failures (network
// errors, non-2xx, or an MCP tool-error result) are logged and counted, but
// never abort the remaining pages — a single bad page shouldn't sink the
// whole source import.
export async function importSource(
  memoryName: string,
  src: MemorySource,
  files: MaterializedFile[],
  opts: ImportOpts,
): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  for (const f of files) {
    const slug = `${src.name}/${f.slug}`;
    try {
      const res = await fetch(`${opts.baseUrl}/memory/${memoryName}/mcp`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${opts.token}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "put_page",
            arguments: { slug, content: f.content },
          },
        }),
      });
      let body: { result?: { isError?: boolean } } | undefined;
      try {
        body = await res.json();
      } catch {
        // Non-JSON body (e.g. a plain-text 500) — treated as a failure
        // below via res.ok, not fatal to parse.
      }
      if (res.ok && !body?.result?.isError) {
        ok++;
      } else {
        failed++;
        console.error(
          `memory ${memoryName}/${src.name}: put_page ${f.slug} failed`,
          body?.result ?? res.status,
        );
      }
    } catch (e) {
      failed++;
      console.error(
        `memory ${memoryName}/${src.name}: put_page ${f.slug} threw`,
        e,
      );
    }
  }
  return { ok, failed };
}
