import { assertEquals } from "jsr:@std/assert";
import { collectNavEntries, mergeNav } from "./nav.ts";

const entry = (name: string, nav: unknown) =>
  [
    name,
    { trexConfig: nav === undefined ? { ui: {} } : { ui: { nav } } },
  ] as const;

Deno.test("collectNavEntries emits declared nav, keyed by short name", () => {
  const registry = new Map([
    entry("aithon", { path: "/aithon", label: "Aithon" }),
  ]);
  assertEquals(collectNavEntries(registry), [
    { path: "/aithon", label: "Aithon", plugin: "aithon" },
  ]);
});

Deno.test("collectNavEntries skips plugins without a nav declaration", () => {
  const registry = new Map<string, { trexConfig?: unknown }>([
    entry("web", undefined),
    ["fhir", { trexConfig: undefined }],
    entry("aithon", { path: "/aithon", label: "Aithon" }),
  ]);
  assertEquals(collectNavEntries(registry).map((e) => e.plugin), ["aithon"]);
});

Deno.test("collectNavEntries drops malformed nav declarations", () => {
  const registry = new Map([
    entry("a", { path: "/a" }),
    entry("b", { label: "B" }),
    entry("c", { path: 1, label: "C" }),
    entry("d", "nope"),
    entry("e", null),
  ]);
  assertEquals(collectNavEntries(registry), []);
});

Deno.test("collectNavEntries sorts by plugin name for a stable nav order", () => {
  const registry = new Map([
    entry("zulu", { path: "/zulu", label: "Zulu" }),
    entry("alpha", { path: "/alpha", label: "Alpha" }),
  ]);
  assertEquals(collectNavEntries(registry).map((e) => e.plugin), [
    "alpha",
    "zulu",
  ]);
});

Deno.test("mergeNav lets an env entry override a declared path", () => {
  const declared = [{ path: "/aithon", label: "Aithon", plugin: "aithon" }];
  const env = [{ path: "/aithon", label: "Analytics", plugin: "aithon" }];
  assertEquals(mergeNav(declared, env), [
    { path: "/aithon", label: "Analytics", plugin: "aithon" },
  ]);
});

Deno.test("mergeNav appends env-only entries after declared ones", () => {
  const declared = [{ path: "/aithon", label: "Aithon", plugin: "aithon" }];
  const env = [{ path: "/devx", label: "Code", plugin: "devx" }];
  assertEquals(mergeNav(declared, env), [
    { path: "/aithon", label: "Aithon", plugin: "aithon" },
    { path: "/devx", label: "Code", plugin: "devx" },
  ]);
});

Deno.test("mergeNav ignores malformed env entries", () => {
  const declared = [{ path: "/aithon", label: "Aithon", plugin: "aithon" }];
  const env = [
    { path: "/devx" },
    null,
    "x",
    { path: "/d", label: "D", plugin: 2 },
  ];
  assertEquals(mergeNav(declared, env), declared);
});
