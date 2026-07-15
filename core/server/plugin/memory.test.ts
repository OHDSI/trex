import { assertEquals, assertThrows } from "jsr:@std/assert";
import { isTrustedScopeMemoryPlugin, normalizeMemoryValue } from "./memory.ts";

Deno.test("isTrustedScopeMemoryPlugin accepts the trusted scopes and rejects everything else", () => {
  assertEquals(isTrustedScopeMemoryPlugin("@trex/memory-example"), true);
  assertEquals(isTrustedScopeMemoryPlugin("@ohdsi/pythia-memory"), true);
  assertEquals(isTrustedScopeMemoryPlugin("@evil/memory"), false);
  assertEquals(isTrustedScopeMemoryPlugin("unscoped-memory"), false);
  assertEquals(isTrustedScopeMemoryPlugin(""), false);
});

Deno.test("normalizes a git + inline memory", () => {
  const out = normalizeMemoryValue([{
    name: "research",
    sources: [
      {
        name: "clinical-notes",
        repo: "https://x/notes",
        ref: "main",
        dir: "pages/",
      },
      { name: "handbook", dir: "memory/handbook" },
    ],
  }]);
  assertEquals(out[0].name, "research");
  assertEquals(out[0].sources[0].ref, "main");
  assertEquals(out[0].sources[1].repo, undefined);
});

Deno.test("rejects bad memory name", () => {
  assertThrows(() =>
    normalizeMemoryValue([{
      name: "Bad Name",
      sources: [{ name: "s", dir: "d" }],
    }])
  );
});

Deno.test("rejects duplicate source names", () => {
  assertThrows(() =>
    normalizeMemoryValue([{
      name: "m",
      sources: [{ name: "s", dir: "a" }, { name: "s", dir: "b" }],
    }])
  );
});

Deno.test("rejects a source with neither repo nor dir", () => {
  assertThrows(() =>
    normalizeMemoryValue([{ name: "m", sources: [{ name: "s" }] }])
  );
});

// Deviation from the brief (controller decision): a memory name becomes a
// Postgres schema `memory_<name>` interpolated unquoted into DDL, where a
// hyphen is illegal — so memory names use a stricter no-hyphen regex than
// source names, which are namespaces, not schema idents.
Deno.test("rejects a hyphenated memory name (illegal in unquoted schema ident memory_<name>)", () => {
  assertThrows(() =>
    normalizeMemoryValue([{
      name: "clinical-notes",
      sources: [{ name: "s", dir: "d" }],
    }])
  );
});

Deno.test("accepts a hyphenated source name (sources are namespaces, not schema idents)", () => {
  const out = normalizeMemoryValue([{
    name: "research",
    sources: [{ name: "clinical-notes", dir: "d" }],
  }]);
  assertEquals(out[0].sources[0].name, "clinical-notes");
});

Deno.test("git source defaults ref to main", () => {
  const out = normalizeMemoryValue([{
    name: "m",
    sources: [{ name: "s", repo: "https://x/r" }],
  }]);
  assertEquals(out[0].sources[0].ref, "main");
});

Deno.test("normalizeMemoryValue accepts single-object form", () => {
  const out = normalizeMemoryValue({
    name: "m",
    sources: [{ name: "s", dir: "d" }],
  });
  assertEquals(out[0].name, "m");
});
