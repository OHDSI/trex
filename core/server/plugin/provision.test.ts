import { assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert";
import {
  collectProvisionTargets,
  isTrustedProvisionScope,
  runProvisionTargets,
} from "./provision.ts";

/** Write a plugin dir with a package.json and (optionally) its module. */
async function plugin(
  root: string,
  name: string,
  trex: unknown,
  module?: string,
): Promise<void> {
  const dir = `${root}/${name.split("/").pop()}`;
  await Deno.mkdir(dir, { recursive: true });
  await Deno.writeTextFile(
    `${dir}/package.json`,
    JSON.stringify({ name, version: "0.0.1", trex }),
  );
  if (module !== undefined) await Deno.writeTextFile(`${dir}/index.ts`, module);
}

async function withRoot(fn: (root: string) => Promise<void>): Promise<void> {
  const root = await Deno.makeTempDir();
  try {
    await fn(root);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
}

Deno.test("isTrustedProvisionScope admits the d2e scope, rejects the rest", () => {
  assertEquals(isTrustedProvisionScope("@data2evidence/d2e-bootstrap"), true);
  assertEquals(isTrustedProvisionScope("@ohdsi/x"), true);
  assertEquals(isTrustedProvisionScope("@trex/x"), true);
  assertEquals(isTrustedProvisionScope("@evil/x"), false);
  assertEquals(isTrustedProvisionScope("plain"), false);
});

Deno.test("collects a declared provision module", async () => {
  await withRoot(async (root) => {
    await plugin(root, "@data2evidence/d2e-bootstrap", {
      provision: { module: "./index.ts" },
    }, "export default () => 0;");
    const targets = await collectProvisionTargets([root]);
    assertEquals(targets.length, 1);
    assertEquals(targets[0].name, "@data2evidence/d2e-bootstrap");
    assertStringIncludes(targets[0].path, "/d2e-bootstrap/index.ts");
  });
});

Deno.test("skips plugins without a trex.provision declaration", async () => {
  await withRoot(async (root) => {
    await plugin(root, "@data2evidence/other", { migrations: { schema: "x" } });
    assertEquals((await collectProvisionTargets([root])).length, 0);
  });
});

Deno.test("skips an untrusted scope — provisioning runs as the superuser", async () => {
  await withRoot(async (root) => {
    await plugin(root, "@evil/pwn", { provision: { module: "./index.ts" } }, "export default () => 0;");
    assertEquals((await collectProvisionTargets([root])).length, 0);
  });
});

Deno.test("rejects a module path that escapes the plugin directory", async () => {
  await withRoot(async (root) => {
    await plugin(root, "@data2evidence/a", { provision: { module: "../../etc/x.ts" } });
    await plugin(root, "@data2evidence/b", { provision: { module: "/etc/x.ts" } });
    assertEquals((await collectProvisionTargets([root])).length, 0);
  });
});

Deno.test("dev paths win — the same plugin name is collected once", async () => {
  await withRoot(async (root) => {
    const dev = `${root}/dev`, npm = `${root}/npm`;
    await plugin(dev, "@data2evidence/d2e-bootstrap", { provision: { module: "./index.ts" } }, "export default () => 1;");
    await plugin(npm, "@data2evidence/d2e-bootstrap", { provision: { module: "./index.ts" } }, "export default () => 2;");
    const targets = await collectProvisionTargets([dev, npm]);
    assertEquals(targets.length, 1);
    assertStringIncludes(targets[0].path, "/dev/");
  });
});

Deno.test("runs the module with the exec context and sums applied statements", async () => {
  await withRoot(async (root) => {
    await plugin(root, "@data2evidence/d2e-bootstrap", { provision: { module: "./index.ts" } }, `
export default async ({ exec, env }) => {
  await exec("SELECT " + env.MARKER);
  return 1;
};
`);
    const seen: string[] = [];
    const applied = await runProvisionTargets(await collectProvisionTargets([root]), {
      exec: (sql) => {
        seen.push(sql);
        return Promise.resolve(null);
      },
      env: { MARKER: "42" },
    });
    assertEquals(applied, 1);
    assertEquals(seen, ["SELECT 42"]);
  });
});

Deno.test("a module failure propagates — provisioning is fatal at the call site", async () => {
  await withRoot(async (root) => {
    await plugin(root, "@data2evidence/d2e-bootstrap", { provision: { module: "./index.ts" } }, `
export default () => { throw new Error("boom"); };
`);
    const targets = await collectProvisionTargets([root]);
    await assertRejects(
      () => runProvisionTargets(targets, { exec: () => Promise.resolve(null), env: {} }),
      Error,
      "boom",
    );
  });
});

Deno.test("a module without a default export is rejected", async () => {
  await withRoot(async (root) => {
    await plugin(root, "@data2evidence/d2e-bootstrap", { provision: { module: "./index.ts" } }, "export const x = 1;");
    const targets = await collectProvisionTargets([root]);
    await assertRejects(
      () => runProvisionTargets(targets, { exec: () => Promise.resolve(null), env: {} }),
      Error,
      "no default-exported function",
    );
  });
});

// ── Call site ───────────────────────────────────────────────────────────────
// Provisioning is documented as FATAL on failure and must precede plugin init.
// It was originally called inside index.ts's plugin-init try/catch, which logged
// and carried on to server.listen — leaving trex healthy against an
// unprovisioned database. Asserted structurally because the alternative (booting
// the real server) is not testable in-process.
const INDEX_SRC = Deno.readTextFileSync(new URL("../index.ts", import.meta.url));

Deno.test("provision targets are collected and run once, before plugin init", () => {
  assertEquals((INDEX_SRC.match(/await collectProvisionTargets\(/g) ?? []).length, 1);
  assertEquals((INDEX_SRC.match(/await runProvisionTargets\(/g) ?? []).length, 1);
  const call = INDEX_SRC.indexOf("await collectProvisionTargets(");
  assertEquals(call < INDEX_SRC.indexOf("await Plugins.initPlugins(app)"), true);
  assertEquals(call < INDEX_SRC.indexOf("server.listen(8000"), true);
});

Deno.test("the provision call sits outside the plugin-init try/catch", () => {
  const call = INDEX_SRC.indexOf("await collectProvisionTargets(");
  // First statement inside the plugin-init try block.
  const pluginTryBody = INDEX_SRC.indexOf("The studio SPA is served entirely");
  const pluginCatch = INDEX_SRC.indexOf('console.error("Plugin system failed to initialize:"');
  assertEquals(call < pluginTryBody, true, "provision call is inside the plugin-init try block");
  assertEquals(pluginTryBody < pluginCatch, true);
});

Deno.test("a provisioning failure aborts boot instead of being logged and swallowed", () => {
  const call = INDEX_SRC.indexOf("await collectProvisionTargets(");
  const handler = INDEX_SRC.slice(call, call + 900);
  assertStringIncludes(handler, "FATAL");
  assertStringIncludes(handler, "Deno.exit(1)");
  assertStringIncludes(handler, "throw err");
});

Deno.test("a d2e without its provision plugin is refused, not silently skipped", () => {
  const call = INDEX_SRC.indexOf("await collectProvisionTargets(");
  assertStringIncludes(INDEX_SRC.slice(call, call + 900), "assertD2eProvisioned(");
});
