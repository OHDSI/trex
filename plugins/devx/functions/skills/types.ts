// @ts-nocheck - Deno edge function
/**
 * Type definitions for the DevX skills, commands, hooks, and agents system.
 */

// --- Skills ---

export interface Skill {
  id: string;
  user_id: string | null;
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

/** Metadata-only view (loaded for all skills, always in context) */
export interface SkillMetadata {
  id: string;
  name: string;
  slug: string | null;
  aliases: string[] | null;
  description: string;
  allowed_tools: string[] | null;
  mode: string | null;
  is_builtin: boolean;
}

// --- Commands ---

export interface Command {
  id: string;
  user_id: string | null;
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

// --- Hooks ---

export type HookEvent = "PreToolUse" | "PostToolUse" | "Stop";
export type HookType = "command" | "prompt";

export interface Hook {
  id: string;
  user_id: string | null;
  event: HookEvent;
  matcher: string | null;
  hook_type: HookType;
  command: string | null;
  prompt: string | null;
  timeout_ms: number;
  is_builtin: boolean;
  enabled: boolean;
  sort_order: number;
  created_at: string;
}

export interface HookResult {
  action: "approve" | "deny" | "modify";
  modifications?: Record<string, unknown>;
  modifiedResult?: string;
}

// --- Agents ---

export interface AgentDefinition {
  id: string;
  user_id: string | null;
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
  parent_chat_id: string;
  agent_name: string;
  task: string;
  status: "running" | "completed" | "failed";
  result: string | null;
  created_at: string;
  completed_at: string | null;
}

// --- Pipeline types ---

/** Override applied when a /command is resolved */
export interface CommandOverride {
  body: string;
  allowed_tools: string[] | null;
  model: string | null;
}

/** Parsed slash input from user message */
export interface ParsedSlashInput {
  slug: string;
  args: string;
}

// --- Frontmatter types ---

export interface ParsedFrontmatter {
  metadata: Record<string, unknown>;
  body: string;
}
