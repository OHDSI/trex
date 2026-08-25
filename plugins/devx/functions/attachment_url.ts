// @ts-nocheck - Deno edge function
// Guard against attachment urls being used as an SSRF vector. Attachment
// metadata (name/url) is relayed from a chat channel — it is remote input —
// and the bytes fetched from it land in the coder's workspace where the
// coder will read them, so the url must be validated before we ever fetch it.
//
// IMPORTANT LIMITATION: the checks below are hostname/IP-literal based. They
// do NOT stop DNS rebinding (a hostname that resolves to a private/loopback
// address at fetch time after passing this check with a different
// resolution), nor do they stop an otherwise-public hostname whose DNS is
// controlled by an attacker to point at an internal address. For a
// locked-down deployment, set DEVX_ATTACHMENT_HOST_ALLOWLIST — an explicit
// allowlist of hosts is the strong control here, not the deny list below.

function isIPv4(hostname: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
}

function ipv4Octets(hostname: string): number[] {
  return hostname.split(".").map((p) => Number(p));
}

function isNonPublicIPv4(hostname: string): boolean {
  const [a, b, c] = ipv4Octets(hostname);
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (incl. 169.254.169.254 cloud metadata)
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 192 && b === 88 && c === 99) return true; // 192.88.99.0/24 6to4 relay anycast
  if (a >= 224 && a <= 239) return true; // 224.0.0.0/4 multicast
  if (a >= 240) return true; // 240.0.0.0/4 reserved (covers 255.255.255.255)
  return false;
}

