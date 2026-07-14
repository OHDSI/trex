import { assertEquals } from "jsr:@std/assert";
import { importSource, materializeSource } from "./importer.ts";

Deno.test("materializes inline markdown into slug/content pairs", async () => {
  const dir = await Deno.makeTempDir();
  await Deno.mkdir(`${dir}/handbook`, { recursive: true });
  await Deno.writeTextFile(`${dir}/handbook/intro.md`, "# Intro\nhello");
  await Deno.mkdir(`${dir}/handbook/deep`, { recursive: true });
  await Deno.writeTextFile(`${dir}/handbook/deep/topic.md`, "# Topic\nx");
  const out = await materializeSource(
    { name: "handbook", dir: "handbook" },
    dir,
    await Deno.makeTempDir(),
  );
  const slugs = out.files.map((f: { slug: string }) => f.slug).sort();
  assertEquals(slugs, ["deep/topic", "intro"]);
  assertEquals(typeof out.version, "string");
});

Deno.test("inline materialize ignores non-markdown files", async () => {
  const dir = await Deno.makeTempDir();
  await Deno.mkdir(`${dir}/handbook`, { recursive: true });
  await Deno.writeTextFile(`${dir}/handbook/intro.md`, "# Intro\nhello");
  await Deno.writeTextFile(`${dir}/handbook/notes.txt`, "not markdown");
  const out = await materializeSource(
    { name: "handbook", dir: "handbook" },
    dir,
    await Deno.makeTempDir(),
  );
  assertEquals(out.files.map((f: { slug: string }) => f.slug), ["intro"]);
});

Deno.test("inline materialize version is stable across runs and changes when content changes", async () => {
  const dir = await Deno.makeTempDir();
  await Deno.mkdir(`${dir}/handbook`, { recursive: true });
  await Deno.writeTextFile(`${dir}/handbook/intro.md`, "# Intro\nhello");
  const src = { name: "handbook", dir: "handbook" };
  const first = await materializeSource(src, dir, await Deno.makeTempDir());
  const second = await materializeSource(src, dir, await Deno.makeTempDir());
  assertEquals(first.version, second.version);

  await Deno.writeTextFile(
    `${dir}/handbook/intro.md`,
    "# Intro\nhello changed",
  );
  const third = await materializeSource(src, dir, await Deno.makeTempDir());
  assertEquals(first.version === third.version, false);
});

// --- git source (local throwaway repo, no network) ------------------------

async function gitRun(cmd: string[], cwd: string): Promise<void> {
  const p = new Deno.Command(cmd[0], {
    args: cmd.slice(1),
    cwd,
    stdout: "piped",
    stderr: "piped",
  });
  const { success, stderr } = await p.output();
  if (!success) {
    throw new Error(`${cmd.join(" ")}: ${new TextDecoder().decode(stderr)}`);
  }
}

async function makeLocalRepo(): Promise<string> {
  const repo = await Deno.makeTempDir();
  await gitRun(["git", "init", "-q", "-b", "main", "."], repo);
  await gitRun(["git", "config", "user.email", "t@t.com"], repo);
  await gitRun(["git", "config", "user.name", "t"], repo);
  await Deno.mkdir(`${repo}/docs`, { recursive: true });
  await Deno.writeTextFile(`${repo}/docs/a.md`, "# A");
  await gitRun(["git", "add", "-A"], repo);
  await gitRun(["git", "commit", "-q", "-m", "init"], repo);
  return repo;
}

Deno.test("materializes a git source (local repo, no network): clone, read *.md under dir, version = HEAD sha", async () => {
  const repo = await makeLocalRepo();
  const workRoot = await Deno.makeTempDir();
  const src = { name: "docs", repo, ref: "main", dir: "docs" };

  const out = await materializeSource(
    src,
    /* pluginDir unused for git */ "",
    workRoot,
  );
  assertEquals(out.files.map((f) => f.slug), ["a"]);
  assertEquals(out.files[0].content, "# A");

  const headOut = new TextDecoder().decode(
    (await new Deno.Command("git", {
      args: ["-C", repo, "rev-parse", "HEAD"],
      stdout: "piped",
    }).output()).stdout,
  ).trim();
  assertEquals(out.version, headOut);
});

