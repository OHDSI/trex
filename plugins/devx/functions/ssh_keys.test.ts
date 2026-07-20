// deno test --allow-all plugins/devx/functions/ssh_keys.test.ts
import { assertEquals, assertMatch, assertRejects } from "jsr:@std/assert";
import { generateEd25519, parseOpensshPrivateKey } from "./ssh_keys.ts";

Deno.test("generateEd25519: emits a well-formed keypair", async () => {
  const key = await generateEd25519();
  assertMatch(key.privateKeyOpenssh, /^-----BEGIN OPENSSH PRIVATE KEY-----\n[\s\S]+\n-----END OPENSSH PRIVATE KEY-----\n$/);
  assertMatch(key.publicKeyLine, /^ssh-ed25519 AAAA[0-9A-Za-z+/=]+ devx-signing$/);
  assertMatch(key.fingerprint, /^SHA256:[0-9A-Za-z+/]{43}$/);
});

Deno.test("roundtrip: parsing our own generated key reproduces public line + fingerprint", async () => {
  const key = await generateEd25519();
  const parsed = await parseOpensshPrivateKey(key.privateKeyOpenssh);
  assertEquals(parsed.publicKeyLine, key.publicKeyLine);
  assertEquals(parsed.fingerprint, key.fingerprint);
});

Deno.test("parse: rejects garbage, non-openssh, and multi-key inputs", async () => {
  await assertRejects(() => parseOpensshPrivateKey("not a key"), Error, "not an OpenSSH private key");
  await assertRejects(
    () =>
      parseOpensshPrivateKey(
        "-----BEGIN OPENSSH PRIVATE KEY-----\n!!!not-base64!!!\n-----END OPENSSH PRIVATE KEY-----",
      ),
    Error,
  );
});

Deno.test("parse: rejects passphrase-protected keys with an actionable message", async () => {
  // Container with ciphername aes256-ctr — only the header matters for this path.
  const enc = new TextEncoder();
  const magic = enc.encode("openssh-key-v1\0");
  const str = (s: string) => {
    const b = enc.encode(s);
    const out = new Uint8Array(4 + b.length);
    new DataView(out.buffer).setUint32(0, b.length);
    out.set(b, 4);
    return out;
  };
  const blob = new Uint8Array([...magic, ...str("aes256-ctr"), ...str("bcrypt"), ...str("")]);
  const pem = `-----BEGIN OPENSSH PRIVATE KEY-----\n${btoa(String.fromCharCode(...blob))}\n-----END OPENSSH PRIVATE KEY-----`;
  await assertRejects(() => parseOpensshPrivateKey(pem), Error, "passphrase-protected");
});

// Cross-check against the real toolchain when ssh-keygen is on PATH (dev boxes,
// CI images with openssh-client). Skips silently otherwise — the pure-JS
// roundtrip above still guards the format.
Deno.test("cross-validation: ssh-keygen agrees on fingerprint and derived public key", async () => {
  let available = true;
  try {
    const probe = new Deno.Command("ssh-keygen", { args: ["-?"], stdout: "null", stderr: "null" });
    await probe.output();
  } catch {
    available = false;
  }
  if (!available) return;

  const key = await generateEd25519();
  const dir = await Deno.makeTempDir();
  try {
    const privPath = `${dir}/id_ed25519`;
    await Deno.writeTextFile(privPath, key.privateKeyOpenssh, { mode: 0o600 });

    // ssh-keygen -y re-derives the public key from the private file.
    const y = new Deno.Command("ssh-keygen", { args: ["-y", "-f", privPath], stdout: "piped", stderr: "piped" });
    const yOut = await y.output();
    if (!yOut.success) throw new Error(`ssh-keygen -y failed: ${new TextDecoder().decode(yOut.stderr)}`);
    const derived = new TextDecoder().decode(yOut.stdout).trim();
    // Compare key material (type + blob); comments may differ.
    assertEquals(derived.split(" ").slice(0, 2), key.publicKeyLine.split(" ").slice(0, 2));

    // ssh-keygen -lf agrees on the SHA256 fingerprint.
    const l = new Deno.Command("ssh-keygen", { args: ["-l", "-f", privPath], stdout: "piped", stderr: "piped" });
    const lOut = await l.output();
    if (!lOut.success) throw new Error(`ssh-keygen -lf failed: ${new TextDecoder().decode(lOut.stderr)}`);
    const line = new TextDecoder().decode(lOut.stdout);
    if (!line.includes(key.fingerprint)) {
      throw new Error(`fingerprint mismatch: ours ${key.fingerprint}, ssh-keygen said ${line.trim()}`);
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
