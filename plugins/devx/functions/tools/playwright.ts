// @ts-nocheck - Deno edge function
/**
 * Playwright browser tools for QA testing and design review.
 * Each tool invokes playwright_helper.js via trex_devx_run_command.
 *
 * The helper script lives alongside this file at ../playwright_helper.js
 * and is executed via `node <path> <json-command>`.
 */

import type { ToolDefinition, AgentContext } from "./types.ts";
import { duckdb, escapeSql } from "../duckdb.ts";

// Known locations for the helper script (checked in order)
const HELPER_CANDIDATES = [
  "/usr/src/plugins-dev/devx/functions/playwright_helper.js", // Docker
  "/usr/src/plugins/devx/functions/playwright_helper.js",     // Alt Docker layout
];

/**
 * Resolve the absolute path to playwright_helper.js.
 * Checks known Docker paths first, then falls back to import.meta.url resolution.
 */
let _cachedHelperPath: string | null = null;
async function getHelperPath(): Promise<string> {
  if (_cachedHelperPath) return _cachedHelperPath;

  // Check known paths first (reliable in Docker)
  for (const candidate of HELPER_CANDIDATES) {
    try {
      await Deno.stat(candidate);
      _cachedHelperPath = candidate;
      return candidate;
    } catch { /* not found, try next */ }
  }

  // Fallback: resolve from import.meta.url (works in dev)
  try {
    const parentDir = new URL("..", import.meta.url).pathname;
    const fallback = `${parentDir}playwright_helper.js`;
    await Deno.stat(fallback);
    _cachedHelperPath = fallback;
    return fallback;
  } catch { /* not found */ }

  throw new Error("playwright_helper.js not found. Check installation.");
}

/**
 * Run the Playwright helper script with a command.
 *
 * trex_devx_run_command uses Command::new(cmd).args(parts) — no shell interpretation.
 * To pass JSON safely, we write the command to a temp file and use `sh -c` to read it.
 */
async function runPlaywright(
  workspacePath: string,
  action: string,
  params: Record<string, unknown> = {},
): Promise<{ ok: boolean; [key: string]: unknown }> {
  const helperPath = await getHelperPath();
  const cmd = JSON.stringify({ action, params });

  // Write command JSON to a temp file (avoids shell escaping issues)
  const tmpId = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const tmpFile = `/tmp/pw-cmd-${tmpId}.json`;
  await Deno.writeTextFile(tmpFile, cmd);

  try {
    // Write a wrapper shell script that reads the JSON from the temp file
    // and passes it to the helper. This avoids shell escaping issues since
    // trex_devx_run_command splits on whitespace (no shell interpretation).
    const tmpScript = `/tmp/pw-run-${tmpId}.sh`;
    await Deno.writeTextFile(tmpScript, `#!/bin/sh\nnode "${helperPath}" "$(cat "${tmpFile}")"\n`);

    const shellCmd = `sh ${tmpScript}`;
    const json = await duckdb(
      `SELECT * FROM trex_devx_run_command('${escapeSql(workspacePath)}', '${escapeSql(shellCmd)}')`
    );
    const result = JSON.parse(json);
    const output = result.output || "";

    // Find the JSON result line in the output
    const lines = output.trim().split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith("{")) {
        try {
          return JSON.parse(line);
        } catch { /* not valid JSON, try previous line */ }
      }
    }
    return { ok: false, error: `No JSON output from Playwright helper. Output: ${output.slice(0, 500)}` };
  } catch (err) {
    return { ok: false, error: `Playwright execution failed: ${err.message}` };
  } finally {
    // Clean up temp files
    try { await Deno.remove(tmpFile); } catch { /* ignore */ }
    try { await Deno.remove(`/tmp/pw-run-${tmpId}.sh`); } catch { /* ignore */ }
  }
}

// ── browser_navigate ────────────────────────────────────────────────