Deno.test("materializes a git source: a second call (already cloned) fetches/resets instead of re-cloning", async () => {
  const repo = await makeLocalRepo();
  const workRoot = await Deno.makeTempDir();
  const src = { name: "docs", repo, ref: "main", dir: "docs" };

  const first = await materializeSource(src, "", workRoot);

  // Amend the repo with a new commit; the second materialize should pick it
  // up via fetch+reset rather than failing (would fail if it tried to
  // re-clone into the already-populated dest dir without handling that case).
  await Deno.writeTextFile(`${repo}/docs/b.md`, "# B");
  await gitRun(["git", "add", "-A"], repo);
  await gitRun(["git", "commit", "-q", "-m", "second"], repo);

  const second = await materializeSource(src, "", workRoot);
  assertEquals(second.files.map((f) => f.slug).sort(), ["a", "b"]);
  assertEquals(second.version === first.version, false);
});

// --- importSource ---------------------------------------------------------

interface PutPageBody {
  jsonrpc: string;
  method: string;
  params: { name: string; arguments: { slug: string; content: string } };
}

interface StubRequest {
  path: string;
  auth: string | null;
  body: PutPageBody;
}

function startStub(
  respond: (body: { slug: string }) => Response,
): {
  baseUrl: string;
  requests: StubRequest[];
  ac: AbortController;
  server: Deno.HttpServer;
} {
  const requests: StubRequest[] = [];
  const ac = new AbortController();
  const server = Deno.serve(
    { port: 0, signal: ac.signal, onListen: () => {} },
    async (req) => {
      const body = await req.json() as PutPageBody;
      requests.push({
        path: new URL(req.url).pathname,
        auth: req.headers.get("authorization"),
        body,
      });
      const slug = body?.params?.arguments?.slug;
      return respond({ slug });
    },
  );
  const port = (server.addr as Deno.NetAddr).port;
  return { baseUrl: `http://127.0.0.1:${port}`, requests, ac, server };
}

async function stopStub(
  stub: { ac: AbortController; server: Deno.HttpServer },
) {
  stub.ac.abort();
  await stub.server.finished;
}

Deno.test("importSource posts one put_page per file with the namespaced slug", async () => {
  const stub = startStub(() =>
    Response.json({ jsonrpc: "2.0", id: 1, result: { ok: true } })
  );
  try {
    const src = { name: "handbook", dir: "handbook" };
    const files = [
      { slug: "intro", content: "# Intro" },
      { slug: "deep/topic", content: "# Topic" },
    ];
    const result = await importSource("research", src, files, {
      baseUrl: stub.baseUrl,
      token: "test-token",
    });

    assertEquals(result, { ok: 2, failed: 0 });
    assertEquals(stub.requests.length, 2);
    for (const req of stub.requests) {
      assertEquals(req.path, "/memory/research/mcp");
      assertEquals(req.auth, "Bearer test-token");
      assertEquals(req.body.jsonrpc, "2.0");
      assertEquals(req.body.method, "tools/call");
      assertEquals(req.body.params.name, "put_page");
    }
    const slugs = stub.requests.map((r) => r.body.params.arguments.slug).sort();
    assertEquals(slugs, ["handbook/deep/topic", "handbook/intro"]);
  } finally {
    await stopStub(stub);
  }
});

Deno.test("importSource counts a per-page failure without aborting the rest", async () => {
  const stub = startStub((body) =>
    body.slug === "handbook/bad"
      ? Response.json({
        jsonrpc: "2.0",
        id: 1,
        result: { isError: true, content: "boom" },
      })
      : Response.json({ jsonrpc: "2.0", id: 1, result: { ok: true } })
  );
  try {
    const src = { name: "handbook", dir: "handbook" };
    const files = [
      { slug: "good", content: "# Good" },
      { slug: "bad", content: "# Bad" },
      { slug: "also-good", content: "# Also good" },
    ];
    const result = await importSource("research", src, files, {
      baseUrl: stub.baseUrl,
      token: "test-token",
    });
    assertEquals(result, { ok: 2, failed: 1 });
    assertEquals(stub.requests.length, 3);
  } finally {
    await stopStub(stub);
  }
});

Deno.test("importSource counts a network-level failure (non-2xx) without throwing", async () => {
  const stub = startStub(() => new Response("nope", { status: 500 }));
  try {
    const src = { name: "handbook", dir: "handbook" };
    const files = [{ slug: "intro", content: "# Intro" }];
    const result = await importSource("research", src, files, {
      baseUrl: stub.baseUrl,
      token: "test-token",
    });
    assertEquals(result, { ok: 0, failed: 1 });
  } finally {
    await stopStub(stub);
  }
});
