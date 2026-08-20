import { API_BASE } from "./config";
import type {
  Chat, Message, DevxSettings, ProviderConfigRecord, AgentTodo, ToolCall, ConsentRequest,
  App, DevServerStatus, FileTreeEntry, Problem,
  GitFile, GitCommit, GitBranches, GitWorktree, GitHubStatus, GitHubDeviceCode, GitHubRepo,
  McpServer, McpTool, Plan, QuestionnaireRequest, BuildAction,
  SupabaseStatus, SupabaseDeployConfig, SupabaseProject, Deployment, DeployStep,
  SecurityReview,
  CodeReview,
  QaTestReview,
  DesignReview,
  DocsReview,
  GitSigningStatus,
  D2EConfig,
  UserMapEntry,
  SlackAllowlistEntry,
  ModelInfo,
} from "./types";

// task-u1: exported so useAgentsChat.ts can build the Authorization header
// for the eve/agents runtime's /chat endpoint (a different plugin mount than
// API_BASE/apiFetch below, so it can't just call apiFetch). No behavior
// change for any existing (legacy) caller — this function's body/callers
// are otherwise untouched.
export function getAuthToken(): string | null {
  try {
    const raw = localStorage.getItem("trex.auth.session");
    if (raw) {
      const session = JSON.parse(raw);
      const token = session.access_token || null;
      // Sync token to cookie so iframe requests (preview proxy) can authenticate
      if (token) {
        document.cookie = `sb-access-token=${token}; path=/; SameSite=Lax`;
      }
      return token;
    }
  } catch { /* ignore */ }
  return null;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json();
}

// Chat CRUD
export async function listChats(appId?: string | null): Promise<Chat[]> {
  const params = appId ? `?app_id=${appId}` : "";
  return apiFetch(`/chats${params}`);
}

export async function createChat(title: string, mode: string, appId?: string | null): Promise<Chat> {
  return apiFetch("/chats", {
    method: "POST",
    body: JSON.stringify({ title, mode, app_id: appId || undefined }),
  });
}

export async function deleteChat(chatId: string): Promise<void> {
  await apiFetch(`/chats/${chatId}`, { method: "DELETE" });
}

