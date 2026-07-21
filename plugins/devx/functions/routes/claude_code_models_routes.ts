import { getValidOAuthToken } from "./claude_code_routes.ts";

const CLAUDE_PORT = 4322;

type ModelInfo = { value: string; displayName: string; description: string; supportsEffort?: boolean };
type ModelsResponse = { models: ModelInfo[]; source: "sdk" | "fallback" };

export const SEED_RESPONSE: ModelsResponse = {
  models: [
    { value: "default", displayName: "Default (recommended)", description: "", supportsEffort: true },
    { value: "sonnet", displayName: "Sonnet", description: "", supportsEffort: true },
    { value: "haiku", displayName: "Haiku", description: "" },
  ],
  source: "fallback",
};

// deno-lint-ignore no-explicit-any
export async function handleClaudeCodeModelsRoutes(
  path: string,
  method: string,
  _req: Request,
  _userId: string,
  _sql: (q: string, p?: unknown[]) => Promise<{ rows: unknown[] }>,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  if (!path.endsWith("/claude-code/models") || method !== "GET") return null;

  const oauthToken = await getValidOAuthToken();
  if (!oauthToken) return Response.json(SEED_RESPONSE, { headers: corsHeaders });

  try {
    const resp = await fetch(`http://localhost:${CLAUDE_PORT}/models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oauthToken }),
    });
    if (!resp.ok) return Response.json(SEED_RESPONSE, { headers: corsHeaders });
    const data = await resp.json() as ModelsResponse;
    return Response.json(data, { headers: corsHeaders });
  } catch (err) {
    console.error("[claude-code] /claude-code/models proxy error:", (err as Error)?.message);
    return Response.json(SEED_RESPONSE, { headers: corsHeaders });
  }
}
