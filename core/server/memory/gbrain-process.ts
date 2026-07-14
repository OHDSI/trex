// The `memory` plugin type (spec: memory plugin) supervises a single
// vendored gbrain subprocess (running under Bun) for the whole trex server.
// gbrain serves/provisions only the memories declared by plugins; the
// allow-list is passed in via GBRAIN_MEMORY_ALLOWLIST so undeclared memory
// names 404 instead of being silently auto-provisioned (the security gate
// for this plugin type — see task-9-brief.md / project_memory_plugin_type).
//
// This module is a focused single-responsibility supervisor: resolve the
// vendored gbrain checkout, spawn it as a child process, wait for it to
// report healthy, and keep it alive across crashes with bounded backoff.
// It does not know about plugin registration or brain provisioning — that
// is the caller's job (Task 13).

const DEFAULT_PORT = Number(Deno.env.get("GBRAIN_PORT") ?? "8781");

interface RunningGbrain {
  port: number;
  baseUrl: string;
  child: Deno.ChildProcess;
  // Set true when startGbrain's caller intentionally stops supervision, so
  // the restart loop knows not to respawn after the child it's watching
  // exits.
  stopped: boolean;
}

let running: RunningGbrain | null = null;
// Serializes concurrent startGbrain() calls so we never spawn two gbrain
// child processes racing for the same port.
let starting: Promise<{ port: number; baseUrl: string }> | null = null;

// Resolve the on-disk vendor/gbrain dir. import.meta.url is NOT a reliable
// disk path in the packaged image (the main service can execute from a
// build-time compile graph whose file URLs don't exist at runtime). Try
// meta-relative first (source checkouts, tests), then cwd-relative
// (packaged image) — same dual-path convention as
// plugin/agents.ts:resolveAgentsRuntimeDir.
export async function resolveGbrainDir(): Promise<string> {
  const candidates = [
    new URL("../../../vendor/gbrain/", import.meta.url).pathname,
    `${Deno.cwd()}/vendor/gbrain/`,
  ];
  for (const c of candidates) {
    try {
      await Deno.stat(`${c}src/cli.ts`);
      return c;
    } catch { /* try next candidate */ }
  }
  throw new Error(`memory: cannot locate vendor/gbrain (tried ${candidates.join(", ")})`);
}

export function gbrainBaseUrl(): string | null {
  return running?.baseUrl ?? null;
}

async function waitHealthy(baseUrl: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${baseUrl}/health`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise((res) => setTimeout(res, 300));
  }
  throw new Error(`memory: gbrain did not become healthy at ${baseUrl} within ${timeoutMs}ms`);
}

export async function startGbrain(
  opts?: { port?: number; databaseUrl?: string; allowlist?: string[] },
): Promise<{ port: number; baseUrl: string }> {
  if (running) return { port: running.port, baseUrl: running.baseUrl };
  if (starting) return starting;

  starting = (async () => {
    const port = opts?.port ?? DEFAULT_PORT;
    const baseUrl = `http://127.0.0.1:${port}`;
    const dir = await resolveGbrainDir();
    const databaseUrl = opts?.databaseUrl ?? Deno.env.get("DATABASE_URL") ?? "";
    const allowlist = (opts?.allowlist ?? []).join(",");

    const childEnv = {
      ...Deno.env.toObject(),
      DATABASE_URL: databaseUrl,
      // Security gate: gbrain must only serve/provision memories declared by
      // plugins. Undeclared memory names are rejected (404) by gbrain using
      // this list. Do not omit — see MANDATORY additions in task-9-brief.md.
      GBRAIN_MEMORY_ALLOWLIST: allowlist,
    };

    const spawn = () =>
      new Deno.Command("bun", {
        args: ["run", `${dir}src/cli.ts`, "serve", "--http", "--port", String(port)],
        cwd: dir,
        env: childEnv,
        stdout: "inherit",
        stderr: "inherit",
      }).spawn();

    let child = spawn();
    const state: RunningGbrain = { port, baseUrl, child, stopped: false };
    running = state;

    // Restart-on-crash with bounded exponential backoff. Guards against
    // restarting after intentional shutdown via state.stopped.
    (async () => {
      let backoff = 500;
      while (running === state && !state.stopped) {
        const status = await child.status;
        if (running !== state || state.stopped) break;
        console.error(
          `memory: gbrain exited unexpectedly (code ${status.code}); restarting in ${backoff}ms`,
        );
        await new Promise((res) => setTimeout(res, backoff));
        backoff = Math.min(backoff * 2, 10_000);
        if (state.stopped) break;
        child = spawn();
        state.child = child;
      }
    })();

    await waitHealthy(baseUrl);
    return { port, baseUrl };
  })();

  try {
    return await starting;
  } finally {
    starting = null;
  }
}

// Intentionally stop supervision: marks the running instance as stopped
// (so the restart loop won't respawn it) and kills the child process.
// Exported for tests/shutdown hooks; not exercised by the plugin path yet.
export function stopGbrain(): void {
  if (!running) return;
  const state = running;
  running = null;
  state.stopped = true;
  try {
    state.child.kill();
  } catch { /* already exited */ }
}
