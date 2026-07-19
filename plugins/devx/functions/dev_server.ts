// @ts-nocheck - Deno edge function
/**
 * Dev server process manager.
 * Manages long-lived dev server processes via DuckDB devx_process_* functions
 * (backed by the Rust devx-ext extension which can spawn subprocesses).
 */

import { duckdb, escapeSql } from "./duckdb.ts";

interface OutputEvent {
  type: "stdout" | "stderr" | "status_change";
  data: string;
  timestamp: number;
}

interface DevServerEntry {
  processId: string | null;
  status: "starting" | "running" | "stopped" | "error";
  port: number;
  portReleased: boolean;
  outputBuffer: OutputEvent[];
  listeners: Set<(event: OutputEvent) => void>;
  detectedUrl: string | null;
  error?: string;
  pollTimer?: number;
  lastLineId: number;
}

const MAX_BUFFER_LINES = 1000;
const PORT_START = 3001;
const PORT_END = 3999;
const POLL_INTERVAL_MS = 500;

/** Allowed command prefixes for dev/install/build commands */
const ALLOWED_COMMAND_PREFIXES = ["npm", "npx", "yarn", "pnpm", "node", "deno", "bun", "echo", "python", "python3", "uv", "prefect"];

/** Run override for d2e (and other) sub-apps: install in one dir, run in
 * another, and inject the allocated port per the framework's portStyle.
 * Custom env is NOT passed here — the Rust process manager parses argv0 and
 * has no inline-env, so custom env is delivered via files (.env.local/.npmrc).
 * It does inject PORT into the child env, so PORT-based servers need no flags. */
interface RunOverride {
  installCwd?: string;     // absolute dir to run the install command in
  devCwd?: string;         // absolute dir to run the dev server in
  portStyle?: "vite" | "webpack" | "cra" | "nx" | "deno" | "none";
  nxApp?: string;          // for portStyle "nx": the nx project name
}

/** Validate that a command starts with an allowed prefix. envPrefix may prepend
 * KEY='val' tokens, so validate the first NON-`KEY=val` token.
 * NOTE: the Rust `validate_command` (plugins/devx-ext/src/validation.rs) is the
 * authoritative gate — this Deno allowlist/parser is advisory and must be kept in
 * sync with it. */
function validateCommand(command: string): void {
  const tokens = command.trim().split(/\s+/);
  let firstWord = tokens[0];
  for (const t of tokens) {
    if (/^[A-Z0-9_]+=/.test(t)) continue;
    firstWord = t;
    break;
  }
  if (!ALLOWED_COMMAND_PREFIXES.includes(firstWord)) {
    throw new Error(`Command not allowed: "${firstWord}". Must start with one of: ${ALLOWED_COMMAND_PREFIXES.join(", ")}`);
  }
}

// Track allocated ports to avoid conflicts
const allocatedPorts = new Set<number>();

class DevServerManager {
  private servers = new Map<string, DevServerEntry>();

  private key(userId: string, appId: string): string {
    return `${userId}:${appId}`;
  }

  private async allocatePort(): Promise<number> {
    for (let port = PORT_START; port <= PORT_END; port++) {
      if (allocatedPorts.has(port)) continue;
      // Check the port is actually free (handles leaked/stale processes). Probe
      // BOTH loopback families: dev servers like vite (host 'localhost') bind
      // IPv6 ::1, so an IPv4-only probe misses them and we'd hand out a port
      // that then fails with EADDRINUSE.
      if (await this.portInUse(port)) continue;
      allocatedPorts.add(port);
      return port;
    }
    throw new Error("No available ports");
  }

  /** True if anything is listening on the port over IPv4 or IPv6 loopback. */
  private async portInUse(port: number): Promise<boolean> {
    for (const hostname of ["127.0.0.1", "::1"]) {
      try {
        const conn = await Deno.connect({ hostname, port });
        conn.close();
        return true;
      } catch { /* refused on this family */ }
    }
    return false;
  }

  private releasePort(entry: DevServerEntry): void {
    if (!entry.portReleased && entry.port > 0) {
      allocatedPorts.delete(entry.port);
      entry.portReleased = true;
    }
  }

  private emit(entry: DevServerEntry, event: OutputEvent): void {
    entry.outputBuffer.push(event);
    if (entry.outputBuffer.length > MAX_BUFFER_LINES) {
      entry.outputBuffer.shift();
    }
    for (const listener of entry.listeners) {
      try { listener(event); } catch { /* listener error */ }
    }
  }

