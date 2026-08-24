import { assertEquals, assertThrows } from "jsr:@std/assert";
import { assertSafeAttachmentUrl } from "./attachment_url.ts";

const noEnv = () => undefined;

Deno.test("an ordinary https CDN url passes", () => {
  const url = assertSafeAttachmentUrl("https://cdn.example.com/a.png", noEnv);
  assertEquals(url.hostname, "cdn.example.com");
});

Deno.test("rejects a url that does not parse at all", () => {
  assertThrows(() => assertSafeAttachmentUrl("not a url", noEnv));
});

Deno.test("rejects http", () => {
  assertThrows(() => assertSafeAttachmentUrl("http://cdn.example.com/a.png", noEnv));
});

Deno.test("rejects other schemes", () => {
  assertThrows(() => assertSafeAttachmentUrl("file:///etc/passwd", noEnv));
  assertThrows(() => assertSafeAttachmentUrl("data:text/plain;base64,aGk=", noEnv));
  assertThrows(() => assertSafeAttachmentUrl("blob:https://example.com/uuid", noEnv));
  assertThrows(() => assertSafeAttachmentUrl("gopher://example.com/a", noEnv));
  assertThrows(() => assertSafeAttachmentUrl("ftp://example.com/a", noEnv));
});

Deno.test("rejects urls carrying credentials", () => {
  assertThrows(() => assertSafeAttachmentUrl("https://user@cdn.example.com/a.png", noEnv));
  assertThrows(() => assertSafeAttachmentUrl("https://user:pass@cdn.example.com/a.png", noEnv));
});

Deno.test("rejects IPv4 non-public ranges", () => {
  const bad = [
    "https://127.0.0.1/a.png",
    "https://127.5.5.5/a.png",
    "https://10.0.0.5/a.png",
    "https://172.16.0.5/a.png",
    "https://172.31.255.255/a.png",
    "https://192.168.1.1/a.png",
    "https://169.254.169.254/a.png",
    "https://0.0.0.0/a.png",
    "https://100.64.0.1/a.png",
    "https://100.100.100.100/a.png",
  ];
  for (const u of bad) {
    assertThrows(() => assertSafeAttachmentUrl(u, noEnv), Error, undefined, u);
  }
});

Deno.test("allows public IPv4 literals", () => {
  const url = assertSafeAttachmentUrl("https://8.8.8.8/a.png", noEnv);
  assertEquals(url.hostname, "8.8.8.8");
});

Deno.test("rejects IPv6 non-public forms", () => {
  const bad = [
    "https://[::1]/a.png",
    "https://[fc00::1]/a.png",
    "https://[fe80::1]/a.png",
    "https://[::ffff:127.0.0.1]/a.png",
    "https://[::ffff:169.254.169.254]/a.png",
  ];
  for (const u of bad) {
    assertThrows(() => assertSafeAttachmentUrl(u, noEnv), Error, undefined, u);
  }
});

Deno.test("rejects localhost and .internal hostnames", () => {
  assertThrows(() => assertSafeAttachmentUrl("https://localhost/a.png", noEnv));
  assertThrows(() => assertSafeAttachmentUrl("https://foo.localhost/a.png", noEnv));
  assertThrows(() => assertSafeAttachmentUrl("https://foo.internal/a.png", noEnv));
  assertThrows(() => assertSafeAttachmentUrl("https://svc.foo.internal/a.png", noEnv));
});

Deno.test("allowlist set: matching host passes, non-matching rejected", () => {
  const env = (k: string) => (k === "DEVX_ATTACHMENT_HOST_ALLOWLIST" ? "cdn.example.com,files.example.org" : undefined);
  const url = assertSafeAttachmentUrl("https://cdn.example.com/a.png", env);
  assertEquals(url.hostname, "cdn.example.com");
  const sub = assertSafeAttachmentUrl("https://sub.files.example.org/a.png", env);
  assertEquals(sub.hostname, "sub.files.example.org");
  assertThrows(() => assertSafeAttachmentUrl("https://not-allowed.example.net/a.png", env));
});

Deno.test("allowlist blank: deny rules still apply", () => {
  const env = (k: string) => (k === "DEVX_ATTACHMENT_HOST_ALLOWLIST" ? "" : undefined);
  assertThrows(() => assertSafeAttachmentUrl("https://127.0.0.1/a.png", env));
  const url = assertSafeAttachmentUrl("https://cdn.example.com/a.png", env);
  assertEquals(url.hostname, "cdn.example.com");
});
