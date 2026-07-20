// plugins/claw/agent/tools/lookupDiscordIds.ts
// Resolves GitHub logins (from the investigation) to Discord ids via devx's
// instance-global user map, maintained in the devx Support settings screen.
import { defineTool } from "eve/tools";
import { apiBase, mintToken } from "../lib/code-stream.ts";
import { effectiveUserId } from "./askCodeAgent.ts";
import { isEvalMode, evalStubs } from "../lib/eval-stubs.ts";

export async function lookupCore(
  logins: string[],
  userId: string,
  fetchImpl: typeof fetch = fetch,
  mint: (userId: string) => Promise<string> = mintToken,
): Promise<{ mappings: Record<string, string>; unmapped: string[] }> {
  const token = await mint(userId);
  const res = await fetchImpl(
    `${apiBase()}/support/discord-ids?logins=${encodeURIComponent(logins.join(","))}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`lookupDiscordIds: devx route failed: ${res.status}`);
  return await res.json();
}

export default defineTool({
  description:
    "Resolve GitHub logins to Discord user ids using the team mapping maintained in devx " +
    "settings. Returns {mappings, unmapped}; mention mapped devs, list unmapped logins as " +
    "plain text (and note they can be added in devx Settings → Support).",
  inputSchema: {
    type: "object",
    properties: {
      logins: { type: "array", items: { type: "string" }, description: "GitHub logins from the investigation." },
    },
    required: ["logins"],
  },
  execute: async (input, ctx) => {
    if (isEvalMode(ctx)) return evalStubs.lookupDiscordIds((input.logins as string[]) ?? []);
    const userId = effectiveUserId(ctx?.userId, (k) => Deno.env.get(k));
    if (!userId) throw new Error("lookupDiscordIds: no user id (set CLAW_CODE_USER_ID)");
    return lookupCore(input.logins as string[], userId);
  },
});