  async start(
    userId: string,
    appId: string,
    appPath: string,
    devCommand: string,
    installCommand: string,
    override: RunOverride = {},
  ): Promise<{ status: string; port?: number }> {
    // Validate commands before execution
    validateCommand(devCommand);
    validateCommand(installCommand);

    const installCwd = override.installCwd ?? appPath;
    const devCwd = override.devCwd ?? appPath;

    const k = this.key(userId, appId);
    const existing = this.servers.get(k);
    if (existing && existing.status === "running") {
      return { status: existing.status, port: existing.port };
    }
    if (existing && existing.status === "starting") {
      // A prior start can leave the entry stuck on "starting" (stdout-based
      // detection missed the URL). If the port is actually up, recover it to
      // "running" here rather than reporting stale "starting" forever.
      if (existing.port > 0 && await this.portInUse(existing.port)) {
        existing.status = "running";
        this.emit(existing, { type: "status_change", data: "running", timestamp: Date.now() });
      }
      return { status: existing.status, port: existing.port };
    }

    const port = await this.allocatePort();
    const entry: DevServerEntry = {
      processId: null,
      status: "starting",
      port,
      portReleased: false,
      outputBuffer: [],
      listeners: existing?.listeners ?? new Set(),
      detectedUrl: null,
      lastLineId: 0,
    };
    this.servers.set(k, entry);

    this.emit(entry, { type: "status_change", data: "starting", timestamp: Date.now() });

    // Check if node_modules exists, run install if not
    try {
      await Deno.stat(`${installCwd}/node_modules`);
    } catch {
      this.emit(entry, { type: "stdout", data: `Running: ${installCommand}`, timestamp: Date.now() });
      try {
        const result = JSON.parse(await duckdb(
          `SELECT * FROM trex_devx_run_command('${escapeSql(installCwd)}', '${escapeSql(installCommand)}')`
        ));
        if (result.output) {
          this.emit(entry, { type: "stdout", data: result.output, timestamp: Date.now() });
        }
        if (!result.ok) {
          entry.status = "error";
          entry.error = "Install failed";
          this.releasePort(entry);
          this.emit(entry, { type: "status_change", data: "error", timestamp: Date.now() });
          return { status: "error" };
        }
      } catch (err) {
        entry.status = "error";
        entry.error = err.message;
        this.releasePort(entry);
        this.emit(entry, { type: "status_change", data: "error", timestamp: Date.now() });
        return { status: "error" };
      }
    }

    // Start dev server via Rust process manager
    try {
      const processId = k;
      // Inject --port and --base so the dev server binds to the allocated port
      // and serves assets from the proxy base path
      const proxyBase = `/plugins/trex/devx-api/apps/${appId}/proxy/`;
      const style = override.portStyle ?? "vite";
      let finalCommand = devCommand;
      // `--` is how you forward flags THROUGH a script runner (`bun run start -- --port`).
      // A direct binary invocation (`bunx vite`, `npx vite`) must NOT get it: the runner
      // passes `--` along, vite ignores the trailing flags, and the server silently binds
      // its config default port instead of the allocated one (which then reads as "stopped").
      const isDirectBinary = /^\s*(bunx|npx|bun\s+x|npm\s+exec|pnpm\s+dlx|yarn\s+dlx)\b/.test(devCommand);
      const sep = isDirectBinary ? "" : "-- ";
      if (style === "vite") {
        finalCommand = `${devCommand} ${sep}--port ${port} --base ${proxyBase}`;
      } else if (style === "nx") {
        // nx forwards extra flags to the underlying vite/serve script, so --base
        // reaches vite and overrides a hardcoded base (e.g. d2e's vue-mri).
        finalCommand = `${devCommand} --port ${port} --base ${proxyBase}`;
      } else if (style === "webpack") {
        finalCommand = `${devCommand} ${sep}--port ${port}`;
      } else {
        // "cra" | "deno" | "none": the Rust process manager injects PORT env; pass no extra flags
        finalCommand = devCommand;
      }
      const configJson = JSON.stringify({ path: devCwd, command: finalCommand, port });
      const startResult = JSON.parse(await duckdb(
        `SELECT * FROM trex_devx_process_start('${escapeSql(processId)}', '${escapeSql(configJson)}')`
      ));

      if (!startResult.ok) {
        entry.status = "error";
        entry.error = "Failed to start process";
        this.releasePort(entry);
        this.emit(entry, { type: "status_change", data: "error", timestamp: Date.now() });
        return { status: "error" };
      }

      entry.processId = processId;

      // Register dev server as a service in the trex cluster gossip
      this.registerService(appId, port);

      // Start polling for output and status
      this.startPolling(entry, processId);

      // Set running after a short delay if URL hasn't been detected yet
      setTimeout(() => {
        if (entry.status === "starting") {
          entry.status = "running";
          this.emit(entry, { type: "status_change", data: "running", timestamp: Date.now() });
        }
      }, 5000);

      return { status: "starting", port };
    } catch (err) {
      entry.status = "error";
      entry.error = err.message;
      this.releasePort(entry);
      this.emit(entry, { type: "status_change", data: "error", timestamp: Date.now() });
      return { status: "error" };
    }
  }

