// @ts-nocheck - Deno edge function
/**
 * Figma REST tools: list a file's frames, and pull selected frames into the
 * workspace as PNG mockups + distilled design-spec JSON. The PAT is resolved
 * server-side per call (routes/figma_routes.ts) and never enters model
 * context.
 */
import type { ToolDefinition } from "./types.ts";
import { safeJoin } from "./path_safety.ts";
import { FIGMA_API, getFigmaToken } from "../routes/figma_routes.ts";

/** figma.com/(file|design|proto|board)/<key>/… or a bare file key. ?node-id=12-345 → "12:345". */
export function parseFigmaRef(input: string): { fileKey: string; nodeIds: string[] } {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/figma\.com\/(?:file|design|proto|board)\/([A-Za-z0-9]+)/);
  if (urlMatch) {
    const nodeIds: string[] = [];
    try {
      const nodeParam = new URL(trimmed).searchParams.get("node-id");
      if (nodeParam) nodeIds.push(nodeParam.replace(/-/g, ":"));
    } catch { /* relative or partial URL — no node-id */ }
    return { fileKey: urlMatch[1], nodeIds };
  }
  if (/^[A-Za-z0-9]{8,}$/.test(trimmed)) return { fileKey: trimmed, nodeIds: [] };
  throw new Error(`Not a Figma file URL or file key: "${input}"`);
}

/** "Login / Desktop (v2)" + "12:345" → "login-desktop-v2-12-345" (unique, fs-safe). */
export function frameSlug(name: string, nodeId: string): string {
  const base = (name || "frame").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "frame";
  return `${base}-${nodeId.replace(/[^0-9a-z]+/gi, "-")}`;
}

function colorToHex(c): string {
  const to2 = (v) => Math.round((v ?? 0) * 255).toString(16).padStart(2, "0");
  return `#${to2(c.r)}${to2(c.g)}${to2(c.b)}`;
}

function solidPaints(paints) {
  return (paints || [])
    .filter((p) => p.type === "SOLID" && p.visible !== false && p.color)
    .map((p) => ({ color: colorToHex(p.color), opacity: p.opacity ?? 1 }));
}

/**
 * Distill a /v1/nodes document subtree to the values a coder implements
 * against (boxes, colors, radii, auto-layout, text + fonts). Drops vector
 * geometry, effects, and invisible nodes — keeps specs in the low-KB range
 * instead of the raw multi-MB tree.
 */
export function distillNode(node) {
  if (!node || node.visible === false) return null;
  const out: Record<string, unknown> = { name: node.name, type: node.type };
  if (node.absoluteBoundingBox) {
    const b = node.absoluteBoundingBox;
    out.box = { x: b.x, y: b.y, w: b.width, h: b.height };
  }
  const fills = solidPaints(node.fills);
  if (fills.length) out.fills = fills;
  const strokes = solidPaints(node.strokes);
  if (strokes.length) {
    out.strokes = strokes;
    if (node.strokeWeight != null) out.strokeWeight = node.strokeWeight;
  }
  if (node.cornerRadius) out.cornerRadius = node.cornerRadius;
  if (node.layoutMode && node.layoutMode !== "NONE") {
    out.layout = {
      mode: node.layoutMode,
      padding: [node.paddingTop ?? 0, node.paddingRight ?? 0, node.paddingBottom ?? 0, node.paddingLeft ?? 0],
      gap: node.itemSpacing ?? 0,
    };
  }
  if (node.type === "TEXT") {
    out.text = node.characters ?? "";
    const s = node.style || {};
    out.font = {
      family: s.fontFamily ?? null,
      size: s.fontSize ?? null,
      weight: s.fontWeight ?? null,
      lineHeight: s.lineHeightPx ?? null,
    };
  }
  const children = (node.children || []).map(distillNode).filter(Boolean);
  if (children.length) out.children = children;
  return out;
}