// Expand an IPv6 literal (brackets optional, "::" compression allowed, and
// a dotted-decimal IPv4 tail allowed) into its 8 16-bit groups. Returns null
// if it does not parse as IPv6 with confidence — callers must treat null as
// "reject", not "fall through as a DNS name": failing open here would let an
// unparseable literal skip every deny rule below.
export function expandIPv6(raw: string): number[] | null {
  let addr = raw.replace(/^\[|\]$/g, "").toLowerCase();

  // A trailing dotted-decimal quad (e.g. "::ffff:127.0.0.1") is not valid
  // hex — fold it into two hex groups before splitting on ":".
  const lastColon = addr.lastIndexOf(":");
  const tail = addr.slice(lastColon + 1);
  if (tail.includes(".")) {
    const octetStrs = tail.split(".");
    // Strict decimal-octet check: reject non-digit forms (e.g. "0x7f") and
    // empty segments (e.g. from "1.2..3") that Number() would silently
    // coerce into 0.
    if (octetStrs.length !== 4 || octetStrs.some((o) => !/^\d{1,3}$/.test(o))) return null;
    const octets = octetStrs.map(Number);
    if (octets.some((o) => o > 255)) return null;
    const hi = ((octets[0] << 8) | octets[1]).toString(16);
    const lo = ((octets[2] << 8) | octets[3]).toString(16);
    addr = `${addr.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  let groups: string[];
  if (addr.includes("::")) {
    const parts = addr.split("::");
    if (parts.length !== 2) return null;
    // No filter(Boolean) here: a genuine "::" boundary yields an empty
    // string on the side(s) with no groups, handled by the `parts[n] ? ... : []`
    // ternary below. Any OTHER empty segment (e.g. the extra colon in
    // "1:::2" splitting the tail into ["", "2"]) is malformed and must
    // survive into `groups` so the hex-group regex below rejects it,
    // rather than being silently dropped as if it were never there.
    const head = parts[0] ? parts[0].split(":") : [];
    const rest = parts[1] ? parts[1].split(":") : [];
    const missing = 8 - head.length - rest.length;
    if (missing < 0) return null;
    groups = [...head, ...Array(missing).fill("0"), ...rest];
  } else {
    groups = addr.split(":");
  }
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

function isNonPublicIPv6(hostname: string): boolean {
  const groups = expandIPv6(hostname);
  // Fail CLOSED: a bracketed literal that looks like IPv6 (it has a colon)
  // but cannot be parsed with confidence must be treated as non-public —
  // i.e. rejected — never allowed through as if it were an ordinary DNS name.
  if (!groups) return true;

  const isAllZero = groups.every((g) => g === 0);
  if (isAllZero) return true; // :: — the v6 twin of 0.0.0.0, reaches localhost on Linux

  const isLoopback = groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1;
  if (isLoopback) return true; // ::1

  if ((groups[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((groups[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((groups[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated, still routed by some stacks)

  // Forms that embed an IPv4 address in the low 32 bits — evaluate that
  // embedded address with the same non-public test applied to plain IPv4.
  const embedsIPv4 =
    (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) || // ::ffff:a.b.c.d/96 IPv4-mapped
    groups.slice(0, 6).every((g) => g === 0) || // ::/96 IPv4-compatible (deprecated)
    (groups.slice(0, 4).every((g) => g === 0) && groups[4] === 0xffff && groups[5] === 0) || // ::ffff:0:0/96 IPv4-translated
    (groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((g) => g === 0)); // 64:ff9b::/96 NAT64
  if (embedsIPv4) {
    const a = groups[6] >> 8, b = groups[6] & 0xff, c = groups[7] >> 8, d = groups[7] & 0xff;
    if (isNonPublicIPv4(`${a}.${b}.${c}.${d}`)) return true;
  }

  // 2002::/16 6to4 — the embedded IPv4 lives in the next two groups
  // (groups[1] and groups[2], i.e. bytes 2-5 of the address). Apply the
  // same non-public test used for the IPv4-mapped/translated tails above,
  // so e.g. 2002:a9fe:a9fe:: (which encodes 169.254.169.254) is caught.
  if (groups[0] === 0x2002) {
    const a = groups[1] >> 8, b = groups[1] & 0xff, c = groups[2] >> 8, d = groups[2] & 0xff;
    if (isNonPublicIPv4(`${a}.${b}.${c}.${d}`)) return true;
  }

  return false;
}

// These are PUBLIC hostnames that resolve (today, on the relevant cloud
// networks) to the link-local metadata address 169.254.169.254 or an
// equivalent instance-metadata endpoint. The IP-range checks above cannot
// catch them — the request never carries the IP literal, only a name that
// DNS (or in some environments a static /etc/hosts-style entry) resolves to
// it — so they are denied explicitly, by name, here. Matched case
// insensitively and against the same trailing-dot-stripped hostname the
// other deny rules see.
const METADATA_HOSTNAMES = new Set([
  "metadata.goog", // GCP's public DNS alias for 169.254.169.254
  "metadata.google.internal", // GCP, also covered by the .internal suffix rule below
  "metadata", // bare single-label name resolved internally on GCP/AWS/etc.
  "instance-data", // legacy AWS alias for the metadata endpoint
  "metadata.azure.com", // Azure instance metadata service
]);
// A suffix rule for metadata.goog subdomains, anchored on the label
// boundary (a leading dot) so it matches "sub.metadata.goog" but not an
// unrelated, attacker-registrable domain that merely ends in the same
// letters without that boundary (e.g. "notmetadata.goog" is a different
// domain and must not be denied).
const METADATA_HOSTNAME_SUFFIX = ".metadata.goog";

function isMetadataHostname(lowerHostname: string): boolean {
  return METADATA_HOSTNAMES.has(lowerHostname) || lowerHostname.endsWith(METADATA_HOSTNAME_SUFFIX);
}

function hostnameLooksIPv6(hostname: string): boolean {
  // URL.hostname keeps brackets around an IPv6 literal (e.g. "[::1]");
  // distinguish it from a regular DNS name by the colon, which is never
  // legal in a DNS label.
  return hostname.includes(":");
}

export function assertSafeAttachmentUrl(
  raw: string,
  env: (k: string) => string | undefined = (k) => Deno.env.get(k),
): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("attachment url does not parse");
  }

  if (url.protocol !== "https:") {
    throw new Error(`attachment url scheme not allowed: ${url.protocol}`);
  }

  if (url.username || url.password) {
    throw new Error("attachment url must not carry credentials");
  }

  // WHATWG preserves a trailing dot on a domain (it strips one only from
  // IPv4 literals), so "localhost." and "metadata.google.internal." would
  // otherwise sail past every hostname check below by not literally
  // matching "localhost" / not literally ending in ".internal". Strip
  // exactly one trailing dot up front so every check — deny rules AND the
  // allowlist comparison — sees the same normalized name.
  const hostname = url.hostname.replace(/\.$/, "");

  // Lowercase (and trim) each entry: url.hostname is already lowercase (the
  // WHATWG URL parser lowercases the host), so an un-lowercased allowlist
  // entry like "CDN.Example.com" would otherwise match nothing — every
  // attachment fails closed, but silently and hard to diagnose.
  const allowlistRaw = env("DEVX_ATTACHMENT_HOST_ALLOWLIST");
  const allowlist = (allowlistRaw || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  if (allowlist.length > 0) {
    const ok = allowlist.some((h) => hostname === h || hostname.endsWith(`.${h}`));
    if (!ok) {
      throw new Error(`attachment host not in allowlist: ${hostname}`);
    }
    return url;
  }

  // No allowlist configured — fall back to the deny rules only.
  if (isIPv4(hostname) && isNonPublicIPv4(hostname)) {
    throw new Error(`attachment host resolves to a non-public address: ${hostname}`);
  }
  if (hostnameLooksIPv6(hostname) && isNonPublicIPv6(hostname)) {
    throw new Error(`attachment host resolves to a non-public address: ${hostname}`);
  }
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost") || lower.endsWith(".internal")) {
    throw new Error(`attachment host not allowed: ${hostname}`);
  }
  if (isMetadataHostname(lower)) {
    throw new Error(`attachment host not allowed: ${hostname}`);
  }

  return url;
}