export const browserNavigateTool: ToolDefinition<{ url: string }> = {
  name: "BrowserNavigate",
  description:
    "Navigate to a URL in the browser and return the page's text content, links, and form elements. Use this to load a page and see what's on it.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL to navigate to (e.g., http://localhost:3001)",
      },
    },
    required: ["url"],
  },
  defaultConsent: "always",
  modifiesState: false,

  async execute(args, ctx) {
    const result = await runPlaywright(ctx.workspacePath, "navigate", { url: args.url });
    if (!result.ok) {
      return `Navigation failed: ${result.error}`;
    }
    let output = `Page: ${result.title} (${result.url})\nStatus: ${result.statusCode}\n\n`;
    output += `--- Page Content ---\n${result.text}\n`;
    if (result.links && (result.links as any[]).length > 0) {
      output += `\n--- Links (${(result.links as any[]).length}) ---\n`;
      for (const link of result.links as any[]) {
        output += `  ${link.text} -> ${link.href}\n`;
      }
    }
    if (result.forms && (result.forms as any[]).length > 0) {
      output += `\n--- Form Elements (${(result.forms as any[]).length}) ---\n`;
      for (const el of result.forms as any[]) {
        const parts = [el.tag];
        if (el.type) parts.push(`type="${el.type}"`);
        if (el.name) parts.push(`name="${el.name}"`);
        if (el.id) parts.push(`id="${el.id}"`);
        if (el.placeholder) parts.push(`placeholder="${el.placeholder}"`);
        if (el.label) parts.push(`label="${el.label}"`);
        output += `  ${parts.join(" ")}\n`;
      }
    }
    return output;
  },
};

// ── browser_click ───────────────────────────────────────────────────

export const browserClickTool: ToolDefinition<{ selector: string; current_url: string }> = {
  name: "BrowserClick",
  description:
    'Click an element on the page by CSS selector or text. Examples: "button.submit", "text=Sign In", "a[href=\\"/about\\"]". Returns the page content after clicking.',
  parameters: {
    type: "object",
    properties: {
      selector: {
        type: "string",
        description: 'CSS selector or Playwright selector (e.g., "text=Submit", "#login-btn", "button.primary")',
      },
      current_url: {
        type: "string",
        description: "The current page URL (from the last navigation or click result)",
      },
    },
    required: ["selector", "current_url"],
  },
  defaultConsent: "always",
  modifiesState: false,

  async execute(args, ctx) {
    const result = await runPlaywright(ctx.workspacePath, "click", {
      selector: args.selector,
      _currentUrl: args.current_url,
    });
    if (!result.ok) {
      return `Click failed: ${result.error}`;
    }
    let output = `Clicked "${args.selector}"\nPage: ${result.title} (${result.url})\n\n`;
    output += `--- Page Content ---\n${result.text}\n`;
    return output;
  },
};

// ── browser_fill ────────────────────────────────────────────────────

export const browserFillTool: ToolDefinition<{ selector: string; value: string; current_url: string }> = {
  name: "BrowserFill",
  description:
    "Fill a form field with a value. Use CSS selectors to target the input element.",
  parameters: {
    type: "object",
    properties: {
      selector: {
        type: "string",
        description: 'CSS selector for the input field (e.g., "#email", "input[name=username]")',
      },
      value: {
        type: "string",
        description: "The value to fill in",
      },
      current_url: {
        type: "string",
        description: "The current page URL",
      },
    },
    required: ["selector", "value", "current_url"],
  },
  defaultConsent: "always",
  modifiesState: false,

  async execute(args, ctx) {
    const result = await runPlaywright(ctx.workspacePath, "fill", {
      selector: args.selector,
      value: args.value,
      _currentUrl: args.current_url,
    });
    if (!result.ok) {
      return `Fill failed: ${result.error}`;
    }
    return `Filled "${args.selector}" with "${args.value}"`;
  },
};

// ── browser_get_text ────────────────────────────────────────────────

