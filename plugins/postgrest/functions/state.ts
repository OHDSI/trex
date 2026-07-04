// Worker-level state: mount-prefix handling and lazy singletons.
//
// The worker receives the full original URL. It is reachable via two mounts:
//  - "/postgrest"                — fnmap direct calls from the core server's
//                                  ${BASE_PATH}/rest/v1 route (public API path)
//  - "/plugins/trex/postgrest"   — the automatic authenticated plugin mount
//                                  (used for the admin surface)

const MOUNT_PREFIXES = ["/plugins/trex/postgrest", "/postgrest"];

/**
 * Strips the mount prefix from a URL pathname. Returns the in-API path
 * (always starting with "/", "/" for the API root) or null when the path is
 * outside all known mounts.
 */
export function stripMount(pathname: string): string | null {
  for (const prefix of MOUNT_PREFIXES) {
    if (pathname === prefix) return "/";
    if (pathname.startsWith(prefix + "/")) return pathname.slice(prefix.length);
  }
  return null;
}
