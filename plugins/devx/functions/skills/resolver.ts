// @ts-nocheck - Deno edge function
/**
 * Skill and command resolver for the DevX agent pipeline.
 * Handles slash command detection, skill intent matching, and command resolution.
 */

import type {
  SkillMetadata,
  Skill,
  Command,
  CommandOverride,
  ParsedSlashInput,
} from "./types.ts";

type SqlFn = (query: string, params?: unknown[]) => Promise<{ rows: any[] }>;

// --- Slash input parsing ---

/**
 * Parse user input to detect /slash-command at the start.
 * Returns null if no slash command detected.
 */
export function parseSlashInput(input: string): ParsedSlashInput | null {
  const trimmed = input.trim();
  const match = trimmed.match(/^\/([a-zA-Z0-9-]+)(?:\s+(.*))?$/s);
  if (!match) return null;
  return {
    slug: match[1],
    args: (match[2] || "").trim(),
  };
}

// --- Command resolution ---

/**
 * Look up a command by slug. User commands take priority over built-in.
 */
export async function resolveCommand(
  slug: string,
  userId: string,
  sqlFn: SqlFn,
): Promise<Command | null> {
  // User's command first, then built-in
  const result = await sqlFn(
    `SELECT * FROM devx.commands
     WHERE slug = $1 AND enabled = true
       AND (user_id = $2 OR (is_builtin = true AND user_id IS NULL))
     ORDER BY (user_id IS NOT NULL) DESC
     LIMIT 1`,
    [slug, userId],
  );
  return result.rows[0] || null;
}

/**
 * Build a CommandOverride from a resolved command.
 */
export function buildCommandOverride(
  command: Command,
  args: string,
): CommandOverride {
  // Substitute $ARGUMENTS placeholder in command body
  let body = command.body;
  body = body.replace(/\$ARGUMENTS/g, args);
  body = body.replace(/\$1/g, args.split(/\s+/)[0] || "");

  return {
    body,
    allowed_tools: command.allowed_tools,
    model: command.model,
  };
}

// --- Skill loading ---

/**
 * Load all enabled skill metadata (lightweight, no body) for a user.
 * Includes both user-created and built-in skills.
 */
export async function loadSkillMetadata(
  userId: string,
  sqlFn: SqlFn,
): Promise<SkillMetadata[]> {
  const result = await sqlFn(
    `SELECT id, name, slug, description, allowed_tools, mode, aliases, is_builtin
     FROM devx.skills
     WHERE enabled = true
       AND (user_id = $1 OR (is_builtin = true AND user_id IS NULL))`,
    [userId],
  );
  return result.rows;
}

/**
 * Find a skill by exact slug match, including aliases defined in skill metadata.
 */
export function matchSkillBySlug(
  slug: string,
  skills: SkillMetadata[],
): SkillMetadata | null {
  // Prefer user skill over built-in when slugs collide
  const userMatch = skills.find((s) => s.slug === slug && !s.is_builtin);
  if (userMatch) return userMatch;
  const direct = skills.find((s) => s.slug === slug);
  if (direct) return direct;

  // Check aliases defined in skill metadata
  const byAlias = skills.find((s) => s.aliases?.includes(slug) && !s.is_builtin);
  if (byAlias) return byAlias;
  return skills.find((s) => s.aliases?.includes(slug)) || null;
}

/**
 * Match skills by user intent using keyword scoring against descriptions.
 * Returns the best matching skill if score is above threshold.
 */
export function matchSkillsByIntent(
  message: string,
  skills: SkillMetadata[],
): SkillMetadata | null {
  if (!message || skills.length === 0) return null;

  const msgTokens = tokenize(message);
  if (msgTokens.length === 0) return null;

  let bestSkill: SkillMetadata | null = null;
  let bestScore = 0;

  for (const skill of skills) {
    const descTokens = tokenize(skill.description);
    if (descTokens.length === 0) continue;

    // Count how many description tokens appear in the message
    let matchCount = 0;
    for (const token of descTokens) {
      if (msgTokens.includes(token)) matchCount++;
    }

    // Dice coefficient — symmetric scoring that doesn't penalize long descriptions
    const score = (2 * matchCount) / (descTokens.length + msgTokens.length);

    // Also check for quoted trigger phrases in description
    const quotedPhrases = extractQuotedPhrases(skill.description);
    let phraseBonus = 0;
    for (const phrase of quotedPhrases) {
      if (message.toLowerCase().includes(phrase.toLowerCase())) {
        phraseBonus += 0.3;
      }
    }

    const totalScore = score + phraseBonus;

    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestSkill = skill;
    }
  }

  // Threshold: require a reasonable match
  const THRESHOLD = 0.25;
  return bestScore >= THRESHOLD ? bestSkill : null;
}

