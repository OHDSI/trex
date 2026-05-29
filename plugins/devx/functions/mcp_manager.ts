// @ts-nocheck - Deno edge function
/**
 * MCP client manager — lazily connects to MCP servers, caches clients and tools.
 */

import { Client } from "npm:@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "npm:@modelcontextprotocol/sdk/client/stdio.js";

interface McpServerConfig {
  name: string;
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

interface McpToolDef {
  serverName: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface McpClientEntry {
  client: any;
  transport: any;
  lastUsed: number;
}

class McpManager {
  private clients = new Map<string, McpClientEntry>();
  private toolCaches = new Map<string, McpToolDef[]>();

  private key(userId: string, serverName: string): string {
    return `${userId}:${serverName}`;
  }

  private static ALLOWED_MCP_COMMANDS = new Set(["npx", "node", "python", "python3", "uvx", "deno", "bun"]);

  private async connectClient(config: McpServerConfig): Promise<any> {
    if (config.transport === "stdio") {
      if (!config.command) throw new Error(`MCP server "${config.name}" has no command`);
      // Validate command against allowlist
      const cmdBase = config.command.split("/").pop()!.split("\\").pop()!;
      if (!McpManager.ALLOWED_MCP_COMMANDS.has(cmdBase)) {
        throw new Error(`MCP command not permitted: "${config.command}". Allowed: ${[...McpManager.ALLOWED_MCP_COMMANDS].join(", ")}`);
      }
      const args = config.args || [];
      // Don't inherit full server env — only pass explicitly configured env vars
      const transport = new StdioClientTransport({
        command: config.command,
        args,
        env: config.env || undefined,
      });
      const client = new Client({ name: "devx", version: "1.0.0" }, { capabilities: {} });
      await client.connect(transport);
      return { client, transport };
    }

    if (config.transport === "http") {
      if (!config.url) throw new Error(`MCP server "${config.name}" has no URL`);
      // For HTTP/SSE MCP servers, use SSEClientTransport
      const { SSEClientTransport } = await import("npm:@modelcontextprotocol/sdk/client/sse.js");
      const transport = new SSEClientTransport(new URL(config.url), {
        requestInit: { headers: config.headers || {} },
      });
      const client = new Client({ name: "devx", version: "1.0.0" }, { capabilities: {} });
      await client.connect(transport);
      return { client, transport };
    }

    throw new Error(`Unknown transport: ${config.transport}`);
  }

  async getTools(userId: string, serverConfigs: McpServerConfig[]): Promise<McpToolDef[]> {
    const allTools: McpToolDef[] = [];

    for (const config of serverConfigs) {
      const k = this.key(userId, config.name);

      // Check cache
      if (this.toolCaches.has(k)) {
        allTools.push(...this.toolCaches.get(k)!);
        const entry = this.clients.get(k);
        if (entry) entry.lastUsed = Date.now();
        continue;
      }

      // Connect and discover
      try {
        let entry = this.clients.get(k);
        if (!entry) {
          const { client, transport } = await this.connectClient(config);
          entry = { client, transport, lastUsed: Date.now() };
          this.clients.set(k, entry);
        }

        const result = await entry.client.listTools();
        const tools: McpToolDef[] = (result.tools || []).map((t) => ({
          serverName: config.name,
          name: t.name,
          description: t.description || "",
          inputSchema: t.inputSchema || { type: "object", properties: {} },
        }));

        this.toolCaches.set(k, tools);
        allTools.push(...tools);
      } catch (err) {
        console.error(`MCP connect error (${config.name}):`, err.message);
        // Skip this server, don't block other tools
      }
    }

    return allTools;
  }

  async executeTool(
    userId: string,
    serverName: string,
    toolName: string,
    args: unknown,
  ): Promise<string> {
    const k = this.key(userId, serverName);
    const entry = this.clients.get(k);
    if (!entry) {
      throw new Error(`MCP server "${serverName}" not connected`);
    }
    entry.lastUsed = Date.now();

    const result = await entry.client.callTool({ name: toolName, arguments: args });

    // Format result — MCP returns content array
    if (result.content && Array.isArray(result.content)) {
      return result.content
        .map((c) => (c.type === "text" ? c.text : JSON.stringify(c)))
        .join("\n");
    }
    return JSON.stringify(result);
  }

  disconnect(userId: string, serverName?: string): void {
    if (serverName) {
      const k = this.key(userId, serverName);
      const entry = this.clients.get(k);
      if (entry) {
        try { entry.client.close(); } catch { /* */ }
        this.clients.delete(k);
        this.toolCaches.delete(k);
      }
    } else {
      // Disconnect all for user — collect keys first to avoid mutation during iteration
      const toDelete = [...this.clients.keys()].filter((k) => k.startsWith(`${userId}:`));
      for (const k of toDelete) {
        const entry = this.clients.get(k);
        if (entry) {
          try { entry.client.close(); } catch { /* */ }
        }
        this.clients.delete(k);
        this.toolCaches.delete(k);
      }
    }
  }

  cleanup(): void {
    for (const [, entry] of this.clients) {
      try { entry.client.close(); } catch { /* */ }
    }
    this.clients.clear();
    this.toolCaches.clear();
  }
}

export const mcpManager = new McpManager();
