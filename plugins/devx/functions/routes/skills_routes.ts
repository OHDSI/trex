// @ts-nocheck - Deno edge function
/**
 * API routes for skills, commands, hooks, and agents CRUD + import/export.
 */

import { parseFrontmatter, serializeToMarkdown } from "../skills/frontmatter.ts";

const ALLOWED_HOOK_EXECUTABLES = new Set([
  "node", "deno", "python", "python3", "bash", "sh", "bun", "npx", "uvx",
]);

function validateHookCommand(command: string | null | undefined): string | null {
  if (!command) return null;
  const executable = command.trim().split(/\s+/)[0];
  if (!ALLOWED_HOOK_EXECUTABLES.has(executable)) {
    return `Executable "${executable}" not allowed. Allowed: ${[...ALLOWED_HOOK_EXECUTABLES].join(", ")}`;
  }
  return null;
}

function validateHookMatcher(matcher: string | null | undefined): string | null {
  if (!matcher) return null;
  if (matcher.length > 200) return "Matcher must be under 200 characters";
  // Only allow pipe-separated tool names with optional * glob
  if (!/^[a-zA-Z0-9_*|]+$/.test(matcher)) {
    return "Matcher must be pipe-separated tool names (letters, numbers, underscores, * for glob)";
  }
  return null;
}