export const browserGetTextTool: ToolDefinition<{ current_url: string }> = {
  name: "BrowserGetText",
  description:
    "Get the current page's text content, links, and form elements without navigating. Useful to re-read a page after interactions.",
  parameters: {
    type: "object",
    properties: {
      current_url: {
        type: "string",
        description: "The current page URL",
      },
    },
    required: ["current_url"],
  },
  defaultConsent: "always",
  modifiesState: false,

  async execute(args, ctx) {
    const result = await runPlaywright(ctx.workspacePath, "getText", {
      _currentUrl: args.current_url,
    });
    if (!result.ok) {
      return `Failed to get text: ${result.error}`;
    }
    let output = `Page: ${result.title} (${result.url})\n\n`;
    output += `--- Page Content ---\n${result.text}\n`;
    if (result.links && (result.links as any[]).length > 0) {
      output += `\n--- Links ---\n`;
      for (const link of result.links as any[]) {
        output += `  ${link.text} -> ${link.href}\n`;
      }
    }
    if (result.forms && (result.forms as any[]).length > 0) {
      output += `\n--- Form Elements ---\n`;
      for (const el of result.forms as any[]) {
        const parts = [el.tag];
        if (el.type) parts.push(`type="${el.type}"`);
        if (el.name) parts.push(`name="${el.name}"`);
        if (el.placeholder) parts.push(`placeholder="${el.placeholder}"`);
        output += `  ${parts.join(" ")}\n`;
      }
    }
    return output;
  },
};

// ── browser_screenshot ──────────────────────────────────────────────

export const browserScreenshotTool: ToolDefinition<{ current_url: string; full_page?: boolean }> = {
  name: "BrowserScreenshot",
  description:
    "Capture the current page's visual layout. Returns page text content and computed CSS styles (font sizes, colors, spacing, dimensions) for design analysis.",
  parameters: {
    type: "object",
    properties: {
      current_url: {
        type: "string",
        description: "The current page URL",
      },
      full_page: {
        type: "boolean",
        description: "Whether to capture the full scrollable page (default: false, viewport only)",
      },
    },
    required: ["current_url"],
  },
  defaultConsent: "always",
  modifiesState: false,

  async execute(args, ctx) {
    const result = await runPlaywright(ctx.workspacePath, "screenshot", {
      _currentUrl: args.current_url,
      full_page: args.full_page,
    });
    if (!result.ok) {
      return `Screenshot failed: ${result.error}`;
    }
    // Return page text + computed styles for design analysis.
    // The raw base64 screenshot is omitted from the tool result to avoid
    // wasting context tokens — LLMs receive tool results as text, not images.
    let output = `Screenshot captured: ${result.url} (${result.title})\n\n`;
    output += `--- Page Content ---\n${result.text}\n`;
    if (result.styles && (result.styles as any[]).length > 0) {
      output += `\n--- Computed Styles ---\n`;
      for (const s of result.styles as any[]) {
        output += `  ${s.selector} (${s.tag}): font=${s.fontSize} ${s.fontFamily}, color=${s.color}, bg=${s.backgroundColor}, padding=${s.padding}, margin=${s.margin}, display=${s.display}, size=${s.width}x${s.height}\n`;
      }
    }
    return output;
  },
};

// ── browser_evaluate ────────────────────────────────────────────────

export const browserEvaluateTool: ToolDefinition<{ expression: string; current_url: string }> = {
  name: "BrowserEvaluate",
  description:
    "Execute a JavaScript expression in the browser page context and return the result. Useful for checking console errors, DOM state, or running assertions.",
  parameters: {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description: "JavaScript expression to evaluate (e.g., \"document.querySelectorAll('.error').length\")",
      },
      current_url: {
        type: "string",
        description: "The current page URL",
      },
    },
    required: ["expression", "current_url"],
  },
  defaultConsent: "always",
  modifiesState: false,

  async execute(args, ctx) {
    const result = await runPlaywright(ctx.workspacePath, "evaluate", {
      expression: args.expression,
      _currentUrl: args.current_url,
    });
    if (!result.ok) {
      return `Evaluate failed: ${result.error}`;
    }
    return `Result: ${result.value}`;
  },
};
