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
const ALLOWED_COMMAND_PREFIXES = ["npm", "npx", "yarn", "pnpm", "node", "deno", "bun", "echo"];

/** Validate that a command starts with an allowed prefix */
function validateCommand(command: string): void {
  const firstWord = command.trim().split(/\s+/)[0];
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
      // Check if the port is actually free (handles stale processes from restarts)
      try {
        const conn = await Deno.connect({ hostname: "127.0.0.1", port });
        conn.close();
        // Port is in use — skip it
        continue;
      } catch {
        // Connection refused = port is free
        allocatedPorts.add(port);
        return port;
      }
    }
    throw new Error("No available ports");
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
  ): Promise<{ status: string; port?: number }> {
    // Validate commands before execution
    validateCommand(devCommand);
    validateCommand(installCommand);

    const k = this.key(userId, appId);
    const existing = this.servers.get(k);
    if (existing && (existing.status === "running" || existing.status === "starting")) {
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
      await Deno.stat(`${appPath}/node_modules`);
    } catch {
      this.emit(entry, { type: "stdout", data: `Running: ${installCommand}`, timestamp: Date.now() });
      try {
        const result = JSON.parse(await duckdb(
          `SELECT * FROM trex_devx_run_command('${escapeSql(appPath)}', '${escapeSql(installCommand)}')`
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
      let finalCommand = devCommand;
      if (/\bnpm run\b/.test(devCommand)) {
        finalCommand = `${devCommand} -- --port ${port} --base ${proxyBase}`;
      } else if (/\bnpx serve\b/.test(devCommand)) {
        finalCommand = `${devCommand} -l ${port}`;
      }
      const configJson = JSON.stringify({
        path: appPath,
        command: finalCommand,
        port,
      });
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

            // Detect URL from output
            const urlMatch = clean.match(/https?:\/\/localhost:(\d+)/);
            if (urlMatch && !entry.detectedUrl) {
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
    if (!entry) return;

    // Clear polling timer
    if (entry.pollTimer) {
      clearTimeout(entry.pollTimer);
      entry.pollTimer = undefined;
    }

    if (!entry.processId) {
      // No running process — clean up the entry entirely
      this.servers.delete(k);
      return;
    }

    const processId = entry.processId;
    entry.processId = null;
    entry.status = "stopped";
    this.releasePort(entry);
    entry.outputBuffer = [];
    this.emit(entry, { type: "status_change", data: "stopped", timestamp: Date.now() });

    // Unregister from trex cluster gossip
    this.unregisterService(appId);

    // Stop via DuckDB (fire and forget)
    duckdb(
      `SELECT * FROM trex_devx_process_stop('${escapeSql(processId)}', '')`
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
        // Process exists in Rust registry
        if (entry) {
          entry.status = statusResult.status === "running" ? "running" : statusResult.status;
          if (statusResult.url) entry.detectedUrl = statusResult.url;
        }
        return {
          status: statusResult.status,
          port: statusResult.port || entry?.port,
          url: statusResult.url || undefined,
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
