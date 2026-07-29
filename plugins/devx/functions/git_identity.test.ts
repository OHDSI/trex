// deno test --allow-all plugins/devx/functions/git_identity.test.ts
// Pure-function coverage: config rendering + quoting. The DB/duckdb-backed
// paths (ensureGitConfig etc.) need a live stack and are covered by the
// end-to-end verification instead.
import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { materializeSigningKey, renderGitConfig, signingKeyPath } from "./git_identity.ts";
import { encryptToken } from "./crypto.ts";

Deno.test("renderGitConfig: identity only (no signing block when no key)", () => {
  const out = renderGitConfig({ name: "DevX", email: "devx@trex.local" }, null);
  assertStringIncludes(out, '\tname = "DevX"');
  assertStringIncludes(out, '\temail = "devx@trex.local"');
  assertEquals(out.includes("gpgsign"), false);
  assertEquals(out.includes("signingkey"), false);
});

Deno.test("renderGitConfig: full signing block", () => {
  const out = renderGitConfig(
    { name: "Jane Doe", email: "jane@example.com" },
    { keyPath: "/tmp/devx-workspaces/u1/.gitkeys/signing_key", signersPath: "/tmp/devx-workspaces/u1/.gitkeys/allowed_signers" },
  );
  assertStringIncludes(out, '\tname = "Jane Doe"');
  assertStringIncludes(out, '\tsigningkey = "/tmp/devx-workspaces/u1/.gitkeys/signing_key"');
  assertStringIncludes(out, "[commit]\n\tgpgsign = true");
  assertStringIncludes(out, "[gpg]\n\tformat = ssh");
  assertStringIncludes(out, '[gpg "ssh"]\n\tallowedSignersFile = "/tmp/devx-workspaces/u1/.gitkeys/allowed_signers"');
});

Deno.test("renderGitConfig: quotes and backslashes in names are escaped", () => {
  const out = renderGitConfig({ name: 'Jane "JD" O\\Brien', email: "jane@example.com" }, null);
  assertStringIncludes(out, '\tname = "Jane \\"JD\\" O\\\\Brien"');
});

Deno.test("renderGitConfig: output is parseable by real git config", async () => {
  let gitAvailable = true;
  try {
    await new Deno.Command("git", { args: ["--version"], stdout: "null", stderr: "null" }).output();
  } catch {
    gitAvailable = false;
  }
  if (!gitAvailable) return;

  const dir = await Deno.makeTempDir();
  try {
    const file = `${dir}/devx.gitconfig`;
    await Deno.writeTextFile(
      file,
      renderGitConfig(
        { name: 'Jane "JD" Doe', email: "jane@example.com" },
        { keyPath: `${dir}/signing_key`, signersPath: `${dir}/allowed_signers` },
      ),
    );
    const out = await new Deno.Command("git", {
      args: ["config", "--file", file, "--get", "user.name"],
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (!out.success) throw new Error(new TextDecoder().decode(out.stderr));
    assertEquals(new TextDecoder().decode(out.stdout).trim(), 'Jane "JD" Doe');

    const sign = await new Deno.Command("git", {
      args: ["config", "--file", file, "--get", "commit.gpgsign"],
      stdout: "piped",
    }).output();
    assertEquals(new TextDecoder().decode(sign.stdout).trim(), "true");
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

// Regression: the edge sandbox blocklists Deno.chmod and the blocklist THROWS
// SYNCHRONOUSLY when called — `Deno.chmod?.(..)?.catch?.()` does not guard a
// sync throw, which 500'd POST /integrations/git-signing/generate. The key
// must be created 0600 via the writeTextFile mode option, with NO chmod call
// on the happy path.
Deno.test("materializeSigningKey: writes the key 0600 without calling Deno.chmod", async () => {
  const prevWs = Deno.env.get("DEVX_WORKSPACE_DIR");
  const prevKey = Deno.env.get("DEVX_ENCRYPTION_KEY");
  const base = await Deno.makeTempDir();
  Deno.env.set("DEVX_WORKSPACE_DIR", base);
  Deno.env.set("DEVX_ENCRYPTION_KEY", "a".repeat(64));
  const realChmod = Deno.chmod;
  // Simulate the edge runtime: chmod exists but throws synchronously.
  // deno-lint-ignore no-explicit-any
  (Deno as any).chmod = () => { throw new Deno.errors.PermissionDenied("Deno.chmod is blocklisted"); };
  try {
    const { ciphertext, iv } = await encryptToken("FAKE-PRIVATE-KEY\n");
    const row = {
      encrypted_token: ciphertext,
      token_iv: iv,
      metadata: { public_key: "ssh-ed25519 AAAAtest devx-signing" },
    };
    const sql = () => Promise.resolve({ rows: [row] });

    // Seed a stale, wrongly-permissioned key from a pre-fix failed attempt —
    // rotation must end at 0600 even when the file already exists.
    const keyPath = signingKeyPath("u1");
    await Deno.mkdir(keyPath.slice(0, keyPath.lastIndexOf("/")), { recursive: true });
    await Deno.writeTextFile(keyPath, "stale", { mode: 0o644 });

    const out = await materializeSigningKey("u1", sql, { name: "Jane", email: "j@x.y" });
    assertEquals(out, keyPath);
    assertEquals(await Deno.readTextFile(keyPath), "FAKE-PRIVATE-KEY\n");
    const mode = (await Deno.stat(keyPath)).mode;
    if (mode !== null) assertEquals(mode & 0o777, 0o600);
  } finally {
    // deno-lint-ignore no-explicit-any
    (Deno as any).chmod = realChmod;
    if (prevWs === undefined) Deno.env.delete("DEVX_WORKSPACE_DIR");
    else Deno.env.set("DEVX_WORKSPACE_DIR", prevWs);
    if (prevKey === undefined) Deno.env.delete("DEVX_ENCRYPTION_KEY");
    else Deno.env.set("DEVX_ENCRYPTION_KEY", prevKey);
    await Deno.remove(base, { recursive: true });
  }
});