export async function updateChat(chatId: string, title: string): Promise<Chat> {
  return apiFetch(`/chats/${chatId}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export async function updateChatMode(chatId: string, mode: string): Promise<Chat> {
  return apiFetch(`/chats/${chatId}`, {
    method: "PATCH",
    body: JSON.stringify({ mode }),
  });
}

// Messages
export async function listMessages(chatId: string): Promise<Message[]> {
  return apiFetch(`/chats/${chatId}/messages`);
}

// task-u1: the stateless eve/agents /chat endpoint never writes to
// devx.messages itself (history is client-provided; agents.sessions/turns
// records the run for the dashboard in parallel — see agent/lib/context.ts's
// header comment on the dual-write). This is the client-side persistence
// call the new chat client makes after each turn so devx's own chat history
// (read via listMessages above, shared with the legacy loop) stays complete
// across both loops. Mirrors the shape functions/index.ts's /stream handler
// already inserts server-side for the legacy loop (chat_id, role, content,
// model, tool_calls).
export async function createMessage(
  chatId: string,
  message: { role: "user" | "assistant"; content: string; model?: string; tool_calls?: ToolCall[] },
): Promise<Message> {
  return apiFetch(`/chats/${chatId}/messages`, {
    method: "POST",
    body: JSON.stringify(message),
  });
}

// Todos
export async function getTodos(chatId: string): Promise<AgentTodo[]> {
  return apiFetch(`/chats/${chatId}/todos`);
}

// Consent
export async function respondToConsent(
  chatId: string,
  requestId: string,
  decision: "allow" | "deny" | "always",
): Promise<void> {
  await apiFetch(`/chats/${chatId}/consent`, {
    method: "POST",
    body: JSON.stringify({ requestId, decision }),
  });
}

// Settings
export async function getSettings(): Promise<DevxSettings | null> {
  try {
    return await apiFetch("/settings");
  } catch {
    return null;
  }
}

export async function saveSettings(settings: Partial<DevxSettings>): Promise<DevxSettings> {
  return apiFetch("/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

// Provider Configs (multi-provider)
export async function getProviderConfigs(): Promise<ProviderConfigRecord[]> {
  return apiFetch("/provider-configs");
}

export interface ActiveProviderConfig {
  provider: string;
  // Server-derived credential-shape hint (see types.ts's AuthShape) — the
  // masked api_key in GET responses can never be shape-sniffed client-side.
  // undefined on older server builds that don't emit the field yet.
  auth_shape?: "bearer" | "iam" | "plain" | "none";
}

// task-u1: mirrors plugins/devx/agent/agent.ts's resolveModel fallback chain
// (active devx.provider_configs row, else the legacy devx.settings row, else
// "anthropic") so the UI can gate claude-code/copilot away from the agents
// loop BEFORE ever calling /chat — resolveModel throws for those two
// providers (eve/agents has no sidecar-process equivalent), which /chat
// surfaces as a bare uncaught 500, not a parseable error. Read-only; never
// used for anything security-sensitive, same posture as the server-side
// fallback it mirrors. Also carries `auth_shape` (final-007 review finding
// #4 + merge-gate re-review) so useEffectiveLoop.ts can detect IAM-shaped
// bedrock credentials — resolveModel throws for those too (agents loop is
// bearer-token-only), the exact same "gate it before /chat" reasoning as the
// claude-code/copilot case above.
export async function getActiveProviderConfig(): Promise<ActiveProviderConfig> {
  const configs = await getProviderConfigs().catch(() => [] as ProviderConfigRecord[]);
  const active = configs.find((c) => c.is_active);
  if (active) return { provider: active.provider, auth_shape: active.auth_shape };
  const settings = await getSettings();
  return { provider: settings?.provider || "anthropic", auth_shape: settings?.auth_shape };
}

export async function getActiveProvider(): Promise<string> {
  return (await getActiveProviderConfig()).provider;
}

export async function createProviderConfig(config: {
  provider: string;
  model: string;
  api_key?: string;
  base_url?: string;
  display_name?: string;
}): Promise<ProviderConfigRecord> {
  return apiFetch("/provider-configs", {
    method: "POST",
    body: JSON.stringify(config),
  });
}

export async function updateProviderConfig(
  id: string,
  updates: Partial<{ provider: string; model: string; api_key: string; base_url: string; display_name: string }>,
): Promise<ProviderConfigRecord> {
  return apiFetch(`/provider-configs/${id}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
}

export async function deleteProviderConfig(id: string): Promise<void> {
  await apiFetch(`/provider-configs/${id}`, { method: "DELETE" });
}

export async function activateProviderConfig(id: string): Promise<void> {
  await apiFetch(`/provider-configs/${id}/activate`, { method: "PUT" });
}

export interface EncryptExistingKeysResult {
  migrated: number;
  skipped: number;
  encryptionConfigured: boolean;
}

// Backfill: encrypts every remaining plaintext api_key row for this user
// (routes/provider_config_routes.ts's POST /provider-configs/encrypt-existing).
// Idempotent and safe to call repeatedly — rows already encrypted are
// skipped. Returns `encryptionConfigured: false` (migrated: 0) when
// DEVX_ENCRYPTION_KEY isn't set server-side, which the caller should surface
// rather than treat as an error.
export async function encryptExistingKeys(): Promise<EncryptExistingKeysResult> {
  return apiFetch("/provider-configs/encrypt-existing", { method: "POST" });
}

// App CRUD
export interface Prototype {
  name: string;
  path: string;
  mtime: number;
}

export async function listPrototypes(appId: string): Promise<Prototype[]> {
  return apiFetch(`/apps/${appId}/prototypes`);
}

export async function listApps(): Promise<App[]> {
  return apiFetch("/apps");
}

export async function createApp(
  name: string,
  opts?: { template?: string; gitUrl?: string; kind?: "d2e" },
): Promise<App> {
  return apiFetch("/apps", {
    method: "POST",
    body: JSON.stringify(
      opts?.gitUrl
        ? { name, git_url: opts.gitUrl, kind: opts.kind }
        : { name, template: opts?.template },
    ),
  });
}

// Data2Evidence (d2e)
export async function getD2E(appId: string): Promise<D2EConfig | null> {
  return apiFetch(`/apps/${appId}/d2e`);
}

export async function selectD2ESubApp(appId: string, key: string): Promise<{ ok: boolean; activeSubApp: string }> {
  return apiFetch(`/apps/${appId}/d2e/select`, {
    method: "POST",
    body: JSON.stringify({ key }),
  });
}

export async function setD2EExternalApi(appId: string, externalApiBase: string): Promise<{ ok: boolean }> {
  return apiFetch(`/apps/${appId}/d2e/external-api`, {
    method: "PATCH",
    body: JSON.stringify({ externalApiBase }),
  });
}

export async function redetectD2E(appId: string): Promise<D2EConfig> {
  return apiFetch(`/apps/${appId}/d2e/redetect`, { method: "POST" });
}

export async function getApp(appId: string): Promise<App> {
  return apiFetch(`/apps/${appId}`);
}

export async function updateApp(appId: string, data: Partial<App>): Promise<App> {
  return apiFetch(`/apps/${appId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteApp(appId: string): Promise<void> {
  await apiFetch(`/apps/${appId}`, { method: "DELETE" });
}

export async function duplicateApp(appId: string): Promise<App> {
  return apiFetch(`/apps/${appId}/duplicate`, { method: "POST" });
}

// App files
export async function getFileTree(appId: string): Promise<FileTreeEntry[]> {
  return apiFetch(`/apps/${appId}/files`);
}

export async function getFileContent(appId: string, filePath: string): Promise<string> {
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/apps/${appId}/files/${encodedPath}`, {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.text();
}

export async function saveFileContent(appId: string, filePath: string, content: string): Promise<void> {
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}/apps/${appId}/files/${encodedPath}`, {
    method: "PUT",
    headers: { "Content-Type": "text/plain", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    credentials: "include",
    body: content,
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
}

export async function createFile(appId: string, filePath: string): Promise<void> {
  await saveFileContent(appId, filePath, "");
}

export async function deleteFile(appId: string, filePath: string): Promise<void> {
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  await apiFetch(`/apps/${appId}/files/${encodedPath}`, { method: "DELETE" });
}

export async function renameFile(appId: string, from: string, to: string): Promise<void> {
  await apiFetch(`/apps/${appId}/files-rename`, {
    method: "POST",
    body: JSON.stringify({ from, to }),
  });
}

export async function createDir(appId: string, dirPath: string): Promise<void> {
  await apiFetch(`/apps/${appId}/files-mkdir`, {
    method: "POST",
    body: JSON.stringify({ path: dirPath }),
  });
}

export interface SearchResult {
  file: string;
  line: number;
  col: number;
  text: string;
  before: string | null;
  after: string | null;
}

export async function searchFiles(appId: string, query: string): Promise<SearchResult[]> {
  const result = await apiFetch<{ results: SearchResult[] }>(`/apps/${appId}/search`, {
    method: "POST",
    body: JSON.stringify({ query }),
  });
  return result.results;
}

// Dev server
export async function startDevServer(appId: string): Promise<DevServerStatus> {
  return apiFetch(`/apps/${appId}/server/start`, { method: "POST" });
}

export async function stopDevServer(appId: string): Promise<DevServerStatus> {
  return apiFetch(`/apps/${appId}/server/stop`, { method: "POST" });
}

export async function restartDevServer(appId: string): Promise<DevServerStatus> {
  return apiFetch(`/apps/${appId}/server/restart`, { method: "POST" });
}

export async function getDevServerStatus(appId: string): Promise<DevServerStatus> {
  return apiFetch(`/apps/${appId}/server/status`);
}

export function streamDevServerOutput(
  appId: string,
  onEvent: (event: { type: string; data: string; timestamp: number }) => void,
): AbortController {
  const controller = new AbortController();

  const token = getAuthToken();
  fetch(`${API_BASE}/apps/${appId}/server/output`, {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) return;
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              onEvent(JSON.parse(line.slice(6)));
            } catch { /* skip */ }
          }
        }
      }
    })
    .catch(() => { /* aborted or network error */ });

  return controller;
}

// Type checking / problems
export async function checkApp(appId: string): Promise<{ problems: Problem[]; summary: string }> {
  return apiFetch(`/apps/${appId}/check`, { method: "POST" });
}

// Git
export async function getGitStatus(appId: string): Promise<{ files: GitFile[] }> {
  return apiFetch(`/apps/${appId}/git/status`);
}

export async function getGitLog(appId: string): Promise<GitCommit[]> {
  return apiFetch(`/apps/${appId}/git/log`);
}

export async function getGitBranches(appId: string): Promise<GitBranches> {
  return apiFetch(`/apps/${appId}/git/branches`);
}

export async function gitCommit(appId: string, message: string): Promise<void> {
  await apiFetch(`/apps/${appId}/git/commit`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

export async function gitPush(appId: string): Promise<{ ok: boolean; message: string }> {
  return apiFetch(`/apps/${appId}/git/push`, { method: "POST" });
}

export async function gitPull(appId: string): Promise<{ ok: boolean; message: string }> {
  return apiFetch(`/apps/${appId}/git/pull`, { method: "POST" });
}

// Git branch management
export async function gitCreateBranch(appId: string, name: string): Promise<void> {
  await apiFetch(`/apps/${appId}/git/branches/create`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function gitSwitchBranch(appId: string, name: string): Promise<void> {
  await apiFetch(`/apps/${appId}/git/branches/switch`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function gitDeleteBranch(appId: string, name: string): Promise<void> {
  await apiFetch(`/apps/${appId}/git/branches/delete`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

// Worktrees (agent-driven run isolation)
export async function getGitWorktrees(appId: string): Promise<{ worktrees: GitWorktree[] }> {
  return apiFetch(`/apps/${appId}/git/worktrees`);
}

export async function mergeGitWorktree(appId: string, branch: string, path?: string): Promise<{ ok: boolean; message?: string }> {
  return apiFetch(`/apps/${appId}/git/worktrees/merge`, {
    method: "POST",
    body: JSON.stringify({ branch, path }),
  });
}

export async function discardGitWorktree(appId: string, branch: string | null, path: string): Promise<{ ok: boolean }> {
  return apiFetch(`/apps/${appId}/git/worktrees/discard`, {
    method: "POST",
    body: JSON.stringify({ branch, path }),
  });
}

// GitHub
export async function startGitHubDeviceFlow(): Promise<GitHubDeviceCode> {
  return apiFetch("/integrations/github/device-code", { method: "POST" });
}

export async function pollGitHubToken(deviceCode: string): Promise<{ status: string; username?: string; error?: string }> {
  return apiFetch("/integrations/github/poll-token", {
    method: "POST",
    body: JSON.stringify({ device_code: deviceCode }),
  });
}

export async function getGitHubStatus(): Promise<GitHubStatus> {
  return apiFetch("/integrations/github/status");
}

export async function disconnectGitHub(): Promise<void> {
  await apiFetch("/integrations/github", { method: "DELETE" });
}

// Git commit signing. The private key never crosses this API — generate/import
// return only the public half (+ an optional server-config warning).
export async function getGitSigningStatus(): Promise<GitSigningStatus> {
  return apiFetch("/integrations/git-signing/status");
}

export async function generateGitSigningKey(): Promise<{ public_key: string; fingerprint: string; warning?: string }> {
  return apiFetch("/integrations/git-signing/generate", { method: "POST" });
}

export async function importGitSigningKey(privateKey: string): Promise<{ public_key: string; fingerprint: string; warning?: string }> {
  return apiFetch("/integrations/git-signing/import", {
    method: "POST",
    body: JSON.stringify({ private_key: privateKey }),
  });
}

export async function removeGitSigningKey(): Promise<void> {
  await apiFetch("/integrations/git-signing", { method: "DELETE" });
}

// --- Claude Code Auth ---

export async function getClaudeCodeAuthStatus(): Promise<{
  installed: boolean;
  authenticated: boolean;
  version: string | null;
  account: string | null;
}> {
  return apiFetch("/claude-code/auth-status");
}

export async function startClaudeCodeLogin(): Promise<{
  status: string;
  login_url?: string;
  needs_code?: boolean;
  message: string;
}> {
  return apiFetch("/claude-code/login", { method: "POST" });
}

export async function submitClaudeCodeLoginCode(code: string): Promise<{
  status: string;
  message: string;
}> {
  return apiFetch("/claude-code/login-code", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function claudeCodeLogout(): Promise<{ ok: boolean; message: string }> {
  return apiFetch("/claude-code/logout", { method: "POST" });
}

export async function getFigmaMcpStatus(): Promise<{
  connected: boolean;
  expiresAt: number | null;
  clientRegistered: boolean;
}> {
  return apiFetch("/figma-mcp/status");
}

export async function startFigmaMcpLogin(redirectUri: string): Promise<{ authUrl: string }> {
  return apiFetch("/figma-mcp/login", {
    method: "POST",
    body: JSON.stringify({ redirectUri }),
  });
}

export async function exchangeFigmaMcpCode(code: string, state: string): Promise<{ connected: boolean }> {
  return apiFetch("/figma-mcp/exchange", {
    method: "POST",
    body: JSON.stringify({ code, state }),
  });
}

export async function figmaMcpLogout(): Promise<{ connected: boolean }> {
  return apiFetch("/figma-mcp/logout", { method: "POST" });
}

export function getClaudeCodeModels(): Promise<{ models: ModelInfo[]; source: string }> {
  return apiFetch<{ models: ModelInfo[]; source: string }>("/claude-code/models");
}

// --- GitHub Copilot Auth ---

export async function getCopilotAuthStatus(): Promise<{
  installed: boolean;
  authenticated: boolean;
  version: string | null;
  account: string | null;
}> {
  return apiFetch("/copilot/auth-status");
}

export async function startCopilotLogin(): Promise<{
  status: string;
  login_url?: string;
  user_code?: string;
  message: string;
}> {
  return apiFetch("/copilot/login", { method: "POST" });
}

export async function copilotLogout(): Promise<{ ok: boolean; message: string }> {
  return apiFetch("/copilot/logout", { method: "POST" });
}

// --- GitHub Repos ---

export async function listGitHubRepos(): Promise<GitHubRepo[]> {
  return apiFetch("/integrations/github/repos");
}

export async function createGitHubRepo(appId: string, name: string, isPrivate = true): Promise<{ url: string; clone_url: string }> {
  return apiFetch(`/apps/${appId}/github/create-repo`, {
    method: "POST",
    body: JSON.stringify({ name, private: isPrivate }),
  });
}

export async function connectGitHubRepo(appId: string, url: string): Promise<void> {
  await apiFetch(`/apps/${appId}/github/connect-repo`, {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

// MCP servers
export async function listMcpServers(): Promise<McpServer[]> {
  return apiFetch("/mcp/servers");
}

export async function createMcpServer(config: Partial<McpServer>): Promise<McpServer> {
  return apiFetch("/mcp/servers", {
    method: "POST",
    body: JSON.stringify(config),
  });
}

export async function updateMcpServer(id: string, config: Partial<McpServer>): Promise<McpServer> {
  return apiFetch(`/mcp/servers/${id}`, {
    method: "PATCH",
    body: JSON.stringify(config),
  });
}

export async function deleteMcpServer(id: string): Promise<void> {
  await apiFetch(`/mcp/servers/${id}`, { method: "DELETE" });
}

export async function testMcpServer(id: string): Promise<{ ok: boolean; tools?: McpTool[]; error?: string }> {
  return apiFetch(`/mcp/servers/${id}/test`, { method: "POST" });
}

// Support settings (instance-global)
export async function listUserMap(): Promise<UserMapEntry[]> {
  return apiFetch("/support/user-map");
}

export async function saveUserMapEntry(entry: {
  github_login: string;
  discord_user_id: string;
  display_name?: string;
}): Promise<UserMapEntry> {
  return apiFetch("/support/user-map", { method: "POST", body: JSON.stringify(entry) });
}

export async function deleteUserMapEntry(id: string): Promise<void> {
  await apiFetch(`/support/user-map/${id}`, { method: "DELETE" });
}

export async function listSlackAllowlist(): Promise<SlackAllowlistEntry[]> {
  return apiFetch("/support/slack-allowlist");
}

export async function addSlackAllowlistEntry(entry: { slack_user_id: string; note?: string }): Promise<SlackAllowlistEntry> {
  return apiFetch("/support/slack-allowlist", { method: "POST", body: JSON.stringify(entry) });
}

export async function deleteSlackAllowlistEntry(id: string): Promise<void> {
  await apiFetch(`/support/slack-allowlist/${id}`, { method: "DELETE" });
}

// Trex database
export async function createAppDatabase(appId: string): Promise<{ schema_name: string }> {
  return apiFetch(`/apps/${appId}/database/create`, { method: "POST" });
}

export async function getAppTables(appId: string): Promise<{ table_name: string; table_type: string }[]> {
  return apiFetch(`/apps/${appId}/database/tables`);
}

// Plans
export async function getPlan(chatId: string): Promise<Plan | null> {
  return apiFetch(`/chats/${chatId}/plan`);
}

export async function answerQuestionnaire(chatId: string, requestId: string, answers: Record<string, unknown>): Promise<void> {
  await apiFetch(`/chats/${chatId}/plan/answer`, {
    method: "POST",
    body: JSON.stringify({ requestId, answers }),
  });
}

export async function listAppPlans(appId: string): Promise<Plan[]> {
  return apiFetch(`/apps/${appId}/plans`);
}

export async function updatePlanStatus(planId: string, status: Plan["status"]): Promise<void> {
  await apiFetch(`/plans/${planId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

/** Start an agent-driven run that implements the plan via the subagent-driven
 * skill. Returns the new agent-run id (surfaces in the Agents tab). */
export async function executePlan(planId: string, appId?: string): Promise<{ runId: string }> {
  // File-backed plans (id "file:…") have no DB row, so the server needs appId
  // to read the markdown and anchor the run. Harmless for DB plans.
  return apiFetch(`/plans/${planId}/execute`, {
    method: "POST",
    ...(appId ? { body: JSON.stringify({ appId }) } : {}),
  });
}

// Security
export async function securityScan(appId: string): Promise<{ findings: { severity: string; title: string; description: string; file?: string }[] }> {
  return apiFetch(`/apps/${appId}/security/scan`, { method: "POST" });
}

export async function getLatestSecurityReview(appId: string): Promise<SecurityReview | null> {
  return apiFetch(`/apps/${appId}/security/reviews`);
}

export interface SecurityReviewCallbacks {
  onProgress: (message: string) => void;
  onDone: (review: SecurityReview) => void;
  onError: (error: string) => void;
}

export function streamSecurityReview(appId: string, callbacks: SecurityReviewCallbacks): AbortController {
  const controller = new AbortController();

  fetch(`${API_BASE}/apps/${appId}/security/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.text();
        try {
          const parsed = JSON.parse(body);
          callbacks.onError(parsed.error || `API error ${res.status}`);
        } catch {
          callbacks.onError(`API error ${res.status}: ${body}`);
        }
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        callbacks.onError("No response body");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              switch (parsed.type) {
                case "review_progress":
                  callbacks.onProgress(parsed.message);
                  break;
                case "review_done":
                  callbacks.onDone(parsed.review);
                  break;
                case "review_error":
                  callbacks.onError(parsed.error);
                  break;
              }
            } catch { /* skip malformed */ }
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        callbacks.onError(err.message);
      }
    });

  return controller;
}

// Code review
export async function getLatestCodeReview(appId: string): Promise<CodeReview | null> {
  return apiFetch(`/apps/${appId}/code/reviews`);
}

export interface CodeReviewCallbacks {
  onProgress: (message: string) => void;
  onDone: (review: CodeReview) => void;
  onError: (error: string) => void;
}

export function streamCodeReview(appId: string, callbacks: CodeReviewCallbacks): AbortController {
  const controller = new AbortController();

  fetch(`${API_BASE}/apps/${appId}/code/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.text();
        try {
          const parsed = JSON.parse(body);
          callbacks.onError(parsed.error || `API error ${res.status}`);
        } catch {
          callbacks.onError(`API error ${res.status}: ${body}`);
        }
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        callbacks.onError("No response body");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              switch (parsed.type) {
                case "code_review_progress":
                  callbacks.onProgress(parsed.message);
                  break;
                case "code_review_done":
                  callbacks.onDone(parsed.review);
                  break;
                case "code_review_error":
                  callbacks.onError(parsed.error);
                  break;
              }
            } catch { /* skip malformed */ }
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        callbacks.onError(err.message);
      }
    });

  return controller;
}

// QA test review
export async function getLatestQaReview(appId: string): Promise<QaTestReview | null> {
  return apiFetch(`/apps/${appId}/qa/reviews`);
}

export interface QaReviewCallbacks {
  onProgress: (message: string) => void;
  onDone: (review: QaTestReview) => void;
  onError: (error: string) => void;
}

export function streamQaReview(appId: string, callbacks: QaReviewCallbacks): AbortController {
  const controller = new AbortController();

  fetch(`${API_BASE}/apps/${appId}/qa/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.text();
        try {
          const parsed = JSON.parse(body);
          callbacks.onError(parsed.error || `API error ${res.status}`);
        } catch {
          callbacks.onError(`API error ${res.status}: ${body}`);
        }
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        callbacks.onError("No response body");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              switch (parsed.type) {
                case "qa_review_progress":
                  callbacks.onProgress(parsed.message);
                  break;
                case "qa_review_done":
                  callbacks.onDone(parsed.review);
                  break;
                case "qa_review_error":
                  callbacks.onError(parsed.error);
                  break;
              }
            } catch { /* skip malformed */ }
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        callbacks.onError(err.message);
      }
    });

  return controller;
}

// Design review
export async function getLatestDesignReview(appId: string): Promise<DesignReview | null> {
  return apiFetch(`/apps/${appId}/design/reviews`);
}

export interface DesignReviewCallbacks {
  onProgress: (message: string) => void;
  onDone: (review: DesignReview) => void;
  onError: (error: string) => void;
}

export function streamDesignReview(appId: string, callbacks: DesignReviewCallbacks): AbortController {
  const controller = new AbortController();

  fetch(`${API_BASE}/apps/${appId}/design/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.text();
        try {
          const parsed = JSON.parse(body);
          callbacks.onError(parsed.error || `API error ${res.status}`);
        } catch {
          callbacks.onError(`API error ${res.status}: ${body}`);
        }
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        callbacks.onError("No response body");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              switch (parsed.type) {
                case "design_review_progress":
                  callbacks.onProgress(parsed.message);
                  break;
                case "design_review_done":
                  callbacks.onDone(parsed.review);
                  break;
                case "design_review_error":
                  callbacks.onError(parsed.error);
                  break;
              }
            } catch { /* skip malformed */ }
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        callbacks.onError(err.message);
      }
    });

  return controller;
}

