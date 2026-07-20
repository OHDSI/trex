// DB-backed Slack allowlist, checked in the channel's allow callback BEFORE any
// send(). Fail closed: API/user-id problems deny. SLACK_ALLOWED_USERS env is a
// bootstrap fallback so the very first operator can reach the settings flow.
import { devxApiBase, mintToken, supportUserId } from "./devx-api.ts";

export interface CheckDeps {
  envList: string;
  fetchImpl: typeof fetch;
  mint: (userId: string) => Promise<string>;
}

const CACHE_MS = 60_000;
const cache = new Map<string, { allowed: boolean; at: number }>();

export async function checkAllowlist(userId: string | undefined, deps: CheckDeps): Promise<boolean> {
  if (!userId) return false;
  const envIds = deps.envList.split(",").map((s) => s.trim()).filter(Boolean);
  if (envIds.includes(userId)) return true;
  const cached = cache.get(userId);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.allowed;
  try {
    const uid = supportUserId();
    if (!uid) return false;
    const token = await deps.mint(uid);
    const res = await deps.fetchImpl(
      `${devxApiBase()}/support/slack-allowlist/check?user=${encodeURIComponent(userId)}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!res.ok) {
      await res.body?.cancel();
      return false;
    }
    const j = await res.json() as { allowed?: boolean };
    const allowed = j.allowed === true;
    cache.set(userId, { allowed, at: Date.now() });
    return allowed;
  } catch (e) {
    console.warn("d2esupport: allowlist check failed — denying:", e);
    return false;
  }
}

export function isAllowedSlackUser(userId?: string): Promise<boolean> {
  return checkAllowlist(userId, {
    envList: Deno.env.get("SLACK_ALLOWED_USERS") ?? "",
    fetchImpl: fetch,
    mint: mintToken,
  });
}