async function figmaFetch(ctx, apiPath: string) {
  const token = await getFigmaToken(ctx.userId, ctx.sql);
  if (!token) {
    throw new Error("Figma is not connected — paste a personal access token in Settings → Figma.");
  }
  const resp = await fetch(`${FIGMA_API}${apiPath}`, { headers: { "X-Figma-Token": token } });
  if (resp.status === 403) throw new Error("Figma token invalid or revoked — reconnect in Settings → Figma.");
  if (resp.status === 404) {
    throw new Error("Figma file not found — check the URL, and that the connected account can open it.");
  }
  if (resp.status === 429) throw new Error("Figma rate limit hit — wait a minute and retry.");
  if (!resp.ok) throw new Error(`Figma API error ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  return await resp.json();
}

export const figmaListFramesTool: ToolDefinition<{ url: string }> = {
  name: "FigmaListFrames",
  description:
    "List the pages and top-level frames of a Figma file (id, name, size) so specific frames can be pulled with FigmaPullMockups. Accepts a figma.com file/design URL or a bare file key.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "Figma URL (figma.com/design/… or /file/…) or bare file key" },
    },
    required: ["url"],
  },
  defaultConsent: "always",
  async execute(args, ctx) {
    const { fileKey } = parseFigmaRef(args.url);
    const data = await figmaFetch(ctx, `/v1/files/${fileKey}?depth=2`);
    const lines = [`File: ${data.name} (key: ${fileKey})`];
    for (const page of data.document?.children || []) {
      lines.push(`\nPage: ${page.name}`);
      for (const frame of page.children || []) {
        const b = frame.absoluteBoundingBox;
        const size = b ? `  ${Math.round(b.width)}x${Math.round(b.height)}` : "";
        lines.push(`  ${frame.id}  ${frame.name}${size}`);
      }
    }
    lines.push("\nUse FigmaPullMockups with the node ids of the relevant frames.");
    return lines.join("\n");
  },
};

export const figmaPullMockupsTool: ToolDefinition<{ url: string; nodeIds?: string[] }> = {
  name: "FigmaPullMockups",
  description:
    "Export Figma frames into the workspace as PNG mockups (figma/<slug>.png, 2x) plus a distilled design-spec JSON (figma/<slug>.spec.json with exact colors, fonts, spacing). Frames come from nodeIds (see FigmaListFrames) or the URL's ?node-id=….",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "Figma URL or file key; a ?node-id=… URL selects that frame" },
      nodeIds: {
        type: "array",
        items: { type: "string" },
        description: "Frame node ids like 12:345 (12-345 also accepted). Optional when the URL carries ?node-id=…",
      },
    },
    required: ["url"],
  },
  defaultConsent: "ask",
  modifiesState: true,
  getConsentPreview(args) {
    const n = args.nodeIds?.length;
    return `Pull Figma mockups into figma/${n ? ` (${n} frame${n === 1 ? "" : "s"})` : ""}`;
  },
  async execute(args, ctx) {
    const ref = parseFigmaRef(args.url);
    const ids = (args.nodeIds?.length ? args.nodeIds : ref.nodeIds).map((id) => id.trim().replace(/-/g, ":"));
    if (!ids.length) {
      throw new Error("No frames selected — pass nodeIds (use FigmaListFrames first) or a URL with ?node-id=….");
    }
    const idsParam = encodeURIComponent(ids.join(","));
    const [images, nodes] = await Promise.all([
      figmaFetch(ctx, `/v1/images/${ref.fileKey}?ids=${idsParam}&format=png&scale=2`),
      figmaFetch(ctx, `/v1/nodes/${ref.fileKey}?ids=${idsParam}`),
    ]);
    if (images.err) throw new Error(`Figma image render failed: ${images.err}`);

    await Deno.mkdir(safeJoin(ctx.workspacePath, "figma"), { recursive: true });
    const saved: string[] = [];
    const failed: string[] = [];
    for (const id of ids) {
      const doc = nodes.nodes?.[id]?.document;
      const slug = frameSlug(doc?.name, id);
      const imageUrl = images.images?.[id];
      if (!imageUrl) {
        failed.push(id);
        continue;
      }
      const png = await fetch(imageUrl);
      if (!png.ok) {
        failed.push(id);
        continue;
      }
      await Deno.writeFile(
        safeJoin(ctx.workspacePath, "figma", `${slug}.png`),
        new Uint8Array(await png.arrayBuffer()),
      );
      let line = `figma/${slug}.png`;
      const spec = doc ? distillNode(doc) : null;
      if (spec) {
        await Deno.writeTextFile(
          safeJoin(ctx.workspacePath, "figma", `${slug}.spec.json`),
          JSON.stringify(spec, null, 2),
        );
        line += ` + figma/${slug}.spec.json`;
      }
      saved.push(line);
    }
    if (!saved.length) {
      throw new Error(
        `Figma could not render any of the requested frames (${failed.join(", ")}) — are the node ids frames in this file?`,
      );
    }
    let result = `Saved:\n${saved.join("\n")}\n\nView the PNGs with the read tool; use the .spec.json files for exact colors/fonts/spacing.`;
    if (failed.length) result += `\n\nFailed to render: ${failed.join(", ")}`;
    return result;
  },
};
