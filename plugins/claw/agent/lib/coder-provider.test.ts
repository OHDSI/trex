// @ts-nocheck
import { assertEquals } from "jsr:@std/assert";
import { resolveCoderProviderIntent } from "./coder-provider.ts";

const envOf = (map: Record<string, string>) => (k: string) => map[k];

Deno.test("no env set: asserts nothing, so the account's own provider stands", () => {
  assertEquals(resolveCoderProviderIntent(envOf({})), null);
});

Deno.test("empty-string env counts as unset (manifest bakes '' when host var is absent)", () => {
  assertEquals(resolveCoderProviderIntent(envOf({ CLAW_CODER_PROVIDER: "  " })), null);
});

Deno.test("provider only: model is left to the account", () => {
  assertEquals(
    resolveCoderProviderIntent(envOf({ CLAW_CODER_PROVIDER: "openai" })),
    { provider: "openai" },
  );
});

Deno.test("provider and model are both asserted when both are set", () => {
  assertEquals(
    resolveCoderProviderIntent(envOf({ CLAW_CODER_PROVIDER: "openai", CLAW_CODER_MODEL: "gpt-5.1" })),
    { provider: "openai", model: "gpt-5.1" },
  );
});

Deno.test("model without provider is ignored — a model means nothing without its engine", () => {
  assertEquals(resolveCoderProviderIntent(envOf({ CLAW_CODER_MODEL: "gpt-5.1" })), null);
});

// --- assertCoderProvider (code-stream.ts) — the pinned intent actually landing.
// Lives here rather than in code-stream.test.ts because it is the other half of
// resolveCoderProviderIntent above: what claw DOES with the intent it resolved.
// It is called on BOTH transports now (askCodeAgent's eve branch and the legacy
// runCodeTurn), so a pinned provider can no longer be silently ignored.
import { assert, assertRejects } from "jsr:@std/assert";
import { assertCoderProvider } from "./code-stream.ts";

function withFetch<T>(handler: (url: string, init?: RequestInit) => Response, body: () => Promise<T>): Promise<T> {
  const real = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init))) as typeof fetch;
  return body().finally(() => {
    globalThis.fetch = real;
  });
}

Deno.test("nothing pinned: no token is minted and the settings API is never called", async () => {
  await withFetch(
    () => {
      throw new Error("must not touch the settings API when nothing is pinned");
    },
    () =>
      assertCoderProvider("u1", {
        env: envOf({}),
        mint: () => {
          throw new Error("must not mint a token when nothing is pinned");
        },
      }),
  );
});

Deno.test("a pinned provider is written to the coder account's settings", async () => {
  const puts: { url: string; body: unknown }[] = [];
  await withFetch(
    (url, init) => {
      if (init?.method === "PUT") {
        puts.push({ url, body: JSON.parse(String(init.body)) });
        return new Response("{}", { status: 200 });
      }
      return Response.json({ provider: "anthropic", model: "claude-x" });
    },
    () =>
      assertCoderProvider("u1", {
        env: envOf({ CLAW_CODER_PROVIDER: "openai", CLAW_CODER_MODEL: "gpt-5.1" }),
        mint: () => Promise.resolve("tok"),
      }),
  );
  assert(puts.length === 1, "expected the pinned provider to be PUT to devx settings");
  assertEquals((puts[0].body as { provider: string; model: string }).provider, "openai");
  assertEquals((puts[0].body as { provider: string; model: string }).model, "gpt-5.1");
});

Deno.test("a pinned provider with no model resolvable anywhere still fails loudly", async () => {
  await withFetch(
    () => Response.json({}),
    () =>
      assertRejects(
        () =>
          assertCoderProvider("u1", {
            env: envOf({ CLAW_CODER_PROVIDER: "openai" }),
            mint: () => Promise.resolve("tok"),
          }),
        Error,
        "CLAW_CODER_MODEL",
      ),
  );
});
