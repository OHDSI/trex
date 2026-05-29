// @ts-nocheck - Deno edge function
// Feasibility test: can Supabase Storage run inside the trex Deno edge runtime?

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (url.pathname.endsWith("/health")) {
    const results: Record<string, string> = {};

    // Test 1: Can we import the storage config?
    try {
      const _config = await import("../supabase-storage/dist/config.js");
      results["1_config"] = "ok";
    } catch (e) {
      results["1_config"] = `FAIL: ${e.message}`;
    }

    // Test 2: Can we import knex?
    try {
      const _knex = await import("knex");
      results["2_knex"] = "ok";
    } catch (e) {
      results["2_knex"] = `FAIL: ${e.message}`;
    }

    // Test 3: Can we import fastify?
    try {
      const _fastify = await import("fastify");
      results["3_fastify"] = "ok";
    } catch (e) {
      results["3_fastify"] = `FAIL: ${e.message}`;
    }

    // Test 4: Can we import the storage backend?
    try {
      const _backend = await import("../supabase-storage/dist/storage/backend/index.js");
      results["4_backend"] = "ok";
    } catch (e) {
      results["4_backend"] = `FAIL: ${e.message}`;
    }

    // Test 5: Can we import the app builder?
    try {
      const _app = await import("../supabase-storage/dist/app.js");
      results["5_app_import"] = "ok";
    } catch (e) {
      results["5_app_import"] = `FAIL: ${e.message}`;
    }

    // Test 6: Can we actually build the Fastify app?
    try {
      const { default: build } = await import("../supabase-storage/dist/app.js");
      const app = build({ logger: false });
      results["6_app_build"] = "ok";
      // Clean up
      await app.close();
    } catch (e) {
      results["6_app_build"] = `FAIL: ${e.message}`;
    }

    return new Response(JSON.stringify({ status: "feasibility-test", runtime: "deno-edge", results }, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
