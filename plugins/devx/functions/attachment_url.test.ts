import { assertEquals, assertThrows } from "jsr:@std/assert";
import { assertSafeAttachmentUrl, expandIPv6 } from "./attachment_url.ts";

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

// FIX B: WHATWG preserves a trailing dot on a domain (it is stripped only
// from IPv4 literals), so "localhost." and "metadata.google.internal."
// must be treated the same as their dotless forms.
Deno.test("rejects a trailing dot used to dodge the hostname rules", () => {
  assertThrows(() => assertSafeAttachmentUrl("https://localhost./a.png", noEnv));
  assertThrows(() => assertSafeAttachmentUrl("https://metadata.google.internal./a.png", noEnv));
});

Deno.test("trailing dot on a public host is consistent with the allowlist", () => {
  const env = (k: string) => (k === "DEVX_ATTACHMENT_HOST_ALLOWLIST" ? "cdn.example.com" : undefined);
  // The allowlist compares against the trailing-dot-stripped hostname, so an
  // allowlisted host must behave identically whether or not the url spells
  // it with a trailing dot — neither smuggled past nor unfairly excluded.
  const dotless = assertSafeAttachmentUrl("https://cdn.example.com/a.png", env);
  const dotted = assertSafeAttachmentUrl("https://cdn.example.com./a.png", env);
  assertEquals(dotted.hostname.replace(/\.$/, ""), dotless.hostname);
});

// FIX C: "::" (all-zero) is the v6 twin of 0.0.0.0 and reaches localhost on
// Linux; it must be rejected the same as "::1".
Deno.test("rejects the all-zero IPv6 address", () => {
  assertThrows(() => assertSafeAttachmentUrl("https://[::]/a.png", noEnv));
});

// FIX D: additional non-public ranges.
Deno.test("rejects IPv6 embedded-IPv4 forms (IPv4-compatible, IPv4-translated, NAT64)", () => {
  const bad = [
    "https://[::127.0.0.1]/a.png", // IPv4-compatible ::/96, normalises to ::7f00:1
    "https://[::ffff:0:127.0.0.1]/a.png", // IPv4-translated ::ffff:0:0/96
    "https://[64:ff9b::127.0.0.1]/a.png", // NAT64 well-known prefix 64:ff9b::/96
  ];
  for (const u of bad) {
    assertThrows(() => assertSafeAttachmentUrl(u, noEnv), Error, undefined, u);
  }
});

Deno.test("rejects additional IPv4 non-public ranges", () => {
  const bad = [
    "https://192.0.0.1/a.png", // 192.0.0.0/24
    "https://198.18.0.1/a.png", // 198.18.0.0/15 benchmarking
    "https://198.19.255.255/a.png",
    "https://224.0.0.1/a.png", // 224.0.0.0/4 multicast
    "https://240.0.0.1/a.png", // 240.0.0.0/4 reserved
    "https://255.255.255.255/a.png",
  ];
  for (const u of bad) {
    assertThrows(() => assertSafeAttachmentUrl(u, noEnv), Error, undefined, u);
  }
});

// FIX E: the IPv6 expander must fail CLOSED — an unparseable bracketed
// literal must be rejected, not treated as a DNS name (which would let it
// fall through the deny rules entirely).
Deno.test("rejects a malformed bracketed IPv6 literal instead of treating it as a hostname", () => {
  assertThrows(() => assertSafeAttachmentUrl("https://[1:::2]/a.png", noEnv));
});

// The url-level test above is already caught by `new URL()` itself refusing
// to parse "[1:::2]" at all, so it does not, by itself, prove the expander
// fix. Exercise expandIPv6 directly: before the fix, `filter(Boolean)`
// silently dropped the empty segment produced by the extra colon and
// `octets.map(Number)` accepted non-decimal/empty octets, so both inputs
// below parsed "successfully" (and wrongly) instead of failing closed.
Deno.test("expandIPv6 fails closed on malformed input rather than silently repairing it", () => {
  assertEquals(expandIPv6("1:::2"), null); // extra colon — filter(Boolean) used to hide it
  assertEquals(expandIPv6("::ffff:0x7f.0.0.1"), null); // hex octet — Number("0x7f") = 127
  assertEquals(expandIPv6("::ffff:127.0..1"), null); // empty octet — Number("") = 0
});

