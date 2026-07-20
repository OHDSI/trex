// deno test --allow-all plugins/devx/functions/git_identity.test.ts
// Pure-function coverage: config rendering + quoting. The DB/duckdb-backed
// paths (ensureGitConfig etc.) need a live stack and are covered by the
// end-to-end verification instead.
import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { renderGitConfig } from "./git_identity.ts";

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
