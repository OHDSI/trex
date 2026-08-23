// deno test --no-check --allow-all plugins/devx/functions/tools/figma.test.ts
//
// Pure-helper coverage for the Figma tools: URL/file-key/node-id parsing
// against real figma.com URL shapes, slug generation, and the spec
// distillation that turns a /v1/nodes document subtree into the compact
// design values a coder implements against.
import { assert, assertEquals, assertThrows } from "jsr:@std/assert";
import { distillNode, frameSlug, parseFigmaRef } from "./figma.ts";

Deno.test("parseFigmaRef handles design/file/proto URLs and node-id", () => {
  assertEquals(
    parseFigmaRef("https://www.figma.com/design/AbC123xyz/My-App?node-id=12-345&t=q"),
    { fileKey: "AbC123xyz", nodeIds: ["12:345"] },
  );
  assertEquals(
    parseFigmaRef("https://www.figma.com/file/AbC123xyz/My-App"),
    { fileKey: "AbC123xyz", nodeIds: [] },
  );
  assertEquals(parseFigmaRef("https://www.figma.com/proto/K9/Flow").fileKey, "K9");
  // bare file key passes through
  assertEquals(parseFigmaRef("AbC123xyz42"), { fileKey: "AbC123xyz42", nodeIds: [] });
  assertThrows(() => parseFigmaRef("https://example.com/nope"), Error, "Figma");
});

Deno.test("frameSlug is filesystem-safe and unique per node", () => {
  assertEquals(frameSlug("Login / Desktop (v2)", "12:345"), "login-desktop-v2-12-345");
  assertEquals(frameSlug("", "1:2"), "frame-1-2");
});

Deno.test("distillNode keeps design values, drops geometry, recurses", () => {
  const spec = distillNode({
    name: "Card",
    type: "FRAME",
    absoluteBoundingBox: { x: 0, y: 0, width: 320, height: 200 },
    fills: [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }],
    strokes: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity: 0.1 }],
    strokeWeight: 1,
    cornerRadius: 8,
    layoutMode: "VERTICAL",
    paddingTop: 16,
    paddingRight: 16,
    paddingBottom: 16,
    paddingLeft: 16,
    itemSpacing: 8,
    fillGeometry: [{ path: "M0 0L1 1" }], // must be dropped
    children: [
      {
        name: "Title",
        type: "TEXT",
        characters: "Hello",
        style: { fontFamily: "Inter", fontSize: 16, fontWeight: 600, lineHeightPx: 24 },
        fills: [{
          type: "SOLID",
          color: { r: 0.06666666666666667, g: 0.06666666666666667, b: 0.06666666666666667 },
        }],
      },
      { name: "hidden", type: "RECTANGLE", visible: false },
    ],
  });
  assertEquals(spec.box, { x: 0, y: 0, w: 320, h: 200 });
  assertEquals(spec.fills, [{ color: "#ffffff", opacity: 1 }]);
  assertEquals(spec.strokes, [{ color: "#000000", opacity: 0.1 }]);
  assertEquals(spec.cornerRadius, 8);
  assertEquals(spec.layout, { mode: "VERTICAL", padding: [16, 16, 16, 16], gap: 8 });
  assertEquals(spec.children.length, 1, "invisible children are dropped");
  const title = spec.children[0];
  assertEquals(title.text, "Hello");
  assertEquals(title.font, { family: "Inter", size: 16, weight: 600, lineHeight: 24 });
  assertEquals(title.fills, [{ color: "#111111", opacity: 1 }]);
  assert(!("fillGeometry" in spec), "vector geometry must not survive");
});

Deno.test("distillNode returns null for invisible nodes", () => {
  assertEquals(distillNode({ name: "x", type: "FRAME", visible: false }), null);
});