// FIX 1: public DNS aliases for the cloud metadata endpoint. The link-local
// IP deny rule (169.254.169.254) does nothing against a public hostname that
// resolves to it — these must be denied by name.
Deno.test("rejects known public aliases for the cloud metadata endpoint", () => {
  const bad = [
    "https://metadata.goog/",
    "https://METADATA.GOOG/", // case-insensitive
    "https://metadata.google.internal/",
    "https://metadata/",
    "https://instance-data/",
    "https://metadata.azure.com/",
    "https://sub.metadata.goog/", // covered by the ".metadata.goog" suffix rule
    "https://metadata.goog./", // trailing dot stripped before the deny check
  ];
  for (const u of bad) {
    assertThrows(() => assertSafeAttachmentUrl(u, noEnv), Error, undefined, u);
  }
});

// A different, attacker-registrable domain that merely CONTAINS the deny
// string must not be caught by a naive suffix match ("metadata.goog" is not
// a suffix-anchored parent of "metadata.goog.example.com" — the label
// boundary is wrong, so this is genuinely a different registrable domain).
// It is allowed through here; it is still subject to every other deny rule
// (IP literals, .internal, localhost) and, in a locked-down deployment, to
// the allowlist.
Deno.test("does not reject an unrelated host that merely contains a metadata alias as a substring", () => {
  const url = assertSafeAttachmentUrl("https://metadata.goog.example.com/a.png", noEnv);
  assertEquals(url.hostname, "metadata.goog.example.com");
  // Also prove the naive substring/suffix trap the other way: a host that
  // merely ends with the letters "metadata.goog" without a label boundary
  // must not be denied either.
  const url2 = assertSafeAttachmentUrl("https://notmetadata.goog/a.png", noEnv);
  assertEquals(url2.hostname, "notmetadata.goog");
});

// FIX 2: remaining non-public IPv6/IPv4 ranges.
Deno.test("rejects 6to4 addresses whose embedded IPv4 is non-public", () => {
  // 2002:a9fe:a9fe:: encodes 169.254.169.254 in groups[1]/groups[2].
  assertThrows(() => assertSafeAttachmentUrl("https://[2002:a9fe:a9fe::]/", noEnv));
});

Deno.test("allows 6to4 addresses whose embedded IPv4 is public", () => {
  // 2002:0808:0808:: encodes 8.8.8.8.
  const url = assertSafeAttachmentUrl("https://[2002:808:808::]/a.png", noEnv);
  assertEquals(url.hostname, "[2002:808:808::]");
});

Deno.test("rejects deprecated IPv6 site-local addresses", () => {
  assertThrows(() => assertSafeAttachmentUrl("https://[fec0::1]/", noEnv));
});

Deno.test("rejects the 6to4 relay anycast IPv4 range", () => {
  assertThrows(() => assertSafeAttachmentUrl("https://192.88.99.1/a.png", noEnv));
  assertThrows(() => assertSafeAttachmentUrl("https://192.88.99.255/a.png", noEnv));
});

// FIX 3: allowlist entries must be lowercased (and trimmed) when parsed —
// otherwise an operator who writes mixed case silently blocks everything.
Deno.test("allowlist: a mixed-case entry matches a lowercase hostname", () => {
  const env = (k: string) => (k === "DEVX_ATTACHMENT_HOST_ALLOWLIST" ? "CDN.Example.com" : undefined);
  const url = assertSafeAttachmentUrl("https://cdn.example.com/a.png", env);
  assertEquals(url.hostname, "cdn.example.com");
});

// FIX 6c: the existing "trailing dot is consistent with the allowlist" test
// only proves dotted == dotless for an ALLOWED host. Prove the reject side
// too: a non-allowlisted host with a trailing dot must still be rejected,
// not smuggled past the allowlist check by the dot.
Deno.test("trailing dot does not smuggle a non-allowlisted host past the allowlist", () => {
  const env = (k: string) => (k === "DEVX_ATTACHMENT_HOST_ALLOWLIST" ? "cdn.example.com" : undefined);
  assertThrows(() => assertSafeAttachmentUrl("https://not-allowed.example.net./a.png", env));
});