// Docs update — same SSE contract as the reviews; the agent writes docs pages
// and its "review" payload lists the pages it added/updated.
export async function getLatestDocsReview(appId: string): Promise<DocsReview | null> {
  return apiFetch(`/apps/${appId}/docs/reviews`);
}

export interface DocsReviewCallbacks {
  onProgress: (message: string) => void;
  onDone: (review: DocsReview) => void;
  onError: (error: string) => void;
}

export function streamDocsReview(appId: string, callbacks: DocsReviewCallbacks): AbortController {
  const controller = new AbortController();

  fetch(`${API_BASE}/apps/${appId}/docs/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.text();
        try {
          const parsed = JSON.parse(body);
          callbacks.onError(parsed.error || `API error ${res.status}`);
        } catch {
          callbacks.onError(`API error ${res.status}: ${body}`);
        }
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        callbacks.onError("No response body");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              switch (parsed.type) {
                case "docs_review_progress":
                  callbacks.onProgress(parsed.message);
                  break;
                case "docs_review_done":
                  callbacks.onDone(parsed.review);
                  break;
                case "docs_review_error":
                  callbacks.onError(parsed.error);
                  break;
              }
            } catch { /* skip malformed */ }
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        callbacks.onError(err.message);
      }
    });

  return controller;
}

// Streaming chat with agent event support
export interface StreamCallbacks {
  onChunk: (text: string) => void;
  onDone: (message: Message) => void;
  onError: (error: string) => void;
  onToolCall?: (toolCall: ToolCall) => void;
  onToolCallEnd?: (toolCall: ToolCall) => void;
  onConsentRequest?: (request: ConsentRequest) => void;
  onTodos?: (todos: AgentTodo[]) => void;
  onStep?: (step: number, maxSteps: number) => void;
  // Plan mode events
  onQuestionnaire?: (request: QuestionnaireRequest) => void;
  onPlanUpdate?: (content: string) => void;
  onPlanExit?: () => void;
  onModeChange?: (mode: string) => void;
  // Token usage
  onTokenUsage?: (usage: { promptTokens?: number; completionTokens?: number }) => void;
  // Build actions (file written, renamed, deleted, etc.)
  onBuildAction?: (action: BuildAction) => void;
  // App commands (e.g. refresh preview)
  onAppCommand?: (command: string) => void;
}

export function streamChat(
  chatId: string,
  prompt: string,
  callbacks: StreamCallbacks,
  context?: { visualEdit?: { filePath: string; line: number; componentName: string }; selectedComponents?: { devxId: string; devxName: string; filePath: string; line: number }[] },
): AbortController {
  const controller = new AbortController();

  const streamToken = getAuthToken();
  fetch(`${API_BASE}/chats/${chatId}/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(streamToken ? { Authorization: `Bearer ${streamToken}` } : {}) },
    credentials: "include",
    body: JSON.stringify({ prompt, context }),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.text();
        callbacks.onError(`API error ${res.status}: ${body}`);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        callbacks.onError("No response body");
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;
            try {
              const parsed = JSON.parse(data);
              switch (parsed.type) {
                case "chunk":
                  callbacks.onChunk(parsed.content);
                  break;
                case "done":
                  callbacks.onDone(parsed.message);
                  break;
                case "error":
                  callbacks.onError(parsed.error);
                  break;
                case "tool_call_start":
                  callbacks.onToolCall?.({ callId: parsed.callId, name: parsed.name, args: parsed.args });
                  // Yield to let React render the pending state before tool_call_end arrives
                  await new Promise((r) => setTimeout(r, 0));
                  break;
                case "tool_call_end":
                  callbacks.onToolCallEnd?.({ callId: parsed.callId, name: parsed.name, args: {}, result: parsed.result, error: parsed.error });
                  break;
                case "consent_request":
                  callbacks.onConsentRequest?.({ requestId: parsed.requestId, toolName: parsed.toolName, inputPreview: parsed.inputPreview });
                  break;
                case "todos":
                  callbacks.onTodos?.(parsed.todos);
                  break;
                case "step":
                  callbacks.onStep?.(parsed.step, parsed.maxSteps);
                  break;
                case "questionnaire":
                  callbacks.onQuestionnaire?.({ requestId: parsed.requestId, questions: parsed.questions });
                  break;
                case "plan_update":
                  callbacks.onPlanUpdate?.(parsed.content);
                  break;
                case "plan_exit":
                  callbacks.onPlanExit?.();
                  if (parsed.mode) callbacks.onModeChange?.(parsed.mode);
                  break;
                case "token_usage":
                  callbacks.onTokenUsage?.({ promptTokens: parsed.prompt_tokens, completionTokens: parsed.completion_tokens });
                  break;
                case "build_action":
                  callbacks.onBuildAction?.({ action: parsed.action, path: parsed.path, error: parsed.error });
                  break;
                case "app_command":
                  callbacks.onAppCommand?.(parsed.command);
                  break;
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        callbacks.onError(err.message);
      }
    });

  return controller;
}

