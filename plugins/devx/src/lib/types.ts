export interface Message {
  id: string;
  chat_id: string;
  role: "user" | "assistant";
  content: string;
  model?: string | null;
  tokens?: number | null;
  error?: string | null;
  tool_calls?: ToolCall[] | null;
  created_at: string;
}

export interface Chat {
  id: string;
  user_id: string;
  title: string;
  mode: ChatMode;
  app_id?: string | null;
  created_at: string;
  updated_at: string;
}

export type ChatMode = "build" | "ask" | "agent" | "plan";

export const CHAT_MODES: { id: ChatMode; label: string; description: string }[] = [
  { id: "agent", label: "Agent", description: "Autonomous coding agent" },
  { id: "plan", label: "Plan", description: "Plan before building" },
  { id: "ask", label: "Chat", description: "Chat without code changes" },
];


export interface DevxSettings {
  id: string;
  user_id: string;
  provider: string;
  model: string;
  api_key?: string;
  base_url?: string;
  ai_rules?: string;
  auto_approve?: boolean;
  max_steps?: number;
  max_tool_steps?: number;
  auto_fix_problems?: boolean;
}

export interface ProviderConfigRecord {
  id: string;
  user_id: string;
  provider: Provider;
  model: string;
  api_key?: string;
  base_url?: string;
  display_name?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Agent types

export interface AgentTodo {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
}

export interface ToolCall {
  callId: string;
  name: string;
  args: Record<string, unknown>;
  result?: string;
  error?: boolean;
}

export interface ConsentRequest {
  requestId: string;
  toolName: string;
  inputPreview?: string;
}

// App types

export interface App {
  id: string;
  user_id: string;
  name: string;
  path: string;
  tech_stack?: string | null;
  dev_command: string;
  install_command: string;
  build_command: string;
  dev_port?: number | null;
  supabase_target?: string | null;
  supabase_project_id?: string | null;
  config?: Record<string, string> | null;
  created_at: string;
  updated_at: string;
}

/** Template-specific configurable fields shown in the preview settings bar */
export interface TemplateConfigField {
  key: string;
  label: string;
  placeholder: string;
  type?: "text" | "url";
}

export const TEMPLATE_CONFIG_FIELDS: Record<string, TemplateConfigField[]> = {
  "atlas-vue": [
    { key: "VITE_WEBAPI_URL", label: "WebAPI URL", placeholder: "http://localhost:8080/WebAPI", type: "url" },
  ],
  "d2e-react": [
    { key: "datasetId", label: "Dataset ID", placeholder: "dataset-uuid" },
    { key: "studyId", label: "Study ID", placeholder: "study-uuid" },
  ],
};

// Supabase deploy types

export interface SupabaseDeployConfig {
  target: "local" | "cloud";
  project_id: string | null;
}

export interface SupabaseStatus {
  connected: boolean;
}

export interface SupabaseProject {
  id: string;
  name: string;
  region: string;
  status: string;
}

export interface DeployStep {
  name: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  message?: string;
}

export interface Deployment {
  id: string;
  target: string;
  target_project_id?: string | null;
  status: "pending" | "running" | "success" | "failed";
  steps: DeployStep[];
  error?: string;
  created_at: string;
  completed_at?: string;
}

// Security review types

export interface SecurityFinding {
  title: string;
  level: "critical" | "high" | "medium" | "low";
  description: string;
}

export interface SecurityReview {
  id: string;
  findings: SecurityFinding[];
  created_at: string;
}

// Code review types

export interface CodeReviewFinding {
  title: string;
  level: "critical" | "high" | "medium" | "low";
  description: string;
}

export interface CodeReview {
  id: string;
  findings: CodeReviewFinding[];
  created_at: string;
}

// QA test review types

export interface QaTestFinding {
  title: string;
  level: "critical" | "high" | "medium" | "low";
  description: string;
}

export interface QaTestReview {
  id: string;
  findings: QaTestFinding[];
  created_at: string;
}

// Design review types

export interface DesignFinding {
  title: string;
  level: "critical" | "high" | "medium" | "low";
  description: string;
}

export interface DesignReview {
  id: string;
  findings: DesignFinding[];
  created_at: string;
}

export interface DevServerStatus {
  status: "stopped" | "starting" | "running" | "error";
  port?: number;
  pid?: number;
  url?: string;
  error?: string;
}

export interface FileTreeEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileTreeEntry[];
}

export interface ServerOutputEvent {
  type: "stdout" | "stderr" | "status_change";
  data: string;
  timestamp: number;
}

export interface Problem {
  file: string;
  line: number;
  col: number;
  message: string;
  severity: "error" | "warning";
}

// Git types
export interface GitFile {
  path: string;
  status: string;
}

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export interface GitBranches {
  current: string;
  branches: string[];
}

export interface GitWorktree {
  path: string;
  branch: string | null;
  head: string;
  isMain: boolean;
  status: GitFile[];
  runId: string | null;
  runStatus?: string | null;
}

// GitHub types
export interface GitHubStatus {
  connected: boolean;
  username?: string;
}

export interface GitHubDeviceCode {
  device_code: string;
  user_code: string;
  verification_uri: string;
  interval: number;
  expires_in: number;
}

export interface GitHubRepo {
  name: string;
  url: string;
  clone_url: string;
  private: boolean;
  default_branch: string;
}