  private startPolling(entry: DevServerEntry, processId: string): void {
    const poll = async () => {
      if (!entry.processId || entry.status === "stopped" || entry.status === "error") {
        return;
      }

      try {
        // Get new output lines
        const outputResult = JSON.parse(await duckdb(
          `SELECT * FROM trex_devx_process_output('${escapeSql(processId)}', '${entry.lastLineId}')`
        ));

        if (outputResult.lines && outputResult.lines.length > 0) {
          for (const line of outputResult.lines) {
            const clean = line.text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
            if (!clean.trim()) continue;
            this.emit(entry, {
              type: line.type === "stderr" ? "stderr" : "stdout",
              data: clean,
              timestamp: line.ts || Date.now(),
            });

            // Detect the dev server URL from output. Vite prints its "Local:"
            // URLs under whatever host it's configured with (localhost,
            // localhost.localdomain, lvh.me, …), so match ANY host — a bare
            // "localhost:" match misses readiness on custom-host apps and leaves
            // them stuck on "starting". Require the URL's port to be the port we
            // allocated so unrelated URLs in build output don't false-positive.
            const urlMatch = clean.match(/https?:\/\/[A-Za-z0-9.-]+:(\d+)\//);
            if (urlMatch && Number(urlMatch[1]) === entry.port && !entry.detectedUrl) {
              entry.detectedUrl = urlMatch[0];
              entry.status = "running";
              this.emit(entry, { type: "status_change", data: "running", timestamp: Date.now() });
            }
          }
          entry.lastLineId = outputResult.last_id;
        }

        // Check process status from Rust process manager
        const statusResult = JSON.parse(await duckdb(
          `SELECT * FROM trex_devx_process_status('${escapeSql(processId)}', '')`
        ));

        if (statusResult.status === "stopped") {
          entry.status = "stopped";
          entry.processId = null;
          this.releasePort(entry);
          this.emit(entry, {
            type: "status_change",
            data: "Process exited",
            timestamp: Date.now(),
          });
          return; // Stop polling
        }

        // Use Rust-side status/URL detection (it reads stdout directly)
        if (entry.status === "starting") {
          console.log(`[devx] process status: ${JSON.stringify(statusResult)}`);
        }
        if (statusResult.status === "running" && entry.status === "starting") {
          entry.status = "running";
          if (statusResult.url && !entry.detectedUrl) {
            entry.detectedUrl = statusResult.url;
          }
          this.emit(entry, { type: "status_change", data: "running", timestamp: Date.now() });
        }

        // Robust readiness fallback: if the allocated port is actually accepting
        // connections, the dev server IS up — regardless of what it printed to
        // stdout. Stdout parsing alone misses custom-host URLs, quiet servers,
        // and IPv6-only binds, which is what leaves apps stuck on "starting".
        if (entry.status === "starting" && entry.port > 0 && await this.portInUse(entry.port)) {
          entry.status = "running";
          this.emit(entry, { type: "status_change", data: "running", timestamp: Date.now() });
        }
      } catch (pollErr) {
        console.error("[devx] poll error:", pollErr?.message || pollErr);
      }

      // Schedule next poll
      entry.pollTimer = setTimeout(poll, POLL_INTERVAL_MS) as unknown as number;
    };

    entry.pollTimer = setTimeout(poll, POLL_INTERVAL_MS) as unknown as number;
  }

  stop(userId: string, appId: string): void {
    const k = this.key(userId, appId);
    const entry = this.servers.get(k);

    if (entry) {
      if (entry.pollTimer) {
        clearTimeout(entry.pollTimer);
        entry.pollTimer = undefined;
      }
      entry.processId = null;
      entry.status = "stopped";
      this.releasePort(entry);
      entry.outputBuffer = [];
      this.emit(entry, { type: "status_change", data: "stopped", timestamp: Date.now() });
    }

    // Unregister from trex cluster gossip
    this.unregisterService(appId);

    // Always kill by the deterministic process key (the start path uses k as the
    // processId). This stops leaked dev servers whose in-memory entry was lost
    // across a worker restart or a failed start — otherwise they keep holding
    // their port and block the next Run (vite strictPort). Fire and forget.
    duckdb(
      `SELECT * FROM trex_devx_process_stop('${escapeSql(k)}', '')`
    ).catch(() => { /* already dead */ });
  }

  async getStatus(userId: string, appId: string): Promise<{ status: string; port?: number; url?: string; error?: string }> {
    const k = this.key(userId, appId);
    const entry = this.servers.get(k);

    // Always check Rust process manager for ground truth
    // (edge function workers are ephemeral — in-memory state may be lost)
    try {
      const statusResult = JSON.parse(await duckdb(
        `SELECT * FROM trex_devx_process_status('${escapeSql(k)}', '')`
      ));
      if (statusResult.pid) {
        // Process exists in Rust registry. Rust's own readiness detection can
        // miss custom-host URLs / IPv6-only binds and stay "starting" forever —
        // and this is what the UI badge polls — so treat a bound allocated port
        // as "running" (matching the poll-loop fallback), and never downgrade an
        // entry we already flipped to running.
        const port = statusResult.port || entry?.port;
        let status = statusResult.status;
        if (
          status !== "running" &&
          ((entry && entry.status === "running") ||
            (port && port > 0 && (await this.portInUse(port))))
        ) {
          status = "running";
        }
        if (entry) {
          entry.status = status;
          if (statusResult.url) entry.detectedUrl = statusResult.url;
        }
        return {
          status,
          port,
          url: statusResult.url || entry?.detectedUrl || undefined,
        };
      }
    } catch { /* devx_ext not loaded or query failed */ }

    if (!entry) return { status: "stopped" };
    return {
      status: entry.status,
      port: entry.port,
      url: entry.detectedUrl || undefined,
      error: entry.error,
    };
  }

  getEntry(userId: string, appId: string): DevServerEntry | undefined {
    return this.servers.get(this.key(userId, appId));
  }

  subscribe(userId: string, appId: string, callback: (event: OutputEvent) => void): () => void {
    const k = this.key(userId, appId);
    let entry = this.servers.get(k);
    if (!entry) {
      // Create a placeholder entry so we can subscribe before server starts
      entry = {
        processId: null,
        status: "stopped",
        port: 0,
        portReleased: true,
        outputBuffer: [],
        listeners: new Set(),
        detectedUrl: null,
        lastLineId: 0,
      };
      this.servers.set(k, entry);
    }
    entry.listeners.add(callback);
    return () => {
      entry.listeners.delete(callback);
      // Clean up placeholder entries with no listeners and no process
      if (entry.listeners.size === 0 && !entry.processId) {
        this.servers.delete(k);
      }
    };
  }

  /** Register a dev server as a service in the trex cluster gossip */
  private registerService(appId: string, port: number): void {
    const serviceName = `devx:${appId.slice(0, 8)}`;
    duckdb(
      `SELECT trex_db_register_service('${escapeSql(serviceName)}', 'localhost', ${port})`
    ).catch((err) => {
      console.error("[devx] Failed to register service in gossip:", err?.message || err);
    });
  }

  /** Mark a dev server as stopped in the trex cluster gossip */
  private unregisterService(appId: string): void {
    const serviceName = `devx:${appId.slice(0, 8)}`;
    duckdb(
      `SELECT trex_db_stop_service('${escapeSql(serviceName)}')`
    ).catch((err) => {
      console.error("[devx] Failed to stop service in gossip:", err?.message || err);
    });
  }

  /** Stop all running servers (call on process shutdown) */
  cleanup(): void {
    for (const [k, entry] of this.servers) {
      if (entry.pollTimer) {
        clearTimeout(entry.pollTimer);
      }
      if (entry.processId) {
        // Unregister from gossip
        const appId = k.split(":")[1];
        if (appId) this.unregisterService(appId);
        // Fire and forget — stop via DuckDB
        duckdb(
          `SELECT * FROM trex_devx_process_stop('${escapeSql(entry.processId)}', '')`
        ).catch(() => { /* */ });
      }
      this.releasePort(entry);
    }
    this.servers.clear();
  }
}

export const devServerManager = new DevServerManager();

// Cleanup on shutdown
try {
  Deno.addSignalListener("SIGTERM", () => devServerManager.cleanup());
  Deno.addSignalListener("SIGINT", () => devServerManager.cleanup());
} catch { /* signal listeners may not be available in all environments */ }