// Supabase integration
export async function getSupabaseStatus(): Promise<SupabaseStatus> {
  return apiFetch("/integrations/supabase/status");
}

export async function connectSupabase(accessToken: string): Promise<{ connected: boolean }> {
  return apiFetch("/integrations/supabase/connect", {
    method: "POST",
    body: JSON.stringify({ access_token: accessToken }),
  });
}

export async function disconnectSupabase(): Promise<void> {
  await apiFetch("/integrations/supabase", { method: "DELETE" });
}

export async function listSupabaseProjects(): Promise<SupabaseProject[]> {
  return apiFetch("/integrations/supabase/projects");
}

export async function getDeployConfig(appId: string): Promise<SupabaseDeployConfig> {
  return apiFetch(`/apps/${appId}/supabase/config`);
}

export async function saveDeployConfig(appId: string, config: SupabaseDeployConfig): Promise<void> {
  await apiFetch(`/apps/${appId}/supabase/config`, {
    method: "POST",
    body: JSON.stringify(config),
  });
}

export async function listDeployments(appId: string): Promise<Deployment[]> {
  return apiFetch(`/apps/${appId}/deployments`);
}

export interface DeployCallbacks {
  onStep: (step: DeployStep) => void;
  onLog: (message: string) => void;
  onDone: (result: { status: string; deployment_id: string; steps: DeployStep[]; error?: string }) => void;
}