export async function handleSkillsRoutes(path, method, req, userId, sql, corsHeaders) {
  // ===== SKILLS =====

  // GET /skills
  if (path.endsWith("/skills") && method === "GET") {
    const result = await sql(
      `SELECT * FROM devx.skills
       WHERE user_id = $1 OR (is_builtin = true AND user_id IS NULL)
       ORDER BY is_builtin DESC, name`,
      [userId],
    );
    return Response.json(result.rows, { headers: corsHeaders });
  }

  // POST /skills
  if (path.endsWith("/skills") && method === "POST") {
    const body = await req.json();
    const { name, slug, description, version, body: skillBody, allowed_tools, mode } = body;
    if (!name || !description || !skillBody) {
      return Response.json({ error: "name, description, and body required" }, { status: 400, headers: corsHeaders });
    }
    const result = await sql(
      `INSERT INTO devx.skills (user_id, name, slug, description, version, body, allowed_tools, mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [userId, name, slug || null, description, version || "0.1.0", skillBody, allowed_tools || null, mode || null],
    );
    return Response.json(result.rows[0], { headers: corsHeaders });
  }

  // POST /skills/import — parse SKILL.md format
  if (path.endsWith("/skills/import") && method === "POST") {
    const body = await req.json();
    const { content } = body;
    if (!content) {
      return Response.json({ error: "content required (SKILL.md format)" }, { status: 400, headers: corsHeaders });
    }
    const { metadata, body: skillBody } = parseFrontmatter(content);
    const result = await sql(
      `INSERT INTO devx.skills (user_id, name, slug, description, version, body, allowed_tools, mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        userId,
        String(metadata.name || "imported-skill"),
        metadata.slug ? String(metadata.slug) : null,
        String(metadata.description || "Imported skill"),
        String(metadata.version || "0.1.0"),
        skillBody,
        Array.isArray(metadata["allowed-tools"]) ? metadata["allowed-tools"] : null,
        metadata.mode ? String(metadata.mode) : null,
      ],
    );
    return Response.json(result.rows[0], { headers: corsHeaders });
  }

  // Skills by ID: PATCH, DELETE, GET export
  const skillIdMatch = path.match(/\/skills\/([^/]+)$/);
  if (skillIdMatch) {
    const skillId = skillIdMatch[1];

    // GET /skills/:id/export
    if (path.endsWith("/export") && method === "GET") {
      const idForExport = path.match(/\/skills\/([^/]+)\/export$/)?.[1];
      if (idForExport) {
        const result = await sql(
          `SELECT * FROM devx.skills WHERE id = $1 AND (user_id = $2 OR (is_builtin = true AND user_id IS NULL))`,
          [idForExport, userId],
        );
        if (result.rows.length === 0) {
          return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
        }
        const skill = result.rows[0];
        const md = serializeToMarkdown(
          {
            name: skill.name,
            slug: skill.slug,
            description: skill.description,
            version: skill.version,
            mode: skill.mode,
            "allowed-tools": skill.allowed_tools,
          },
          skill.body,
        );
        return new Response(md, {
          headers: { ...corsHeaders, "Content-Type": "text/markdown" },
        });
      }
    }

    // PATCH /skills/:id
    if (method === "PATCH") {
      // Block editing built-in skills
      const check = await sql(`SELECT is_builtin, user_id FROM devx.skills WHERE id = $1`, [skillId]);
      if (check.rows.length === 0) {
        return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
      }
      if (check.rows[0].is_builtin) {
        return Response.json(
          { error: "Cannot edit built-in skills. Create a user skill with the same slug to override." },
          { status: 403, headers: corsHeaders },
        );
      }
      const body = await req.json();
      const sets = [];
      const params = [];
      let idx = 1;
      for (const field of ["name", "slug", "description", "version", "body", "allowed_tools", "mode", "enabled"]) {
        if (body[field] !== undefined) {
          sets.push(`${field} = $${idx++}`);
          params.push(body[field]);
        }
      }
      if (sets.length === 0) {
        return Response.json({ error: "No fields to update" }, { status: 400, headers: corsHeaders });
      }
      sets.push("updated_at = NOW()");
      params.push(skillId, userId);
      const result = await sql(
        `UPDATE devx.skills SET ${sets.join(", ")} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
        params,
      );
      return Response.json(result.rows[0] || { error: "Not found" }, { headers: corsHeaders });
    }

    // DELETE /skills/:id
    if (method === "DELETE") {
      const check = await sql(`SELECT is_builtin FROM devx.skills WHERE id = $1`, [skillId]);
      if (check.rows[0]?.is_builtin) {
        return Response.json({ error: "Cannot delete built-in skills" }, { status: 403, headers: corsHeaders });
      }
      await sql(`DELETE FROM devx.skills WHERE id = $1 AND user_id = $2`, [skillId, userId]);
      return Response.json({ ok: true }, { headers: corsHeaders });
    }
  }

  // ===== COMMANDS =====

  if (path.endsWith("/commands") && method === "GET") {
    const result = await sql(
      `SELECT * FROM devx.commands
       WHERE user_id = $1 OR (is_builtin = true AND user_id IS NULL)
       ORDER BY is_builtin DESC, slug`,
      [userId],
    );
    return Response.json(result.rows, { headers: corsHeaders });
  }

  if (path.endsWith("/commands") && method === "POST") {
    const body = await req.json();
    const { slug, description, body: cmdBody, allowed_tools, model, argument_hint } = body;
    if (!slug || !cmdBody) {
      return Response.json({ error: "slug and body required" }, { status: 400, headers: corsHeaders });
    }
    const result = await sql(
      `INSERT INTO devx.commands (user_id, slug, description, body, allowed_tools, model, argument_hint)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [userId, slug, description || null, cmdBody, allowed_tools || null, model || null, argument_hint || null],
    );
    return Response.json(result.rows[0], { headers: corsHeaders });
  }

  if (path.endsWith("/commands/import") && method === "POST") {
    const body = await req.json();
    const { content } = body;
    if (!content) {
      return Response.json({ error: "content required (command.md format)" }, { status: 400, headers: corsHeaders });
    }
    const { metadata, body: cmdBody } = parseFrontmatter(content);
    const result = await sql(
      `INSERT INTO devx.commands (user_id, slug, description, body, allowed_tools, model, argument_hint)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        userId,
        String(metadata.slug || "imported-command"),
        metadata.description ? String(metadata.description) : null,
        cmdBody,
        Array.isArray(metadata["allowed-tools"]) ? metadata["allowed-tools"] : null,
        metadata.model ? String(metadata.model) : null,
        metadata["argument-hint"] ? String(metadata["argument-hint"]) : null,
      ],
    );
    return Response.json(result.rows[0], { headers: corsHeaders });
  }

  const cmdIdMatch = path.match(/\/commands\/([^/]+)$/);
  if (cmdIdMatch && !path.endsWith("/import")) {
    const cmdId = cmdIdMatch[1];

    if (method === "PATCH") {
      const check = await sql(`SELECT is_builtin FROM devx.commands WHERE id = $1`, [cmdId]);
      if (check.rows[0]?.is_builtin) {
        return Response.json(
          { error: "Cannot edit built-in commands. Create a user command with the same slug to override." },
          { status: 403, headers: corsHeaders },
        );
      }
      const body = await req.json();
      const sets = [];
      const params = [];
      let idx = 1;
      for (const field of ["slug", "description", "body", "allowed_tools", "model", "argument_hint", "enabled"]) {
        if (body[field] !== undefined) {
          sets.push(`${field} = $${idx++}`);
          params.push(body[field]);
        }
      }
      sets.push("updated_at = NOW()");
      params.push(cmdId, userId);
      const result = await sql(
        `UPDATE devx.commands SET ${sets.join(", ")} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
        params,
      );
      return Response.json(result.rows[0] || { error: "Not found" }, { headers: corsHeaders });
    }

    if (method === "DELETE") {
      const check = await sql(`SELECT is_builtin FROM devx.commands WHERE id = $1`, [cmdId]);
      if (check.rows[0]?.is_builtin) {
        return Response.json({ error: "Cannot delete built-in commands" }, { status: 403, headers: corsHeaders });
      }
      await sql(`DELETE FROM devx.commands WHERE id = $1 AND user_id = $2`, [cmdId, userId]);
      return Response.json({ ok: true }, { headers: corsHeaders });
    }
  }

  // ===== HOOKS =====

  if (path.endsWith("/hooks") && method === "GET") {
    const result = await sql(
      `SELECT * FROM devx.hooks
       WHERE user_id = $1 OR (is_builtin = true AND user_id IS NULL)
       ORDER BY event, sort_order`,
      [userId],
    );
    return Response.json(result.rows, { headers: corsHeaders });
  }

  if (path.endsWith("/hooks") && method === "POST") {
    const body = await req.json();
    const { event, matcher, hook_type, command, prompt, timeout_ms, sort_order } = body;
    if (!event || !hook_type) {
      return Response.json({ error: "event and hook_type required" }, { status: 400, headers: corsHeaders });
    }
    // Validate hook command against allow-list
    const cmdError = validateHookCommand(command);
    if (cmdError) {
      return Response.json({ error: cmdError }, { status: 400, headers: corsHeaders });
    }
    // Validate matcher pattern
    const matcherError = validateHookMatcher(matcher);
    if (matcherError) {
      return Response.json({ error: matcherError }, { status: 400, headers: corsHeaders });
    }
    const result = await sql(
      `INSERT INTO devx.hooks (user_id, event, matcher, hook_type, command, prompt, timeout_ms, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [userId, event, matcher || null, hook_type, command || null, prompt || null, timeout_ms || 10000, sort_order || 0],
    );
    return Response.json(result.rows[0], { headers: corsHeaders });
  }

  const hookIdMatch = path.match(/\/hooks\/([^/]+)$/);
  if (hookIdMatch && !path.endsWith("/import")) {
    const hookId = hookIdMatch[1];

    if (method === "PATCH") {
      const body = await req.json();
      const sets = [];
      const params = [];
      let idx = 1;
      for (const field of ["event", "matcher", "hook_type", "command", "prompt", "timeout_ms", "enabled", "sort_order"]) {
        if (body[field] !== undefined) {
          sets.push(`${field} = $${idx++}`);
          params.push(body[field]);
        }
      }
      if (sets.length === 0) {
        return Response.json({ error: "No fields to update" }, { status: 400, headers: corsHeaders });
      }
      params.push(hookId, userId);
      const result = await sql(
        `UPDATE devx.hooks SET ${sets.join(", ")} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
        params,
      );
      return Response.json(result.rows[0] || { error: "Not found" }, { headers: corsHeaders });
    }

    if (method === "DELETE") {
      await sql(`DELETE FROM devx.hooks WHERE id = $1 AND user_id = $2`, [hookId, userId]);
      return Response.json({ ok: true }, { headers: corsHeaders });
    }
  }

  // ===== AGENTS =====

  if (path.endsWith("/agents") && method === "GET") {
    const result = await sql(
      `SELECT * FROM devx.agents
       WHERE user_id = $1 OR (is_builtin = true AND user_id IS NULL)
       ORDER BY is_builtin DESC, name`,
      [userId],
    );
    return Response.json(result.rows, { headers: corsHeaders });
  }

  if (path.endsWith("/agents") && method === "POST") {
    const body = await req.json();
    const { name, description, body: agentBody, allowed_tools, model, max_steps } = body;
    if (!name || !description || !agentBody) {
      return Response.json({ error: "name, description, and body required" }, { status: 400, headers: corsHeaders });
    }
    const result = await sql(
      `INSERT INTO devx.agents (user_id, name, description, body, allowed_tools, model, max_steps)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [userId, name, description, agentBody, allowed_tools || null, model || "inherit", max_steps || 15],
    );
    return Response.json(result.rows[0], { headers: corsHeaders });
  }

  if (path.endsWith("/agents/import") && method === "POST") {
    const body = await req.json();
    const { content } = body;
    if (!content) {
      return Response.json({ error: "content required (agent.md format)" }, { status: 400, headers: corsHeaders });
    }
    const { metadata, body: agentBody } = parseFrontmatter(content);
    const result = await sql(
      `INSERT INTO devx.agents (user_id, name, description, body, allowed_tools, model, max_steps)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        userId,
        String(metadata.name || "imported-agent"),
        String(metadata.description || "Imported agent"),
        agentBody,
        Array.isArray(metadata["allowed-tools"]) ? metadata["allowed-tools"] : null,
        String(metadata.model || "inherit"),
        Number(metadata["max-steps"]) || 15,
      ],
    );
    return Response.json(result.rows[0], { headers: corsHeaders });
  }

  const agentIdMatch = path.match(/\/agents\/([^/]+)$/);
  if (agentIdMatch && !path.endsWith("/import")) {
    const agentId = agentIdMatch[1];

    if (method === "PATCH") {
      const check = await sql(`SELECT is_builtin FROM devx.agents WHERE id = $1`, [agentId]);
      if (check.rows[0]?.is_builtin) {
        return Response.json(
          { error: "Cannot edit built-in agents. Create a user agent with the same name to override." },
          { status: 403, headers: corsHeaders },
        );
      }
      const body = await req.json();
      const sets = [];
      const params = [];
      let idx = 1;
      for (const field of ["name", "description", "body", "allowed_tools", "model", "max_steps", "enabled"]) {
        if (body[field] !== undefined) {
          sets.push(`${field} = $${idx++}`);
          params.push(body[field]);
        }
      }
      sets.push("updated_at = NOW()");
      params.push(agentId, userId);
      const result = await sql(
        `UPDATE devx.agents SET ${sets.join(", ")} WHERE id = $${idx++} AND user_id = $${idx} RETURNING *`,
        params,
      );
      return Response.json(result.rows[0] || { error: "Not found" }, { headers: corsHeaders });
    }

    if (method === "DELETE") {
      const check = await sql(`SELECT is_builtin FROM devx.agents WHERE id = $1`, [agentId]);
      if (check.rows[0]?.is_builtin) {
        return Response.json({ error: "Cannot delete built-in agents" }, { status: 403, headers: corsHeaders });
      }
      await sql(`DELETE FROM devx.agents WHERE id = $1 AND user_id = $2`, [agentId, userId]);
      return Response.json({ ok: true }, { headers: corsHeaders });
    }
  }

  // ===== SLASH COMPLETIONS =====

  if (path.endsWith("/slash-completions") && method === "GET") {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").toLowerCase();

    // Get skills with slugs and aliases
    const skills = await sql(
      `SELECT slug, description, aliases, 'skill' as type, NULL as argument_hint
       FROM devx.skills
       WHERE slug IS NOT NULL AND enabled = true
         AND (user_id = $1 OR (is_builtin = true AND user_id IS NULL))`,
      [userId],
    );

    // Get commands
    const commands = await sql(
      `SELECT slug, description, 'command' as type, argument_hint
       FROM devx.commands
       WHERE enabled = true
         AND (user_id = $1 OR (is_builtin = true AND user_id IS NULL))`,
      [userId],
    );

    // Build alias entries from skill metadata
    const aliasItems: any[] = [];
    for (const s of skills.rows) {
      if (s.aliases && Array.isArray(s.aliases)) {
        for (const alias of s.aliases) {
          aliasItems.push({
            slug: alias,
            description: s.description,
            type: "skill",
            argument_hint: null,
          });
        }
      }
    }

    // Built-in meta-commands
    const metaCommands = [
      { slug: "agent", description: "Run a skill as an autonomous agent", type: "command", argument_hint: "/<skill>" },
      { slug: "commands", description: "List all available commands", type: "command", argument_hint: null },
      { slug: "skills", description: "List all available skills", type: "command", argument_hint: null },
      { slug: "help", description: "Show available commands and skills", type: "command", argument_hint: null },
    ];

    let items = [...skills.rows, ...commands.rows, ...aliasItems, ...metaCommands];

    // Deduplicate by slug (prefer earlier entries)
    const seen = new Set();
    items = items.filter((item) => {
      if (seen.has(item.slug)) return false;
      seen.add(item.slug);
      return true;
    });

    // Filter by query
    if (q) {
      items = items.filter((item) => item.slug.toLowerCase().includes(q));
    }

    // Sort: exact prefix match first, then alphabetical
    items.sort((a, b) => {
      const aPrefix = a.slug.toLowerCase().startsWith(q) ? 0 : 1;
      const bPrefix = b.slug.toLowerCase().startsWith(q) ? 0 : 1;
      if (aPrefix !== bPrefix) return aPrefix - bPrefix;
      return a.slug.localeCompare(b.slug);
    });

    return Response.json(items.slice(0, 20), { headers: corsHeaders });
  }

  return null;
}