/**
 * Load the full skill body by ID.
 */
export async function loadSkillBody(
  skillId: string,
  sqlFn: SqlFn,
): Promise<string | null> {
  const result = await sqlFn(
    `SELECT body FROM devx.skills WHERE id = $1`,
    [skillId],
  );
  return result.rows[0]?.body || null;
}

/**
 * Load a full skill by name (for enrichment with SECURITY_RULES.md etc).
 */
export async function loadSkillByName(
  name: string,
  userId: string,
  sqlFn: SqlFn,
): Promise<Skill | null> {
  const result = await sqlFn(
    `SELECT * FROM devx.skills
     WHERE name = $1 AND enabled = true
       AND (user_id = $2 OR (is_builtin = true AND user_id IS NULL))
     ORDER BY (user_id IS NOT NULL) DESC
     LIMIT 1`,
    [name, userId],
  );
  return result.rows[0] || null;
}

// --- Enrichment ---

/**
 * Enrich skill context with app-specific data.
 * For security-review: loads SECURITY_RULES.md and previous findings.
 * For code-review: loads previous findings.
 */
export async function enrichSkillContext(
  skillName: string,
  skillBody: string,
  appId: string | null,
  userId: string,
  workspacePath: string,
  sqlFn: SqlFn,
): Promise<string> {
  let enriched = skillBody;

  if (skillName === "security-review" && appId) {
    // Load SECURITY_RULES.md
    try {
      const rulesPath = `${workspacePath}/SECURITY_RULES.md`;
      const rules = await Deno.readTextFile(rulesPath);
      if (rules.trim()) {
        enriched += `\n\n# Security Rules (Project-Specific)\n\n${rules}`;
      }
    } catch { /* no SECURITY_RULES.md */ }

    // Load previous findings
    const prev = await sqlFn(
      `SELECT findings FROM devx.agent_results
       WHERE app_id = $1 AND user_id = $2 AND result_type = 'security-review'
       ORDER BY created_at DESC LIMIT 1`,
      [appId, userId],
    );
    if (prev.rows.length > 0 && prev.rows[0].findings) {
      enriched += formatPreviousFindings(prev.rows[0].findings);
    }
  }

  if (skillName === "code-review" && appId) {
    const prev = await sqlFn(
      `SELECT findings FROM devx.agent_results
       WHERE app_id = $1 AND user_id = $2 AND result_type = 'code-review'
       ORDER BY created_at DESC LIMIT 1`,
      [appId, userId],
    );
    if (prev.rows.length > 0 && prev.rows[0].findings) {
      enriched += formatPreviousFindings(prev.rows[0].findings);
    }
  }

  return enriched;
}

function formatPreviousFindings(findings: unknown[]): string {
  if (!Array.isArray(findings) || findings.length === 0) return "";

  const items = findings.map((f: any) => `- [${f.level}] ${f.title}: ${f.description?.slice(0, 200)}`);
  return `\n\n# Previous Review Findings\n\nFor each previous finding, check if it is still present in the code. If it is still present, include it again in your findings. If it has been fixed, do NOT include it.\n\n${items.join("\n")}`;
}

// --- Helpers ---

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "shall",
  "should", "may", "might", "must", "can", "could", "to", "of", "in",
  "for", "on", "with", "at", "by", "from", "as", "into", "through",
  "during", "before", "after", "above", "below", "between", "under",
  "this", "that", "these", "those", "it", "its", "or", "and", "but",
  "if", "not", "no", "so", "than", "too", "very", "just", "about",
  "when", "user", "asks", "used", "skill",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

function extractQuotedPhrases(text: string): string[] {
  const matches = text.match(/"([^"]+)"/g);
  if (!matches) return [];
  return matches.map((m) => m.slice(1, -1));
}