export function streamDeploy(appId: string, callbacks: DeployCallbacks): AbortController {
  const controller = new AbortController();

  const deployToken = getAuthToken();
  fetch(`${API_BASE}/apps/${appId}/deploy`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(deployToken ? { Authorization: `Bearer ${deployToken}` } : {}) },
    credentials: "include",
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.text();
        callbacks.onDone({ status: "failed", deployment_id: "", steps: [], error: `API error ${res.status}: ${body}` });
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        callbacks.onDone({ status: "failed", deployment_id: "", steps: [], error: "No response body" });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6));
              switch (parsed.type) {
                case "deploy_step":
                  callbacks.onStep({ name: parsed.step, status: parsed.status, message: parsed.message });
                  break;
                case "deploy_log":
                  callbacks.onLog(parsed.message);
                  break;
                case "deploy_done":
                  callbacks.onDone({
                    status: parsed.status,
                    deployment_id: parsed.deployment_id,
                    steps: parsed.steps || [],
                    error: parsed.error,
                  });
                  break;
              }
            } catch { /* skip malformed */ }
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        callbacks.onDone({ status: "failed", deployment_id: "", steps: [], error: err.message });
      }
    });

  return controller;
}

// Visual editing
export async function applyVisualEdit(
  appId: string,
  changes: import("./visual-editing-types").PendingChange[],
): Promise<{ results: { filePath: string; success: boolean; error?: string }[] }> {
  return apiFetch(`/apps/${appId}/visual-edit`, {
    method: "POST",
    body: JSON.stringify({ changes }),
  });
}