// MCP types
export interface McpServer {
  id: string;
  user_id: string;
  name: string;
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled: boolean;
  created_at: string;
}

export interface McpTool {
  serverName: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// Plan types
export interface Plan {
  id: string;
  chat_id: string;
  content: string;
  status: "draft" | "accepted" | "rejected" | "implemented";
  created_at: string;
  updated_at: string;
  chat_title?: string;
  /** "db" for plans tracked in devx.plans; "file" for read-only markdown
   * surfaced from docs/devx/{plans,specs}/. File entries cannot have their
   * status mutated. */
  source?: "db" | "file";
}

export interface PlanQuestion {
  id: string;
  type: "text" | "radio" | "checkbox";
  label: string;
  options?: string[];
}

export interface QuestionnaireRequest {
  requestId: string;
  questions: PlanQuestion[];
}

// Build action types
export interface BuildAction {
  action: string;
  path?: string;
  error?: string;
}

// Skills, Commands, Hooks, Agents

export interface Skill {
  id: string;
  name: string;
  slug: string | null;
  description: string;
  version: string;
  body: string;
  allowed_tools: string[] | null;
  mode: string | null;
  is_builtin: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface DevxCommand {
  id: string;
  slug: string;
  description: string | null;
  body: string;
  allowed_tools: string[] | null;
  model: string | null;
  argument_hint: string | null;
  is_builtin: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export type HookEvent = "PreToolUse" | "PostToolUse" | "Stop";

export interface DevxHook {
  id: string;
  event: HookEvent;
  matcher: string | null;
  hook_type: "command" | "prompt";
  command: string | null;
  prompt: string | null;
  timeout_ms: number;
  is_builtin: boolean;
  enabled: boolean;
  sort_order: number;
  created_at: string;
}

export interface DevxAgent {
  id: string;
  name: string;
  description: string;
  body: string;
  allowed_tools: string[] | null;
  model: string;
  max_steps: number;
  is_builtin: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubagentRun {
  id: string;
  parent_chat_id?: string;
  agent_name: string;
  skill_name?: string | null;
  task: string;
  status: "running" | "completed" | "failed";
  result?: string | null;
  created_at: string;
  completed_at: string | null;
  app_id?: string | null;
  run_kind?: "agent" | "subagent" | null;
  plan_id?: string | null;
  branch?: string | null;
  worktree_path?: string | null;
  parent_run_id?: string | null;
}

/** Item returned by /slash-completions endpoint */
export interface SlashCompletion {
  slug: string;
  description: string | null;
  type: "skill" | "command";
  argument_hint?: string | null;
}

export interface SubagentMessage {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_name?: string | null;
  tool_call_id?: string | null;
  created_at: string;
}

// Prompt templates
export interface PromptTemplate {
  id: string;
  user_id: string;
  name: string;
  content: string;
  category: string;
  created_at: string;
}

// Attachment types
export interface Attachment {
  id: string;
  message_id: string;
  filename: string;
  content_type: string;
  size_bytes: number;
}

export type Provider = "anthropic" | "openai" | "google" | "openai-compatible" | "bedrock" | "claude-code" | "copilot";

export interface ProviderConfig {
  id: Provider;
  name: string;
  models: string[];
  requiresApiKey: boolean;
  requiresBaseUrl: boolean;
}

export const PROVIDERS: ProviderConfig[] = [
  {
    id: "anthropic",
    name: "Anthropic",
    models: [
      "claude-sonnet-4-6-20250627",
      "claude-sonnet-4-20250514",
      "claude-haiku-4-5-20251001",
    ],
    requiresApiKey: true,
    requiresBaseUrl: false,
  },
  {
    id: "openai",
    name: "OpenAI",
    models: [
      "gpt-5.3-codex",
      "gpt-5-mini",
    ],
    requiresApiKey: true,
    requiresBaseUrl: false,
  },
  {
    id: "google",
    name: "Google",
    models: [
      "gemini-3.1-pro",
      "gemini-2.5-pro-preview-06-05",
      "gemini-2.5-flash-preview-05-20",
      "gemini-2.0-flash",
    ],
    requiresApiKey: true,
    requiresBaseUrl: false,
  },
  {
    id: "openai-compatible",
    name: "OpenAI Compatible",
    models: [],
    requiresApiKey: true,
    requiresBaseUrl: true,
  },
  {
    id: "bedrock",
    name: "AWS Bedrock",
    models: [
      "us.anthropic.claude-sonnet-4-6",
      "mistral.devstral-2-123b",
      "minimax.minimax-m2.5",
      "qwen.qwen3-coder-next",
      "moonshotai.kimi-k2.5",
      "zai.glm-5",
    ],
    requiresApiKey: false,
    requiresBaseUrl: false,
  },
  {
    id: "claude-code",
    name: "Claude Code (Subscription)",
    models: [
      "claude-sonnet-4-6",
      "claude-opus-4-6",
      "sonnet",
      "opus",
    ],
    requiresApiKey: false,
    requiresBaseUrl: false,
  },
  {
    id: "copilot",
    name: "GitHub Copilot (Subscription)",
    models: [
      "gpt-5.3-codex",
      "gpt-5-mini",
      "claude-sonnet-4-6",
      "gemini-3.1-pro",
    ],
    requiresApiKey: false,
    requiresBaseUrl: false,
  },
];