export async function setupVisualEditing(appId: string): Promise<{ success: boolean; error?: string }> {
  return apiFetch(`/apps/${appId}/setup-visual-editing`, { method: "POST" });
}

// Skills, Commands, Hooks, Agents

import type { Skill, DevxCommand, DevxHook, DevxAgent, SlashCompletion } from "./types";

export async function getSkills(): Promise<Skill[]> {
  return apiFetch("/skills");
}

export async function createSkill(data: Partial<Skill>): Promise<Skill> {
  return apiFetch("/skills", { method: "POST", body: JSON.stringify(data) });
}

export async function updateSkill(id: string, data: Partial<Skill>): Promise<Skill> {
  return apiFetch(`/skills/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function deleteSkill(id: string): Promise<void> {
  await apiFetch(`/skills/${id}`, { method: "DELETE" });
}

export async function importSkill(content: string): Promise<Skill> {
  return apiFetch("/skills/import", { method: "POST", body: JSON.stringify({ content }) });
}

export async function getCommands(): Promise<DevxCommand[]> {
  return apiFetch("/commands");
}

export async function createCommand(data: Partial<DevxCommand>): Promise<DevxCommand> {
  return apiFetch("/commands", { method: "POST", body: JSON.stringify(data) });
}

export async function updateCommand(id: string, data: Partial<DevxCommand>): Promise<DevxCommand> {
  return apiFetch(`/commands/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function deleteCommand(id: string): Promise<void> {
  await apiFetch(`/commands/${id}`, { method: "DELETE" });
}

export async function getHooks(): Promise<DevxHook[]> {
  return apiFetch("/hooks");
}

export async function createHook(data: Partial<DevxHook>): Promise<DevxHook> {
  return apiFetch("/hooks", { method: "POST", body: JSON.stringify(data) });
}

export async function updateHook(id: string, data: Partial<DevxHook>): Promise<DevxHook> {
  return apiFetch(`/hooks/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function deleteHook(id: string): Promise<void> {
  await apiFetch(`/hooks/${id}`, { method: "DELETE" });
}

export async function getAgents(): Promise<DevxAgent[]> {
  return apiFetch("/agents");
}

export async function createAgent(data: Partial<DevxAgent>): Promise<DevxAgent> {
  return apiFetch("/agents", { method: "POST", body: JSON.stringify(data) });
}

export async function updateAgent(id: string, data: Partial<DevxAgent>): Promise<DevxAgent> {
  return apiFetch(`/agents/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export async function deleteAgent(id: string): Promise<void> {
  await apiFetch(`/agents/${id}`, { method: "DELETE" });
}

export async function getSlashCompletions(query: string): Promise<SlashCompletion[]> {
  return apiFetch(`/slash-completions?q=${encodeURIComponent(query)}`);
}

// --- Subagent Runs ---

import type { SubagentRun, SubagentMessage } from "./types";

export async function listAgentRuns(appId?: string | null): Promise<SubagentRun[]> {
  const qs = appId ? `?app_id=${appId}` : "";
  return apiFetch(`/agent-runs${qs}`);
}

export async function getAgentMessages(runId: string): Promise<SubagentMessage[]> {
  return apiFetch(`/agent-runs/${runId}/messages`);
}

export async function stopAgentRun(runId: string): Promise<void> {
  await apiFetch(`/agent-runs/${runId}/stop`, { method: "POST" });
}

export function startAgentRun(
  runId: string,
  callbacks: {
    onChunk: (content: string) => void;
    onToolCall: (name: string, args: unknown) => void;
    onStep: (step: number, maxSteps: number) => void;
    onDone: (content: string) => void;
    onError: (error: string) => void;
  },
): AbortController {
  const controller = new AbortController();
  const token = getAuthToken();

  fetch(`${API_BASE}/agent-runs/${runId}/start`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: "include",
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.text();
        try {
          callbacks.onError(JSON.parse(body).error || `API error ${res.status}`);
        } catch {
          callbacks.onError(`API error ${res.status}: ${body}`);
        }
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) { callbacks.onError("No response body"); return; }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "chunk") callbacks.onChunk(data.content);
            else if (data.type === "tool_call_start") callbacks.onToolCall(data.name, data.args);
            else if (data.type === "step") callbacks.onStep(data.step, data.maxSteps);
            else if (data.type === "done") callbacks.onDone(data.content);
            else if (data.type === "error") callbacks.onError(data.error);
          } catch { /* skip */ }
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") callbacks.onError(err.message);
    });

  return controller;
}
